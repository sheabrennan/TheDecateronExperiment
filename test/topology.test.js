import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTopology, doorTargets, antipodeOf,
  DOOR_MAP, POSITIONS, POSITION_PAIRS, OPPOSITE_SLOT,
  CELL_COUNT, ROOM_COUNT, ROOMS_PER_CELL, DOORS_PER_ROOM
} from '../src/engine/topology.js'

const SEEDS = [0, 1, 7, 42, 1337, 99999]
const topo = buildTopology(42)

const antipodal = (a, b) => a.axis === b.axis && a.bit !== b.bit

// ── Door map ────────────────────────────────────────────────────────────────

test('every position has 6 doors', () => {
  assert.equal(Object.keys(DOOR_MAP).length, 8)
  for (const position of POSITIONS) {
    assert.equal(DOOR_MAP[position].length, DOORS_PER_ROOM, position)
  }
})

test('a room\'s doors are exactly the 6 non-antipodal positions', () => {
  for (const [a, b] of POSITION_PAIRS) {
    for (const [position, antipode] of [[a, b], [b, a]]) {
      const expected = POSITIONS.filter(p => p !== position && p !== antipode)
      assert.deepEqual([...DOOR_MAP[position]].sort(), expected.sort(), position)
    }
  }
})

// The defect this whole phase exists to fix.  cellMap in .config/default.json
// paired opposite faces at slots (0,2), (1,3), (4,5); ORIENTATIONS pairs them at
// (0,3), (1,4), (2,5).  The two must agree or the GM reads out wrong directions.
test('opposite door slots hold antipodal positions', () => {
  const antipodeFor = {}
  for (const [a, b] of POSITION_PAIRS) {
    antipodeFor[a] = b
    antipodeFor[b] = a
  }

  for (const position of POSITIONS) {
    const doors = DOOR_MAP[position]
    for (let slot = 0; slot < DOORS_PER_ROOM; slot++) {
      assert.equal(
        doors[OPPOSITE_SLOT[slot]], antipodeFor[doors[slot]],
        `${position}: slot ${slot} (${doors[slot]}) vs slot ${OPPOSITE_SLOT[slot]}`
      )
    }
  }
})

test('all rooms share one handedness', () => {
  const axisOf = {}
  const signOf = {}
  POSITION_PAIRS.forEach((names, pair) => {
    names.forEach((name, pole) => {
      axisOf[name] = pair
      signOf[name] = pole === 0 ? 1 : -1
    })
  })

  const determinant = names => {
    const axes = names.map(n => axisOf[n])
    let inversions = 0
    for (let i = 0; i < axes.length; i++) {
      for (let j = i + 1; j < axes.length; j++) if (axes[i] > axes[j]) inversions++
    }
    return (inversions % 2 === 0 ? 1 : -1) *
      names.reduce((acc, n) => acc * signOf[n], 1)
  }

  const seen = new Set(
    POSITIONS.map(p => determinant([...DOOR_MAP[p].slice(0, 3), p]))
  )
  assert.equal(seen.size, 1, `mixed handedness: ${[...seen]} -- rooms would mirror`)
})

// ── Topology shape ──────────────────────────────────────────────────────────

test('10 cells and 40 rooms', () => {
  assert.equal(topo.cells.length, CELL_COUNT)
  assert.equal(topo.slots.length, ROOM_COUNT)
})

test('every room lies in exactly 2 cells', () => {
  for (const slot of topo.slots) {
    assert.equal(slot.cells.length, 2, `slot ${slot.index}`)
    assert.notEqual(slot.cells[0], slot.cells[1])
  }

  const membership = {}
  for (const slot of topo.slots) {
    for (const id of slot.cells) membership[id] = (membership[id] ?? 0) + 1
  }
  for (const cell of topo.cells) {
    assert.equal(membership[cell.id], ROOMS_PER_CELL, `cell ${cell.id}`)
  }
})

test('every cell names its 8 rooms with 8 distinct positions', () => {
  for (const cell of topo.cells) {
    const positions = Object.keys(cell.positions)
    assert.equal(positions.length, ROOMS_PER_CELL, `cell ${cell.id}`)
    assert.equal(new Set(positions).size, ROOMS_PER_CELL)
    assert.equal(new Set(Object.values(cell.positions)).size, ROOMS_PER_CELL)

    for (const [position, slot] of Object.entries(cell.positions)) {
      assert.equal(cell.bySlot[slot], position)
      assert.ok(topo.slots[slot].cells.includes(cell.id))
    }
  }
})

