import test from 'node:test'
import assert from 'node:assert/strict'

import { GameSession } from '../src/io/session.js'
import * as storage from '../src/io/storage.js'
import { canMerge, nextPartyId } from '../src/engine/party.js'
import { bigPackJson } from './fixtures.js'

const pack = bigPackJson()

const fresh = async (options = {}) => {
  storage.__resetMemory()
  return GameSession.create(pack, { name: 'Test run', seed: 42, ...options })
}

// Walk a specific party one room on, so two groups can be put in different places.
const step = async (session, partyId, door = 0) => {
  const party = session.engine.party(partyId)
  await session.openDoor(door, party.currentCell, partyId)
  await session.command('move', { partyId })
}

// ── Shape ───────────────────────────────────────────────────────────────────

test('a new game starts with exactly one party', async () => {
  const session = await fresh()
  const parties = session.getParties()

  assert.equal(parties.length, 1)
  assert.equal(parties[0].id, 'a')
  assert.equal(parties[0].name, 'Party A')
  assert.equal(parties[0].isActive, true)
})

test('party ids stay short and readable, because a GM says them aloud', () => {
  assert.equal(nextPartyId([]), 'a')
  assert.equal(nextPartyId([{ id: 'a' }]), 'b')
  assert.equal(nextPartyId([{ id: 'a' }, { id: 'b' }]), 'c')
  // A gap is reused rather than skipped.
  assert.equal(nextPartyId([{ id: 'a' }, { id: 'c' }]), 'b')
})

// ── Splitting ───────────────────────────────────────────────────────────────

test('a split leaves both halves standing where the original was', async () => {
  const session = await fresh()
  const before = session.engine.party('a')
  const { newPartyId } = await session.splitParty('a')

  const [a, b] = [session.engine.party('a'), session.engine.party(newPartyId)]
  assert.equal(b.currentCell, before.currentCell)
  assert.equal(b.currentRoom, before.currentRoom)
  assert.equal(b.currentEntry, before.currentEntry)
  assert.equal(b.gravity, before.gravity)
  assert.deepEqual(b.currentDoors, a.currentDoors)
})

test('a split party can be named', async () => {
  const session = await fresh()
  const { newPartyId } = await session.splitParty('a', { name: 'The scouts' })
  assert.equal(session.engine.party(newPartyId).name, 'The scouts')
})

test('the halves move independently', async () => {
  const session = await fresh()
  const { newPartyId } = await session.splitParty('a')

  await step(session, 'a', 0)

  assert.notEqual(
    session.engine.party('a').currentRoom,
    session.engine.party(newPartyId).currentRoom,
    'moving one party moved the other'
  )
})

test('each party keeps its own undo history', async () => {
  const session = await fresh()
  const { newPartyId } = await session.splitParty('a')

  await step(session, 'a', 1)
  await step(session, 'a', 2)

  assert.equal(session.engine.canGoBack('a'), true)
  // Two moves, two entries: the log records where they were, not where they are.
  assert.equal(session.engine.party('a').gameLog.length, 2)

  // The fork inherited the shared history but has taken no steps of its own.
  const forkLog = session.engine.party(newPartyId).gameLog.length
  await session.command('back', { partyId: 'a' })
  assert.equal(session.engine.party(newPartyId).gameLog.length, forkLog,
    'undoing for one party disturbed the other')
})

// Keys are physical objects. Copying them on a split would put the same key in
// two places at once, so they stay with the group that picked them up.
test('a split does not duplicate keys', async () => {
  const session = await fresh()
  const party = session.engine.party('a')
  const cellId = String(party.currentCell)

  // Put a key in reach and take it. A key room with no key feature offers a
  // generated `key` action, and that is what hands it over.
  session.engine.cells[cellId].key = String(party.currentRoom)
  await session.setRoomFlag('key', true)
  assert.deepEqual(session.engine.party('a').keysHeld, [cellId])

  const { newPartyId } = await session.splitParty('a')
  assert.deepEqual(session.engine.party('a').keysHeld, [cellId])
  assert.deepEqual(session.engine.party(newPartyId).keysHeld, [],
    'the key was cloned onto the new party')
})

