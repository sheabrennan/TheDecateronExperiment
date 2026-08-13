import { lexicalMapper } from './lexicalMap.js'
import { roomView, holdsKey, keysHeld } from './roomView.js'

// Builds a structured description of the current room from the DM's perspective.
// Captures orientation (which door they entered, gravity direction), visit history,
// and generates a short narrative summary the DM can use when describing the room
// to players.
//
// gameDetails, cells, rooms — plain objects from GameEngine state
// party — the group being described; position now belongs to them, not the game
export function buildRoomContext (gameDetails, cells, rooms, party) {
  const { exitCell, exitRoom, notes } = gameDetails
  const {
    currentCell, currentRoom, currentEntry, gravity,
    currentOpenDoor, shortestPath, gameLog
  } = party

  const room = rooms[currentRoom]
  const cell = cells[currentCell]
  const cellRoomData = cell.cellRooms[currentRoom]

  // ── Room ─────────────────────────────────────────────────────────────────
  // One projection, shared with the preview and catalog builders. `key` used to
  // be listed here and was always undefined -- rooms never carried one; keys
  // belong to cells.
  const keyHeldHere = holdsKey(party, currentCell)
  const roomInfo = roomView(room, {
    instanceId: currentRoom,
    keyHeld: keyHeldHere,
    isKeyRoom: String(cell.key) === String(currentRoom),
    packActions: gameDetails.packActions ?? null,
    state: gameDetails.roomState?.[`${currentCell}:${currentRoom}`] ?? {},
    cell,
    templateVars: gameDetails.packTemplateVars ?? null
  })

  // ── Cell ─────────────────────────────────────────────────────────────────
  const isExit =
    String(currentCell) === String(exitCell) &&
    String(currentRoom) === String(exitRoom)

  const cellInfo = {
    id: String(currentCell),
    color: cell.color,
    // The GM says this aloud -- "you're in the Verdant tesseract" lands where
    // "cell 4" does not, and the colour alone cannot be spoken.
    colorName: cell.colorName ?? null,
    isExitCell: isExit,
    hasKey: String(cell.key) === String(currentRoom)
  }

  // ── Orientation ──────────────────────────────────────────────────────────
  // currentDoors is already computed via lexicalMapper on the way in.
  // Each index maps door-position → direction label for THIS entry+gravity combo.
  const currentDoors = party.currentDoors || []

  const entryLabel = currentDoors[currentEntry] ?? null
  const gravityLabel = gravity >= 0 ? (currentDoors[gravity] ?? null) : null

  const doors = currentDoors.map((label, index) => {
    const targetRoomId = cellRoomData?.doors?.[index]
    const trId = targetRoomId != null ? String(targetRoomId) : null
    return {
      index,
      label,
      isEntry: index === currentEntry,
      isGravity: index === gravity,
      isOpen: index === currentOpenDoor,
      targetRoomId: trId,
      targetRoomName: trId != null ? (rooms[trId]?.name ?? '?') : '?',
      wasVisited:        trId != null && gameLog.some(
        e => String(e.currentRoom) === trId && String(e.currentCell) === String(currentCell)),
      wasVisitedAnyCell: trId != null && gameLog.some(
        e => String(e.currentRoom) === trId),
    }
  })

  const orientation = {
    entryDoorIndex: currentEntry,
    entryLabel,
    gravityIndex: gravity,
    gravityLabel,
    gravityDesc: gravity < 0 ? (room.gravity.desc ?? 'Special') : null,
    doors
  }

  // ── Visit history ────────────────────────────────────────────────────────
  // gameLog stores rooms visited BEFORE the current one.
  // Entries matching currentRoom are prior visits (may be from either cell).
  const allPriorVisits = gameLog.filter(
    e => String(e.currentRoom) === String(currentRoom)
  )

  const visitedInThisCell = allPriorVisits.some(
    e => String(e.currentCell) === String(currentCell)
  )
  const visitedInAnyCell = allPriorVisits.length > 0

  const priorVisits = allPriorVisits.map(e => {
    // Recompute the orientation for that visit so the entry label is accurate.
    const visitDoors = lexicalMapper(e.currentEntry, e.gravity)
    const visitEntryLabel = visitDoors ? visitDoors[e.currentEntry] : '?'
    return {
      cell: String(e.currentCell),
      cellColor: cells[e.currentCell]?.color ?? null,
      cellName: cells[e.currentCell]?.colorName ?? null,
      entry: e.currentEntry,
      entryLabel: visitEntryLabel,
      gravity: e.gravity
    }
  })

  const visitHistory = { visitedInThisCell, visitedInAnyCell, priorVisits }

  // Which tesseracts the party has taken the key from. Placement has always
  // existed on the cell; acquisition was only ever a `looted` flag on the key
  // room, and nothing put the two together.
  const allKeys = keysHeld(party)
  const keys = {
    partyId: party.id,
    held: allKeys.map(id => ({
      cellId: id,
      cellName: cells[id]?.colorName ?? null,
      cellColor: cells[id]?.color ?? null
    })),
    total: Object.keys(cells).length,
    hereHeld: allKeys.includes(String(currentCell))
  }

  // ── Pathfinding ──────────────────────────────────────────────────────────
  const shortestPathLength = shortestPath?.length ?? null

  const pathfinding = { shortestPathLength }

  // ── Narrative summary ────────────────────────────────────────────────────
  // A short, plain-language prompt for the DM to use when narrating the room.
  const parts = []

  if (entryLabel) {
    parts.push(`Party enters through the ${entryLabel} door.`)
  }

  if (gravityLabel) {
    parts.push(`Gravity: ${gravityLabel}.`)
  } else if (gravity < 0) {
    // Special gravity with no description used to say nothing at all, so the
    // GM got silence in exactly the rooms where orientation is strangest.
    parts.push(room.gravity.desc
      ? `Gravity: ${room.gravity.desc}.`
      : 'Gravity: special — see the GM notes; door labels below assume the party\'s previous footing.')
  }

  // Where they came from, stated in *that* room's frame. The whole difficulty
  // of running this dungeon is that "the Up door" meant something different one
  // room ago, so both framings have to be in front of the GM at once.
  const [cameFrom] = gameLog
  if (cameFrom && cameFrom.exitDoor >= 0) {
    const fromLabels = lexicalMapper(cameFrom.currentEntry, cameFrom.gravity)
    const fromDoor = fromLabels?.[cameFrom.exitDoor]
    const fromGravity = cameFrom.gravity >= 0
      ? fromLabels?.[cameFrom.gravity]
      : 'special'

    if (fromDoor) {
      parts.push(
        `Left ${rooms[cameFrom.currentRoom]?.name ?? 'the last room'} ` +
        `through its ${fromDoor} door, where gravity was ${fromGravity}.`
      )
    }
  }

  if (visitedInThisCell) {
    const prev = priorVisits.find(v => String(v.cell) === String(currentCell))
    parts.push(
      `Previously visited in this tesseract (came in through the ${prev?.entryLabel ?? '?'} door).`
    )
  } else if (visitedInAnyCell) {
    // The moment the dungeon stops making sense to the players: the same room,
    // but reached through the other tesseract, so its exits lead elsewhere.
    // Naming that tesseract is what lets the GM play the difference instead of
    // just knowing about it.
    const prev = priorVisits[0]
    const where = prev.cellName ? `the ${prev.cellName} tesseract` : `cell ${prev.cell}`
    parts.push(
      `Party has seen this room before, from ${where} (came in through the ${prev.entryLabel} door). ` +
      'Its doors lead somewhere else here.'
    )
  }

  if (cellInfo.hasKey) {
    parts.push('This cell\'s key is in this room.')
  }

  if (isExit) {
    parts.push('THE EXIT IS HERE.')
  }

  const narrativeSummary = parts.join(' ')

  // ── Recent moves ─────────────────────────────────────────────────────────
  const recentMoves = gameLog.slice(0, 15).map(e => {
    const visitDoors = lexicalMapper(e.currentEntry, e.gravity)
    return {
      roomId:     String(e.currentRoom),
      roomName:   rooms[e.currentRoom]?.name ?? '?',
      cellId:     String(e.currentCell),
      cellColor:  cells[e.currentCell]?.color ?? null,
      cellName:   cells[e.currentCell]?.colorName ?? null,
      // Enough for the breadcrumb to answer "did we finish with that room?"
      // without the GM reopening it.
      holdsKey:   String(cells[e.currentCell]?.key) === String(e.currentRoom),
      creatures:  (rooms[e.currentRoom]?.creatures ?? []).map(c => c.name).filter(Boolean),
      state:      gameDetails.roomState?.[`${e.currentCell}:${e.currentRoom}`] ?? {},
      note:       notes?.[e.currentRoom] ?? null,
      entryLabel: visitDoors ? visitDoors[e.currentEntry] : '?'
    }
  })

  // ── Notes ────────────────────────────────────────────────────────────────
  const note = notes?.[currentRoom] ?? null

  // ── What the party has already done here ─────────────────────────────────
  // Tracked per cell *and* room: the party may have cleared this room from the
  // other tesseract only. Both sides are reported; whether that means the
  // bodies are still here is the GM's call.
  const roomState = gameDetails.roomState ?? {}
  const otherCellId = cellRoomData?.otherCell != null
    ? String(cellRoomData.otherCell)
    : null

  const progress = {
    here: roomState[`${currentCell}:${currentRoom}`] ?? {},
    otherSide: otherCellId
      ? {
          cellId: otherCellId,
          cellColor: cells[otherCellId]?.color ?? null,
          cellName: cells[otherCellId]?.colorName ?? null,
          ...(roomState[`${otherCellId}:${currentRoom}`] ?? {})
        }
      : null,
    // Only meaningful when this room holds a key at all.
    holdsKey: cellInfo.hasKey
  }

  return {
    party: { id: party.id, name: party.name, notes: party.notes ?? '' },
    room: roomInfo,
    cell: cellInfo,
    orientation,
    visitHistory,
    pathfinding,
    isExit,
    narrativeSummary,
    recentMoves,
    note,
    progress,
    keys
  }
}
