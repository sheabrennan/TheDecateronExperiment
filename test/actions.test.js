import test from 'node:test'
import assert from 'node:assert/strict'

import { GameSession } from '../src/io/session.js'
import * as storage from '../src/io/storage.js'
import { roomActions } from '../src/engine/roomView.js'
import { validatePack } from '../src/pack/validate.js'
import { bigPackJson } from './fixtures.js'

const pack = bigPackJson()

const fresh = async () => {
  storage.__resetMemory()
  return GameSession.create(pack, { name: 'Test run', seed: 42 })
}

// A room with one of everything, to check the derivation rather than the pack.
const stocked = {
  name: 'Mirror Boggles',
  creatures: [{ id: 'boggles', name: 'Boggle', resetsOn: ['long-rest'] }],
  features: [
    { id: 'amulet', name: 'Glowing amulet', kind: 'key' },
    { id: 'glass', name: 'Broken glass', kind: 'hazard', resetsOn: ['short-rest'] },
    { id: 'lever', name: 'Rusted lever', kind: 'lever' },
    { id: 'plaque', name: 'Brass plaque', kind: 'lore' }
  ]
}

// ── Derivation ──────────────────────────────────────────────────────────────

test('every creature and feature becomes its own action', () => {
  const actions = roomActions(stocked, {})
  const ids = actions.map(a => a.id)

  assert.deepEqual(ids, [
    'creature:boggles',
    'feature:amulet', 'feature:glass', 'feature:lever', 'feature:plaque',
    'searched'
  ])
})

test('the verb suits what the thing is', () => {
  const byId = Object.fromEntries(roomActions(stocked, {}).map(a => [a.id, a.label]))

  assert.equal(byId['creature:boggles'], 'Boggle defeated')
  assert.equal(byId['feature:amulet'], 'Glowing amulet taken')
  assert.equal(byId['feature:glass'], 'Broken glass disarmed')
  assert.equal(byId['feature:lever'], 'Rusted lever used')
  assert.equal(byId['feature:plaque'], 'Brass plaque read')
})

test('ids are namespaced so a creature cannot collide with a room action', () => {
  const actions = roomActions({
    creatures: [{ id: 'searched', name: 'Something' }]
  }, {})

  const ids = actions.map(a => a.id)
  assert.deepEqual(ids, ['creature:searched', 'searched'])
  assert.equal(new Set(ids).size, 2)
})

test('resetsOn travels from the pack entry onto the action', () => {
  const byId = Object.fromEntries(roomActions(stocked, {}).map(a => [a.id, a.resetsOn]))

  assert.deepEqual(byId['creature:boggles'], ['long-rest'])
  assert.deepEqual(byId['feature:glass'], ['short-rest'])
  assert.deepEqual(byId['feature:amulet'], [])
})

test('a feature of kind key is what hands the key over', () => {
  const granting = roomActions(stocked, {}).filter(a => a.grantsKey)
  assert.deepEqual(granting.map(a => a.id), ['feature:amulet'])
})

test('a key room with no key feature gets a generated key action', () => {
  const bare = { name: 'Empty', creatures: [], features: [] }

  assert.deepEqual(roomActions(bare, { isKeyRoom: false }).map(a => a.id), ['searched'])
  assert.deepEqual(roomActions(bare, { isKeyRoom: true }).map(a => a.id), ['searched', 'key'])
})

test('a room may override the pack\'s room-level actions', () => {
  const room = { ...stocked, actions: [{ id: 'sealed', label: 'sealed shut' }] }
  const ids = roomActions(room, {}).map(a => a.id)

  assert.ok(ids.includes('sealed'))
  assert.ok(!ids.includes('searched'), 'the pack default was not overridden')
})

test('a room with nothing in it still offers the room-level action', () => {
  assert.deepEqual(roomActions({}, {}).map(a => a.id), ['searched'])
})

// ── Through the session ─────────────────────────────────────────────────────

test('the room context carries the actions with their done state', async () => {
  const session = await fresh()
  const { room } = session.getState()

  assert.ok(room.actions.length > 0)
  for (const action of room.actions) {
    assert.equal(typeof action.id, 'string')
    assert.equal(typeof action.label, 'string')
    assert.equal(action.done, false)
    assert.ok(Array.isArray(action.resetsOn))
  }
})

test('doing an action records it, and undoing it clears it', async () => {
  const session = await fresh()
  const [action] = session.getState().room.actions

  await session.setRoomFlag(action.id, true)
  assert.equal(session.getState().room.actions.find(a => a.id === action.id).done, true)

  await session.setRoomFlag(action.id, false)
  assert.equal(session.getState().room.actions.find(a => a.id === action.id).done, false)
})

test('actions are per tesseract, like every other room fact', async () => {
  const session = await fresh()
  const party = session.engine.party()
  const other = session.engine.getOtherCell()

  await session.setRoomFlag('searched', true)

  assert.equal(session.engine.getRoomState(party.currentCell, party.currentRoom).searched, true)
  assert.equal(session.engine.getRoomState(other, party.currentRoom).searched, undefined)
})

