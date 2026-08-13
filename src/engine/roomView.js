// The one place a room becomes something the UI can render.
//
// Room content used to be projected through three hand-maintained allowlists --
// roomContext's `roomInfo`, and session's preview and catalog builders -- each
// naming its own subset of fields. Every new field had to be added to all three
// or it was silently invisible, which made every content change cost triple and
// fail quietly when it didn't.
//
// Everything that shows a room now goes through here.

import { FEATURE_VERBS, PACK_ACTION_DEFAULTS, ACTION_PREFIX } from '../pack/schema.js'

// {{key}} substitution in room text, resolved at display time (unlike
// {{variant}}, which is folded in earlier -- see pack/load.js -- because a
// variant is chosen once per instance, while cellColor depends on which
// tesseract this viewing happens to be through).
const TEMPLATE_TOKEN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g

function buildTemplateVars (cell, templateVars) {
  const vars = {}
  for (const v of templateVars ?? []) {
    if (v?.key) vars[v.key] = v.value ?? ''
  }
  // Built-ins are applied last so a pack cannot accidentally (or deliberately)
  // shadow the computed cell color with a stale authored value.
  if (cell) vars.cellColor = cell.colorName ?? cell.color ?? ''
  return vars
}

function substitute (text, vars) {
  if (!text || !vars) return text
  return text.replace(TEMPLATE_TOKEN, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  )
}

function withTemplateVars (room, vars) {
  if (!vars || Object.keys(vars).length === 0) return room
  return {
    ...room,
    read: substitute(room.read, vars),
    detail: substitute(room.detail, vars),
    gm: substitute(room.gm, vars),
    orientation: substitute(room.orientation, vars),
    onKey: room.onKey
      ? {
          ...room.onKey,
          read: substitute(room.onKey.read, vars),
          detail: substitute(room.onKey.detail, vars),
          gm: substitute(room.onKey.gm, vars)
        }
      : room.onKey
  }
}

// What the party can do here, derived from what the room already declares.
//
// The two hardcoded toggles this replaces -- "cleared" and "looted" -- could not
// say *which* enemy was defeated or *which* thing was taken, and a reset had
// nothing to act on but the pair of them. Every creature and every feature now
// carries its own action and its own `resetsOn`, so "the boggles come back on a
// long rest but the amulet stays gone" is expressible.
//
// Kept apart from room notes deliberately. A note records what happened; an
// action records a state the room is in, and only the second is something a
// reset event can undo programmatically.
export function roomActions (room, { isKeyRoom = false, packActions = null } = {}) {
  const actions = []

  for (const creature of room?.creatures ?? []) {
    const id = creature.id ?? creature.name
    if (!id) continue
    actions.push({
      id: `${ACTION_PREFIX.creature}${id}`,
      label: `${creature.name ?? id} defeated`,
      kind: 'creature',
      subject: creature.name ?? id,
      grantsKey: false,
      resetsOn: creature.resetsOn ?? []
    })
  }

  for (const feature of room?.features ?? []) {
    const id = feature.id ?? feature.name
    if (!id) continue
    const verb = FEATURE_VERBS[feature.kind] ?? FEATURE_VERBS.other
    actions.push({
      id: `${ACTION_PREFIX.feature}${id}`,
      label: `${feature.name ?? id} ${verb}`,
      kind: 'feature',
      subject: feature.name ?? id,
      // Taking the thing that *is* the key is what puts it in the party's hands.
      grantsKey: feature.kind === 'key',
      resetsOn: feature.resetsOn ?? []
    })
  }

  // Room-level actions: the pack's set, or the room's own override.
  for (const action of room?.actions ?? packActions ?? PACK_ACTION_DEFAULTS) {
    if (!action?.id) continue
    actions.push({
      id: String(action.id),
      label: action.label ?? action.id,
      kind: 'room',
      subject: null,
      grantsKey: Boolean(action.grantsKey),
      resetsOn: action.resetsOn ?? []
    })
  }

  // A key room with no key feature still needs a way to hand the key over.
  if (isKeyRoom && !actions.some(a => a.grantsKey)) {
    actions.push({
      id: 'key',
      label: 'key taken',
      kind: 'key',
      subject: null,
      grantsKey: true,
      resetsOn: []
    })
  }

  return actions
}

