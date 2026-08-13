import test from 'node:test'
import assert from 'node:assert/strict'

import { generateDungeon, SAVE_SCHEMA_VERSION } from '../src/engine/dungeon.js'
import { GameEngine } from '../src/engine/GameEngine.js'
import { bfsShortestPath } from '../src/engine/pathfinding.js'
import { ROOM_COUNT, CELL_COUNT, ROOMS_PER_CELL, DOORS_PER_ROOM } from '../src/engine/topology.js'
import { PackError } from '../src/pack/load.js'
import { bigPackJson } from './fixtures.js'

const bigPack = bigPackJson()

const SEEDS = [0, 1, 7, 42, 1337, 99999]
const state = generateDungeon(bigPack, { seed: 42 })

const tinyPack = {
  schemaVersion: 1,
  manifest: { id: 'tiny', name: 'Tiny', version: '1.0.0' },
  cells: {
    colors: Array.from({ length: 10 }, (_, i) => ({ hex: `#00000${i}`, name: `c${i}` }))
  },
  rooms: {
    'way-in': { name: 'Way In', role: 'start', read: 'in' },
    'way-out': { name: 'Way Out', role: 'exit', read: 'out' }
  },
  filler: { strategy: 'templates', templates: ['vault'], distribution: 'spread' },
  fillerRooms: {
    vault: {
      name: 'Vault',
      read: 'A chamber. {{variant}}',
      variants: [{ id: 'a', text: 'Dusty.' }, { id: 'b', text: 'Damp.' }]
    }
  }
}

// ── Shape ───────────────────────────────────────────────────────────────────

test('generation produces 10 cells and 40 rooms', () => {
  assert.equal(Object.keys(state.cells).length, CELL_COUNT)
  assert.equal(Object.keys(state.rooms).length, ROOM_COUNT)
  assert.equal(state.schemaVersion, SAVE_SCHEMA_VERSION)
})

test('the save records the pack it came from', () => {
  assert.deepEqual(state.pack, {
    id: 'full-fixture', version: '1.0.0', name: 'Full Fixture'
  })
  assert.equal(state.seed, 42)
})

test('each cell holds 8 rooms with 8 distinct positions', () => {
  for (const [id, cell] of Object.entries(state.cells)) {
    const ids = Object.keys(cell.cellRooms)
    assert.equal(ids.length, ROOMS_PER_CELL, `cell ${id}`)

    const positions = ids.map(r => cell.cellRooms[r].position)
    assert.equal(new Set(positions).size, ROOMS_PER_CELL, `cell ${id} reuses a position`)
  }
})

test('every room lies in exactly 2 cells', () => {
  const membership = {}
  for (const cell of Object.values(state.cells)) {
    for (const roomId of Object.keys(cell.cellRooms)) {
      membership[roomId] = (membership[roomId] ?? 0) + 1
    }
  }

  assert.equal(Object.keys(membership).length, ROOM_COUNT)
  for (const [roomId, count] of Object.entries(membership)) {
    assert.equal(count, 2, roomId)
  }
})

// The invariant the old generator silently violated.
test('the dungeon is an actual penteract', () => {
  for (const seed of SEEDS) {
    const s = generateDungeon(bigPack, { seed })
    const ids = Object.keys(s.cells)
    const histogram = {}

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = new Set(Object.keys(s.cells[ids[i]].cellRooms))
        const shared = Object.keys(s.cells[ids[j]].cellRooms).filter(r => a.has(r)).length
        histogram[shared] = (histogram[shared] ?? 0) + 1
      }
    }

    assert.deepEqual(histogram, { 0: 5, 1: 40 }, `seed ${seed}`)
  }
})

test('otherCell names the room\'s other tesseract', () => {
  for (const [id, cell] of Object.entries(state.cells)) {
    for (const [roomId, placement] of Object.entries(cell.cellRooms)) {
      const other = placement.otherCell
      assert.notEqual(other, id, `${roomId} claims itself as its other cell`)
      assert.ok(state.cells[other], `unknown cell ${other}`)
      assert.ok(
        state.cells[other].cellRooms[roomId],
        `${roomId} is not resident in its declared other cell ${other}`
      )
    }
  }
})

// ── Doors ───────────────────────────────────────────────────────────────────

