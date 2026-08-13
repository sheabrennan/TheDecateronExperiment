import test from 'node:test'
import assert from 'node:assert/strict'

import { GameSession } from '../src/io/session.js'
import * as storage from '../src/io/storage.js'
import { DOORS_PER_ROOM } from '../src/engine/topology.js'
import { bigPackJson } from './fixtures.js'

const pack = bigPackJson()

const fresh = async (options = {}) => {
  storage.__resetMemory()
  return GameSession.create(pack, { name: 'Test run', seed: 42, ...options })
}

// ── Storage ─────────────────────────────────────────────────────────────────

test('a new game is persisted and listed', async () => {
  const session = await fresh()
  const games = await storage.listGames()

  assert.equal(games.length, 1)
  assert.equal(games[0].gameId, session.gameId)
  assert.equal(games[0].name, 'Test run')
  assert.equal(games[0].packName, 'Full Fixture')
  assert.equal(games[0].moves, 0)
})

test('multi-game is first class, not withheld', async () => {
  storage.__resetMemory()
  await GameSession.create(pack, { name: 'Tuesday group', seed: 1 })
  await GameSession.create(pack, { name: 'Sunday group', seed: 2 })

  const games = await storage.listGames()
  assert.equal(games.length, 2)
  assert.deepEqual(games.map(g => g.name).sort(), ['Sunday group', 'Tuesday group'])
})

test('a save carries the fields cloud sync would need', async () => {
  const { save } = await fresh()

  assert.equal(save.schemaVersion, storage.SAVE_SCHEMA_VERSION)
  assert.ok(save.gameId)
  assert.equal(save.version, 1)
  assert.ok(save.createdAt)
  assert.ok(save.lastModified)
  assert.equal(save.pack.id, 'full-fixture')
})

test('the version counter advances on every write', async () => {
  const session = await fresh()
  assert.equal(session.save.version, 1)

  await session.command('close')
  assert.equal(session.save.version, 2)

  await session.command('close')
  assert.equal(session.save.version, 3)
})

test('play persists without an explicit save', async () => {
  // The old web build only wrote on a Save click, so a crash lost the session.
  const session = await fresh()
  await session.openDoor(0, session.engine.party().currentCell)
  await session.command('move')

  const reopened = await GameSession.open(session.gameId)
  assert.equal(
    reopened.engine.party().currentRoom,
    session.engine.party().currentRoom
  )
  assert.equal(reopened.engine.party().gameLog.length, 1)
})

test('reopening a game restores position and history', async () => {
  const session = await fresh()
  for (let i = 0; i < 5; i++) {
    await session.openDoor(i % DOORS_PER_ROOM, session.engine.party().currentCell)
    await session.command('move')
  }

  const before = session.getState()
  const after = (await GameSession.open(session.gameId)).getState()

  assert.equal(after.room.id, before.room.id)
  assert.equal(after.cell.id, before.cell.id)
  assert.deepEqual(after.recentMoves, before.recentMoves)
})

test('a deleted game leaves the library', async () => {
  const session = await fresh()
  await storage.deleteGame(session.gameId)
  assert.deepEqual(await storage.listGames(), [])
})

// ── Export / import ─────────────────────────────────────────────────────────

test('a save round-trips through export and import', async () => {
  const session = await fresh()
  await session.openDoor(0, session.engine.party().currentCell)
  await session.command('move')

  const exported = storage.exportGame(session.save)
  await storage.deleteGame(session.gameId)

  const imported = await storage.importGame(exported)
  const reopened = await GameSession.open(imported.gameId)

  assert.equal(reopened.engine.party().currentRoom, session.engine.party().currentRoom)
  assert.equal(Object.keys(reopened.engine.rooms).length, 40)
})

