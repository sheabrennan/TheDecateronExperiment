import { lexicalMapper, gravitron } from './lexicalMap.js'
import { bfsShortestPath } from './pathfinding.js'
import { buildRoomContext } from './roomContext.js'
import { roomActions } from './roomView.js'
import {
  newParty, splitParty, mergeParties, canMerge, findParty,
  nextPartyId, defaultPartyName
} from './party.js'

// Position belongs to a party, not to the game.
//
// `gameDetails` used to hold both -- where the exit is (a fact about the
// dungeon) and where the group is standing (a fact about the group). Now the
// second lives on `gameDetails.parties`, and every method that moves or looks
// takes an optional party id defaulting to the active one. That default is what
// keeps a single-party game reading exactly as it did.
//
// World-scoped and deliberately shared: `roomState` (a cleared room is cleared
// for everyone), `notes`, `cellChoiceMode`, and the start/exit coordinates.

export class GameEngine {
  constructor (state, isNew = false) {
    this.cells = state.cells
    this.rooms = state.rooms
    this.gameDetails = state.gameDetails

    // Additive state, defaulted on load so older saves keep working.
    this.gameDetails.roomState ??= {}
    this.gameDetails.eventLog ??= []
    this.gameDetails.parties ??= []
    this.gameDetails.activeParty ??= this.gameDetails.parties[0]?.id ?? null

    if (isNew) {
      for (const party of this.gameDetails.parties) {
        party.gravity = this.gravitron(party.currentRoom, party)
        party.currentDoors = lexicalMapper(party.currentEntry, party.gravity)
      }
    }

    // Always recompute on load so shortestPath reflects current position.
    for (const party of this.gameDetails.parties) this._updateShortestPath(party)
  }

  // ── Parties ───────────────────────────────────────────────────────────────

  get parties () { return this.gameDetails.parties }

  party (partyId = null) {
    const found = findParty(this.gameDetails, partyId)
    if (!found) throw new Error(partyId ? `no party "${partyId}"` : 'game has no parties')
    return found
  }

  // ── Event log ─────────────────────────────────────────────────────────────
  // What happened, as distinct from where anyone is. The breadcrumb answers
  // "where did we go"; this answers "what did we do", which is the question a
  // reset raises and nothing could previously answer -- "1 thing(s) came back"
  // told a GM nothing about which thing.

  logEvent (type, summary, detail = {}) {
    this.gameDetails.eventLog.unshift({
      at: new Date().toISOString(),
      type,
      summary,
      detail
    })
    // Bounded: a long campaign should not grow a save without limit.
    if (this.gameDetails.eventLog.length > 300) this.gameDetails.eventLog.length = 300
    return this.gameDetails.eventLog[0]
  }

  setPartyNotes (partyId, notes) {
    const party = this.party(partyId)
    party.notes = String(notes ?? '')
    return party
  }

  setActiveParty (partyId) {
    const party = this.party(partyId)
    this.gameDetails.activeParty = party.id
    return party
  }

  // Splits a group in two, both standing where the original was. Keys stay with
  // the original -- see party.js for why duplicating them would be wrong.
  split (partyId = null, { name } = {}) {
    const source = this.party(partyId)
    const id = nextPartyId(this.parties)
    const fork = splitParty(source, { id, name })

    this._updateShortestPath(fork)
    this.parties.push(fork)
    this.logEvent('split', `${source.name} split — ${fork.name} formed`, {
      from: source.id, to: fork.id, room: String(source.currentRoom)
    })
    return fork
  }

  // Folds `fromId` into `intoId`. Both must be standing in the same room of the
  // same tesseract; the same room via different tesseracts is not one place.
  merge (fromId, intoId = null) {
    const from = this.party(fromId)
    const into = this.party(intoId)

    if (!canMerge(into, from)) {
      throw new Error(
        `${from.name} and ${into.name} are not in the same room of the same tesseract`
      )
    }

    const merged = mergeParties(into, from)
    Object.assign(into, merged)

    this.gameDetails.parties = this.parties.filter(p => p.id !== from.id)
    if (this.gameDetails.activeParty === from.id) {
      this.gameDetails.activeParty = into.id
    }

    this._updateShortestPath(into)
    this.logEvent('merge', `${from.name} rejoined ${into.name}`, {
      from: from.id, into: into.id, room: String(into.currentRoom)
    })
    return into
  }

  renameParty (partyId, name) {
    const party = this.party(partyId)
    party.name = String(name ?? '').trim() || defaultPartyName(party.id)
    return party
  }