test('doors resolve to real rooms in the same cell', () => {
  for (const [id, cell] of Object.entries(state.cells)) {
    for (const [roomId, placement] of Object.entries(cell.cellRooms)) {
      assert.equal(placement.doors.length, DOORS_PER_ROOM, roomId)
      assert.equal(new Set(placement.doors).size, DOORS_PER_ROOM, `${roomId} has duplicate doors`)

      for (const target of placement.doors) {
        assert.notEqual(target, undefined, `${roomId} has an undefined door`)
        assert.notEqual(target, roomId, `${roomId} doors onto itself`)
        assert.ok(cell.cellRooms[target], `${roomId} -> ${target} leaves cell ${id}`)
        assert.ok(state.rooms[target], `door target ${target} has no room content`)
      }
    }
  }
})

test('every door has exactly one door leading back', () => {
  for (const cell of Object.values(state.cells)) {
    for (const [roomId, placement] of Object.entries(cell.cellRooms)) {
      for (const target of placement.doors) {
        const back = cell.cellRooms[target].doors.filter(d => d === roomId)
        assert.equal(back.length, 1, `${roomId} <-> ${target}`)
      }
    }
  }
})

// This is what the old code produced when its candidate pool ran dry.
test('no seed produces an undefined room id anywhere', () => {
  for (let seed = 0; seed < 40; seed++) {
    const s = generateDungeon(bigPack, { seed })
    const json = JSON.stringify(s)
    assert.ok(!json.includes('undefined'), `seed ${seed} emitted undefined`)
    assert.ok(!json.includes('null,null'), `seed ${seed} emitted null ids`)
  }
})

// ── Start, exit, keys ───────────────────────────────────────────────────────

test('start and exit are placed in cells they actually occupy', () => {
  for (const seed of SEEDS) {
    const { cells, gameDetails: gd } = generateDungeon(bigPack, { seed })

    assert.ok(cells[gd.startCell].cellRooms[gd.startRoom], `seed ${seed}: start`)
    assert.ok(cells[gd.exitCell].cellRooms[gd.exitRoom], `seed ${seed}: exit`)
    assert.equal(gd.parties[0].currentCell, gd.startCell)
    assert.equal(gd.parties[0].currentRoom, gd.startRoom)
  }
})

// The old generator found the start cell by looking for the cell whose *key*
// was the start room, so it broke the moment a start room was not key-eligible.
test('start placement does not depend on the start room being key-eligible', () => {
  const pack = JSON.parse(JSON.stringify(bigPack))
  pack.rooms.entrance.keyEligible = false

  for (const seed of SEEDS) {
    const { cells, gameDetails: gd } = generateDungeon(pack, { seed })
    assert.ok(gd.startCell != null && gd.startRoom != null, `seed ${seed}`)
    assert.ok(cells[gd.startCell].cellRooms[gd.startRoom], `seed ${seed}`)
  }
})

test('the start and exit rooms are the ones the pack designated', () => {
  assert.equal(state.rooms[state.gameDetails.startRoom].contentId, 'entrance')
  assert.equal(state.rooms[state.gameDetails.exitRoom].contentId, 'exit-room')
})

test('each key is a key-eligible room resident in its own cell', () => {
  for (const seed of SEEDS) {
    const s = generateDungeon(bigPack, { seed })

    for (const [id, cell] of Object.entries(s.cells)) {
      if (cell.key == null) continue
      assert.ok(cell.cellRooms[cell.key], `seed ${seed}: cell ${id} key is not resident`)
      assert.equal(s.rooms[cell.key].keyEligible, true, `seed ${seed}: cell ${id}`)
    }
  }
})

test('no room holds the key for both of its cells', () => {
  for (const seed of SEEDS) {
    const keys = Object.values(generateDungeon(bigPack, { seed }).cells)
      .map(c => c.key).filter(Boolean)
    assert.equal(new Set(keys).size, keys.length, `seed ${seed}`)
  }
})

test('a pack with no key-eligible rooms generates with no keys', () => {
  const pack = JSON.parse(JSON.stringify(bigPack))
  Object.values(pack.rooms).forEach(r => { delete r.keyEligible })

  const s = generateDungeon(pack, { seed: 3 })
  assert.deepEqual(Object.values(s.cells).map(c => c.key), new Array(CELL_COUNT).fill(null))
})

