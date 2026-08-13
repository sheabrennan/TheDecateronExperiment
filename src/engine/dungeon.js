// Builds a playable dungeon from a pack.
//
// Pure: state in, state out.  The old generator wrote its save file as a side
// effect of construction, which made it impossible to test and impossible to
// regenerate without touching disk.
//
// Deterministic: the same seed yields the same dungeon, so a GM can share a
// dungeon by seed alone and tests can assert on exact output.
//
// The geometry comes from topology.js and is fixed before any content is
// placed.  This module only decides *which instance goes in which slot*, under
// the pack's grouping constraints -- it cannot produce a malformed shape, which
// is the failure the previous greedy generator was prone to.

import {
  buildTopology, doorTargets, makeRng, shuffled,
  ROOM_COUNT, CELL_COUNT
} from './topology.js'
import { lexicalMapper, gravitron } from './lexicalMap.js'
import { newParty } from './party.js'
import { loadPack, resolveInstances, PackError } from '../pack/load.js'

export const SAVE_SCHEMA_VERSION = 1

// How a door's destination tesseract gets chosen. Per-game, switchable mid-play.
export const CELL_CHOICE_MODES = ['gm', 'random']

const PLACEMENT_ATTEMPTS = 200

// ── Placement ───────────────────────────────────────────────────────────────

const slotCells = (topology, slot) => topology.slots[slot].cells

function sharesCell (topology, a, b) {
  const [x, y] = slotCells(topology, a)
  return slotCells(topology, b).includes(x) || slotCells(topology, b).includes(y)
}

function groupsOf (instances, kind) {
  const groups = {}
  instances.forEach((instance, index) => {
    const tag = instance.room[kind]
    if (tag != null) (groups[tag] ??= []).push(index)
  })
  return groups
}

// Assigns every instance to a topology slot, honouring:
//
//   includeGroup  all members share at least one tesseract
//   excludeGroup  no two members share any tesseract
//
// and, as a soft preference, keeping repeats of the same content out of a
// shared tesseract -- impossible past 5 copies, so it is a tie-break rather
// than a constraint.
//
// Randomised greedy with retries. The validator has already bounded group sizes
// to what is satisfiable, so failure here means an unlucky draw, not an
// impossible pack.
function placeInstances (topology, instances, rng) {
  const includeGroups = groupsOf(instances, 'includeGroup')
  const excludeGroups = groupsOf(instances, 'excludeGroup')

  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const slotFor = new Array(instances.length).fill(null)
    const free = new Set(topology.slots.map(s => s.index))
    let failed = false

    const take = (index, slot) => {
      slotFor[index] = slot
      free.delete(slot)
    }

    // Include groups first: they need a whole cell's worth of adjacent slots,
    // so they are the least flexible thing to place.
    const included = Object.values(includeGroups)
      .sort((a, b) => b.length - a.length)

    for (const members of included) {
      const host = shuffled(topology.cells, rng).find(cell => {
        const open = Object.values(cell.positions).filter(s => free.has(s))
        return open.length >= members.length
      })

      if (!host) { failed = true; break }

      const open = shuffled(Object.values(host.positions).filter(s => free.has(s)), rng)
      members.forEach((index, i) => take(index, open[i]))
    }
    if (failed) continue

    // Exclude groups: pairwise cell-disjoint slots.
    for (const members of Object.values(excludeGroups)) {
      const chosen = []

      for (const index of members) {
        if (slotFor[index] != null) {
          // Already placed by an include group; it still has to satisfy this.
          if (chosen.some(s => sharesCell(topology, s, slotFor[index]))) { failed = true; break }
          chosen.push(slotFor[index])
          continue
        }

        const slot = shuffled([...free], rng)
          .find(s => chosen.every(c => !sharesCell(topology, s, c)))

        if (slot == null) { failed = true; break }
        take(index, slot)
        chosen.push(slot)
      }
      if (failed) break
    }
    if (failed) continue

    // Everything else, preferring slots whose cells hold the fewest copies of
    // the same content.
    const perCellContent = {}
    for (const cell of topology.cells) perCellContent[cell.id] = {}

    const noteContent = (slot, contentId) => {
      for (const cellId of slotCells(topology, slot)) {
        perCellContent[cellId][contentId] = (perCellContent[cellId][contentId] ?? 0) + 1
      }
    }

    instances.forEach((instance, index) => {
      if (slotFor[index] != null) noteContent(slotFor[index], instance.contentId)
    })

    const remaining = shuffled(
      instances.map((_, i) => i).filter(i => slotFor[i] == null), rng
    )

    for (const index of remaining) {
      const contentId = instances[index].contentId

      const collisionsFor = slot => slotCells(topology, slot)
        .reduce((sum, cellId) => sum + (perCellContent[cellId][contentId] ?? 0), 0)

      let best = null
      let bestScore = Infinity
      for (const slot of shuffled([...free], rng)) {
        const score = collisionsFor(slot)
        if (score < bestScore) { best = slot; bestScore = score }
        if (score === 0) break
      }

      if (best == null) { failed = true; break }
      take(index, best)
      noteContent(best, contentId)
    }
    if (failed) continue

    return slotFor
  }

  throw new PackError(
    'DUNGEON_PLACEMENT_FAILED',
    `could not satisfy the pack's grouping constraints in ${PLACEMENT_ATTEMPTS} attempts`,
    { attempts: PLACEMENT_ATTEMPTS }
  )
}

