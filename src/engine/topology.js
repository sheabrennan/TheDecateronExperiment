// Closed-form geometry of the 5-cube (penteract).
//
// Label each tesseract cell by the coordinate it fixes: (axis 0..4, bit 0..1),
// giving 10 cells.  A room fixes two coordinates, so rooms are exactly the
// unordered pairs {(i,a),(j,b)} with i !== j -- the edge set of the
// cocktail-party graph K(5x2).  Every invariant then falls out for free:
//
//   - 10 cells; C(5,2) * 4 = 40 rooms
//   - each room lies in exactly 2 cells (its two endpoints)
//   - each cell holds 8 rooms (4 other axes x 2 bits)
//   - two cells share exactly one room, unless they are antipodal (same axis,
//     opposite bit), in which case they share none
//
// That last property is the one the previous generator lost.  It picked each
// room's second cell greedily by "whichever cell has the most slots left", which
// produces a legal 8-regular configuration but not the polytope: measured
// against a real penteract's pair-overlap histogram of {0:5, 1:40}, the old
// output scored {0:12, 1:26, 2:7}.
//
// Nothing here searches or backtracks, so it cannot fail or emit a partial
// dungeon.  The seed only drives cosmetic labelling (which numeric id a cell
// gets, which position name a room gets inside a cell) -- never the topology,
// which is fixed.

export const AXIS_COUNT = 5
export const CELL_COUNT = 10
export const ROOM_COUNT = 40
export const ROOMS_PER_CELL = 8
export const DOORS_PER_ROOM = 6

// The 8 room positions within a cell, as 4 antipodal pairs.
export const POSITION_PAIRS = [
  ['North', 'South'],
  ['Top', 'Bottom'],
  ['West', 'East'],
  ['Inner', 'Outer']
]

export const POSITIONS = POSITION_PAIRS.flat()

// Door slot i is physically opposite slot OPPOSITE_SLOT[i].
//
// This convention is load-bearing: ORIENTATIONS in lexicalMap.js labels
// opposite faces at (0,3), (1,4), (2,5) in all 36 of its rows.  The cellMap in
// .config/default.json paired them at (0,2), (1,3), (4,5) instead, so the door
// labelled "Up" was never the one opposite the door labelled "Down" -- every
// orientation description the GM read out was wrong.  See the note at
// index.js:9, which logged this as a playtest complaint about "consistency in
// orientation description".
export const OPPOSITE_SLOT = [3, 4, 5, 0, 1, 2]

// Handedness target for every room's door frame.  Any fixed value works; what
// matters is that all 8 positions agree, or rooms would be mirror images of
// each other and left/right would flip between them.
const HANDEDNESS = -1

// ── Derivation of the door map ──────────────────────────────────────────────
// Derived rather than transcribed, so it cannot drift or pick up a typo.  Each
// vector is a signed basis vector, so a 4x4 determinant reduces to the parity of
// the axis permutation times the product of the signs.

function permutationSign (axes) {
  let inversions = 0
  for (let i = 0; i < axes.length; i++) {
    for (let j = i + 1; j < axes.length; j++) if (axes[i] > axes[j]) inversions++
  }
  return inversions % 2 === 0 ? 1 : -1
}

function determinant (vectors) {
  return permutationSign(vectors.map(v => v.pair)) *
    vectors.reduce((acc, v) => acc * v.sign, 1)
}

function positionOf (pair, sign) {
  return POSITION_PAIRS[pair][sign === 1 ? 0 : 1]
}

// position -> the 6 positions reachable through door slots 0..5, in slot order.
function buildDoorMap () {
  const map = {}

  POSITION_PAIRS.forEach((names, pair) => {
    names.forEach((position, pole) => {
      const normal = { pair, sign: pole === 0 ? 1 : -1 }
      const facing = [0, 1, 2, 3]
        .filter(p => p !== pair)
        .map(p => ({ pair: p, sign: 1 }))

      // Flip one axis if needed so every room's frame has the same handedness.
      if (determinant([...facing, normal]) !== HANDEDNESS) facing[2].sign = -1

      map[position] = [
        ...facing.map(v => positionOf(v.pair, v.sign)),
        ...facing.map(v => positionOf(v.pair, -v.sign))
      ]
    })
  })

  return map
}