// ── Merging ─────────────────────────────────────────────────────────────────

test('parties in the same room of the same tesseract can merge', async () => {
  const session = await fresh()
  const { newPartyId } = await session.splitParty('a')

  assert.equal(session.engine.canMergeInto(newPartyId, 'a'), true)
  await session.mergeParty(newPartyId, 'a')

  assert.equal(session.getParties().length, 1)
  assert.equal(session.getParties()[0].id, 'a')
})

test('parties in different rooms cannot merge', async () => {
  const session = await fresh()
  const { newPartyId } = await session.splitParty('a')
  await step(session, 'a', 0)

  assert.equal(session.engine.canMergeInto(newPartyId, 'a'), false)
  await assert.rejects(
    () => session.mergeParty(newPartyId, 'a'),
    /not in the same room of the same tesseract/
  )
})

// The same room reached through different tesseracts is not the same place.
// That is the entire premise of the dungeon, so merging across it is refused.
test('the same room in different tesseracts is not the same place', async () => {
  const session = await fresh()
  const { newPartyId } = await session.splitParty('a')

  const fork = session.engine.party(newPartyId)
  fork.currentCell = session.engine.getOtherCell('a')

  assert.equal(
    String(session.engine.party('a').currentRoom), String(fork.currentRoom),
    'fixture should leave both in the same room'
  )
  assert.equal(session.engine.canMergeInto(newPartyId, 'a'), false)
  assert.equal(canMerge(session.engine.party('a'), fork), false)
})

test('merging unions the keys both halves were carrying', async () => {
  const session = await fresh()
  const party = session.engine.party('a')
  const cellId = String(party.currentCell)

  session.engine.cells[cellId].key = String(party.currentRoom)
  await session.setRoomFlag('key', true)

  const { newPartyId } = await session.splitParty('a')
  // Hand the fork a different key by hand.
  const otherCell = session.engine.getOtherCell('a')
  session.engine.party(newPartyId).keysHeld = [String(otherCell)]

  await session.mergeParty(newPartyId, 'a')
  assert.deepEqual(
    session.engine.party('a').keysHeld.sort(),
    [cellId, String(otherCell)].sort()
  )
})

test('merging keeps both trails as one history', async () => {
  const session = await fresh()
  await step(session, 'a', 0)
  const { newPartyId } = await session.splitParty('a')

  // Both walk on, then reunite by putting the fork back where 'a' stands.
  await step(session, 'a', 1)
  const a = session.engine.party('a')
  const fork = session.engine.party(newPartyId)
  Object.assign(fork, {
    currentCell: a.currentCell, currentRoom: a.currentRoom
  })
  fork.gameLog = [{ currentCell: 'x', currentRoom: 'y', currentEntry: 0, gravity: 0, doorCounter: 99 }]

  await session.mergeParty(newPartyId, 'a')
  const log = session.engine.party('a').gameLog

  assert.ok(log.some(e => e.doorCounter === 99), 'the other half\'s trail was dropped')
  // Newest first, so the merged history still reads in order.
  const counters = log.map(e => e.doorCounter ?? 0)
  assert.deepEqual(counters, [...counters].sort((x, y) => y - x))
})

test('merging the active party moves the cursor to the survivor', async () => {
  const session = await fresh()
  const { newPartyId } = await session.splitParty('a')

  await session.setActiveParty(newPartyId)
  assert.equal(session.engine.gameDetails.activeParty, newPartyId)

  await session.mergeParty(newPartyId, 'a')
  assert.equal(session.engine.gameDetails.activeParty, 'a')
})

// ── What is shared and what is not ──────────────────────────────────────────