// Content the party has unlocked by holding this tesseract's key is merged over
// the base text rather than appended: a room whose secret changes what it looks
// like should read as one description, not as a description with a footnote.
function withKeyContent (room, keyHeld) {
  if (!keyHeld || !room.onKey) return room

  const { read, detail, gm } = room.onKey
  return {
    ...room,
    read: read || room.read,
    detail: detail || room.detail,
    gm: [room.gm, gm].filter(Boolean).join('\n\n')
  }
}

// `room` is a resolved instance (see pack/load.js), not authored pack content.
//
// Options:
//   instanceId  the id this room occupies in the dungeon
//   keyHeld     whether the party holds the key for the tesseract being viewed
export function roomView (room, {
  instanceId = null, keyHeld = false, isKeyRoom = false,
  packActions = null, state = {}, cell = null, templateVars = null
} = {}) {
  if (!room) return null

  const vars = buildTemplateVars(cell, templateVars)
  const source = withKeyContent(withTemplateVars(room, vars), keyHeld)

  return {
    id: instanceId != null ? String(instanceId) : null,

    name: source.name ?? '?',

    // The GM's reading order: what to say, what to say if asked, what to know.
    read: source.read ?? '',
    detail: source.detail ?? '',
    gm: source.gm ?? '',
    orientation: source.orientation ?? '',

    creatures: (source.creatures ?? []).map(c => ({
      id: c.id ?? null,
      name: c.name ?? '?',
      count: c.count ?? null,
      notes: c.notes ?? '',
      link: c.link ?? null,
      resetsOn: c.resetsOn ?? []
    })),

    features: (source.features ?? []).map(f => ({
      id: f.id ?? null,
      name: f.name ?? '?',
      kind: f.kind ?? 'other',
      detail: f.detail ?? '',
      resetsOn: f.resetsOn ?? []
    })),

    rest: source.rest ? { safety: source.rest.safety ?? null, effect: source.rest.effect ?? '' } : null,
    links: (source.links ?? []).map(l => ({
      kind: l.kind ?? 'other',
      label: l.label ?? l.url ?? 'link',
      url: l.url ?? null
    })),

    size: source.size ?? null,
    gravity: source.gravity ?? null,

    // Present so the UI can say "this is the second Storage Vault" without
    // reaching back into the pack.
    contentId: source.contentId ?? null,
    instanceOrdinal: source.instanceOrdinal ?? 1,
    variantId: source.variantId ?? null,

    // Opaque by contract: the engine never reads inside it, the UI may display
    // it, and that is what keeps the geometry system-agnostic.
    system: source.system ?? {},

    // What the party can do here, and what they have already done. The UI renders
    // whatever is in this list rather than knowing any action by name.
    actions: roomActions(source, { isKeyRoom, packActions }).map(action => ({
      ...action,
      done: Boolean(state?.[action.id])
    })),

    // Whether the key content above was folded in, so the UI can mark it.
    keyContentShown: Boolean(keyHeld && room.onKey)
  }
}

// Whether a party is carrying the key for a given tesseract.
//
// Key *placement* has always existed (`cells[id].key`). Acquisition is a party
// fact, not a world one: the room being emptied is recorded in `roomState`, but
// which group walked off with the key is recorded on the group. With two parties
// in the dungeon those two things come apart, and only one of them answers
// "can they open the exit".
export function holdsKey (party, cellId) {
  return (party?.keysHeld ?? []).includes(String(cellId))
}

export function keysHeld (party) {
  return [...(party?.keysHeld ?? [])]
}
