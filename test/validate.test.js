import test from 'node:test'
import assert from 'node:assert/strict'

import { validatePack } from '../src/pack/validate.js'
import { bigPackJson } from './fixtures.js'

const bigPack = bigPackJson()

const codes = result => result.errors.map(e => e.code)
const warnCodes = result => result.warnings.map(w => w.code)

const clone = () => JSON.parse(JSON.stringify(bigPack))

// Smallest pack that validates clean, used as the base for negative cases.
const minimal = (overrides = {}) => ({
  schemaVersion: 1,
  manifest: { id: 'minimal', name: 'Minimal', version: '1.0.0' },
  cells: {
    colors: Array.from({ length: 10 }, (_, i) => ({ hex: `#00000${i}`, name: `c${i}` }))
  },
  rooms: {
    'way-in': { name: 'Way In', role: 'start', read: 'in', keyEligible: true },
    'way-out': { name: 'Way Out', role: 'exit', read: 'out' }
  },
  filler: { strategy: 'templates', templates: ['vault'], distribution: 'spread' },
  fillerRooms: { vault: { name: 'Vault', read: 'a vault' } },
  ...overrides
})

// ── A large, fully-authored pack ────────────────────────────────────────────

test('a large pack validates', () => {
  const result = validatePack(bigPack)
  assert.deepEqual(codes(result), [])
  assert.equal(result.ok, true)
})

test('a large, fully-authored pack reports what it will produce', () => {
  const { info } = validatePack(bigPack)
  assert.equal(info.authoredRooms, 40)
  assert.equal(info.fillerNeeded, 0)
  assert.equal(info.distinctContent, 40)
  assert.equal(info.repeatedContent, 0)
  assert.equal(info.cellsWithKeys, 10)
})

// Confirmed as intended: the reference pack hands out a key in the first room,
// and a pack is free to make the opposite choice.
test('a key-eligible start room is not a finding', () => {
  assert.equal(bigPack.rooms.entrance.role, 'start')
  assert.equal(bigPack.rooms.entrance.keyEligible, true)

  const result = validatePack(bigPack)
  assert.equal(result.ok, true)
  assert.deepEqual(
    [...result.errors, ...result.warnings].filter(f => f.path?.startsWith('rooms.entrance')),
    []
  )
})

test('a key-ineligible start room is equally clean', () => {
  const pack = clone()
  pack.rooms.entrance.keyEligible = false
  pack.rooms['alt-key-room'].keyEligible = true

  const result = validatePack(pack)
  assert.equal(result.ok, true)
  assert.equal(result.info.cellsWithKeys, 10)
})

test('exactly as many key rooms as cells is flagged as forced placement', () => {
  assert.ok(warnCodes(validatePack(bigPack)).includes('KEY_ROOMS_EXACT'))
})

// ── Envelope ────────────────────────────────────────────────────────────────

test('a non-object is rejected without throwing', () => {
  for (const bad of [null, undefined, 42, 'pack', []]) {
    const result = validatePack(bad)
    assert.equal(result.ok, false)
    assert.deepEqual(codes(result), ['PACK_NOT_AN_OBJECT'])
  }
})

test('a future schema version is rejected rather than guessed at', () => {
  const result = validatePack(minimal({ schemaVersion: 99 }))
  assert.deepEqual(codes(result), ['PACK_SCHEMA_UNSUPPORTED'])
  assert.equal(result.errors[0].detail.found, 99)
})

test('manifest id, name and version are required', () => {
  const result = validatePack(minimal({ manifest: {} }))
  assert.equal(codes(result).filter(c => c === 'MANIFEST_FIELD_MISSING').length, 3)
})

test('a manifest id that is not a slug is rejected', () => {
  const result = validatePack(
    minimal({ manifest: { id: 'Not A Slug', name: 'n', version: '1' } })
  )
  assert.ok(codes(result).includes('MANIFEST_ID_INVALID'))
})

test('CC-BY without attribution warns', () => {
  const result = validatePack(
    minimal({ manifest: { id: 'm', name: 'M', version: '1', license: 'CC-BY-4.0' } })
  )
  assert.ok(warnCodes(result).includes('ATTRIBUTION_MISSING'))
})

// ── Cells ───────────────────────────────────────────────────────────────────

test('the palette must hold exactly one color per cell', () => {
  const result = validatePack(minimal({ cells: { colors: [{ hex: '#fff', name: 'a' }] } }))
  assert.ok(codes(result).includes('CELL_COLORS_COUNT'))
  assert.equal(result.errors.find(e => e.code === 'CELL_COLORS_COUNT').detail.found, 1)
})