export const DOOR_MAP = buildDoorMap()

// ── Seeded RNG ──────────────────────────────────────────────────────────────
// mulberry32.  Small, dependency-free, and good enough for cosmetic shuffles.

export function makeRng (seed = 0) {
  let a = seed >>> 0
  return function rng () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffled (items, rng) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ── Topology ────────────────────────────────────────────────────────────────

// Builds the fixed skeleton the generator then assigns content to.
//
// Returns:
//   cells     - 10 x { id, axis, bit, positions: {position -> slot},
//                      bySlot: {slot -> position} }
//   cellById  - id -> cell
//   slots     - 40 x { index, cells: [idA, idB], positions: {cellId -> position} }
export function buildTopology (seed = 0) {
  const rng = makeRng(seed)

  // 1. Hand out cell ids.  Cosmetic: relabelling cells cannot change the shape.
  const coords = []
  for (let axis = 0; axis < AXIS_COUNT; axis++) {
    for (let bit = 0; bit < 2; bit++) coords.push({ axis, bit })
  }

  const cells = shuffled(coords, rng).map((coord, id) => ({
    id: String(id),
    axis: coord.axis,
    bit: coord.bit,
    positions: {},
    bySlot: {}
  }))

  const cellById = {}
  for (const cell of cells) cellById[cell.id] = cell

  // 2. Slots are the cell pairs on differing axes -- 45 pairs less the 5
  //    antipodal ones = 40.
  const slots = []
  for (let a = 0; a < cells.length; a++) {
    for (let b = a + 1; b < cells.length; b++) {
      if (cells[a].axis === cells[b].axis) continue
      slots.push({
        index: slots.length,
        cells: [cells[a].id, cells[b].id],
        positions: {}
      })
    }
  }

  // 3. Name each slot's position within each of its two cells.  Inside a cell,
  //    a room is identified by the *other* cell's (axis, bit); the 4 other axes
  //    map onto the 4 position pairs and the bit picks the pole.  Any bijection
  //    is geometrically valid, so this is seeded purely for variety.
  for (const cell of cells) {
    const otherAxes = [0, 1, 2, 3, 4].filter(a => a !== cell.axis)
    const pairForAxis = shuffled([0, 1, 2, 3], rng)
    const flipForAxis = otherAxes.map(() => rng() < 0.5)

    const axisMapping = new Map()
    otherAxes.forEach((axis, i) => {
      axisMapping.set(axis, { pair: pairForAxis[i], flip: flipForAxis[i] })
    })

    for (const slot of slots) {
      if (!slot.cells.includes(cell.id)) continue

      const otherId = slot.cells[0] === cell.id ? slot.cells[1] : slot.cells[0]
      const other = cellById[otherId]
      const { pair, flip } = axisMapping.get(other.axis)
      const pole = flip ? 1 - other.bit : other.bit
      const position = POSITION_PAIRS[pair][pole]

      cell.positions[position] = slot.index
      cell.bySlot[slot.index] = position
      slot.positions[cell.id] = position
    }
  }

  return { seed, cells, cellById, slots }
}

// The 6 slots reachable from `slotIndex` when travelling through `cellId`,
// indexed by door slot.  A room has two of these -- one per cell it belongs to
// -- and which one applies is the GM's (or chance's) choice at the door.
export function doorTargets (topology, cellId, slotIndex) {
  const cell = topology.cellById[cellId]
  const position = cell.bySlot[slotIndex]
  if (position === undefined) {
    throw new Error(`slot ${slotIndex} is not in cell ${cellId}`)
  }
  return DOOR_MAP[position].map(p => cell.positions[p])
}

// The cell directly opposite `cellId` -- same axis, other bit.  Shares no room
// with it, and is the only cell for which that is true.
export function antipodeOf (topology, cellId) {
  const cell = topology.cellById[cellId]
  return topology.cells.find(c => c.axis === cell.axis && c.bit !== cell.bit).id
}
