// A synthetic, fully-authored 40-room pack for tests that need a large,
// realistic-shaped fixture -- deliberately not tied to any pack the app
// actually ships, so the test suite never depends on product content.
//
// Room ids below are referenced by exact string in several test files
// (pack.test.js, validate.test.js, dungeon.test.js) to exercise specific
// structural cases (a key-eligible start room, an include-group pair, an
// exclude-group cluster, reassigning keyEligible). Keep ids in sync if you
// change this file.

import { CELL_COUNT, ROOM_COUNT } from '../src/engine/topology.js'

const GRAVITY_CYCLE = ['Fixed', 'Random', 'Match', 'Special']

// Rooms 0-9 are named anchors specific tests key off of; the rest are plain
// filler-shaped (but still authored, not `fillerRooms`) rooms, with the last
// one the exit.
const NAMED = ['entrance', 'partner-room', 'dup-start-room', 'alt-key-room',
  'aux-room-1', 'aux-room-2', 'aux-room-3', 'aux-room-4', 'aux-room-5',
  'creature-room']

export function bigPackJson () {
  const ids = [...NAMED]
  while (ids.length < ROOM_COUNT - 1) ids.push(`room-${ids.length}`)
  ids.push('exit-room')

  // Exactly CELL_COUNT (10) rooms are key-eligible in the baseline pack,
  // including entrance but not alt-key-room -- several tests swap
  // keyEligible between exactly these two and check the total stays at 10.
  const keyEligibleIds = new Set(
    ids.filter(id => id !== 'alt-key-room').slice(0, CELL_COUNT)
  )

  const rooms = {}
  ids.forEach((id, i) => {
    const gravityType = GRAVITY_CYCLE[i % GRAVITY_CYCLE.length]
    rooms[id] = {
      name: `Room ${i}`,
      read: `Read-aloud text for room ${i}.`,
      gravity: gravityType === 'Fixed' ? { type: 'Fixed', gravity: i % 6 } : { type: gravityType },
      keyEligible: keyEligibleIds.has(id)
    }
  })

  rooms.entrance.role = 'start'
  rooms.entrance.includeGroup = 'paired-rooms'
  rooms['partner-room'].includeGroup = 'paired-rooms'
  rooms['exit-room'].role = 'exit'

  rooms['creature-room'].creatures = [
    { id: 'guard', name: 'A patchwork guard', count: 1, resetsOn: ['long-rest'] }
  ]
  rooms['creature-room'].rest = { safety: 'unsafe', effect: 'The guard respawns after a long rest.' }

  return {
    schemaVersion: 1,
    manifest: { id: 'full-fixture', name: 'Full Fixture', version: '1.0.0' },
    cells: {
      colors: Array.from({ length: CELL_COUNT }, (_, i) => ({
        hex: `#${((i + 1) * 0x111111).toString(16).padStart(6, '0')}`,
        name: `Cell ${i}`
      }))
    },
    rooms,
    filler: { strategy: 'reuse', reusePool: '*', distribution: 'spread' },
    fillerRooms: {},
    actions: [{ id: 'searched', label: 'searched', resetsOn: [] }]
  }
}