test('duplicate cell colors warn but do not block, since not every pack uses color as the tell', () => {
  const colors = Array.from({ length: 10 }, () => ({ hex: '#FF0000', name: 'Red' }))
  const result = validatePack(minimal({ cells: { colors } }))
  assert.ok(warnCodes(result).includes('CELL_COLORS_DUPLICATE'))
  assert.equal(result.ok, true)
})

// ── Custom reset events ──────────────────────────────────────────────────────

test('a pack-defined reset event makes resetsOn accept it', () => {
  const pack = minimal({ resetEvents: [{ id: 'return-to-start', label: 'Return to start' }] })
  pack.rooms['way-in'].features = [{ name: 'lever', kind: 'lever', resetsOn: ['return-to-start'] }]
  const result = validatePack(pack)
  assert.equal(result.ok, true)
})

test('an unknown resetsOn event is still rejected', () => {
  const pack = minimal()
  pack.rooms['way-in'].features = [{ name: 'lever', kind: 'lever', resetsOn: ['return-to-start'] }]
  assert.ok(codes(validatePack(pack)).includes('ROOM_RESET_EVENT_INVALID'))
})

test('a custom reset event id must be a slug', () => {
  const pack = minimal({ resetEvents: [{ id: 'Not A Slug', label: 'x' }] })
  assert.ok(codes(validatePack(pack)).includes('PACK_RESET_EVENT_ID_INVALID'))
})

test('a custom reset event cannot reuse a built-in id', () => {
  const pack = minimal({ resetEvents: [{ id: 'doors', label: 'x' }] })
  assert.ok(codes(validatePack(pack)).includes('PACK_RESET_EVENT_ID_COLLISION'))
})

test('two custom reset events cannot share an id', () => {
  const pack = minimal({ resetEvents: [{ id: 'foo', label: 'a' }, { id: 'foo', label: 'b' }] })
  assert.ok(codes(validatePack(pack)).includes('PACK_RESET_EVENT_ID_COLLISION'))
})

// ── Text template vars ───────────────────────────────────────────────────────

test('a declared template var silences the unknown-token warning', () => {
  const pack = minimal({ templateVars: [{ key: 'guardian', value: 'Azreth' }] })
  pack.rooms['way-in'].read = 'Guarded by {{guardian}}.'
  const result = validatePack(pack)
  assert.equal(warnCodes(result).includes('TEMPLATE_VAR_UNKNOWN'), false)
})

test('an undeclared {{token}} in room text warns but does not block', () => {
  const pack = minimal()
  pack.rooms['way-in'].read = 'Guarded by {{guardian}}.'
  const result = validatePack(pack)
  assert.ok(warnCodes(result).includes('TEMPLATE_VAR_UNKNOWN'))
  assert.equal(result.ok, true)
})

test('{{variant}} is never flagged as an unknown token', () => {
  const pack = minimal()
  pack.rooms['way-in'].read = 'A cubic chamber. {{variant}}'
  const result = validatePack(pack)
  assert.equal(warnCodes(result).includes('TEMPLATE_VAR_UNKNOWN'), false)
})

test('{{cellColor}} is always known, with no declaration needed', () => {
  const pack = minimal()
  pack.rooms['way-in'].read = 'The walls glow {{cellColor}}.'
  const result = validatePack(pack)
  assert.equal(warnCodes(result).includes('TEMPLATE_VAR_UNKNOWN'), false)
})

test('a template var key must be a valid identifier', () => {
  const pack = minimal({ templateVars: [{ key: '1bad', value: 'x' }] })
  assert.ok(codes(validatePack(pack)).includes('PACK_TEMPLATE_VAR_KEY_INVALID'))
})

test('a template var cannot redeclare a reserved or built-in key', () => {
  for (const key of ['cellColor', 'variant']) {
    const pack = minimal({ templateVars: [{ key, value: 'x' }] })
    assert.ok(codes(validatePack(pack)).includes('PACK_TEMPLATE_VAR_KEY_COLLISION'), key)
  }
})

test('two template vars cannot share a key', () => {
  const pack = minimal({ templateVars: [{ key: 'foo', value: 'a' }, { key: 'foo', value: 'b' }] })
  assert.ok(codes(validatePack(pack)).includes('PACK_TEMPLATE_VAR_KEY_COLLISION'))
})

// ── Roles ───────────────────────────────────────────────────────────────────

test('a missing start or exit is an error naming the role', () => {
  const pack = minimal()
  delete pack.rooms['way-out'].role

  const result = validatePack(pack)
  const missing = result.errors.find(e => e.code === 'ROLE_MISSING')
  assert.equal(missing.detail.role, 'exit')
})

