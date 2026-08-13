// Everything the HTTP server used to do, minus the HTTP.
//
// The old server kept a single module-level GameEngine for the whole process,
// so a second browser tab silently destroyed the first tab's game.  A session
// is per-game and lives in the page that owns it, which removes that class of
// bug rather than guarding against it.
//
// Two pieces of real logic lived in the route handlers rather than the engine
// and are recovered here: the preview context builder, and the choice of which
// tesseract a door list opens on.

import { GameEngine } from '../engine/GameEngine.js'
import { lexicalMapper } from '../engine/lexicalMap.js'
import { roomView, holdsKey } from '../engine/roomView.js'
import { generateDungeon } from '../engine/dungeon.js'
import { newSave, touchSave, putGame, loadGame } from './storage.js'

export class GameSession {
  constructor (save) {
    this.save = save
    this.engine = new GameEngine(save, false)
  }

  static async create (packJson, { name, seed = Date.now() % 2147483647, cellChoiceMode = 'gm' } = {}) {
    const dungeon = generateDungeon(packJson, { seed, cellChoiceMode })
    const save = newSave(dungeon, name?.trim() || dungeon.pack.name || 'New game')
    await putGame(save)
    return new GameSession(save)
  }

  static async open (gameId) {
    return new GameSession(await loadGame(gameId))
  }

  get gameId () { return this.save.gameId }
  get name () { return this.save.name }

  // ── Persistence ───────────────────────────────────────────────────────────
  // The old web build only wrote on an explicit Save click, so a crash lost the
  // session; the CLI auto-saved on every move.  Local writes are cheap, so the
  // web behaviour matches the CLI now.

