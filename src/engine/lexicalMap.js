// Static 36-entry lookup table: (entry door 0-5) x (gravity 0-5) → orientation labels
// Lifted from default.json initer.gameDetails.lexicalMap so it no longer needs to live in save files.

export const ENTRY_GRAVITY_TUPLES = [
  [0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5],
  [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
  [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5],
  [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5],
  [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5],
  [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5]
]

export const ORIENTATIONS = [
  ['Down', 'Left', 'Front', 'Up', 'Right', 'Back'],
  ['Back', 'Down', 'Right', 'Front', 'Up', 'Left'],
  ['Back', 'Left', 'Down', 'Front', 'Right', 'Up'],
  ['Up', 'Right', 'Front', 'Down', 'Left', 'Back'],
  ['Back', 'Up', 'Left', 'Front', 'Down', 'Right'],
  ['Back', 'Right', 'Up', 'Front', 'Left', 'Down'],
  ['Down', 'Back', 'Left', 'Up', 'Front', 'Right'],
  ['Back', 'Down', 'Right', 'Front', 'Up', 'Left'],
  ['Right', 'Back', 'Down', 'Left', 'Front', 'Up'],
  ['Up', 'Back', 'Right', 'Down', 'Front', 'Left'],
  ['Back', 'Up', 'Left', 'Front', 'Down', 'Right'],
  ['Left', 'Back', 'Up', 'Right', 'Front', 'Down'],
  ['Down', 'Right', 'Back', 'Up', 'Left', 'Front'],
  ['Left', 'Down', 'Back', 'Right', 'Up', 'Front'],
  ['Right', 'Back', 'Down', 'Left', 'Front', 'Up'],
  ['Up', 'Left', 'Back', 'Down', 'Right', 'Front'],
  ['Right', 'Up', 'Back', 'Left', 'Down', 'Front'],
  ['Left', 'Back', 'Up', 'Right', 'Front', 'Down'],
  ['Down', 'Right', 'Back', 'Up', 'Left', 'Front'],
  ['Front', 'Down', 'Left', 'Back', 'Up', 'Right'],
  ['Front', 'Right', 'Down', 'Back', 'Left', 'Up'],
  ['Up', 'Left', 'Back', 'Down', 'Right', 'Front'],
  ['Front', 'Up', 'Right', 'Back', 'Down', 'Left'],
  ['Front', 'Left', 'Up', 'Back', 'Right', 'Down'],
  ['Down', 'Front', 'Right', 'Up', 'Back', 'Left'],
  ['Front', 'Down', 'Left', 'Back', 'Up', 'Right'],
  ['Left', 'Front', 'Down', 'Right', 'Back', 'Up'],
  ['Up', 'Front', 'Left', 'Down', 'Back', 'Right'],
  ['Front', 'Up', 'Right', 'Back', 'Down', 'Left'],
  ['Right', 'Front', 'Up', 'Left', 'Back', 'Down'],
  ['Down', 'Left', 'Front', 'Up', 'Right', 'Back'],
  ['Right', 'Down', 'Front', 'Left', 'Up', 'Back'],
  ['Left', 'Front', 'Down', 'Right', 'Back', 'Up'],
  ['Up', 'Right', 'Front', 'Down', 'Left', 'Back'],
  ['Left', 'Up', 'Front', 'Right', 'Down', 'Back'],
  ['Right', 'Front', 'Up', 'Left', 'Back', 'Down']
]

// Pure function: maps entry door index + gravity index → array of 6 direction labels.
// Special gravity (-1) is treated as 0 for orientation purposes.
export function lexicalMapper (entry, gravity) {
  const g = gravity >= 0 ? gravity : 0
  const idx = ENTRY_GRAVITY_TUPLES.findIndex(t => t[0] === entry && t[1] === g)
  return idx >= 0 ? [...ORIENTATIONS[idx]] : undefined
}

// Pure function: computes gravity for a room given the room definition and previous gravity.
// roomDef: the room object from rooms[roomId]
// prevGravity: gravity value from the room the party just left (used for 'Match' type)
export function gravitron (roomDef, prevGravity = 0) {
  switch (roomDef.gravity.type) {
    case 'Fixed':
      return roomDef.gravity.gravity
    case 'Random':
      return Math.floor(Math.random() * 6)
    case 'Match':
      return prevGravity >= 0 ? prevGravity : 0
    case 'Special':
      return -1
    default:
      return roomDef.gravity.gravity
  }
}
