// Turns a pack's authored content into the 40 room instances a dungeon needs.
//
// Authored rooms each get at least one instance -- an author who ships a room
// expects to see it -- and whatever is left over is drawn from the pack's
// filler configuration.  A pack with 40 rooms needs no filler at all; a pack
// with three (start, exit, one template) fills the other 37.
//
// Instances carry fully resolved room objects, so downstream code keeps
// indexing a flat `rooms[id]` map and never learns that content is shared.

import { ROOM_COUNT } from '../engine/topology.js'
import {
  ROOM_DEFAULTS, FILLER_ROOM_DEFAULTS, FILLER_DEFAULTS,
  normalizeRoom, instanceId, repeatLabel
} from './schema.js'

// Prose fields a variant may substitute into. Renaming a field without adding
// it here fails silently -- the marker simply never gets replaced.
const VARIANT_FIELDS = ['read', 'detail', 'gm', 'orientation']

export class PackError extends Error {
  constructor (code, message, detail = {}) {
    super(message)
    this.name = 'PackError'
    this.code = code
    this.detail = detail
  }
}

// ── Loading ─────────────────────────────────────────────────────────────────

export function loadPack (json) {
  if (!json || typeof json !== 'object') {
    throw new PackError('PACK_NOT_AN_OBJECT', 'pack must be an object')
  }

  const rooms = {}
  for (const [id, room] of Object.entries(json.rooms ?? {})) {
    rooms[id] = normalizeRoom(room, ROOM_DEFAULTS)
  }

  const fillerRooms = {}
  for (const [id, room] of Object.entries(json.fillerRooms ?? {})) {
    fillerRooms[id] = normalizeRoom(room, FILLER_ROOM_DEFAULTS)
  }

  return {
    schemaVersion: json.schemaVersion ?? 1,
    manifest: { ...(json.manifest ?? {}) },
    // Room-level actions every room offers unless it overrides them.
    actions: Array.isArray(json.actions) ? json.actions.map(a => ({ ...a })) : null,
    // Pack-authored resetsOn triggers beyond the built-in vocabulary.
    resetEvents: Array.isArray(json.resetEvents) ? json.resetEvents.map(e => ({ ...e })) : null,
    // Pack-authored {{key}} text substitutions, on top of the built-in {{cellColor}}.
    templateVars: Array.isArray(json.templateVars) ? json.templateVars.map(v => ({ ...v })) : null,
    cells: { colors: json.cells?.colors ?? [] },
    rooms,
    fillerRooms,
    filler: { ...FILLER_DEFAULTS, ...(json.filler ?? {}) }
  }
}

// ── Instance resolution ─────────────────────────────────────────────────────

// Materialises one instance's room object: content, plus its variant folded in
// and a suffix appended when it is a repeat.
export function resolveRoom (content, contentId, ordinal, variant) {
  const room = {
    ...content,
    contentId,
    instanceOrdinal: ordinal,
    variantId: variant?.id ?? null
  }

  delete room.variants
  delete room.maxInstances
  delete room.labelRepeats

  if (variant?.text) {
    for (const field of VARIANT_FIELDS) {
      const text = content[field] ?? ''
      room[field] = text.includes('{{variant}}')
        ? text.replaceAll('{{variant}}', variant.text)
        // No marker, so the variant becomes its own trailing paragraph.
        : (text ? `${text}\n\n${variant.text}` : variant.text)
    }
  } else {
    for (const field of VARIANT_FIELDS) {
      room[field] = (content[field] ?? '').replaceAll('{{variant}}', '').trim()
    }
  }

  if (ordinal > 1 && content.labelRepeats) {
    room.name = `${content.name} (${repeatLabel(ordinal)})`
  }

  return room
}

function capOf (room, listed) {
  if (room.maxInstances != null) return room.maxInstances
  return listed ? Infinity : 1
}

function reuseCandidates (pack) {
  const pool = pack.filler.reusePool
  const ids = pool === '*' ? Object.keys(pack.rooms) : (pool ?? [])

  return ids
    .filter(id => pack.rooms[id])
    // Start and exit are singular by definition; repeating them would put two
    // entrances in one dungeon.
    .filter(id => pack.rooms[id].role == null)
    .map(id => ({ id, source: 'rooms', cap: capOf(pack.rooms[id], true) }))
}