test('room state is world state: clearing it counts for everyone', async () => {
  const session = await fresh()
  const { newPartyId } = await session.splitParty('a')

  await session.setRoomFlag('cleared', true, { partyId: 'a' })

  // Both parties are standing in the same room, and it is cleared for both.
  assert.equal(session.getState('a').progress.here.cleared, true)
  assert.equal(session.getState(newPartyId).progress.here.cleared, true)
})

test('keys are party state: only the finder carries them', async () => {
  const session = await fresh()
  const party = session.engine.party('a')
  const cellId = String(party.currentCell)
  session.engine.cells[cellId].key = String(party.currentRoom)

  const { newPartyId } = await session.splitParty('a')
  await session.setRoomFlag('key', true, { partyId: newPartyId })

  assert.deepEqual(session.engine.party(newPartyId).keysHeld, [cellId])
  assert.deepEqual(session.engine.party('a').keysHeld, [],
    'the key reached a party that never picked it up')

  // The room is empty for everyone, though -- that part is a world fact.
  assert.equal(session.getState('a').progress.here.key, true)
})

test('the room context names the party it describes', async () => {
  const session = await fresh()
  const { newPartyId } = await session.splitParty('a', { name: 'The scouts' })

  assert.equal(session.getState('a').party.name, 'Party A')
  assert.equal(session.getState(newPartyId).party.name, 'The scouts')
})

test('notes are always attributed, not only after a split', async () => {
  const session = await fresh()
  await session.addNote('one group here')

  // Attribution used to begin only at the second party, so everything written
  // before a split stayed anonymous -- and splitting cannot relabel it.
  const first = session.getState().note
  assert.match(first, /Party A/)
  assert.match(first, /one group here/)

  const { newPartyId } = await session.splitParty('a')
  await session.addNote('the scouts saw it too', newPartyId)
  assert.match(session.getState(newPartyId).note, /Party B/)
})

test('a note names the tesseract as well as the party', async () => {
  const session = await fresh()
  const cellName = session.cellInfo(session.engine.party().currentCell).colorName

  await session.addNote('lever behind the tapestry')
  assert.match(session.getState().note, new RegExp(`${cellName}.*Party A`))
})

// ── Persistence ─────────────────────────────────────────────────────────────

test('parties survive a reload', async () => {
  const session = await fresh()
  const { newPartyId } = await session.splitParty('a', { name: 'The scouts' })
  await step(session, 'a', 0)

  const reopened = await GameSession.open(session.gameId)
  const parties = reopened.getParties()

  assert.equal(parties.length, 2)
  assert.deepEqual(parties.map(p => p.name).sort(), ['Party A', 'The scouts'])
  assert.equal(
    reopened.engine.party(newPartyId).currentRoom,
    session.engine.party(newPartyId).currentRoom
  )
})

test('each party keeps its own distance to the exit', async () => {
  const session = await fresh()
  const { newPartyId } = await session.splitParty('a')
  await step(session, 'a', 0)

  const a = session.getState('a').pathfinding.shortestPathLength
  const b = session.getState(newPartyId).pathfinding.shortestPathLength
  assert.equal(typeof a, 'number')
  assert.equal(typeof b, 'number')
})

test('an unknown party id is refused rather than silently defaulted', async () => {
  const session = await fresh()
  assert.throws(() => session.engine.party('zz'), /no party "zz"/)
})

// Two sources of truth for "which group am I running" is a bug the UI shows as
// a highlight on one party while the commands drive another.
test('splitting focuses the new group, in the engine and in the payload', async () => {
  const session = await fresh()
  const result = await session.splitParty('a')

  assert.equal(result.newPartyId, 'b')
  assert.equal(session.engine.gameDetails.activeParty, 'b')
  assert.equal(result.roomContext.party.id, 'b')
  assert.equal(result.parties.find(p => p.isActive).id, 'b')
})