  async persist () {
    this.save = touchSave({
      ...this.save,
      cells: this.engine.cells,
      rooms: this.engine.rooms,
      gameDetails: this.engine.gameDetails
    })
    await putGame(this.save)
    return this.save
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  getState (partyId = null) {
    return this.engine.getRoomContext(partyId)
  }

  // Every party, for the switcher. Enough to render a row without loading each
  // one's full context.
  getParties () {
    const active = this.engine.gameDetails.activeParty
    return this.engine.parties.map(p => ({
      id: p.id,
      name: p.name,
      isActive: p.id === active,
      cell: this.cellInfo(p.currentCell),
      roomId: String(p.currentRoom),
      roomName: this.engine.rooms[p.currentRoom]?.name ?? '?',
      keysHeld: [...(p.keysHeld ?? [])],
      notes: p.notes ?? '',
      moves: p.gameLog?.length ?? 0,
      // Which other parties this one could fold into: same room, same tesseract.
      canMergeInto: this.engine.parties
        .filter(other => other.id !== p.id && this.engine.canMergeInto(p.id, other.id))
        .map(other => ({ id: other.id, name: other.name }))
    }))
  }

  cellInfo (cellId) {
    const cell = this.engine.cells[String(cellId)]
    return {
      id: String(cellId),
      color: cell?.color ?? null,
      colorName: cell?.colorName ?? null
    }
  }

  // Which tesseract the door list opens on.
  //
  // `gm` keeps the current cell so the GM chooses deliberately and the view
  // does not move under them; `random` lets the dungeon decide. The old server
  // shuffled on *every* fetch with no setting, so the cell being shown changed
  // unpredictably between refreshes.
  defaultTargetCell (partyId = null) {
    const { cellChoiceMode } = this.engine.gameDetails
    const currentCell = this.engine.party(partyId).currentCell
    const other = this.engine.getOtherCell(partyId)

    if (cellChoiceMode === 'random') {
      return Math.random() < 0.5 ? String(currentCell) : String(other)
    }
    return String(currentCell)
  }

  getPreviewChoices (targetCell, partyId = null) {
    const currentCell = this.engine.party(partyId).currentCell
    const other = this.engine.getOtherCell(partyId)

    const target = String(targetCell ?? this.defaultTargetCell(partyId))
    const alt = target === String(currentCell) ? String(other) : String(currentCell)

    return {
      choices: this.engine.getPreviewChoices(target, partyId).map(choice => ({
        ...choice,
        // The destination tesseract's colour, per door. The old payload carried
        // no colour at all, so the UI could only tint the header.
        targetCell: target,
        targetCellColor: this.cellInfo(target).color,
        targetCellName: this.cellInfo(target).colorName
      })),
      targetCell: target,
      altCell: alt,
      targetCellColor: this.cellInfo(target).color,
      altCellColor: this.cellInfo(alt).color,
      targetCellName: this.cellInfo(target).colorName,
      altCellName: this.cellInfo(alt).colorName,
      cellChoiceMode: this.engine.gameDetails.cellChoiceMode
    }
  }

  // The door list, resolved against both tesseracts at once.
  //
  // In `gm` mode every door carries both of its possible destinations, each
  // tagged with the colour of the tesseract it leads into, and the GM chooses.
  // In `random` mode the destinations are withheld -- chance picks the
  // tesseract at the moment the door is opened, and the preview reveals it.
  getDoors (partyId = null) {
    const { cellChoiceMode } = this.engine.gameDetails
    const party = this.engine.party(partyId)
    const { currentCell, currentDoors, currentEntry, gravity } = party

    const cellIds = [String(currentCell), String(this.engine.getOtherCell(partyId))]
    const byCell = Object.fromEntries(
      cellIds.map(id => [id, this.engine.getPreviewChoices(id, partyId)])
    )

    return {
      mode: cellChoiceMode,
      partyId: party.id,
      cells: cellIds.map(id => this.cellInfo(id)),
      doors: (currentDoors ?? []).map((label, index) => ({
        index,
        label,
        isEntry: index === currentEntry,
        isGravity: index === gravity,
        options: cellIds.map(id => {
          const choice = byCell[id][index]
          return {
            cell: this.cellInfo(id),
            isCurrentCell: id === String(currentCell),
            targetRoomId: choice.targetRoomId,
            targetRoomName: choice.targetRoomName,
            targetHasKey: choice.targetHasKey,
            isExit: choice.isExit,
            wasVisited: choice.wasVisited,
            wasVisitedAnyCell: choice.wasVisitedAnyCell,
            isOnShortestPath: choice.isOnShortestPath
          }
        })
      }))
    }
  }

  // Both tesseract versions of the current room at once, with full room text.
  // Ported from the CLI's `catalog`, which was the richest GM-facing view in
  // the app and had no equivalent on the web.
  getCatalog (partyId = null) {
    const party = this.engine.party(partyId)
    const { currentCell, currentRoom, currentEntry, gameLog } = party
    const other = this.engine.getOtherCell(partyId)

    return [String(currentCell), String(other)].map(cellId => {
      const cell = this.engine.cells[cellId]
      const placement = cell.cellRooms[currentRoom]

      return {
        ...this.cellInfo(cellId),
        isCurrent: cellId === String(currentCell),
        position: placement?.position ?? null,
        doors: (placement?.doors ?? []).map((targetRoomId, index) => {
          const view = roomView(this.engine.rooms[targetRoomId], {
            instanceId: targetRoomId,
            keyHeld: holdsKey(party, cellId),
            isKeyRoom: String(cell.key) === String(targetRoomId),
            packActions: this.engine.gameDetails.packActions ?? null,
            state: this.engine.getRoomState(cellId, targetRoomId),
            cell,
            templateVars: this.engine.gameDetails.packTemplateVars ?? null
          })
          return {
            index,
            label: party.currentDoors?.[index] ?? String(index),
            targetRoomId,
            room: view,
            name: view?.name ?? '?',
            hasKey: String(cell.key) === String(targetRoomId),
            isEntry: cellId === String(currentCell) && index === currentEntry,
            wasVisited: gameLog.some(
              e => String(e.currentRoom) === String(targetRoomId) &&
                String(e.currentCell) === cellId
            )
          }
        })
      }
    })
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  async openDoor (doorIndex, targetCell, partyId = null) {
    const target = String(targetCell ?? this.defaultTargetCell(partyId))
    const { targetRoomId, openDoorEntryId, openDoorGravity, targetDoorLabels } =
      this.engine.previewDoor(Number(doorIndex), target, partyId)

    await this.persist()

    return {
      currentContext: this.getState(partyId),
      previewContext: this.buildPreviewContext(
        target, targetRoomId, openDoorEntryId, openDoorGravity, targetDoorLabels,
        -1, null, partyId
      )
    }
  }

  // What the party would see through the open door, before committing to it.
  // `doorCell` is the tesseract the doors resolve through, which is not always
  // the one the room's identity comes from: a party can stand in Teal and leave
  // through a door routed via Bone. Resolving that door in Teal names the room
  // they would have reached had they not crossed -- precisely the mistake this
  // tool exists to stop a GM making.
  buildPreviewContext (targetCell, targetRoomId, entryIndex, gravityIndex, labels, exitIndex = -1, doorCell = null, partyId = null) {
    const room = this.engine.rooms[targetRoomId]
    const cell = this.engine.cells[targetCell]
    // Identity, colour and key stay with the cell the party was standing in;
    // only the door targets come from the cell they routed through.
    const doors = this.engine.cells[doorCell ?? targetCell] ?? cell
    const { exitCell, exitRoom, notes } = this.engine.gameDetails
    const party = this.engine.party(partyId)
    const { gameLog } = party

    const visited = (roomId, cellId) => gameLog.some(
      e => String(e.currentRoom) === String(roomId) &&
        (cellId == null || String(e.currentCell) === String(cellId))
    )

    return {
      room: roomView(room, {
        instanceId: targetRoomId,
        keyHeld: holdsKey(party, targetCell),
        isKeyRoom: String(cell.key) === String(targetRoomId),
        packActions: this.engine.gameDetails.packActions ?? null,
        state: this.engine.getRoomState(targetCell, targetRoomId),
        cell,
        templateVars: this.engine.gameDetails.packTemplateVars ?? null
      }),
      cell: {
        id: String(targetCell),
        color: cell.color,
        colorName: cell.colorName ?? null,
        hasKey: String(cell.key) === String(targetRoomId)
      },
      isExit: String(targetCell) === String(exitCell) &&
        String(targetRoomId) === String(exitRoom),
      // Notes are keyed by room, so they follow it through an open door.
      note: notes?.[targetRoomId] ?? null,
      // So the GM can see "we already cleared that one" without walking in.
      progress: {
        here: this.engine.getRoomState(targetCell, targetRoomId),
        otherSide: (() => {
          const other = this.engine.getOtherSideState(targetCell, targetRoomId)
          return other
            ? { ...other, cellName: this.cellInfo(other.cellId).colorName }
            : null
        })(),
        holdsKey: String(cell.key) === String(targetRoomId)
      },
      orientation: {
        entryDoorIndex: entryIndex,
        entryLabel: labels[entryIndex] ?? null,
        exitDoorIndex: exitIndex,
        exitLabel: exitIndex >= 0 ? (labels[exitIndex] ?? null) : null,
        gravityIndex,
        gravityLabel: gravityIndex >= 0 ? (labels[gravityIndex] ?? null) : null,
        gravityDesc: gravityIndex < 0 ? (room.gravity.desc ?? 'Special') : null,
        doors: labels.map((label, index) => {
          const onward = doors.cellRooms?.[targetRoomId]?.doors?.[index] ?? null
          return {
            index,
            label,
            isEntry: index === entryIndex,
            isExitDoor: index === exitIndex,
            isGravity: index === gravityIndex,
            targetRoomId: onward,
            targetRoomName: onward != null
              ? (this.engine.rooms[onward]?.name ?? '?')
              : '?',
            wasVisited: onward != null && visited(onward, targetCell),
            wasVisitedAnyCell: onward != null && visited(onward, null)
          }
        })
      }
    }
  }

  // After a move, the door the party came through is still open -- so the
  // former room stays previewed, shown with the orientation they actually had
  // while standing in it. That is what lets a GM narrate "you dropped through
  // the floor and came in through a wall" without reconstructing it in their
  // head.
  previousRoomPreview (partyId = null) {
    const [previous] = this.engine.party(partyId).gameLog
    if (!previous) return null

    const labels = lexicalMapper(previous.currentEntry, previous.gravity)
    if (!labels) return null

    const context = this.buildPreviewContext(
      String(previous.currentCell), String(previous.currentRoom),
      previous.currentEntry, previous.gravity, labels,
      // Highlight the door they left by, not the one they arrived by -- that
      // is the one the GM is pointing at when the party looks back.
      previous.exitDoor,
      // ...and resolve it through the tesseract they actually travelled by.
      previous.exitCell != null ? String(previous.exitCell) : null,
      partyId
    )

    return { ...context, isBehind: true }
  }

  async command (command, options = {}) {
    const partyId = options.partyId ?? null
    let preview = null

    switch (command) {
      case 'move':
        if (!this.engine.move(partyId)) throw new Error('no open door to move through')
        preview = this.previousRoomPreview(partyId)
        break
      case 'close':
        this.engine.close(partyId)
        break
      case 'back':
        if (!this.engine.back(1, partyId)) throw new Error('nothing to step back to')
        break
      case 'rewind':
        if (!this.engine.back(Number(options.count ?? 1), partyId)) {
          throw new Error('nothing to rewind to')
        }
        break
      case 'forward':
        if (!this.engine.forward(Number(options.count ?? 1), partyId)) {
          throw new Error('nothing to step forward to')
        }
        break
      case 'save':
        break
      default:
        throw new Error(`unknown command "${command}"`)
    }

    await this.persist()
    return this.result(partyId, preview)
  }

  // The shape every mutating call returns, so a caller never has to remember
  // which of them refresh the party list.
  result (partyId = null, preview = null) {
    return {
      roomContext: this.getState(partyId),
      previewContext: preview,
      canGoBack: this.engine.canGoBack(partyId),
      canGoForward: this.engine.canGoForward(partyId),
      parties: this.getParties(),
      events: this.getEventLog(40)
    }
  }

  // ── Parties ───────────────────────────────────────────────────────────────

  async setActiveParty (partyId) {
    this.engine.setActiveParty(partyId)
    await this.persist()
    return this.result(partyId)
  }

  // The group divides. Both halves stand where the original did; keys stay with
  // the original, since the same physical key cannot be in two places.
  async splitParty (partyId = null, { name } = {}) {
    const fork = this.engine.split(partyId, { name })
    // Focus follows the new group -- the GM split them in order to run them --
    // and the engine has to agree, or `getParties()` marks one party active
    // while the caller is driving another.
    this.engine.setActiveParty(fork.id)
    await this.persist()
    return { ...this.result(fork.id), newPartyId: fork.id }
  }

  // The groups reunite. Only legal where they are standing together in the same
  // room of the same tesseract -- same room by different tesseracts is not the
  // same place, which is the entire premise of the dungeon.
  async mergeParty (fromId, intoId = null) {
    const into = this.engine.merge(fromId, intoId)
    this.engine.setActiveParty(into.id)
    await this.persist()
    return this.result(into.id)
  }

  // Free text about who is in the group: names, hit points, conditions, whatever
  // the GM is holding in their head that the tool has no business modelling.
  async setPartyNotes (partyId, notes) {
    this.engine.setPartyNotes(partyId, notes)
    await this.persist()
    return this.result(partyId)
  }

  getEventLog (limit = 100) {
    return (this.engine.gameDetails.eventLog ?? []).slice(0, limit)
  }

  async renameParty (partyId, name) {
    this.engine.renameParty(partyId, name)
    await this.persist()
    return this.result(partyId)
  }

  // ── Room state ────────────────────────────────────────────────────────────

  async setRoomFlag (flag, value, target = {}) {
    const partyId = target.partyId ?? null
    const party = this.engine.party(partyId)
    const cellId = String(target.cellId ?? party.currentCell)
    const roomId = String(target.roomId ?? party.currentRoom)

    this.engine.setRoomFlag(cellId, roomId, flag, value, partyId)
    await this.persist()

    return this.result(partyId)
  }

  // Fires a reset event across the dungeon. Triggering it is the GM's call for
  // now -- automatic triggers (every N doors, on a key) come next, and will call
  // exactly this.
  async applyReset (event) {
    const result = this.engine.applyReset(event)
    await this.persist()
    return { ...this.result(), reset: result }
  }

  async setCellChoiceMode (mode) {
    this.engine.gameDetails.cellChoiceMode = mode
    await this.persist()
    return mode
  }

  async addNote (text, partyId = null) {
    const trimmed = String(text ?? '').trim()
    if (!trimmed) return this.result(partyId)

    const party = this.engine.party(partyId)
    const notes = (this.engine.gameDetails.notes ??= {})
    const colorName = this.cellInfo(party.currentCell).colorName ?? party.currentCell
    // Always tagged with both the tesseract and the party. Attribution used to
    // start only once a second group existed, which meant every note taken
    // before a split was silently unattributed -- and a split does not go back
    // and label them.
    const line = `${colorName} · ${party.name}: ${trimmed}`

    notes[party.currentRoom] = notes[party.currentRoom]
      ? `${notes[party.currentRoom]}\n${line}`
      : line

    await this.persist()
    return this.result(partyId)
  }
}