// ── Keys ────────────────────────────────────────────────────────────────────

// One key per cell, drawn from the key-eligible rooms resident in it.  A room
// may hold at most one cell's key even though it sits in two, and a cell with
// no eligible room simply holds none -- packs built around a chase or a hunt
// may want exactly that.
//
// This is a bipartite matching, not a greedy pick.  Taking the first available
// candidate per cell strands later cells whose only eligible rooms are already
// spent: with the reference pack's 10 eligible rooms for 10 cells, greedy keyed
// all ten on 9 seeds in 200, median 8.  Augmenting paths find a maximum
// matching, so a pack that *can* key every cell always does.
function placeKeys (topology, slotFor, instances, rng) {
  const instanceAt = {}
  slotFor.forEach((slot, index) => { instanceAt[slot] = index })

  const candidatesFor = {}
  for (const cell of shuffled(topology.cells, rng)) {
    candidatesFor[cell.id] = shuffled(Object.values(cell.positions), rng)
      .map(slot => instanceAt[slot])
      .filter(index => instances[index].room.keyEligible)
  }

  const cellFor = {} // instance index -> cell id
  const keyFor = {} //  cell id       -> instance index

  const augment = (cellId, seen) => {
    for (const candidate of candidatesFor[cellId]) {
      if (seen.has(candidate)) continue
      seen.add(candidate)

      // Free, or its current cell can be rehomed to make room.
      if (cellFor[candidate] === undefined || augment(cellFor[candidate], seen)) {
        cellFor[candidate] = cellId
        keyFor[cellId] = candidate
        return true
      }
    }
    return false
  }

  for (const cellId of Object.keys(candidatesFor)) augment(cellId, new Set())

  const keys = {}
  for (const cell of topology.cells) {
    const index = keyFor[cell.id]
    keys[cell.id] = index === undefined ? null : instances[index].instanceId
  }

  return keys
}

// ── Generation ──────────────────────────────────────────────────────────────

