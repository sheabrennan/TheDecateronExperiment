// BFS shortest path over the dungeon graph.
//
// Graph model:
//   Node:  (cellId, roomId) pair — each room exists in exactly 2 cells → ~80 nodes.
//   Edges: from (cell, room) the party can move by choosing EITHER cell version of
//          the current room, then walking through any of its 6 doors:
//            - Stay in same cell: (cell, cells[cell].cellRooms[room].doors[i])
//            - Flip to otherCell: (other, cells[other].cellRooms[room].doors[i])
//          Each door's target room always exists in the chosen cell (by construction).
//          This gives up to 12 outgoing edges per node.
//
// Gravity has no effect on adjacency — only on door labels — so it is ignored here.

export function bfsShortestPath (cells, startCell, startRoom, exitCell, exitRoom) {
  const encode = (c, r) => `${c}:${r}`

  // The exit room exists in two cells — accept either as the goal.
  const exitOtherCell = cells[exitCell]?.cellRooms?.[exitRoom]?.otherCell
  const goals = new Set([
    encode(exitCell, exitRoom),
    ...(exitOtherCell != null ? [encode(String(exitOtherCell), exitRoom)] : [])
  ])

  const startKey = encode(String(startCell), String(startRoom))
  if (goals.has(startKey)) return []

  const visited = new Set([startKey])
  const queue = [{ cell: String(startCell), room: String(startRoom), path: [] }]

  while (queue.length > 0) {
    const { cell, room, path } = queue.shift()

    // From (cell, room), try doors from BOTH cell versions of this room.
    const otherCell = String(cells[cell]?.cellRooms?.[room]?.otherCell)

    for (const tc of [cell, otherCell]) {
      const cellRoomData = cells[tc]?.cellRooms?.[room]
      if (!cellRoomData) continue

      for (const targetRoom of cellRoomData.doors) {
        if (targetRoom == null) continue

        // The target room is always in tc (door connections are cell-local by construction).
        const key = encode(tc, String(targetRoom))
        if (visited.has(key)) continue
        visited.add(key)

        const newPath = [...path, { currentCell: tc, currentRoom: String(targetRoom) }]

        if (goals.has(key)) {
          // Reverse so [0] = exit, [last] = immediate next step from start.
          return newPath.reverse()
        }

        queue.push({ cell: tc, room: String(targetRoom), path: newPath })
      }
    }
  }

  return null // no path found (shouldn't happen in a valid dungeon)
}