function templateCandidates (pack) {
  const ids = pack.filler.templates?.length
    ? pack.filler.templates
    : Object.keys(pack.fillerRooms)

  return ids
    .filter(id => pack.fillerRooms[id])
    .map(id => ({ id, source: 'fillerRooms', cap: capOf(pack.fillerRooms[id], true) }))
}

// Draws `need` content ids from `candidates`, honouring per-content caps.
// `used` tracks instances already spent so authored singletons cannot be
// double-drawn.
function draw (candidates, need, used, distribution, weights, rng) {
  const picks = []
  const available = candidates.filter(c => (used[c.id] ?? 0) < c.cap)
  if (!available.length) return picks

  if (distribution === 'random') {
    while (picks.length < need) {
      const open = available.filter(c => (used[c.id] ?? 0) < c.cap)
      if (!open.length) break

      const total = open.reduce((sum, c) => sum + (weights[c.id] ?? 1), 0)
      let roll = rng() * total
      const chosen = open.find(c => (roll -= weights[c.id] ?? 1) < 0) ?? open[open.length - 1]

      used[chosen.id] = (used[chosen.id] ?? 0) + 1
      picks.push(chosen)
    }
    return picks
  }

  // spread: round-robin for maximum variety before any content repeats.
  let guard = 0
  while (picks.length < need) {
    const open = available.filter(c => (used[c.id] ?? 0) < c.cap)
    if (!open.length) break

    for (const candidate of open) {
      if (picks.length >= need) break
      used[candidate.id] = (used[candidate.id] ?? 0) + 1
      picks.push(candidate)
    }

    if (++guard > need + candidates.length) break
  }

  return picks
}

// Returns exactly `count` instances, or throws with a structured code.
export function resolveInstances (pack, rng, count = ROOM_COUNT) {
  const authored = Object.keys(pack.rooms)

  if (authored.length > count) {
    throw new PackError(
      'PACK_TOO_MANY_ROOMS',
      `pack has ${authored.length} rooms but a dungeon holds ${count}`,
      { authored: authored.length, count }
    )
  }

  const used = {}
  const planned = authored.map(id => {
    used[id] = 1
    return { id, source: 'rooms' }
  })

  const need = count - planned.length

  if (need > 0) {
    const { strategy, distribution, weights } = pack.filler
    const reuse = reuseCandidates(pack)
    const templates = templateCandidates(pack)

    const drawn = []
    if (strategy === 'mixed') {
      drawn.push(...draw(reuse, Math.ceil(need / 2), used, distribution, weights, rng))
      drawn.push(...draw(templates, need - drawn.length, used, distribution, weights, rng))
    } else if (strategy === 'templates') {
      drawn.push(...draw(templates, need, used, distribution, weights, rng))
      drawn.push(...draw(reuse, need - drawn.length, used, distribution, weights, rng))
    } else {
      drawn.push(...draw(reuse, need, used, distribution, weights, rng))
      drawn.push(...draw(templates, need - drawn.length, used, distribution, weights, rng))
    }

    if (drawn.length < need) {
      throw new PackError(
        'PACK_INSUFFICIENT_FILLER',
        `pack supplies ${planned.length + drawn.length} of ${count} rooms; ` +
        'raise maxInstances, widen filler.reusePool, or add filler templates',
        { supplied: planned.length + drawn.length, count, strategy }
      )
    }

    planned.push(...drawn)
  }

  // Ordinals are per content, assigned in planned order so a given seed always
  // produces the same numbering.
  const ordinals = {}
  return planned.map(entry => {
    const content = pack[entry.source][entry.id]
    const ordinal = (ordinals[entry.id] = (ordinals[entry.id] ?? 0) + 1)

    const variants = content.variants
    const variant = variants?.length
      ? variants[(ordinal - 1) % variants.length]
      : null

    return {
      instanceId: instanceId(entry.id, ordinal),
      contentId: entry.id,
      ordinal,
      variantId: variant?.id ?? null,
      room: resolveRoom(content, entry.id, ordinal, variant)
    }
  })
}
