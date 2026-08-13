import test from 'node:test'
import assert from 'node:assert/strict'

import { makeRng, ROOM_COUNT } from '../src/engine/topology.js'
import { loadPack, resolveInstances, resolveRoom, PackError } from '../src/pack/load.js'
import { instanceId, contentIdOf, ordinalOf, slugify, looseSlugify, uniqueSlug, emptyPackTemplate } from '../src/pack/schema.js'
import { validatePack } from '../src/pack/validate.js'
import { bigPackJson } from './fixtures.js'

const bigPack = loadPack(bigPackJson())

const rng = () => makeRng(42)

// A three-room pack: the documented minimum. Start, exit, and one template to
// fill the other 37 slots.
const tinyPack = () => loadPack({
  schemaVersion: 1,
  manifest: { id: 'tiny', name: 'Tiny', version: '1.0.0' },
  cells: { colors: Array.from({ length: 10 }, (_, i) => ({ hex: '#000000', name: `c${i}` })) },
  rooms: {
    'way-in': { name: 'Way In', role: 'start', read: 'The door.' },
    'way-out': { name: 'Way Out', role: 'exit', read: 'The other door.' }
  },
  filler: { strategy: 'templates', templates: ['vault'], distribution: 'spread' },
  fillerRooms: {
    vault: {
      name: 'Vault',
      read: 'A cubic chamber. {{variant}}',
      variants: [
        { id: 'crates', text: 'Rotting crates line one wall.' },
        { id: 'dry', text: 'The air tastes of chalk.' }
      ]
    }
  }
})

// ── Slugs ───────────────────────────────────────────────────────────────────

test('slugify handles punctuation and apostrophes', () => {
  assert.equal(slugify("Kazan's Library"), 'kazans-library')
  assert.equal(slugify('Exit! (not in Roll20)'), 'exit-not-in-roll20')
  assert.equal(slugify("I'm on a boat!"), 'im-on-a-boat')
  assert.equal(slugify('***', 'fallback'), 'fallback')
})

// looseSlugify backs live id-editing inputs (pack id, action id, reset event
// id) rather than name-derived ones. It must never claw back toward an old
// value while the user is mid-edit -- that was the "can't delete the first
// character" bug: clearing the field to '' has to actually leave it empty.
test('looseSlugify never reverts to a fallback, even down to empty', () => {
  assert.equal(looseSlugify('searched'), 'searched')
  assert.equal(looseSlugify('sear'), 'sear')
  assert.equal(looseSlugify('s'), 's')
  assert.equal(looseSlugify(''), '')
  assert.equal(looseSlugify('***'), '')
  assert.equal(looseSlugify("Kazan's Library"), 'kazans-library')
})

test('uniqueSlug disambiguates collisions in order', () => {
  const taken = new Set()
  const got = ['Empty', 'Empty', 'Empty'].map(n => {
    const slug = uniqueSlug(slugify(n), taken)
    taken.add(slug)
    return slug
  })
  assert.deepEqual(got, ['empty', 'empty-2', 'empty-3'])
})

test('instance ids round-trip', () => {
  assert.equal(instanceId('generic-vault', 3), 'generic-vault.3')
  assert.equal(contentIdOf('generic-vault.3'), 'generic-vault')
  assert.equal(ordinalOf('generic-vault.3'), 3)
})

// ── A large, fully-authored pack ────────────────────────────────────────────

test('a large pack has exactly one start and one exit', () => {
  const roles = Object.values(bigPack.rooms).map(r => r.role).filter(Boolean)
  assert.deepEqual(roles.sort(), ['exit', 'start'])
})

test('a fully-authored 40-room pack fills a dungeon with no filler', () => {
  const instances = resolveInstances(bigPack, rng())
  assert.equal(instances.length, ROOM_COUNT)
  assert.ok(instances.every(i => i.ordinal === 1), 'a room was repeated')
  assert.equal(new Set(instances.map(i => i.contentId)).size, ROOM_COUNT)
})

test('a large pack carries 10 named cell colors', () => {
  assert.equal(bigPack.cells.colors.length, 10)
  assert.equal(new Set(bigPack.cells.colors.map(c => c.hex)).size, 10)
  assert.equal(new Set(bigPack.cells.colors.map(c => c.name)).size, 10)
})

test('rooms with no size migrate to null rather than an empty string', () => {
  // RoomDrawer.jsx calls size.join(), guarded only by truthiness.
  for (const [id, room] of Object.entries(bigPack.rooms)) {
    assert.ok(room.size === null || Array.isArray(room.size), `${id}: ${room.size}`)
  }
})