test('merging focuses the survivor, in the engine and in the payload', async () => {
  const session = await fresh()
  const { newPartyId } = await session.splitParty('a')
  const result = await session.mergeParty(newPartyId, 'a')

  assert.equal(session.engine.gameDetails.activeParty, 'a')
  assert.equal(result.roomContext.party.id, 'a')
  assert.equal(result.parties.find(p => p.isActive).id, 'a')
})

// ── Key-gated content ───────────────────────────────────────────────────────
// The chain this phase existed to make possible: a party loots the key room,
// that party (not the world) starts carrying the key, and every room in that
// tesseract reads differently for them.

test('onKey content appears once that party holds the tesseract\'s key', async () => {
  const session = await fresh()
  const party = session.engine.party('a')
  const cellId = String(party.currentCell)

  // Author key-gated content onto the room they are standing in.
  session.engine.rooms[party.currentRoom].onKey = {
    read: 'The mirrors have gone dark.',
    gm: 'The amulet is inert now.'
  }
  session.engine.cells[cellId].key = String(party.currentRoom)

  const before = session.getState('a')
  assert.notEqual(before.room.read, 'The mirrors have gone dark.')
  assert.equal(before.room.keyContentShown, false)

  await session.setRoomFlag('key', true, { partyId: 'a' })

  const after = session.getState('a')
  assert.equal(after.room.read, 'The mirrors have gone dark.')
  assert.equal(after.room.keyContentShown, true)
  assert.match(after.room.gm, /inert/)
})

test('a party without the key sees the room unchanged', async () => {
  const session = await fresh()
  const party = session.engine.party('a')
  const cellId = String(party.currentCell)

  session.engine.rooms[party.currentRoom].onKey = { read: 'Changed.' }
  session.engine.cells[cellId].key = String(party.currentRoom)

  const { newPartyId } = await session.splitParty('a')
  // The fork takes it, so only the fork carries the key.
  await session.setRoomFlag('key', true, { partyId: newPartyId })

  assert.equal(session.getState(newPartyId).room.read, 'Changed.')
  assert.notEqual(session.getState('a').room.read, 'Changed.',
    'a party that never picked up the key saw the gated content')
})

test('the held-key list names the tesseracts, for a GM to read out', async () => {
  const session = await fresh()
  const party = session.engine.party('a')
  const cellId = String(party.currentCell)
  session.engine.cells[cellId].key = String(party.currentRoom)

  await session.setRoomFlag('key', true)
  const { keys } = session.getState('a')

  assert.equal(keys.held.length, 1)
  assert.equal(keys.held[0].cellId, cellId)
  assert.ok(keys.held[0].cellName, 'a key with no tesseract name cannot be said aloud')
  assert.equal(keys.total, 10)
  assert.equal(keys.hereHeld, true)
})

test('dropping a key stops it being carried', async () => {
  const session = await fresh()
  const party = session.engine.party('a')
  const cellId = String(party.currentCell)
  session.engine.cells[cellId].key = String(party.currentRoom)

  await session.setRoomFlag('key', true)
  assert.deepEqual(session.engine.party('a').keysHeld, [cellId])

  await session.setRoomFlag('key', false)
  assert.deepEqual(session.engine.party('a').keysHeld, [])
})

test('searching an ordinary room carries no key', async () => {
  const session = await fresh()
  const party = session.engine.party('a')
  // Make sure this room is not the cell's key room.
  session.engine.cells[String(party.currentCell)].key = null

  await session.setRoomFlag('searched', true)
  assert.deepEqual(session.engine.party('a').keysHeld, [])
})

// ── Roster ──────────────────────────────────────────────────────────────────

test('a party carries free text about who is in it', async () => {
  const session = await fresh()
  await session.setPartyNotes('a', 'Vex 22/31hp · Bram concentrating on Bless')

  assert.match(session.getState('a').party.notes, /concentrating/)
  assert.match(session.getParties()[0].notes, /Vex/)
})