test('two start rooms is an error listing both', () => {
  const pack = clone()
  pack.rooms['dup-start-room'].role = 'start'

  const result = validatePack(pack)
  const dup = result.errors.find(e => e.code === 'ROLE_DUPLICATED')
  assert.equal(dup.detail.role, 'start')
  assert.deepEqual(dup.detail.rooms.sort(), ['dup-start-room', 'entrance'])
})

test('filler cannot hold the start or exit role', () => {
  const pack = minimal()
  pack.fillerRooms.vault.role = 'start'
  assert.ok(codes(validatePack(pack)).includes('FILLER_ROOM_HAS_ROLE'))
})

// ── Rooms ───────────────────────────────────────────────────────────────────

test('an unknown gravity type is rejected with the allowed set', () => {
  const pack = clone()
  pack.rooms.entrance.gravity = { type: 'Sideways' }

  const result = validatePack(pack)
  const bad = result.errors.find(e => e.code === 'ROOM_GRAVITY_TYPE_INVALID')
  assert.equal(bad.path, 'rooms.entrance.gravity.type')
  assert.deepEqual(bad.detail.allowed, ['Fixed', 'Random', 'Match', 'Special'])
})

test('Fixed gravity outside 0-5 is rejected', () => {
  for (const value of [6, -1, 2.5, null, 'up']) {
    const pack = clone()
    pack.rooms.entrance.gravity = { type: 'Fixed', gravity: value }
    assert.ok(
      codes(validatePack(pack)).includes('ROOM_GRAVITY_VALUE_INVALID'),
      `accepted ${value}`
    )
  }
})

test('a malformed room slug is rejected', () => {
  const pack = minimal()
  pack.rooms['Way In'] = pack.rooms['way-in']
  delete pack.rooms['way-in']
  assert.ok(codes(validatePack(pack)).includes('ROOM_SLUG_INVALID'))
})

test('a slug defined in both rooms and fillerRooms is rejected', () => {
  const pack = minimal()
  pack.fillerRooms['way-in'] = { name: 'Collision' }
  assert.ok(codes(validatePack(pack)).includes('ROOM_SLUG_COLLISION'))
})

test('maxInstances must be a positive integer', () => {
  for (const value of [0, -3, 1.5]) {
    const pack = minimal()
    pack.fillerRooms.vault.maxInstances = value
    assert.ok(codes(validatePack(pack)).includes('ROOM_MAX_INSTANCES_INVALID'), `accepted ${value}`)
  }
})

test('duplicate variant ids are rejected', () => {
  const pack = minimal()
  pack.fillerRooms.vault.variants = [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }]
  assert.ok(codes(validatePack(pack)).includes('ROOM_VARIANTS_INVALID'))
})

test('a room with no read-aloud text warns but does not block', () => {
  const pack = minimal()
  delete pack.fillerRooms.vault.read

  const result = validatePack(pack)
  assert.equal(result.ok, true)
  assert.ok(warnCodes(result).includes('ROOM_READ_EMPTY'))
})

// ── Groups ──────────────────────────────────────────────────────────────────

test('an include group larger than a cell is rejected', () => {
  const pack = clone()
  Object.keys(pack.rooms).slice(0, 9).forEach(id => { pack.rooms[id].includeGroup = 'too-big' })

  const result = validatePack(pack)
  const bad = result.errors.find(e => e.code === 'INCLUDE_GROUP_TOO_LARGE')
  assert.equal(bad.detail.members.length, 9)
  assert.equal(bad.detail.limit, 8)
})

test('an exclude group larger than 5 is rejected', () => {
  const pack = clone()
  Object.keys(pack.rooms).slice(0, 6).forEach(id => { pack.rooms[id].excludeGroup = 'apart' })

  const result = validatePack(pack)
  const bad = result.errors.find(e => e.code === 'EXCLUDE_GROUP_TOO_LARGE')
  assert.equal(bad.detail.limit, 5)
})

test('a group of one warns that it constrains nothing', () => {
  // The fixture pairs entrance with partner-room; dropping one leaves a
  // singleton, which is the shape of a half-finished grouping.
  const pack = clone()
  delete pack.rooms['partner-room'].includeGroup
  assert.ok(warnCodes(validatePack(pack)).includes('INCLUDE_GROUP_SINGLETON'))
})

test('the fixture pack has a well-formed include group', () => {
  const paired = Object.entries(bigPack.rooms)
    .filter(([, r]) => r.includeGroup === 'paired-rooms')
    .map(([id]) => id)
  assert.deepEqual(paired.sort(), ['entrance', 'partner-room'])
  assert.ok(!warnCodes(validatePack(bigPack)).includes('INCLUDE_GROUP_SINGLETON'))
})

// ── Filler ──────────────────────────────────────────────────────────────────