test('gravity normalises to a known type with a value only when Fixed', () => {
  for (const [id, room] of Object.entries(bigPack.rooms)) {
    assert.ok(['Fixed', 'Random', 'Match', 'Special'].includes(room.gravity.type), id)
    if (room.gravity.type === 'Fixed') {
      assert.ok(Number.isInteger(room.gravity.gravity), id)
      assert.ok(room.gravity.gravity >= 0 && room.gravity.gravity < 6, id)
    }
  }
})

// ── Small packs ─────────────────────────────────────────────────────────────

test('a three-room pack fills all 40 slots', () => {
  const instances = resolveInstances(tinyPack(), rng())
  assert.equal(instances.length, ROOM_COUNT)

  const byContent = {}
  for (const i of instances) byContent[i.contentId] = (byContent[i.contentId] ?? 0) + 1
  assert.deepEqual(byContent, { 'way-in': 1, 'way-out': 1, vault: 38 })
})

test('reuse never repeats the start or exit room', () => {
  const pack = loadPack({
    manifest: { id: 'reuse', name: 'Reuse', version: '1.0.0' },
    rooms: {
      'way-in': { name: 'Way In', role: 'start' },
      'way-out': { name: 'Way Out', role: 'exit' },
      hall: { name: 'Hall' },
      cellar: { name: 'Cellar' }
    },
    filler: { strategy: 'reuse', reusePool: '*', distribution: 'spread' }
  })

  const instances = resolveInstances(pack, rng())
  assert.equal(instances.length, ROOM_COUNT)

  for (const role of ['way-in', 'way-out']) {
    assert.equal(instances.filter(i => i.contentId === role).length, 1, role)
  }
})

test('maxInstances caps how often content repeats', () => {
  const pack = loadPack({
    manifest: { id: 'capped', name: 'Capped', version: '1.0.0' },
    rooms: {
      'way-in': { name: 'Way In', role: 'start' },
      'way-out': { name: 'Way Out', role: 'exit' }
    },
    filler: { strategy: 'templates', templates: ['a', 'b'], distribution: 'spread' },
    fillerRooms: {
      a: { name: 'A', maxInstances: 5 },
      b: { name: 'B' }
    }
  })

  const instances = resolveInstances(pack, rng())
  assert.equal(instances.filter(i => i.contentId === 'a').length, 5)
  assert.equal(instances.filter(i => i.contentId === 'b').length, 33)
})

test('spread exhausts variety before repeating', () => {
  const pack = loadPack({
    manifest: { id: 'spread', name: 'Spread', version: '1.0.0' },
    rooms: {
      'way-in': { name: 'Way In', role: 'start' },
      'way-out': { name: 'Way Out', role: 'exit' }
    },
    filler: {
      strategy: 'templates',
      templates: ['a', 'b', 'c', 'd'],
      distribution: 'spread'
    },
    fillerRooms: {
      a: { name: 'A' }, b: { name: 'B' }, c: { name: 'C' }, d: { name: 'D' }
    }
  })

  const counts = {}
  for (const i of resolveInstances(pack, rng())) {
    if (i.contentId.length === 1) counts[i.contentId] = (counts[i.contentId] ?? 0) + 1
  }
  // 38 filler slots over 4 templates: 10, 10, 9, 9 -- never more than one apart.
  const values = Object.values(counts).sort()
  assert.equal(values.length, 4)
  assert.ok(values[3] - values[0] <= 1, `uneven spread: ${JSON.stringify(counts)}`)
})

// ── Variants and labelling ──────────────────────────────────────────────────

test('variants cycle across repeats', () => {
  const vaults = resolveInstances(tinyPack(), rng()).filter(i => i.contentId === 'vault')
  assert.equal(vaults[0].variantId, 'crates')
  assert.equal(vaults[1].variantId, 'dry')
  assert.equal(vaults[2].variantId, 'crates')
})

test('variant text substitutes into the {{variant}} marker', () => {
  const vaults = resolveInstances(tinyPack(), rng()).filter(i => i.contentId === 'vault')
  assert.equal(vaults[0].room.read, 'A cubic chamber. Rotting crates line one wall.')
  assert.ok(!vaults[1].room.read.includes('{{variant}}'))
})