// Key placement is a bipartite matching. Two rooms share at most one cell in a
// penteract, so k eligible rooms can always key k distinct cells -- a greedy
// pick strands some of them, a maximum matching never does.
test('every key-eligible room keys a cell when supply is short', () => {
  const pack = JSON.parse(JSON.stringify(bigPack))
  Object.values(pack.rooms).forEach(r => { delete r.keyEligible })

  const eligible = ['entrance', 'aux-room-1', 'aux-room-2', 'aux-room-3']
  eligible.forEach(id => { pack.rooms[id].keyEligible = true })

  for (let seed = 0; seed < 25; seed++) {
    const keyed = Object.values(generateDungeon(pack, { seed }).cells).filter(c => c.key)
    assert.equal(keyed.length, eligible.length, `seed ${seed}`)
  }
})

test('key coverage stays high when supply exactly matches the cell count', () => {
  // 10 eligible rooms for 10 cells. A perfect matching does not always exist,
  // but greedy assignment used to manage it on 9 seeds in 200; matching should
  // clear 9 cells on the large majority.
  const counts = []
  for (let seed = 0; seed < 60; seed++) {
    counts.push(Object.values(generateDungeon(bigPack, { seed }).cells).filter(c => c.key).length)
  }

  const strong = counts.filter(n => n >= 9).length
  assert.ok(strong > counts.length * 0.7, `only ${strong}/${counts.length} seeds keyed 9+ cells`)
  assert.ok(Math.min(...counts) >= 6, `worst seed keyed only ${Math.min(...counts)} cells`)
})

// ── Grouping constraints ────────────────────────────────────────────────────

test('include group members share a tesseract', () => {
  for (const seed of SEEDS) {
    const s = generateDungeon(bigPack, { seed })

    const members = Object.entries(s.rooms)
      .filter(([, r]) => r.includeGroup === 'paired-rooms')
      .map(([id]) => id)
    assert.equal(members.length, 2, `seed ${seed}`)

    const shared = Object.values(s.cells)
      .filter(cell => members.every(m => cell.cellRooms[m]))
    assert.ok(shared.length >= 1, `seed ${seed}: ${members.join(' + ')} never share a cell`)
  }
})

test('exclude group members never share a tesseract', () => {
  const tagged = ['aux-room-1', 'aux-room-2', 'aux-room-3', 'aux-room-4', 'aux-room-5']
  const instances = tagged.map(id => `${id}.1`)

  const pack = JSON.parse(JSON.stringify(bigPack))
  tagged.forEach(id => { pack.rooms[id].excludeGroup = 'apart' })

  const crowding = state => Object.entries(state.cells).map(([id, cell]) => ({
    id, held: instances.filter(i => cell.cellRooms[i])
  }))

  for (const seed of SEEDS) {
    for (const { id, held } of crowding(generateDungeon(pack, { seed }))) {
      assert.ok(held.length <= 1, `seed ${seed}: cell ${id} holds ${held.join(', ')}`)
    }
  }

  // Guards against the assertion passing because placement happens to spread
  // these rooms anyway: without the tag, they do crowd.
  const unconstrained = SEEDS.flatMap(seed =>
    crowding(generateDungeon(bigPack, { seed })).map(c => c.held.length))
  assert.ok(Math.max(...unconstrained) > 1, 'exclude group is not being exercised')
})

// ── Small packs ─────────────────────────────────────────────────────────────

test('a three-room pack generates a full dungeon', () => {
  const s = generateDungeon(tinyPack, { seed: 5 })
  assert.equal(Object.keys(s.rooms).length, ROOM_COUNT)
  assert.equal(Object.keys(s.cells).length, CELL_COUNT)

  const byContent = {}
  for (const room of Object.values(s.rooms)) {
    byContent[room.contentId] = (byContent[room.contentId] ?? 0) + 1
  }
  assert.deepEqual(byContent, { 'way-in': 1, 'way-out': 1, vault: 38 })

  // The repeats have to be tellable apart, or the GM is running 38 identical
  // rooms: a numeral on the name and alternating variant text.
  const vaults = Object.values(s.rooms)
    .filter(r => r.contentId === 'vault')
    .sort((a, b) => a.instanceOrdinal - b.instanceOrdinal)

  assert.equal(vaults[0].name, 'Vault')
  assert.equal(vaults[1].name, 'Vault (2)')
  assert.equal(vaults[37].name, 'Vault (38)')

  assert.equal(vaults[0].read, 'A chamber. Dusty.')
  assert.equal(vaults[1].read, 'A chamber. Damp.')
  assert.equal(new Set(vaults.map(v => v.variantId)).size, 2)
})