  canMergeInto (fromId, intoId) {
    return canMerge(findParty(this.gameDetails, intoId), findParty(this.gameDetails, fromId))
  }

  // ── Room state ────────────────────────────────────────────────────────────
  // Keyed by cell *and* room, because a room stands in two tesseracts and the
  // party may clear it from one side only. Whether the bodies are still there
  // when they come in from the other side is the GM's ruling, so the tool
  // records both and asserts neither.

  static stateKey (cellId, roomId) {
    return `${cellId}:${roomId}`
  }

  getRoomState (cellId, roomId) {
    return this.gameDetails.roomState[GameEngine.stateKey(cellId, roomId)] ?? {}
  }

  // The actions a room offers, derived from the creatures and features the pack
  // declared for it, with what has already been done folded in.
  roomActions (cellId, roomId) {
    return roomActions(this.rooms[roomId], {
      isKeyRoom: String(this.cells[cellId]?.key) === String(roomId),
      packActions: this.gameDetails.packActions ?? null
    }).map(action => ({ ...action, done: Boolean(this.getRoomState(cellId, roomId)[action.id]) }))
  }

  setRoomFlag (cellId, roomId, flag, value, partyId = null) {
    const key = GameEngine.stateKey(cellId, roomId)
    const state = { ...(this.gameDetails.roomState[key] ?? {}) }

    if (value) state[flag] = true
    else delete state[flag]

    if (Object.keys(state).length) this.gameDetails.roomState[key] = state
    else delete this.gameDetails.roomState[key]

    // Which action hands over the key is the pack's decision now, not a special
    // case on the word "looted": a feature of kind `key` grants it, and a key
    // room with no such feature gets a generated `key` action that does.
    const action = this.roomActions(cellId, roomId).find(a => a.id === flag)
    if (action?.grantsKey && String(this.cells[cellId]?.key) === String(roomId)) {
      this._setKeyHeld(cellId, value, partyId)
      const cellName = this.cells[cellId]?.colorName ?? `cell ${cellId}`
      this.logEvent('key', value
        ? `${this.party(partyId).name} took the ${cellName} key`
        : `${this.party(partyId).name} gave up the ${cellName} key`,
      { cellId, roomId, held: Boolean(value) })
    }

    return this.getRoomState(cellId, roomId)
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  // The reason actions are state rather than notes: an event can undo them.
  //
  // Each action declares which events restore it, so "the boggles come back on a
  // long rest but the amulet stays gone" needs no per-room code. Sweeps the whole
  // dungeon, because a room the party is not standing in still resets.
  applyReset (event) {
    const undone = []

    for (const [key, state] of Object.entries(this.gameDetails.roomState)) {
      const [cellId, roomId] = key.split(':')
      const actions = this.roomActions(cellId, roomId)

      for (const action of actions) {
        if (!state[action.id]) continue
        if (!action.resetsOn?.includes(event)) continue

        // Written straight to room state rather than through setRoomFlag, which
        // would run the key coupling. A reset restores the *room*; what a party
        // is already carrying is theirs, and re-granting through the active party
        // would hand it to whichever group happened to be selected.
        delete state[action.id]
        undone.push({ cellId, roomId, actionId: action.id, label: action.label })
      }

      if (!Object.keys(state).length) delete this.gameDetails.roomState[key]
    }

    if (undone.length) {
      this.logEvent('reset', `${event}: ${undone.length} restored`, {
        event,
        // Named, so the GM can see what came back rather than a count.
        items: undone.map(u => ({
          label: u.label,
          room: this.rooms[u.roomId]?.name ?? u.roomId,
          cell: this.cells[u.cellId]?.colorName ?? u.cellId
        }))
      })
    }

    return { event, undone }
  }

  _setKeyHeld (cellId, held, partyId = null) {
    const party = this.party(partyId)
    const id = String(cellId)
    const keys = new Set(party.keysHeld ?? [])

    if (held) keys.add(id)
    else keys.delete(id)

    party.keysHeld = [...keys]
  }

  // The same room's state in the tesseract the party is not currently in.
  getOtherSideState (cellId, roomId) {
    const other = this.cells[cellId]?.cellRooms?.[roomId]?.otherCell
    if (other == null) return null
    return { cellId: String(other), ...this.getRoomState(other, roomId) }
  }

  // ── Orientation ───────────────────────────────────────────────────────────

  lexicalMapper (entry, gravity, partyId = null) {
    const party = this.party(partyId)
    return lexicalMapper(entry ?? party.currentEntry, gravity ?? party.gravity)
  }

  // Computes gravity for a room by its ID (defaults to the party's own room).
  gravitron (room = null, partyId = null) {
    const party = typeof partyId === 'object' && partyId !== null
      ? partyId
      : this.party(partyId)

    const roomId = room ?? party.currentRoom
    const definition = this.rooms[roomId]

    if (!definition?.gravity?.type) {
      // Swallowing this used to return undefined, which then propagated into
      // the orientation table as a silently wrong set of door labels. A room
      // with no usable gravity keeps the party's current orientation instead.
      return party.gravity >= 0 ? party.gravity : 0
    }
    return gravitron(definition, party.gravity)
  }

  // ── Movement ──────────────────────────────────────────────────────────────

  move (partyId = null) {
    const party = this.party(partyId)
    const cells = this.cells

    if (party.currentOpenDoor < 0) return false

    this.addLog({}, party)

    party.lastCurrentCell = party.currentCell
    party.lastCurrentRoom = party.currentRoom

    party.currentCell = party.currentOpenDoorCell
    party.currentRoom = party.currentOpenDoorRoom
    party.gravity = party.currentOpenDoorGravity

    // The door back is found by searching, not by arithmetic: in a tesseract a
    // reciprocal door sits at whatever slot the origin position occupies, and
    // the party may have crossed tesseracts on the way in.
    const here = cells[party.currentCell].cellRooms[party.currentRoom]
    const viaCurrent = here.doors.indexOf(String(party.lastCurrentRoom))
    party.currentEntry = viaCurrent >= 0
      ? viaCurrent
      : cells[party.lastCurrentCell].cellRooms[party.currentRoom]
        .doors.indexOf(String(party.lastCurrentRoom))

    party.currentDoors = lexicalMapper(party.currentEntry, party.gravity)
    party.currentOpenDoor = party.currentEntry

    this._updateShortestPath(party)
    this.close(partyId)
    return true
  }

  close (partyId = null) {
    const party = this.party(partyId)
    party.currentOpenDoor = -1
    party.currentOpenDoorRoom = -1
    party.currentOpenDoorCell = -1
    party.currentOpenDoorGravity = -1
  }

  // A snapshot of where a party is standing, in the same shape gameLog uses.
  _position (party) {
    const { currentCell, currentRoom, currentEntry, gravity, doorCounter } = party
    return { currentCell, currentRoom, currentEntry, gravity, doorCounter }
  }

  _restore (party, position) {
    for (const k in position) party[k] = position[k]
    party.currentDoors = lexicalMapper(party.currentEntry, party.gravity)
    this._updateShortestPath(party)
  }

  // Stepping back is reversible: the discarded trail and the position being
  // left are stashed so forward() can put them back exactly. Rewinding ten
  // rooms used to destroy those ten log entries outright, which made the
  // breadcrumb a trap -- one misclick and the session's history was gone.
  back (count = 1, partyId = null) {
    const party = this.party(partyId)
    if (!party.gameLog.length) return false

    this.close(partyId)

    const removed = party.gameLog.splice(0, Math.min(count, party.gameLog.length))
    party.redoLog.unshift({ position: this._position(party), removed })
    this._restore(party, removed[removed.length - 1])

    return true
  }

  forward (count = 1, partyId = null) {
    const party = this.party(partyId)
    let moved = false

    for (let i = 0; i < count; i++) {
      const entry = party.redoLog.shift()
      if (!entry) break

      this.close(partyId)
      party.gameLog.unshift(...entry.removed)
      this._restore(party, entry.position)
      moved = true
    }

    return moved
  }

  canGoBack (partyId = null) { return this.party(partyId).gameLog.length > 0 }
  canGoForward (partyId = null) { return this.party(partyId).redoLog.length > 0 }

  addLog (log = {}, partyRef = null) {
    const party = typeof partyRef === 'object' && partyRef !== null
      ? partyRef
      : this.party(partyRef)

    // Moving somewhere new abandons the redo trail, as in any undo stack --
    // otherwise "forward" would jump to a branch the party never took.
    party.redoLog = []

    log.currentCell = party.currentCell
    log.currentRoom = party.currentRoom
    log.currentEntry = party.currentEntry
    log.gravity = party.gravity
    log.doorCounter = party.doorCounter

    // Which door they walked out by. addLog runs before the move commits, so
    // the open door is still the one being used. Without this the room behind
    // could only be shown highlighting the door they came IN by, which is the
    // opposite of what the GM needs to point at.
    log.exitDoor = party.currentOpenDoor
    log.exitCell = party.currentOpenDoorCell

    const [newest] = party.gameLog
    const sameRoom = newest &&
      String(log.currentRoom) === String(newest.currentRoom) &&
      String(log.currentCell) === String(newest.currentCell)

    if (!sameRoom) party.gameLog.unshift(log)
  }

  checkLog (log = {}, partyId = null) {
    const party = this.party(partyId)
    return party.gameLog.some(f => (
      log.cellToCheck && log.cellToCheck >= 0
        ? String(f.currentCell) === String(log.cellToCheck) &&
          String(f.currentRoom) === String(log.roomToCheck)
        : String(f.currentRoom) === String(log.roomToCheck)
    ))
  }

  reviewLog (count = 1, partyId = null) {
    return this.party(partyId).gameLog.slice(0, count)
  }

  _updateShortestPath (party) {
    const path = bfsShortestPath(
      this.cells,
      party.currentCell,
      party.currentRoom,
      this.gameDetails.exitCell,
      this.gameDetails.exitRoom
    )
    party.shortestPath = path ?? []
  }

  // The "other" cell the party's current room also exists in.
  getOtherCell (partyId = null) {
    const party = this.party(partyId)
    return String(this.cells[party.currentCell].cellRooms[party.currentRoom].otherCell)
  }

  // Enriched door choices for all 6 doors through targetCell, so the UI can
  // show visit and path hints per door.
  getPreviewChoices (targetCell, partyId = null) {
    const party = this.party(partyId)
    const { exitCell, exitRoom } = this.gameDetails
    const tc = String(targetCell)

    return party.currentDoors.map((label, i) => {
      const targetRoomId = String(this.cells[tc].cellRooms[party.currentRoom].doors[i])
      const isExit = tc === String(exitCell) && targetRoomId === String(exitRoom)
      const last = party.shortestPath[party.shortestPath.length - 1]
      const isOnShortestPath = (
        party.shortestPath.length > 0 &&
        String(last?.currentCell) === tc &&
        String(last?.currentRoom) === targetRoomId
      )
      return {
        doorIndex: i,
        label,
        isEntry: i === party.currentEntry,
        isGravity: i === party.gravity,
        targetRoomId,
        targetRoomName: this.rooms[targetRoomId]?.name ?? '?',
        targetHasKey: String(this.cells[tc].key) === targetRoomId,
        isExit,
        wasVisited: this.checkLog({ cellToCheck: tc, roomToCheck: targetRoomId }, party.id),
        wasVisitedAnyCell: this.checkLog({ roomToCheck: targetRoomId }, party.id),
        isOnShortestPath,
        shortestPathLength: party.shortestPath.length
      }
    })
  }

  // Opens a door and returns orientation data for the room behind it.
  previewDoor (doorIndex, targetCell, partyId = null) {
    const party = this.party(partyId)
    const tc = String(targetCell)

    if (party.currentOpenDoor >= 0) this.close(partyId)

    party.doorCounter++
    const targetRoomId = this.cells[tc].cellRooms[party.currentRoom].doors[doorIndex]

    party.currentOpenDoor = doorIndex
    party.currentOpenDoorRoom = targetRoomId
    party.currentOpenDoorCell = tc

    // Which door slot in targetRoom leads back to the party's room?
    const targetCellRoomData = this.cells[tc].cellRooms[targetRoomId]
    const openDoorEntryId =
      targetCellRoomData.doors.indexOf(String(party.currentRoom)) >= 0
        ? targetCellRoomData.doors.indexOf(String(party.currentRoom))
        : this.cells[targetCellRoomData.otherCell].cellRooms[party.currentRoom]
          .doors.indexOf(String(targetRoomId))

    party.currentOpenDoorGravity = this.gravitron(targetRoomId, party.id)

    const targetDoorLabels = lexicalMapper(openDoorEntryId, party.currentOpenDoorGravity) ?? []

    return {
      targetRoomId: String(targetRoomId),
      openDoorEntryId,
      openDoorGravity: party.currentOpenDoorGravity,
      targetDoorLabels
    }
  }

  getRoomContext (partyId = null) {
    return buildRoomContext(this.gameDetails, this.cells, this.rooms, this.party(partyId))
  }

  getState () {
    return {
      cells: this.cells,
      rooms: this.rooms,
      gameDetails: this.gameDetails
    }
  }
}

export { newParty }