test('variant text without a marker becomes a trailing paragraph', () => {
  const room = resolveRoom(
    { name: 'Hall', read: 'A long hall.', labelRepeats: true },
    'hall', 1, { id: 'dusty', text: 'Dust hangs in the air.' }
  )
  assert.equal(room.read, 'A long hall.\n\nDust hangs in the air.')
})

test('an unfilled marker is stripped rather than shown to the GM', () => {
  const room = resolveRoom(
    { name: 'Hall', read: 'A hall. {{variant}}', labelRepeats: true },
    'hall', 1, null
  )
  assert.equal(room.read, 'A hall.')
})

test('repeats get a numeral, the first instance does not', () => {
  const vaults = resolveInstances(tinyPack(), rng()).filter(i => i.contentId === 'vault')
  assert.equal(vaults[0].room.name, 'Vault')
  assert.equal(vaults[1].room.name, 'Vault (2)')
  assert.equal(vaults[3].room.name, 'Vault (4)')
})

test('labelRepeats false suppresses the numeral', () => {
  const room = resolveRoom({ name: 'Vault', labelRepeats: false }, 'vault', 3, null)
  assert.equal(room.name, 'Vault')
})

test('resolved rooms carry back-references and drop authoring fields', () => {
  const [first] = resolveInstances(tinyPack(), rng()).filter(i => i.contentId === 'vault')
  assert.equal(first.room.contentId, 'vault')
  assert.equal(first.room.instanceOrdinal, 1)
  assert.equal(first.room.variantId, 'crates')

  for (const field of ['variants', 'maxInstances', 'labelRepeats']) {
    assert.ok(!(field in first.room), `${field} leaked into the resolved room`)
  }
})

// ── Failures ────────────────────────────────────────────────────────────────

test('too many authored rooms is a structured error', () => {
  const rooms = {}
  for (let i = 0; i < 41; i++) rooms[`r${i}`] = { name: `R${i}` }

  assert.throws(
    () => resolveInstances(loadPack({ manifest: {}, rooms }), rng()),
    err => err instanceof PackError && err.code === 'PACK_TOO_MANY_ROOMS'
  )
})

test('a pack that cannot reach 40 rooms is a structured error', () => {
  const pack = loadPack({
    manifest: { id: 'short', name: 'Short', version: '1.0.0' },
    rooms: {
      'way-in': { name: 'Way In', role: 'start' },
      'way-out': { name: 'Way Out', role: 'exit' }
    },
    filler: { strategy: 'templates', templates: ['a'] },
    fillerRooms: { a: { name: 'A', maxInstances: 3 } }
  })

  assert.throws(
    () => resolveInstances(pack, rng()),
    err => err instanceof PackError &&
      err.code === 'PACK_INSUFFICIENT_FILLER' &&
      err.detail.supplied === 5
  )
})

test('loadPack rejects a non-object', () => {
  assert.throws(() => loadPack(null), err => err.code === 'PACK_NOT_AN_OBJECT')
})

test('loadPack passes pack-defined resetEvents through unresolved', () => {
  const pack = loadPack({
    schemaVersion: 1,
    manifest: { id: 'x', name: 'X', version: '1' },
    resetEvents: [{ id: 'return-to-start', label: 'Return to start' }],
    rooms: {}
  })
  assert.deepEqual(pack.resetEvents, [{ id: 'return-to-start', label: 'Return to start' }])
})

test('loadPack defaults resetEvents to null when absent', () => {
  const pack = loadPack({ schemaVersion: 1, manifest: { id: 'x', name: 'X', version: '1' }, rooms: {} })
  assert.equal(pack.resetEvents, null)
})

// ── Determinism ─────────────────────────────────────────────────────────────

test('a seed reproduces the same instances', () => {
  const a = resolveInstances(tinyPack(), makeRng(7))
  const b = resolveInstances(tinyPack(), makeRng(7))
  assert.deepEqual(a.map(i => i.instanceId), b.map(i => i.instanceId))
})

test('instance ids are unique', () => {
  for (const pack of [bigPack, tinyPack()]) {
    const ids = resolveInstances(pack, rng()).map(i => i.instanceId)
    assert.equal(new Set(ids).size, ROOM_COUNT)
  }
})

// ── Empty pack template ──────────────────────────────────────────────────────

test('emptyPackTemplate pre-seeds cell colors and clears the static gates', () => {
  const { errors } = validatePack(emptyPackTemplate())
  const codes = errors.map(e => e.code)
  assert.deepEqual(codes.sort(), ['ROLE_MISSING', 'ROLE_MISSING'])
})