test('an unknown filler strategy is rejected', () => {
  const pack = minimal()
  pack.filler.strategy = 'sideways'
  assert.ok(codes(validatePack(pack)).includes('FILLER_STRATEGY_INVALID'))
})

test('a template reference with no matching filler room is rejected', () => {
  const pack = minimal()
  pack.filler.templates = ['missing']
  const result = validatePack(pack)
  assert.ok(codes(result).includes('FILLER_REF_UNKNOWN'))
  assert.equal(result.errors.find(e => e.code === 'FILLER_REF_UNKNOWN').detail.id, 'missing')
})

test('a reusePool reference with no matching room is rejected', () => {
  const pack = minimal({ filler: { strategy: 'reuse', reusePool: ['ghost'] } })
  assert.ok(codes(validatePack(pack)).includes('FILLER_REF_UNKNOWN'))
})

// The check that makes small packs safe to ship: static fields all pass, and
// only running the resolver proves the pack cannot reach 40 rooms.
test('a pack that cannot fill 40 rooms is caught before generation', () => {
  const pack = minimal()
  pack.fillerRooms.vault.maxInstances = 3

  const result = validatePack(pack)
  assert.equal(result.ok, false)
  assert.ok(codes(result).includes('PACK_INSUFFICIENT_FILLER'))
  assert.equal(result.errors.find(e => e.code === 'PACK_INSUFFICIENT_FILLER').detail.supplied, 5)
})

test('a three-room pack validates and reports its repeats', () => {
  const result = validatePack(minimal())
  assert.equal(result.ok, true)
  assert.equal(result.info.authoredRooms, 2)
  assert.equal(result.info.fillerNeeded, 38)
  assert.equal(result.info.distinctContent, 3)
  assert.equal(result.info.repeatedContent, 37)
})

test('more rooms than a dungeon holds is rejected', () => {
  const rooms = {}
  for (let i = 0; i < 41; i++) rooms[`r${i}`] = { name: `R${i}`, read: 'x' }
  rooms.r0.role = 'start'
  rooms.r1.role = 'exit'

  assert.ok(codes(validatePack(minimal({ rooms }))).includes('PACK_TOO_MANY_ROOMS'))
})

// ── Key supply is descriptive, not a constraint ─────────────────────────────

test('fewer key rooms than cells is a warning that names the shortfall', () => {
  const pack = clone()
  Object.values(pack.rooms).forEach(r => { delete r.keyEligible })
  pack.rooms.entrance.keyEligible = true
  pack.rooms['alt-key-room'].keyEligible = true

  const result = validatePack(pack)
  assert.equal(result.ok, true)

  const warning = result.warnings.find(w => w.code === 'KEY_ROOMS_BELOW_CELLS')
  assert.equal(warning.detail.keyEligible, 2)
  assert.equal(result.info.cellsWithKeys, 2)
})

test('no key rooms at all is valid, for a chase or a hunt', () => {
  const pack = clone()
  Object.values(pack.rooms).forEach(r => { delete r.keyEligible })

  const result = validatePack(pack)
  assert.equal(result.ok, true)
  assert.ok(warnCodes(result).includes('KEY_ROOMS_NONE'))
  assert.equal(result.info.cellsWithKeys, 0)
})

test('more key rooms than cells is entirely clean', () => {
  const pack = clone()
  Object.values(pack.rooms).forEach(r => { r.keyEligible = true })

  const result = validatePack(pack)
  assert.equal(result.ok, true)
  assert.ok(!warnCodes(result).some(c => c.startsWith('KEY_ROOMS')))
  assert.equal(result.info.cellsWithKeys, 10)
})

// ── Findings are machine-consumable ─────────────────────────────────────────

test('every finding carries a code, message and path', () => {
  const pack = minimal({ manifest: {}, cells: { colors: [] } })
  const result = validatePack(pack)

  for (const finding of [...result.errors, ...result.warnings]) {
    assert.equal(typeof finding.code, 'string')
    assert.ok(finding.code.length > 0)
    assert.equal(typeof finding.message, 'string')
    assert.ok(finding.message.length > 0)
    assert.equal(typeof finding.path, 'string')
  }
})

test('validation never throws, whatever it is handed', () => {
  const nasty = [
    {}, { rooms: null }, { rooms: { a: null } }, { manifest: { id: 5 } },
    { rooms: { a: { gravity: null } } }, { filler: { templates: 'nope' } },
    { cells: { colors: [null, undefined] } }, { rooms: { a: { variants: 'x' } } }
  ]
  for (const pack of nasty) {
    assert.doesNotThrow(() => validatePack(pack), JSON.stringify(pack))
  }
})