test('the previewed room shows what has been done without offering to change it', async () => {
  const session = await fresh()
  const { previewContext } = await session.openDoor(0, session.engine.party().currentCell)

  assert.ok(Array.isArray(previewContext.room.actions))
  for (const action of previewContext.room.actions) {
    assert.equal(typeof action.done, 'boolean')
  }
})

// ── Reset ───────────────────────────────────────────────────────────────────
// The reason actions are state and not notes.

test('a reset undoes only the actions that name that event', async () => {
  const session = await fresh()
  const party = session.engine.party()
  const cellId = String(party.currentCell)
  const roomId = String(party.currentRoom)

  // Author a room with one thing that comes back and one that does not.
  session.engine.rooms[roomId].creatures = [
    { id: 'boggles', name: 'Boggle', resetsOn: ['long-rest'] }
  ]
  session.engine.rooms[roomId].features = [
    { id: 'amulet', name: 'Amulet', kind: 'treasure', resetsOn: [] }
  ]

  await session.setRoomFlag('creature:boggles', true)
  await session.setRoomFlag('feature:amulet', true)

  const { reset } = await session.applyReset('long-rest')

  assert.equal(reset.undone.length, 1)
  assert.equal(reset.undone[0].actionId, 'creature:boggles')

  const state = session.engine.getRoomState(cellId, roomId)
  assert.equal(state['creature:boggles'], undefined, 'the boggles did not come back')
  assert.equal(state['feature:amulet'], true, 'the amulet came back, and should not have')
})

test('a reset for an event nothing names changes nothing', async () => {
  const session = await fresh()
  await session.setRoomFlag('searched', true)

  const { reset } = await session.applyReset('shuffle')
  assert.deepEqual(reset.undone, [])
})

test('a reset reaches rooms the party is nowhere near', async () => {
  const session = await fresh()
  const [cellId, cell] = Object.entries(session.engine.cells)[3]
  const roomId = Object.keys(cell.cellRooms)[2]

  session.engine.rooms[roomId].creatures = [
    { id: 'ghost', name: 'Ghost', resetsOn: ['short-rest'] }
  ]
  session.engine.setRoomFlag(cellId, roomId, 'creature:ghost', true)

  const { reset } = await session.applyReset('short-rest')
  assert.equal(reset.undone.length, 1)
  assert.equal(reset.undone[0].cellId, cellId)
})

// A rest does not take back what the party is carrying. Re-granting through the
// active party would also hand it to whichever group happened to be selected.
test('a reset leaves keys the party is carrying alone', async () => {
  const session = await fresh()
  const party = session.engine.party()
  const cellId = String(party.currentCell)
  const roomId = String(party.currentRoom)

  session.engine.cells[cellId].key = roomId
  session.engine.rooms[roomId].features = [
    { id: 'amulet', name: 'Amulet', kind: 'key', resetsOn: ['long-rest'] }
  ]

  await session.setRoomFlag('feature:amulet', true)
  assert.deepEqual(session.engine.party().keysHeld, [cellId])

  await session.applyReset('long-rest')
  assert.deepEqual(session.engine.party().keysHeld, [cellId],
    'a long rest took the key out of the party\'s hands')
})

// ── Validation ──────────────────────────────────────────────────────────────

test('an unknown reset event is rejected', () => {
  const bad = JSON.parse(JSON.stringify(pack))
  bad.rooms['creature-room'].creatures[0].resetsOn = ['tuesday']

  const codes = validatePack(bad).errors.map(e => e.code)
  assert.ok(codes.includes('ROOM_RESET_EVENT_INVALID'))
})

test('two creatures sharing an id is rejected, since their actions would merge', () => {
  const bad = JSON.parse(JSON.stringify(pack))
  bad.rooms['creature-room'].creatures = [
    { id: 'same', name: 'One' }, { id: 'same', name: 'Two' }
  ]

  const codes = validatePack(bad).errors.map(e => e.code)
  assert.ok(codes.includes('ROOM_LIST_DUPLICATE_ID'))
})

test('a room-level action id must be a slug', () => {
  const bad = JSON.parse(JSON.stringify(pack))
  bad.rooms['creature-room'].actions = [{ id: 'Not A Slug' }]

  const codes = validatePack(bad).errors.map(e => e.code)
  assert.ok(codes.includes('ROOM_ACTION_ID_INVALID'))
})

test('the pack-level action set is validated too', () => {
  const bad = JSON.parse(JSON.stringify(pack))
  bad.actions = [{ id: 'ok' }, { id: 'ALSO NOT' }]

  const codes = validatePack(bad).errors.map(e => e.code)
  assert.ok(codes.includes('PACK_ACTION_ID_INVALID'))
})

test('the reference pack validates with its actions', () => {
  const result = validatePack(pack)
  assert.deepEqual(result.errors, [])
})