test('the roster survives a reload', async () => {
  const session = await fresh()
  await session.setPartyNotes('a', 'Kesh is poisoned')

  const reopened = await GameSession.open(session.gameId)
  assert.equal(reopened.getState().party.notes, 'Kesh is poisoned')
})

// Who went with which half is the GM's to sort out, so the tool does not claim
// both groups contain everyone.
test('a split starts the new group with an empty roster', async () => {
  const session = await fresh()
  await session.setPartyNotes('a', 'everyone')

  const { newPartyId } = await session.splitParty('a')
  assert.equal(session.getState('a').party.notes, 'everyone')
  assert.equal(session.getState(newPartyId).party.notes, '')
})

test('merging keeps both rosters', async () => {
  const session = await fresh()
  await session.setPartyNotes('a', 'Vex, Bram')

  const { newPartyId } = await session.splitParty('a')
  await session.setPartyNotes(newPartyId, 'Kesh')
  await session.mergeParty(newPartyId, 'a')

  const notes = session.getState('a').party.notes
  assert.match(notes, /Vex, Bram/)
  assert.match(notes, /Kesh/)
})

// ── Event log ───────────────────────────────────────────────────────────────

test('a fresh game has an empty log', async () => {
  const session = await fresh()
  assert.deepEqual(session.getEventLog(), [])
})

test('splits and merges are recorded', async () => {
  const session = await fresh()
  const { newPartyId } = await session.splitParty('a', { name: 'The scouts' })
  await session.mergeParty(newPartyId, 'a')

  const types = session.getEventLog().map(e => e.type)
  // Newest first.
  assert.deepEqual(types, ['merge', 'split'])
  assert.match(session.getEventLog()[1].summary, /The scouts/)
})

test('taking a key is recorded, naming the tesseract', async () => {
  const session = await fresh()
  const party = session.engine.party()
  const cellId = String(party.currentCell)
  session.engine.cells[cellId].key = String(party.currentRoom)

  await session.setRoomFlag('key', true)
  const [event] = session.getEventLog()

  assert.equal(event.type, 'key')
  assert.match(event.summary, new RegExp(session.engine.cells[cellId].colorName))
  assert.equal(event.detail.held, true)
})

// The whole point: "1 thing(s) came back" told a GM a count and nothing else.
test('a reset records which things came back, not just how many', async () => {
  const session = await fresh()
  const party = session.engine.party()
  const roomId = String(party.currentRoom)

  session.engine.rooms[roomId].creatures = [
    { id: 'boggles', name: 'Boggle', resetsOn: ['long-rest'] }
  ]
  await session.setRoomFlag('creature:boggles', true)
  await session.applyReset('long-rest')

  const [event] = session.getEventLog()
  assert.equal(event.type, 'reset')
  assert.equal(event.detail.items.length, 1)
  assert.match(event.detail.items[0].label, /Boggle defeated/)
  assert.ok(event.detail.items[0].room, 'no room named')
  assert.ok(event.detail.items[0].cell, 'no tesseract named')
})

test('a reset that restores nothing is not logged', async () => {
  const session = await fresh()
  await session.applyReset('shuffle')
  assert.deepEqual(session.getEventLog(), [])
})

test('the log survives a reload and stays newest-first', async () => {
  const session = await fresh()
  const { newPartyId } = await session.splitParty('a')
  await session.mergeParty(newPartyId, 'a')

  const reopened = await GameSession.open(session.gameId)
  const log = reopened.getEventLog()

  assert.equal(log.length, 2)
  assert.ok(log[0].at >= log[1].at)
})

test('the log is bounded so a long campaign cannot grow a save without limit', async () => {
  const session = await fresh()
  for (let i = 0; i < 320; i++) session.engine.logEvent('key', `event ${i}`)

  assert.equal(session.engine.gameDetails.eventLog.length, 300)
  assert.match(session.engine.gameDetails.eventLog[0].summary, /event 319/)
})
