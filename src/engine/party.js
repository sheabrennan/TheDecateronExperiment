// A party: who is standing where, and what they are carrying.
//
// Position used to live flat on `gameDetails`, which fused two different things
// -- facts about the dungeon (where the exit is) and facts about the group
// walking through it (where they are). Splitting them is what makes more than
// one group possible, and the boundary falls cleanly: a cleared room is cleared
// for everyone, but a key is carried by whoever picked it up.
//
// Parties are cheap and additive. A game with one party is the same shape as a
// game with three, so nothing downstream branches on how many there are.

export const PARTY_FIELDS = [
  'currentCell', 'currentRoom', 'currentEntry', 'gravity', 'currentDoors',
  'currentOpenDoor', 'currentOpenDoorRoom', 'currentOpenDoorCell', 'currentOpenDoorGravity',
  'lastCurrentCell', 'lastCurrentRoom',
  'gameLog', 'redoLog', 'shortestPath', 'doorCounter'
]

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// Ids are short and readable because a GM says them out loud: "party B opens
// the north door". A uuid would be correct and useless.
export function nextPartyId (existing = []) {
  const taken = new Set(existing.map(p => p.id))
  for (const letter of LETTERS) {
    const id = letter.toLowerCase()
    if (!taken.has(id)) return id
  }
  return `p${existing.length + 1}`
}

export function defaultPartyName (id) {
  return `Party ${String(id).toUpperCase()}`
}

export function newParty ({ id, name, cell, room, entry = 0, gravity = 0, doors = [] }) {
  return {
    id,
    name: name ?? defaultPartyName(id),

    currentCell: cell,
    currentRoom: room,
    currentEntry: entry,
    gravity,
    currentDoors: doors,

    currentOpenDoor: -1,
    currentOpenDoorRoom: -1,
    currentOpenDoorCell: -1,
    currentOpenDoorGravity: -1,

    lastCurrentCell: cell,
    lastCurrentRoom: room,

    gameLog: [],
    redoLog: [],
    shortestPath: [],
    doorCounter: 0,

    // Which tesseracts' keys this group is carrying. A room being looted is a
    // fact about the room; holding the key is a fact about the party, and with
    // two groups in the dungeon those come apart.
    keysHeld: [],

    // Who is in this group and what is true of them right now -- names, hit
    // points, conditions, a reminder that the wizard is concentrating. Free text
    // on purpose: this is the half of a session no schema should try to model,
    // and a GM types it faster than they would fill a form.
    notes: ''
  }
}

// Splitting the group.
//
// The new party starts where the original stands, with a fresh log -- their
// history diverges from here. Keys deliberately do NOT come along: duplicating
// them would put the same physical key in two places at once. They stay with
// the original group, and a GM who wants otherwise can hand them over.
export function splitParty (source, { id, name } = {}) {
  const partyId = id ?? 'x'

  return {
    ...newParty({
      id: partyId,
      name,
      cell: source.currentCell,
      room: source.currentRoom,
      entry: source.currentEntry,
      gravity: source.gravity,
      doors: [...(source.currentDoors ?? [])]
    }),
    // They remember getting here together, but from now on the trails diverge.
    gameLog: [...(source.gameLog ?? [])],
    // Who went with them is the GM's to sort out, so the roster starts empty
    // rather than claiming both halves have everyone.
    notes: ''
  }
}

// Folding one group back into another.
//
// Keys are unioned -- between them the merged group carries everything either
// half was carrying. Logs are interleaved newest-first so the breadcrumb reads
// as one history rather than one trail with the other stapled on.
export function mergeParties (into, from) {
  const log = [...(into.gameLog ?? []), ...(from.gameLog ?? [])]
    .sort((a, b) => (b.doorCounter ?? 0) - (a.doorCounter ?? 0))

  return {
    ...into,
    gameLog: log,
    // The merged group's undo history is the surviving party's; the other
    // half's redo trail describes a position that no longer exists.
    redoLog: [...(into.redoLog ?? [])],
    keysHeld: [...new Set([...(into.keysHeld ?? []), ...(from.keysHeld ?? [])])],
    // Both rosters, kept: the merged group contains everyone either half did.
    notes: [into.notes, from.notes].map(n => (n ?? '').trim()).filter(Boolean).join('\n'),
    doorCounter: Math.max(into.doorCounter ?? 0, from.doorCounter ?? 0)
  }
}

// Two parties can only merge where they are standing together -- the same room
// in the same tesseract. Same room via different tesseracts is not the same
// place, which is the entire premise of the dungeon.
export function canMerge (a, b) {
  if (!a || !b || a.id === b.id) return false
  return String(a.currentCell) === String(b.currentCell) &&
    String(a.currentRoom) === String(b.currentRoom)
}

export function findParty (gameDetails, partyId = null) {
  const parties = gameDetails.parties ?? []
  if (partyId != null) {
    return parties.find(p => p.id === String(partyId)) ?? null
  }
  return parties.find(p => p.id === gameDetails.activeParty) ?? parties[0] ?? null
}