test('a three-room pack still keys its cells from filler', () => {
  const s = generateDungeon(tinyPack, { seed: 5 })
  const keyed = Object.values(s.cells).filter(c => c.key)
  assert.equal(keyed.length, CELL_COUNT, 'filler is key-eligible by default')
})

// ── Determinism ─────────────────────────────────────────────────────────────

test('a seed reproduces the dungeon exactly', () => {
  for (const seed of SEEDS) {
    assert.deepEqual(
      generateDungeon(bigPack, { seed }),
      generateDungeon(bigPack, { seed }),
      `seed ${seed}`
    )
  }
})

test('different seeds produce different dungeons', () => {
  const shapes = SEEDS.map(seed => JSON.stringify(generateDungeon(bigPack, { seed }).cells))
  assert.equal(new Set(shapes).size, SEEDS.length)
})

// ── Options ─────────────────────────────────────────────────────────────────

test('cellChoiceMode is recorded and defaults to gm', () => {
  assert.equal(state.gameDetails.cellChoiceMode, 'gm')
  assert.equal(
    generateDungeon(bigPack, { seed: 1, cellChoiceMode: 'random' })
      .gameDetails.cellChoiceMode,
    'random'
  )
})

test('an unknown cellChoiceMode is rejected', () => {
  assert.throws(
    () => generateDungeon(bigPack, { cellChoiceMode: 'coin-flip' }),
    err => err instanceof PackError && err.code === 'INVALID_CELL_CHOICE_MODE'
  )
})

test('the vestigial lexicalMap and placeholder fields are gone', () => {
  assert.equal(state.gameDetails.lexicalMap, undefined)
  assert.equal(state.gameDetails.steps, undefined)
  assert.equal(state.gameDetails.ticks, undefined)

  for (const cell of Object.values(state.cells)) {
    assert.equal(cell.id, undefined, 'cellTemplate placeholder leaked')
    assert.equal(cell.name, undefined, 'cellTemplate placeholder leaked')
    assert.ok(cell.colorName, 'cells should carry a spoken color name')
  }
})

// ── Downstream compatibility ────────────────────────────────────────────────

test('GameEngine drives a generated dungeon', () => {
  const engine = new GameEngine(generateDungeon(bigPack, { seed: 11 }), true)
  const context = engine.getRoomContext()

  assert.equal(context.orientation.doors.length, DOORS_PER_ROOM)
  assert.ok(context.room.name)
  assert.equal(typeof context.narrativeSummary, 'string')

  const choices = engine.getPreviewChoices(engine.party().currentCell)
  assert.equal(choices.length, DOORS_PER_ROOM)
  for (const choice of choices) {
    assert.ok(choice.targetRoomId)
    assert.notEqual(choice.targetRoomName, '?')
  }
})

test('a party can walk the dungeon without falling off it', () => {
  const engine = new GameEngine(generateDungeon(bigPack, { seed: 11 }), true)

  for (let step = 0; step < 40; step++) {
    const cell = step % 3 === 0 ? engine.getOtherCell() : engine.party().currentCell
    engine.previewDoor(step % DOORS_PER_ROOM, cell)
    assert.equal(engine.move(), true, `step ${step}`)

    const p = engine.party()
    assert.ok(engine.cells[p.currentCell].cellRooms[p.currentRoom], `step ${step}: left the dungeon`)
    assert.ok(p.currentEntry >= 0 && p.currentEntry < DOORS_PER_ROOM, `step ${step}: bad entry`)
    assert.equal(p.currentDoors.length, DOORS_PER_ROOM, `step ${step}`)
  }
})

test('the exit is reachable from the start on every seed', () => {
  for (const seed of SEEDS) {
    const { cells, gameDetails: gd } = generateDungeon(bigPack, { seed })
    const path = bfsShortestPath(cells, gd.startCell, gd.startRoom, gd.exitCell, gd.exitRoom)
    assert.notEqual(path, null, `seed ${seed}: exit unreachable`)
  }
})