// The check that would have caught the original defect.  A real penteract has
// exactly one room in common between any two non-antipodal cells, and none
// between antipodal ones: 5 pairs at 0, the other 40 at 1.  The old generator
// scored {0:12, 1:26, 2:7} on .config/games/alpha.json.
test('cell pair overlap matches a penteract exactly', () => {
  for (const seed of SEEDS) {
    const t = buildTopology(seed)
    const histogram = {}

    for (let i = 0; i < t.cells.length; i++) {
      for (let j = i + 1; j < t.cells.length; j++) {
        const a = new Set(Object.values(t.cells[i].positions))
        const shared = Object.values(t.cells[j].positions).filter(s => a.has(s)).length
        histogram[shared] = (histogram[shared] ?? 0) + 1

        assert.equal(
          shared, antipodal(t.cells[i], t.cells[j]) ? 0 : 1,
          `seed ${seed}: cells ${t.cells[i].id}/${t.cells[j].id} share ${shared}`
        )
      }
    }

    assert.deepEqual(histogram, { 0: 5, 1: 40 }, `seed ${seed}`)
  }
})

test('antipodeOf finds the one cell sharing no room', () => {
  for (const cell of topo.cells) {
    const antipode = topo.cellById[antipodeOf(topo, cell.id)]
    assert.ok(antipodal(cell, antipode))

    const mine = new Set(Object.values(cell.positions))
    const theirs = Object.values(antipode.positions).filter(s => mine.has(s))
    assert.equal(theirs.length, 0, `cell ${cell.id} vs antipode ${antipode.id}`)
  }
})

// ── Doors ───────────────────────────────────────────────────────────────────

test('door targets are resident in the same cell and never self-referential', () => {
  for (const cell of topo.cells) {
    for (const slot of Object.values(cell.positions)) {
      const targets = doorTargets(topo, cell.id, slot)
      assert.equal(targets.length, DOORS_PER_ROOM)
      assert.equal(new Set(targets).size, DOORS_PER_ROOM, 'duplicate door targets')

      for (const target of targets) {
        assert.notEqual(target, undefined, `cell ${cell.id} slot ${slot}`)
        assert.notEqual(target, slot, 'room doors onto itself')
        assert.ok(
          topo.slots[target].cells.includes(cell.id),
          `target ${target} not resident in cell ${cell.id}`
        )
      }
    }
  }
})

test('every door has exactly one door leading back', () => {
  for (const cell of topo.cells) {
    for (const slot of Object.values(cell.positions)) {
      for (const target of doorTargets(topo, cell.id, slot)) {
        const back = doorTargets(topo, cell.id, target)
        const returns = back.filter(s => s === slot)
        assert.equal(
          returns.length, 1,
          `cell ${cell.id}: ${slot} -> ${target} has ${returns.length} ways back`
        )
      }
    }
  }
})

// The return door is found by position, not by flipping the slot index --
// GameEngine.move() already relies on this, resolving the entry door with
// doors.indexOf(previousRoom) rather than arithmetic.
test('the return door sits where the origin position appears', () => {
  for (const cell of topo.cells) {
    for (const [position, slot] of Object.entries(cell.positions)) {
      doorTargets(topo, cell.id, slot).forEach((target, door) => {
        const targetPosition = DOOR_MAP[position][door]
        const back = doorTargets(topo, cell.id, target)
        assert.equal(back[DOOR_MAP[targetPosition].indexOf(position)], slot)
      })
    }
  }
})

// A tesseract's cubes meet across differing axes, so "walk straight through"
// mostly does not hold: two thirds of the time the door facing your entry leads
// somewhere new rather than back the way you came.  This is the behaviour that
// stops players mapping the dungeon.
//
// The surviving third is structural, not noise -- exactly 2 of each room's 6
// doors -- and the fraction is a cheap fingerprint of the geometry.  Flattening
// the dungeon into an ordinary grid would drive it to 100%; corrupting the
// adjacency would make it drift off a clean third.
test('one third of doors face their own return door', () => {
  for (const seed of SEEDS) {
    const t = buildTopology(seed)
    let facing = 0
    let total = 0

    for (const cell of t.cells) {
      for (const [position, slot] of Object.entries(cell.positions)) {
        doorTargets(t, cell.id, slot).forEach((target, door) => {
          const back = doorTargets(t, cell.id, target)
          if (back.indexOf(slot) === OPPOSITE_SLOT[door]) facing++
          total++
        })
      }
    }

    assert.equal(total, CELL_COUNT * ROOMS_PER_CELL * DOORS_PER_ROOM, `seed ${seed}`)
    assert.equal(facing * 3, total, `seed ${seed}: ${facing}/${total} face their return`)
  }
})

test('doorTargets rejects a slot absent from the cell', () => {
  const cell = topo.cells[0]
  const foreign = topo.slots.find(s => !s.cells.includes(cell.id))
  assert.throws(() => doorTargets(topo, cell.id, foreign.index), /not in cell/)
})

// ── Determinism ─────────────────────────────────────────────────────────────

test('a seed reproduces its dungeon exactly', () => {
  for (const seed of SEEDS) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(buildTopology(seed).cells)),
      JSON.parse(JSON.stringify(buildTopology(seed).cells)),
      `seed ${seed}`
    )
  }
})

test('different seeds relabel without changing the shape', () => {
  const layouts = SEEDS.map(s => JSON.stringify(buildTopology(s).cells))
  assert.ok(new Set(layouts).size > 1, 'seed has no effect on labelling')
})