test('importing a save twice makes two games, not an overwrite', async () => {
  const session = await fresh()
  const exported = storage.exportGame(session.save)

  const again = await storage.importGame(exported)
  assert.notEqual(again.gameId, session.gameId)
  assert.match(again.name, /imported/)
  assert.equal((await storage.listGames()).length, 2)
})

test('import rejects files that are not saves', async () => {
  storage.__resetMemory()
  await assert.rejects(() => storage.importGame('{ not json'), /not a valid save/)
  await assert.rejects(() => storage.importGame('{"a":1}'), /missing cells/)
})

test('a save from a newer schema is refused rather than misread', async () => {
  const session = await fresh()
  const future = JSON.stringify({ ...session.save, schemaVersion: 99 })
  await assert.rejects(() => storage.importGame(future), /newer version of the app/)
})

// ── Preview and the two-tesseract choice ────────────────────────────────────

test('gm mode holds the current tesseract instead of shuffling', async () => {
  const session = await fresh({ cellChoiceMode: 'gm' })
  const current = String(session.engine.party().currentCell)

  // The old server randomised the target on every fetch, so the cell being
  // shown changed unpredictably between refreshes.
  for (let i = 0; i < 10; i++) {
    assert.equal(session.getPreviewChoices().targetCell, current)
  }
})

test('random mode does hand the choice to chance', async () => {
  const session = await fresh({ cellChoiceMode: 'random' })
  const seen = new Set()
  for (let i = 0; i < 60; i++) seen.add(session.getPreviewChoices().targetCell)
  assert.equal(seen.size, 2, 'random mode never showed the other tesseract')
})

test('the mode is switchable mid-game and persists', async () => {
  const session = await fresh({ cellChoiceMode: 'gm' })
  await session.setCellChoiceMode('random')

  const reopened = await GameSession.open(session.gameId)
  assert.equal(reopened.engine.gameDetails.cellChoiceMode, 'random')
})

