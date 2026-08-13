import test from 'node:test'
import assert from 'node:assert/strict'

import {
  lexicalMapper, gravitron, ORIENTATIONS, ENTRY_GRAVITY_TUPLES
} from '../src/engine/lexicalMap.js'
import { OPPOSITE_SLOT, DOORS_PER_ROOM } from '../src/engine/topology.js'

const LABELS = ['Up', 'Down', 'Left', 'Right', 'Front', 'Back']
const OPPOSITE_LABEL = {
  Up: 'Down', Down: 'Up', Left: 'Right', Right: 'Left', Front: 'Back', Back: 'Front'
}

// ── The orientation table ───────────────────────────────────────────────────

test('the table covers all 36 entry/gravity combinations', () => {
  assert.equal(ENTRY_GRAVITY_TUPLES.length, 36)
  assert.equal(ORIENTATIONS.length, 36)

  const seen = new Set(ENTRY_GRAVITY_TUPLES.map(t => t.join(',')))
  assert.equal(seen.size, 36, 'duplicate entry/gravity tuple')

  for (let entry = 0; entry < DOORS_PER_ROOM; entry++) {
    for (let gravity = 0; gravity < DOORS_PER_ROOM; gravity++) {
      assert.ok(seen.has(`${entry},${gravity}`), `missing ${entry},${gravity}`)
    }
  }
})

test('every row labels all 6 directions once', () => {
  ORIENTATIONS.forEach((row, i) => {
    assert.deepEqual([...row].sort(), [...LABELS].sort(), `row ${i}`)
  })
})

// This is the pairing that .config/default.json's cellMap disagreed with.
test('opposite slots carry opposite labels', () => {
  ORIENTATIONS.forEach((row, i) => {
    for (let slot = 0; slot < DOORS_PER_ROOM; slot++) {
      assert.equal(
        row[OPPOSITE_SLOT[slot]], OPPOSITE_LABEL[row[slot]],
        `row ${i}: slot ${slot} (${row[slot]}) vs ${OPPOSITE_SLOT[slot]} (${row[OPPOSITE_SLOT[slot]]})`
      )
    }
  })
})

test('the gravity slot is always the one labelled Down', () => {
  ENTRY_GRAVITY_TUPLES.forEach(([entry, gravity], i) => {
    assert.equal(
      ORIENTATIONS[i][gravity], 'Down',
      `entry ${entry}, gravity ${gravity}: slot ${gravity} is ${ORIENTATIONS[i][gravity]}`
    )
  })
})

// ── lexicalMapper ───────────────────────────────────────────────────────────

test('lexicalMapper returns the row for an entry/gravity pair', () => {
  for (let entry = 0; entry < DOORS_PER_ROOM; entry++) {
    for (let gravity = 0; gravity < DOORS_PER_ROOM; gravity++) {
      const labels = lexicalMapper(entry, gravity)
      assert.equal(labels.length, DOORS_PER_ROOM)
      assert.equal(labels[gravity], 'Down')
    }
  }
})

test('lexicalMapper hands back a copy, not the shared row', () => {
  const first = lexicalMapper(0, 0)
  first[0] = 'Mutated'
  assert.notEqual(lexicalMapper(0, 0)[0], 'Mutated')
})

test('special gravity (-1) falls back to gravity 0', () => {
  assert.deepEqual(lexicalMapper(2, -1), lexicalMapper(2, 0))
})

test('lexicalMapper returns undefined for an out-of-range entry', () => {
  assert.equal(lexicalMapper(6, 0), undefined)
  assert.equal(lexicalMapper(-1, 0), undefined)
})

// ── gravitron ───────────────────────────────────────────────────────────────

test('Fixed gravity returns the room\'s own value', () => {
  assert.equal(gravitron({ gravity: { type: 'Fixed', gravity: 4 } }, 2), 4)
})

test('Match gravity carries the previous room\'s value', () => {
  assert.equal(gravitron({ gravity: { type: 'Match', gravity: 0 } }, 3), 3)
})

test('Match gravity falls back to 0 when the previous room was Special', () => {
  assert.equal(gravitron({ gravity: { type: 'Match', gravity: 0 } }, -1), 0)
})

test('Special gravity returns -1', () => {
  assert.equal(gravitron({ gravity: { type: 'Special', gravity: 0 } }, 2), -1)
})

test('Random gravity stays in range', () => {
  for (let i = 0; i < 200; i++) {
    const g = gravitron({ gravity: { type: 'Random', gravity: 0 } }, 0)
    assert.ok(Number.isInteger(g) && g >= 0 && g < DOORS_PER_ROOM, `got ${g}`)
  }
})