export function generateDungeon (packJson, options = {}) {
  const {
    seed = 0,
    count = ROOM_COUNT,
    cellCount = CELL_COUNT,
    cellChoiceMode = 'gm'
  } = options

  if (!CELL_CHOICE_MODES.includes(cellChoiceMode)) {
    throw new PackError(
      'INVALID_CELL_CHOICE_MODE',
      `cellChoiceMode must be one of ${CELL_CHOICE_MODES.join(', ')}`,
      { found: cellChoiceMode }
    )
  }

  const pack = loadPack(packJson)
  const rng = makeRng(seed)

  const topology = buildTopology(seed)
  const instances = resolveInstances(pack, rng, count)
  const slotFor = placeInstances(topology, instances, rng)

  const instanceAt = {}
  slotFor.forEach((slot, index) => { instanceAt[slot] = index })
  const idAt = slot => instances[instanceAt[slot]].instanceId

  // ── Rooms ─────────────────────────────────────────────────────────────────

  const rooms = {}
  for (const instance of instances) rooms[instance.instanceId] = instance.room

  // ── Cells ─────────────────────────────────────────────────────────────────

  const keys = placeKeys(topology, slotFor, instances, rng)
  const palette = pack.cells.colors

  const cells = {}
  topology.cells.forEach((cell, i) => {
    const color = palette[i] ?? { hex: '#888888', name: `Cell ${cell.id}` }
    const cellRooms = {}

    for (const [position, slot] of Object.entries(cell.positions)) {
      const otherCellId = slotCells(topology, slot).find(id => id !== cell.id)

      cellRooms[idAt(slot)] = {
        position,
        doors: doorTargets(topology, cell.id, slot).map(idAt),
        otherCell: otherCellId
      }
    }

    cells[cell.id] = {
      color: color.hex,
      colorName: color.name,
      key: keys[cell.id],
      cellRooms
    }
  })

  // ── Start and exit ────────────────────────────────────────────────────────

  const roleSlot = role => {
    const index = instances.findIndex(i => i.room.role === role)
    return index === -1 ? null : slotFor[index]
  }

  const startSlot = roleSlot('start')
  const exitSlot = roleSlot('exit')

  if (startSlot == null || exitSlot == null) {
    throw new PackError(
      'DUNGEON_ROLE_MISSING',
      'pack must define exactly one start room and one exit room',
      { start: startSlot != null, exit: exitSlot != null }
    )
  }

  // A room stands in two tesseracts; the start and the exit each happen in one
  // of them.  Which one is a real choice, not an accident of iteration order --
  // the old generator picked the start cell by looking for the cell whose *key*
  // was the start room, which only worked because the start room happened to be
  // key-eligible, and returned undefined the moment it wasn't.
  const startCell = shuffled(slotCells(topology, startSlot), rng)[0]
  const exitCell = shuffled(slotCells(topology, exitSlot), rng)[0]

  const startRoom = idAt(startSlot)
  const exitRoom = idAt(exitSlot)

  // ── Game state ────────────────────────────────────────────────────────────

  const gravity = gravitron(rooms[startRoom], 0)
  const currentEntry = 0

  // One party to begin with. The shape is the same for three, so nothing
  // downstream branches on the count -- and where a second party starts is a
  // decision made in play, not at generation.
  const first = newParty({
    id: 'a',
    cell: startCell,
    room: startRoom,
    entry: currentEntry,
    gravity,
    doors: lexicalMapper(currentEntry, gravity)
  })

  const gameDetails = {
    cellChoiceMode,

    parties: [first],
    activeParty: first.id,

    // Dungeon facts, shared by every party in it.
    startCell,
    startRoom,
    exitCell,
    exitRoom,

    // The pack's room-level action set, snapshotted like room content so a save
    // keeps working if the pack changes underneath it.
    packActions: pack.actions ?? null,

    // The pack's custom resetsOn vocabulary, snapshotted for the same reason --
    // and so the GM's reset menu can offer a button for it (see AppMenu.jsx).
    packResetEvents: pack.resetEvents ?? null,

    // Pack-authored {{key}} text substitutions, snapshotted for the same
    // reason (see roomView.js for where they're applied).
    packTemplateVars: pack.templateVars ?? null,

    // World state: a cleared room is cleared for everyone who walks in.
    roomState: {},
    notes: {}
  }

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    seed,
    pack: {
      id: pack.manifest.id ?? null,
      version: pack.manifest.version ?? null,
      name: pack.manifest.name ?? null
    },
    cells,
    rooms,
    gameDetails
  }
}