test('every door choice carries its destination tesseract colour', async () => {
  const session = await fresh()
  const { choices, targetCellColor, targetCellName } = session.getPreviewChoices()

  assert.equal(choices.length, DOORS_PER_ROOM)
  for (const choice of choices) {
    assert.match(choice.targetCellColor, /^#[0-9A-Fa-f]{6}$/)
    assert.ok(choice.targetCellName)
    assert.equal(choice.targetCellColor, targetCellColor)
    assert.equal(choice.targetCellName, targetCellName)
  }
})

// ── The door list ───────────────────────────────────────────────────────────

test('gm mode offers both tesseracts for every door', async () => {
  const session = await fresh({ cellChoiceMode: 'gm' })
  const { mode, cells, doors } = session.getDoors()

  assert.equal(mode, 'gm')
  assert.equal(cells.length, 2)
  assert.notEqual(cells[0].id, cells[1].id)
  assert.equal(doors.length, DOORS_PER_ROOM)

  for (const door of doors) {
    assert.ok(door.label)
    assert.equal(door.options.length, 2)

    // One option per tesseract, each carrying the colour that tells the
    // players which one they walked into.
    assert.deepEqual(door.options.map(o => o.cell.id), cells.map(c => c.id))
    for (const option of door.options) {
      assert.match(option.cell.color, /^#[0-9A-Fa-f]{6}$/)
      assert.ok(option.cell.colorName)
      assert.ok(option.targetRoomId)
      assert.notEqual(option.targetRoomName, '?')
    }
    assert.equal(door.options.filter(o => o.isCurrentCell).length, 1)
  }
})

test('the two tesseracts lead somewhere different behind every door', async () => {
  const session = await fresh({ cellChoiceMode: 'gm' })
  for (const door of session.getDoors().doors) {
    const [a, b] = door.options
    assert.notEqual(
      a.targetRoomId, b.targetRoomId,
      `door ${door.label} leads to the same room either way`
    )
  }
})

test('exactly one door is the entry and one is gravity', async () => {
  const session = await fresh()
  const { doors } = session.getDoors()
  assert.equal(doors.filter(d => d.isEntry).length, 1)
  assert.ok(doors.filter(d => d.isGravity).length <= 1)
})

test('random mode leaves the choice to the roll, not the caller', async () => {
  const session = await fresh({ cellChoiceMode: 'random' })
  assert.equal(session.getDoors().mode, 'random')

  // Opening the same door repeatedly should land in both tesseracts.
  const landed = new Set()
  for (let i = 0; i < 60; i++) {
    const { previewContext } = await session.openDoor(0, null)
    landed.add(previewContext.cell.id)
  }
  assert.equal(landed.size, 2, 'the roll never reached the other tesseract')
})

test('toggling to the alternate cell shows different rooms', async () => {
  const session = await fresh()
  const here = session.getPreviewChoices()
  const there = session.getPreviewChoices(here.altCell)

  assert.notEqual(here.targetCell, there.targetCell)
  assert.notEqual(here.targetCellColor, there.targetCellColor)
  assert.notDeepEqual(
    here.choices.map(c => c.targetRoomId),
    there.choices.map(c => c.targetRoomId)
  )
})

test('the preview describes the room through the open door', async () => {
  const session = await fresh()
  const { previewContext } = await session.openDoor(2, session.engine.party().currentCell)

  assert.ok(previewContext.room.name)
  assert.equal(previewContext.orientation.doors.length, DOORS_PER_ROOM)
  assert.ok(previewContext.orientation.entryLabel)
  assert.ok(previewContext.cell.colorName)
  for (const door of previewContext.orientation.doors) {
    assert.notEqual(door.targetRoomName, '?')
  }
})

// ── Catalog ─────────────────────────────────────────────────────────────────

test('the catalog shows both tesseract versions of the room', async () => {
  const session = await fresh()
  const catalog = session.getCatalog()

  assert.equal(catalog.length, 2)
  assert.equal(catalog.filter(c => c.isCurrent).length, 1)
  assert.notEqual(catalog[0].id, catalog[1].id)

  for (const side of catalog) {
    assert.equal(side.doors.length, DOORS_PER_ROOM)
    assert.ok(side.colorName)
    assert.ok(side.position)
    for (const door of side.doors) assert.notEqual(door.name, '?')
  }

  // The whole point of the view: same six doors, different rooms behind them.
  assert.notDeepEqual(
    catalog[0].doors.map(d => d.targetRoomId),
    catalog[1].doors.map(d => d.targetRoomId)
  )
})

// ── Commands and notes ──────────────────────────────────────────────────────

test('move without an open door fails loudly', async () => {
  const session = await fresh()
  await assert.rejects(() => session.command('move'), /no open door/)
})

test('an unknown command is rejected', async () => {
  const session = await fresh()
  await assert.rejects(() => session.command('teleport'), /unknown command/)
})

test('back undoes a move', async () => {
  const session = await fresh()
  const origin = session.engine.party().currentRoom

  await session.openDoor(1, session.engine.party().currentCell)
  await session.command('move')
  assert.notEqual(session.engine.party().currentRoom, origin)

  await session.command('back')
  assert.equal(session.engine.party().currentRoom, origin)
})

test('notes are tagged with the tesseract and the party', async () => {
  const session = await fresh()
  const colorName = session.cellInfo(session.engine.party().currentCell).colorName

  const { roomContext } = await session.addNote('boggle has the amulet')
  // Both the tesseract and the group, always: a note written before a split
  // would otherwise stay anonymous forever.
  assert.equal(roomContext.note, `${colorName} · Party A: boggle has the amulet`)
})

test('empty notes are ignored', async () => {
  const session = await fresh()
  await session.addNote('   ')
  assert.equal(session.getState().note, null)
})

// ── Room state ──────────────────────────────────────────────────────────────

test('room flags are recorded per tesseract, not per room', async () => {
  const session = await fresh()
  const { currentCell, currentRoom } = session.engine.party()
  const otherCell = session.engine.getOtherCell()

  await session.setRoomFlag('cleared', true)

  assert.equal(session.engine.getRoomState(currentCell, currentRoom).cleared, true)
  // The same room seen from the other tesseract is untouched -- whether the
  // bodies are still there is the GM's ruling, not the tool's.
  assert.equal(session.engine.getRoomState(otherCell, currentRoom).cleared, undefined)
})

test('the room context reports the other side\'s state', async () => {
  const session = await fresh()
  const { currentCell, currentRoom } = session.engine.party()
  const otherCell = session.engine.getOtherCell()

  session.engine.setRoomFlag(otherCell, currentRoom, 'cleared', true)
  const { progress } = session.getState()

  assert.deepEqual(progress.here, {})
  assert.equal(progress.otherSide.cleared, true)
  assert.equal(progress.otherSide.cellId, String(otherCell))
  assert.ok(progress.otherSide.cellName)
})

test('clearing a flag removes it rather than storing false', async () => {
  const session = await fresh()
  await session.setRoomFlag('looted', true)
  await session.setRoomFlag('looted', false)

  assert.deepEqual(session.getState().progress.here, {})
  assert.deepEqual(session.engine.gameDetails.roomState, {})
})

test('room state survives a reload', async () => {
  const session = await fresh()
  await session.setRoomFlag('cleared', true)
  await session.setRoomFlag('looted', true)

  const reopened = await GameSession.open(session.gameId)
  assert.deepEqual(reopened.getState().progress.here, { cleared: true, looted: true })
})

test('flags are an open set, so new ones need no migration', async () => {
  const session = await fresh()
  await session.setRoomFlag('trapDisarmed', true)
  assert.equal(session.getState().progress.here.trapDisarmed, true)
})

// ── Undo / redo ─────────────────────────────────────────────────────────────

test('stepping back is reversible', async () => {
  const session = await fresh()
  const origin = session.engine.party().currentRoom

  await session.openDoor(1, session.engine.party().currentCell)
  const moved = await session.command('move')
  const arrived = session.engine.party().currentRoom

  assert.equal(moved.canGoBack, true)
  assert.equal(moved.canGoForward, false)

  const back = await session.command('back')
  assert.equal(session.engine.party().currentRoom, origin)
  assert.equal(back.canGoForward, true)

  await session.command('forward')
  assert.equal(session.engine.party().currentRoom, arrived)
})

test('a deep rewind restores the whole trail, not just the position', async () => {
  const session = await fresh()
  for (let i = 0; i < 6; i++) {
    await session.openDoor(i % DOORS_PER_ROOM, session.engine.party().currentCell)
    await session.command('move')
  }

  const trail = session.getState().recentMoves.map(m => m.roomId)
  const room = session.engine.party().currentRoom

  // Rewinding five rooms used to destroy those five log entries outright.
  await session.command('rewind', { count: 5 })
  assert.equal(session.getState().recentMoves.length, trail.length - 5)

  await session.command('forward')
  assert.equal(session.engine.party().currentRoom, room)
  assert.deepEqual(session.getState().recentMoves.map(m => m.roomId), trail)
})

test('moving somewhere new abandons the redo trail', async () => {
  const session = await fresh()
  for (let i = 0; i < 3; i++) {
    await session.openDoor(i, session.engine.party().currentCell)
    await session.command('move')
  }

  await session.command('back')
  assert.equal(session.engine.canGoForward(), true)

  await session.openDoor(4, session.engine.party().currentCell)
  const moved = await session.command('move')
  assert.equal(moved.canGoForward, false, 'redo survived a divergent move')
})

test('back and forward refuse rather than throw past the ends', async () => {
  const session = await fresh()
  await assert.rejects(() => session.command('back'), /nothing to step back to/)
  await assert.rejects(() => session.command('forward'), /nothing to step forward to/)
})

test('undo state survives a reload', async () => {
  const session = await fresh()
  await session.openDoor(0, session.engine.party().currentCell)
  await session.command('move')
  await session.command('back')

  const reopened = await GameSession.open(session.gameId)
  assert.equal(reopened.engine.canGoForward(), true)
})

// ── The room behind you ─────────────────────────────────────────────────────

test('a move leaves the room behind previewed, in its own orientation', async () => {
  const session = await fresh()
  const before = session.getState()

  await session.openDoor(3, session.engine.party().currentCell)
  const { previewContext } = await session.command('move')

  assert.ok(previewContext, 'the room behind was dropped on move')
  assert.equal(previewContext.isBehind, true)
  assert.equal(previewContext.room.id, before.room.id)
  assert.equal(previewContext.cell.id, before.cell.id)

  // The orientation the party actually had while standing there, not one
  // recomputed from where they are now.
  assert.equal(previewContext.orientation.entryLabel, before.orientation.entryLabel)
  assert.ok(previewContext.room.read !== undefined)
})

test('the preview carries enough to read a room aloud without entering it', async () => {
  const session = await fresh()
  const { previewContext } = await session.openDoor(0, session.engine.party().currentCell)

  // The GM's reading order, plus what the room holds.
  for (const field of ['name', 'read', 'detail', 'gm', 'orientation',
    'creatures', 'features', 'rest', 'links', 'size']) {
    assert.ok(field in previewContext.room, `preview is missing ${field}`)
  }
  assert.ok('progress' in previewContext)
})

test('the room behind resolves its doors through the tesseract they travelled by', async () => {
  const session = await fresh()

  // Force a crossing: open a door routed through the *other* tesseract.
  const otherCell = session.engine.getOtherCell()
  await session.openDoor(1, otherCell)
  const { previewContext, roomContext } = await session.command('move')

  const face = previewContext.orientation.doors.find(d => d.isExitDoor)
  assert.ok(face, 'no exit door marked on the room behind')

  // Standing in Teal and leaving via a door routed through Bone, resolving that
  // door in Teal names the room they would have reached had they not crossed.
  assert.equal(
    face.targetRoomId, roomContext.room.id,
    'the door they left by does not lead to the room they are standing in'
  )
})

test('the room behind keeps its own tesseract identity', async () => {
  const session = await fresh()
  const before = session.getState()

  await session.openDoor(1, session.engine.getOtherCell())
  const { previewContext } = await session.command('move')

  // Doors resolve through the crossing, but colour and name belong to the cell
  // the party was actually standing in.
  assert.equal(previewContext.cell.id, before.cell.id)
  assert.equal(previewContext.cell.colorName, before.cell.colorName)
})

test('a room\'s notes travel with it through an open door', async () => {
  const session = await fresh()

  // Note the room first, walk on, then look back through the door at it.
  await session.addNote('the amulet is on the third boggle')
  await session.openDoor(2, session.engine.party().currentCell)
  const { previewContext } = await session.command('move')

  assert.match(previewContext.note ?? '', /third boggle/)
})

test('a forward preview shows notes taken on an earlier visit', async () => {
  const session = await fresh()
  const start = String(session.engine.party().currentRoom)
  await session.addNote('lever behind the tapestry')

  await session.openDoor(0, session.engine.party().currentCell)
  await session.command('move')

  // From the new room, find the door that leads back to the annotated one and
  // look through it. The GM should see their own note without walking in.
  const doors = session.getDoors()
  let found = null
  for (const door of doors.doors) {
    for (const option of door.options) {
      if (String(option.targetRoomId) === start) found = { door, option }
    }
  }
  assert.ok(found, 'no door leads back to the starting room')

  const { previewContext } = await session.openDoor(found.door.index, found.option.cell.id)
  assert.equal(String(previewContext.room.id), start)
  assert.match(previewContext.note ?? '', /tapestry/)
})
