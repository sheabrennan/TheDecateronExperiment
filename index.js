/*
 *  A cell represents a tesseract.  8 generally cubic rooms, each with 6 doors that lead to one of the other rooms in the cell.
 *  Cells have a color, common to the lights on doors to the rooms, misc ambient light, and 'keys'
 *  Every room exists in 2 different cells.
 *   Defeating a trap or enemy in 1 cell doesn't mean the other cell's version is clear.
 *  Posessing the 'key' to a cell disables all traps/tricks in all of that cells rooms.
 *
 * // TODO
      A major playtest issue is consistentcy in orientation description.
      This is _especially_ true for rooms which have some readily perceptible non-symmetry.
      preview needs to resolve a consistent set of descriptors for orientation
      but accurately describing non-symmetry means we can't just always pretend
      the entry door is back in display.
        players want to label doors with an orientation and having entry as 'south' frustrates them
      0) we probably need to set orientation at generate and a better way to rerender
      1) In preview, Gravity and entry plane are fine
            but we have 3ish 'sides' of the door that may be approached prior to opening.  Gravity _may_
            suggest one orientation (ie regular door on a wall) but floor/ceiling doors and any non-standard
            gravities are confounding to describe consistently.

      Another major playtest issue is map transitions.  In playtest we used discrete maps
      per room (cell agnostic). The _easiest_ solution is TotM 100%. In person, printed map/minature solutions _could_ work
      For VTTs, when players open a door they should be able to 'see'
        VTT specific solutions might exist  Roll20 API (requires pro) could theoretically facilitate
        foundry has 'map layers' that could be used to have the different connected cell-rooms.
        An external solution affords the greatest flexibility but likely the least satisfaction

      Misc Issues
      0) Decouple presentation already.
      1) Doors should be optionally impassable.  Ideally in a stateful way that can be updated in-game.
            You shouldn't be able go through the exit door in the non-exit cell probably
              (you can work around this by never letting this door 'preview' to that cell but it's annoying)
            You might want a party to find a key or enforce some cell-specific mission goal before certain
            doors are operable

 */

import Store from 'data-store'
import prompts from 'prompts'
import chalk from 'chalk'
import yargs from 'yargs'
import process from 'process'
import convert from 'color-convert'
console.log(yargs)
prompts.override(yargs.argv)

// First, let's define our command types
const GameCommands = {
  PREVIEW: 'preview',
  CATALOG: 'catalog',
  MOVE: 'move',
  DISPLAY: 'display',
  REST: 'rest',
  CLOSE: 'close',
  ADD_NOTES: 'addnotes',
  REVIEW: 'review',
  TRACE: 'trace',
  BACK: 'back',
  EXIT: 'exit'
}

// Create a class to manage game state
class GameState {
  constructor (game, isNewGame = false) {
    this.cells = game.get('cells')
    this.rooms = game.get('rooms')
    this.gameDetails = game.get('gameDetails')
    this.game = game

    if (isNewGame) {
      this.gameDetails.currentEntry = this.gameDetails.currentEntry || 0
      this.gameDetails.gravity = this.gravitron()
      this.gameDetails.currentDoors = this.lexicalMapper()
      game.set('gameDetails')
    }
  }

  // Move all the existing functions into methods
  display () {
    const gameDetails = this.gameDetails
    const color = this.cells[gameDetails.currentCell].color
    const room = this.rooms[gameDetails.currentRoom]

    // Room Details:
    //    Description - Narrative of the room.  short, descriptive and 'enough'
    //    Size/Shape  - ToTM style rough estimates
    //    Mechanics   - This is the special secret stuff about the room.
    //    Key/Item    - Probably doesn't need to be separate from mechanics, but can be.
    //    Bad Guys    - just a quick url link to the things. TODO: roll20?!?
    //    Exit        - We need to show this when they're in the right room.  the Mechanics will explain, but this is _the warning_
    // if(gameDetails.notes[gameDetails.currentRoom])

    console.log(`
        ${chalk.hex(color)(
          'Name:' +
            room.name +
            '  (' +
            gameDetails.currentCell +
            ' - ' +
            convert.hex.keyword(color) +
            ')'
        )}
        Size: ${room.size ? room.size.join(' x ') : 'see Roll20'}
        Gravity: ${
          gameDetails.gravity < 0
            ? room.gravity.desc
            : this.rooms[gameDetails.currentRoom].gravity.type
        }
        Description: ${room.description}
        Mechanics: ${room.mechanics}
        Key: ${room.key}
        Bad Guys: ${room.badguys}
  
              `)
    console.log('Notes: ' + gameDetails.notes[gameDetails.currentRoom])
    // console.log("Display open doors -"+gameDetails.currentDoors)
    console.log(
      chalk.hex(color)(`
                             ${(
                               'Up ' +
                               (gameDetails.currentEntry ==
                               gameDetails.currentDoors.indexOf('Up')
                                 ? '(E)'
                                 : '') +
                               (gameDetails.currentOpenDoor ==
                               gameDetails.currentDoors.indexOf('Up')
                                 ? '(O)'
                                 : '')
                             ).padEnd(8, ' ')}
              - - - - - - - - - - - - - - -
              | \\                         | \\
              |   \\                       |   \\
              |     \\                     |     \\
              |       \\       ${(
                'Front ' +
                (gameDetails.currentEntry ==
                gameDetails.currentDoors.indexOf('Front')
                  ? '(E)'
                  : '') +
                (gameDetails.currentOpenDoor ==
                gameDetails.currentDoors.indexOf('Front')
                  ? '(O)'
                  : '')
              ).padEnd(9, ' ')}    |       \\
              |         \\                 |         \\
              |           - - - - - - - - - - - - - - -
              |           |               |           |
              |           |               |           |
              |  ${(
                'Left ' +
                (gameDetails.currentEntry ==
                gameDetails.currentDoors.indexOf('Left')
                  ? '(E)'
                  : '') +
                (gameDetails.currentOpenDoor ==
                gameDetails.currentDoors.indexOf('Left')
                  ? '(O)'
                  : '')
              ).padEnd(8, ' ')} |               |  ${(
        'Right ' +
        (gameDetails.currentEntry == gameDetails.currentDoors.indexOf('Right')
          ? '(E)'
          : '') +
        (gameDetails.currentOpenDoor ==
        gameDetails.currentDoors.indexOf('Right')
          ? '(O)'
          : '')
      ).padEnd(8, ' ')} |
              |           |               |           |
              |           |               |           |
              |           |               |           |
              - - - - - - | - - - - - - - -           |
                \\         |                 \\         |
                  \\       |                   \\       |
                    \\     |      ${(
                      'Back ' +
                      (gameDetails.currentEntry ==
                      gameDetails.currentDoors.indexOf('Back')
                        ? '(E)'
                        : '') +
                      (gameDetails.currentOpenDoor ==
                      gameDetails.currentDoors.indexOf('Back')
                        ? '(O)'
                        : '')
                    ).padEnd(8, ' ')}       \\     |
                      \\   |                       \\   |
                        \\ |                         \\ |
                          - - - - - - - - - - - - - - -
                                       ${(
                                         'Down ' +
                                         (gameDetails.currentEntry ==
                                         gameDetails.currentDoors.indexOf(
                                           'Down'
                                         )
                                           ? '(E)'
                                           : '') +
                                         (gameDetails.currentOpenDoor ==
                                         gameDetails.currentDoors.indexOf(
                                           'Down'
                                         )
                                           ? '(O)'
                                           : '')
                                       ).padEnd(8, ' ')}
  `)
    )

    if (
      gameDetails.currentCell == gameDetails.exitCell &&
      gameDetails.currentRoom == gameDetails.exitRoom
    ) {
      console.log(
        `${chalk.hex(color)('\n\n\nT  h  e      E   x   i   t   !   !')}`
      )
    }
    return true
  }

  move () {
    const gameDetails = this.gameDetails
    const cells = this.cells
    // you can't move unless there's an open door.
    if (gameDetails.currentOpenDoor >= 0) {
      // first, save the current entry
      this.addLog()

      // get us a new shortest path

      console.log('Moving thru: ' + gameDetails.currentOpenDoor)
      // save current cell/room in last cells
      gameDetails.lastCurrentCell = gameDetails.currentCell
      gameDetails.lastCurrentRoom = gameDetails.currentRoom

      // set current cell, room, entry

      gameDetails.currentCell = gameDetails.currentOpenDoorCell
      gameDetails.currentRoom = gameDetails.currentOpenDoorRoom

      // we can't gravitron, since random would change...
      gameDetails.gravity = gameDetails.currentOpenDoorGravity

      // use the currentCell/Room to figure out which door we just came through
      // if the room is in our currentCell door list, that's our entry
      // otherwise the room is in otherCell door list (hopefully)
      gameDetails.currentEntry =
        cells[gameDetails.currentCell].cellRooms[
          gameDetails.currentRoom
        ].doors.indexOf(String(gameDetails.lastCurrentRoom)) >= 0
          ? cells[gameDetails.currentCell].cellRooms[
            gameDetails.currentRoom
          ].doors.indexOf(String(gameDetails.lastCurrentRoom))
          : cells[gameDetails.lastCurrentCell].cellRooms[
            gameDetails.currentRoom
          ].doors.indexOf(String(gameDetails.lastCurrentRoom))
      // console.log("move current entry: "+gameDetails.currentEntry)
      // console.log("move gravity - "+gameDetails.gravity)
      // console.log("move currentEntry Decision - cells[gameDetails.currentCell].cellRooms[gameDetails.currentRoom].doors.indexOf(String(gameDetails.lastCurrentRoom)) :"+cells[gameDetails.currentCell].cellRooms[
      //   gameDetails.currentRoom
      // ].doors.indexOf(String(gameDetails.lastCurrentRoom)))

      gameDetails.currentDoors = this.lexicalMapper()
      // console.log("Move - "+ gameDetails.currentDoors)
      // i know we're closing this immediately.  but _maybe_ we need it somehow...
      gameDetails.currentOpenDoor = gameDetails.currentEntry

      gameDetails.rested = false
      this.trace(1000)
      // naratively, doors close when you say.  programmatically, it closes as soon as possible.
      this.close()
      return true
    } else {
      console.log('No open door!')
      return false
    }
  }

  lexicalMapper (
    gravityTuple = [this.gameDetails.currentEntry, this.gameDetails.gravity]
  ) {
    // 'special' gravity is lame.. why do i do this...
    gravityTuple[1] = gravityTuple[1] >= 0 ? gravityTuple[1] : 0

    // this whole thing is garbage and while it works, i'm sorry.
    const identityTuple = this.gameDetails.lexicalMap.entryGravityTuple.map(
      (m) => {
        return m[0] == gravityTuple[0] && m[1] == gravityTuple[1] ? 1 : 0
      }
    )

    let orientation
    if (identityTuple.indexOf(1) >= 0) {
      const orientationIndex = identityTuple.indexOf(1)
      orientation = this.gameDetails.lexicalMap.orientations[orientationIndex]
    }
    return orientation
  }

  gravitron (room = this.gameDetails.currentRoom) {
    try {
      // since gravity is room specific we'll count on the description to clarify
      // weirdness comes across
      // console.log("room: "+room)
      switch (this.rooms[room].gravity.type) {
        case 'Fixed':
          // it's always pinned in a direction
          return this.rooms[room].gravity.gravity
        case 'Random':
          // every entry to this room will (potentially) be different
          return Math.floor(Math.random() * 6)
        case 'Match':
          // every entry to this room will (potentially) be different gravity, but it matches the previous room
          // except special, because that's well, special  visited rooms off the opportunity to bring this into the narrative
          return this.gameDetails.gravity >= 0 ? this.gameDetails.gravity : 0
        case 'Special':
          // we can't set details gravity to a string, we need numeric for orientation
          return -1
        default:
          return this.rooms[room].gravity.gravity
      }
    } catch (e) {
      console.log('Gravity Error: ' + room + ' --> ' + e)
    }
  }

  async preview () {
    // TODO:
    //    In our playtesting, preventing multiple doors from being open seemed like a reasonable constraint,
    //    but having the _option_ to allow additionals requires considerations.
    //    0) If a door is *open*, preview should lock that door into the cell currently reviewed
    //        this is _mostly_ for the DM, as it's annoying to repreview until you get the 'right' cell(s)
    //    1) In playtest we introduced an item that allows door opener to dictate target cell destination
    //          we should implement that functionality.
    //    2) If we allow multiple open doors, preview should generate each doors destination cell individually

    const gameDetails = this.gameDetails
    const cells = this.cells
    const rooms = this.rooms
    // we assign only 1 cell here.  it's not _actually_ less randomness, since we regenerate this everytime preview is called,
    // but it does mean all the doors will lead to the same cell once preview is loaded
    const cellsToPickFrom = shuffle([
      gameDetails.currentCell,
      cells[gameDetails.currentCell].cellRooms[gameDetails.currentRoom]
        .otherCell
    ])
    const nextCell = cellsToPickFrom.pop()
    const otherCell = cellsToPickFrom.pop()

    const otherCellHasShortestPath = gameDetails.currentDoors.map((d, i) => cells[otherCell].cellRooms[gameDetails.currentRoom].doors[i])

    const respChoices = gameDetails.currentDoors.map((d, i) => {
      const door = {
        title: d,
        value: i
      }

      if (i == gameDetails.currentEntry) door.title += ' (Entry)'
      if (i == gameDetails.gravity) door.title += ' (Gravity)'

      // (V) means this room and cell have been visited.  (n) means same room different Cell
      const doorLabel =
        nextCell == gameDetails.currentCell
          ? this.checkLog({
            cellToCheck: nextCell,
            roomToCheck:
                cells[nextCell].cellRooms[gameDetails.currentRoom].doors[i]
          })
            ? '(V)'
            : ''
          : this.checkLog({
            roomToCheck:
                cells[nextCell].cellRooms[gameDetails.currentRoom].doors[i]
          })
            ? '(n)'
            : ''

      door.title = doorLabel.padEnd(6, ' ') + door.title

      // shortest path is a rough guess at the 'fastest path out'
      // only works if we picked the right cell above

      const nextRoom =
        cells[nextCell].cellRooms[gameDetails.currentRoom].doors[i]

      if (
        gameDetails.shortestPath[gameDetails.shortestPath.length - 1] &&
        gameDetails.shortestPath[gameDetails.shortestPath.length - 1]
          .currentCell == nextCell &&
        gameDetails.shortestPath[gameDetails.shortestPath.length - 1]
          .currentRoom == nextRoom
      ) {
        door.title += ` ---> [${gameDetails.shortestPath.length}]`
      } else if (gameDetails.shortestPath[gameDetails.shortestPath.length - 1] &&
        gameDetails.shortestPath[gameDetails.shortestPath.length - 1]
          .currentCell == otherCell &&
        gameDetails.shortestPath[gameDetails.shortestPath.length - 1]
          .currentRoom == otherCellHasShortestPath[i]) {
        door.title += ' ---> [OC]'
      }

      if (
        gameDetails.exitCell == nextCell &&
        gameDetails.exitRoom == nextRoom
      ) {
        door.title += '  (EXIT!!!)'
      }

      door.title += `         {${nextRoom} - ${rooms[nextRoom].name} ${
        cells[nextCell].key == nextRoom ? '<Has Key>' : ''
      }}`
      door.title = chalk.hex(cells[nextCell].color)(door.title)
      return door
    })
    console.log(chalk.hex(cells[nextCell].color)(`Cell Color: ${convert.hex.keyword(cells[nextCell].color)}`))
    const door = await GameInputHandler.getDoorPreview([
      {
        type: 'select',
        name: 'door',
        message: 'Which door?',
        choices: [...respChoices, { title: 'Exit', value: -1 }]
      }
    ])

    if (door >= 0) {
      // if a door is already open, close it.
      if (gameDetails.currentOpenDoor >= 0) this.close()

      // keep track of the number of times any door is opened for... reasons?.
      gameDetails.doorCounter++

      const nextRoom =
        cells[nextCell].cellRooms[gameDetails.currentRoom].doors[door]

      gameDetails.currentOpenDoor = door
      gameDetails.currentOpenDoorRoom = nextRoom
      gameDetails.currentOpenDoorCell = nextCell

      // this gives us the positional index of the 'other side' of the door.
      // Ie: where is the door we came through in the other room.
      const openDoorEntryId =
        cells[gameDetails.currentOpenDoorCell].cellRooms[
          gameDetails.currentOpenDoorRoom
        ].doors.indexOf(String(gameDetails.currentRoom)) >= 0
          ? cells[gameDetails.currentOpenDoorCell].cellRooms[
            gameDetails.currentOpenDoorRoom
          ].doors.indexOf(String(gameDetails.currentRoom))
          : cells[
            cells[gameDetails.currentOpenDoorCell].cellRooms[
              gameDetails.currentOpenDoorRoom
            ].otherCell
          ].cellRooms[gameDetails.currentRoom].doors.indexOf(
            String(gameDetails.currentOpenDoorRoom)
          )

      // room and entryid gives us gravity
      gameDetails.currentOpenDoorGravity = this.gravitron(
        nextRoom,
        openDoorEntryId
      )

      // entry door index + gravity gives us the lexical map of door positions.
      const openDoorEntryDoors = this.lexicalMapper([
        openDoorEntryId,
        gameDetails.currentOpenDoorGravity
      ])
      console.log('preview openDoorEntryId: ' + openDoorEntryId)
      console.log('preview gravity ' + gameDetails.currentOpenDoorGravity)
      console.log(
        'Preview openDoorEntryId ' +
          cells[gameDetails.currentOpenDoorCell].cellRooms[
            gameDetails.currentOpenDoorRoom
          ].doors.indexOf(String(gameDetails.currentRoom))
      )
      console.log('Preview Doors' + JSON.stringify(openDoorEntryDoors))

      //       console.log(
      //         chalk[cells[gameDetails.currentCell].color](`
      //                              ${(
      //                                "Up " +
      //                                (gameDetails.currentEntry ==
      //                                gameDetails.currentDoors.indexOf("Up")
      //                                  ? "(E)"
      //                                  : "") +
      //                                (gameDetails.currentOpenDoor ==
      //                                gameDetails.currentDoors.indexOf("Up")
      //                                  ? "(O)"
      //                                  : "")
      //                              ).padEnd(8, " ")}
      //               - - - - - - - - - - - - - - -
      //               | \\                         | \\
      //               |   \\                       |   \\
      //               |     \\                     |     \\
      //               |       \\      ${(
      //                 "Front " +
      //                 (gameDetails.currentEntry ==
      //                 gameDetails.currentDoors.indexOf("Front")
      //                   ? "(E)"
      //                   : "") +
      //                 (gameDetails.currentOpenDoor ==
      //                 gameDetails.currentDoors.indexOf("Front")
      //                   ? "(O)"
      //                   : "")
      //               ).padEnd(9, " ")}    |       \\
      //               |         \\                 |         \\
      //               |           - - - - - - - - - - - - - - -
      //               |           |               |           |
      //               |           |               |           |
      //               |  ${(
      //                 "Left " +
      //                 (gameDetails.currentEntry ==
      //                 gameDetails.currentDoors.indexOf("Left")
      //                   ? "(E)"
      //                   : "") +
      //                 (gameDetails.currentOpenDoor ==
      //                 gameDetails.currentDoors.indexOf("Left")
      //                   ? "(O)"
      //                   : "")
      //               ).padEnd(8, " ")} |               |  ${(
      //           "Right " +
      //           (gameDetails.currentEntry == gameDetails.currentDoors.indexOf("Right")
      //             ? "(E)"
      //             : "") +
      //           (gameDetails.currentOpenDoor ==
      //           gameDetails.currentDoors.indexOf("Right")
      //             ? "(O)"
      //             : "")
      //         ).padEnd(8, " ")} |
      //               |           |               |           |
      //               |           |               |           |
      //               |           |               |           |
      //               - - - - - - | - - - - - - - -           |
      //                 \\         |                 \\         |
      //                   \\       |                   \\       |
      //                     \\     |      ${(
      //                       "Back " +
      //                       (gameDetails.currentEntry ==
      //                       gameDetails.currentDoors.indexOf("Back")
      //                         ? "(E)"
      //                         : "") +
      //                       (gameDetails.currentOpenDoor ==
      //                       gameDetails.currentDoors.indexOf("Back")
      //                         ? "(O)"
      //                         : "")
      //                     ).padEnd(8, " ")}       \\     |
      //                       \\   |                       \\   |
      //                         \\ |                         \\ |
      //                           - - - - - - - - - - - - - - -
      //                                        ${(
      //                                          "Down " +
      //                                          (gameDetails.currentEntry ==
      //                                          gameDetails.currentDoors.indexOf(
      //                                            "Down"
      //                                          )
      //                                            ? "(E)"
      //                                            : "") +
      //                                          (gameDetails.currentOpenDoor ==
      //                                          gameDetails.currentDoors.indexOf(
      //                                            "Down"
      //                                          )
      //                                            ? "(O)"
      //                                            : "")
      //                                        ).padEnd(8, " ")}
      //   `)
      //       );
      this.display()

      console.log(
        chalk.hex(cells[nextCell].color)(`
                         ${(
                           (gameDetails.currentOpenDoorGravity == 3
                             ? '(G)'
                             : ' ') + (openDoorEntryId == 3 ? '(E)' : ' ')
                         ).padEnd(8, ' ')}
            - - - - - - - - - - - - - - -
            | \\                         | \\
            |   \\                       |   \\
            |     \\                     |     \\
            |       \\       ${(
              (gameDetails.currentOpenDoorGravity == 2 ? '(G)' : ' ') +
              (openDoorEntryId == 2 ? '(E)' : '')
            ).padEnd(8, ' ')}    |       \\
            |         \\                 |         \\
            |           - - - - - - - - - - - - - - -
            |           |               |           |
            |           |               |           |
            |  ${(
              (gameDetails.currentOpenDoorGravity == 1 ? '(G)' : ' ') +
              (openDoorEntryId == 1 ? '(E)' : '')
            ).padEnd(8, ' ')} |               |  ${(
          (gameDetails.currentOpenDoorGravity == 4 ? '(G)' : ' ') +
          (openDoorEntryId == 4 ? '(E)' : '')
        ).padEnd(8, ' ')} |
            |           |               |           |
            |           |               |           |
            |           |               |           |
            - - - - - - | - - - - - - - -           |
              \\         |                 \\         |
                \\       |                   \\       |
                  \\     |      ${(
                    (gameDetails.currentOpenDoorGravity == 5 ? '(G)' : ' ') +
                    (openDoorEntryId == 5 ? '(E)' : '')
                  ).padEnd(8, ' ')}       \\     |
                    \\   |                       \\   |
                      \\ |                         \\ |
                        - - - - - - - - - - - - - - -
                              ${(
                                (gameDetails.currentOpenDoorGravity == 0
                                  ? '(G)'
                                  : ' ') + (openDoorEntryId == 0 ? '(E)' : '')
                              ).padEnd(8, ' ')}`)
      )

      console.log(
        'Open Cell:Room ' +
          gameDetails.currentOpenDoorCell +
          ':' +
          gameDetails.currentOpenDoorRoom
      )
      console.log(
        'Open Door Gravity: ' +
          (openDoorEntryDoors[gameDetails.currentOpenDoorGravity]
            ? openDoorEntryDoors[gameDetails.currentOpenDoorGravity]
            : '\n     ' + rooms[gameDetails.currentOpenDoorRoom].gravity.desc) +
          ' (' +
          gameDetails.currentOpenDoorGravity +
          ')'
      )
      console.log('Open Door Details:')
      console.log(rooms[nextRoom].description)
    }
    return door
  }

  trace (count = 30000, checkVisited = true) {
    const ticker = []
    let shortestPath = []

    const tmpStartRoom = this.gameDetails.currentRoom
    const tmpStartCell = this.gameDetails.currentCell
    const tmpCurrentEntry = this.gameDetails.currentEntry
    const tmpGravity = this.gameDetails.gravity
    const tmpCurrentDoors = [...this.gameDetails.currentDoors]

    for (let t = count; t > 0; t--) {
      process.stdout.write('    ' + t + ' Simulations left.\r')
      this.gameDetails.ticks = 1
      const originalLog = [...this.gameDetails.gameLog]

      // params.checkVisited = checkVisited
      this.walk({ checkVisited, allowEntryExit: true })

      const currentPath = this.gameDetails.gameLog.slice(
        0,
        this.gameDetails.gameLog.length - (originalLog.length + 1)
      )

      if (
        shortestPath.length === 0 ||
        currentPath.length < shortestPath.length
      ) {
        shortestPath = [...currentPath]
      }

      ticker.push(this.gameDetails.ticks)

      // reset our init
      this.gameDetails.currentCell = tmpStartCell
      this.gameDetails.currentRoom = tmpStartRoom

      this.gameDetails.gameLog = [...originalLog]
    }

    console.log('\nDone!')
    // Min of 1 is a single step win. _ s c a r y _

    this.gameDetails.currentEntry = tmpCurrentEntry
    this.gameDetails.gravity = tmpGravity
    this.gameDetails.currentDoors = tmpCurrentDoors
    this.gameDetails.shortestPath = shortestPath

    console.dir({
      min: `${Math.min(...ticker)}`,
      max: `${Math.max(...ticker)}`,
      avg: `${Math.ceil(ticker.reduce((a, b) => a + b, 0) / ticker.length)}`
    })
  }

  walk (params = { checkVisited: false, allowEntryExit: false }) {
    // allowEntryExit lets the walk go out the in door
    // checkVisited looks at the log to see if we've been to the room before, and skips it if we have

    // if the room's an exit, we're done.
    if (
      this.rooms[this.gameDetails.currentRoom].exit &&
      this.gameDetails.exitCell == this.gameDetails.currentCell
    ) {
      this.addLog()
      return true
    }

    const doors = shuffle([...this.gameDetails.currentDoors.keys()])

    let nextDoor
    let nextCell
    let nextRoom
    for (const door in doors) {
      nextDoor = doors.splice(door, 1).pop()

      // don't go out the in unless we said it's ok
      if (
        this.gameDetails.currentDoors[nextDoor] ==
          this.gameDetails.currentEntry &&
        !params.allowEntryExit
      ) {
        continue
      }

      // take a random cell.  it's either the current cell or the 'other' cell this room exists in
      nextCell = shuffle([
        this.gameDetails.currentCell,
        this.cells[this.gameDetails.currentCell].cellRooms[
          this.gameDetails.currentRoom
        ].otherCell
      ]).pop()

      nextRoom =
        this.cells[nextCell].cellRooms[this.gameDetails.currentRoom].doors[
          nextDoor
        ]

      if (!params.checkVisited || doors.length == 0) {
        // we can charge ahead randomly, or go out the last door (if we've visited everything...)
        break
      } else {
        if (this.checkLog({ currentCell: nextCell, currentRoom: nextRoom })) {
          continue
        } else {
          break
        }
      }
    }

    // track where we've been
    this.addLog()

    // load our details up for next pass
    this.gameDetails.currentCell = nextCell
    this.gameDetails.currentRoom = nextRoom
    this.gameDetails.currentEntry = nextDoor
    this.gameDetails.gravity = this.gravitron()
    this.gameDetails.currentDoors = this.lexicalMapper([
      nextDoor,
      this.gameDetails.gravity
    ])

    // ticks track a path length.
    this.gameDetails.ticks++

    // TODO: this isn't TCO right? and i _think_ it's the nested closure/promise resolution for our async play
    return this.walk()
  }

  catalog () {
    const gameDetails = this.gameDetails
    const cells = this.cells
    const rooms = this.rooms

    const color = cells[this.gameDetails.currentCell].color
    const otherCell = cells[gameDetails.currentCell].cellRooms[gameDetails.currentRoom].otherCell
    const otherCellColor = cells[otherCell].color
    const keyRoom = cells[gameDetails.currentCell].key
    const otherCellKeyRoom = cells[otherCell].key

    gameDetails.currentDoors.forEach((door, idx) => {
      const room = cells[gameDetails.currentCell].cellRooms[gameDetails.currentRoom].doors[idx]
      const roomName = rooms[room].name
      const roomDescription = rooms[room].description

      // const roomDescription =
      console.log(chalk.hex(color)(`${door}(${room}) ${(gameDetails.currentEntry == idx) ? '(E)' : ''} ${(room == keyRoom) ? '(Key)' : ''} : ${roomName} ${roomDescription}`))
    })

    gameDetails.currentDoors.forEach((door, idx) => {
      const room = cells[otherCell].cellRooms[gameDetails.currentRoom].doors[idx]
      const roomName = rooms[room].name
      const roomDescription = rooms[room].description

      // const roomDescription =
      console.log(chalk.hex(otherCellColor)(`${door}(${room}) ${(gameDetails.currentEntry == idx) ? '(E)' : ''} ${(room == otherCellKeyRoom) ? '(Key)' : ''} : ${roomName} ${roomDescription}`))
    })
  }

  close () {
    // i resisted 'closed'.
    this.gameDetails.currentOpenDoor = -1
    this.gameDetails.currentOpenDoorRoom = -1
    this.gameDetails.currentOpenDoorCell = -1
    this.gameDetails.currentOpenDoorGravity = -1
  }

  save () {
    // game details will always be changing.
    // there's probably a better way...
    this.game.set('gameDetails', this.gameDetails)
    this.game.set('cells', this.cells)
    this.game.set('rooms', this.rooms)
  }

  back (count = 1) {
    // this is _unwinding_ what we did.
    // if count is > gameLog, it's a reset.

    // close whatever door was open, if any
    this.close()

    // cut the requested number of elements, pull out the lastmost one
    const newCurrent = this.gameDetails.gameLog
      .splice(
        0,
        count > this.gameDetails.gameLog.length
          ? this.gameDetails.gameLog.length
          : count
      )
      .pop()
    // direct remap log properties onto game details.
    // this is convenient, but a _little_ dangerous :D
    for (const k in newCurrent) {
      this.gameDetails[k] = newCurrent[k]
    }

    // this _assumes_ our log has current room and entry defined
    // which it _has_ to i guess... not totally happy.
    this.gameDetails.currentDoors = this.lexicalMapper()

    // regenerate shortest path
    this.trace(1000)
  }

  async addNote () {
    console.log(
      'Current Note:' + this.gameDetails.notes[gameDetails.currentRoom] ||
        'None'
    )
    const resp = await prompts([
      {
        type: 'text',
        name: 'gameNotes',
        message: 'Notes?'
      }
    ])
    if (resp.gameNotes) {
      if (this.gameDetails.notes[this.gameDetails.currentRoom]) {
        this.gameDetails.notes[this.gameDetails.currentRoom] += '\n'
        this.gameDetails.notes[this.gameDetails.currentRoom] +=
          this.gameDetails.currentCell + ': ' + resp.gameNotes
      } else {
        this.gameDetails.notes[this.gameDetails.currentRoom] =
          this.gameDetails.currentCell + ': ' + resp.gameNotes
      }
    }
  }

  addLog (log = {}) {
    // this isn't the _best_ way probably, but we'll always need these
    log.currentCell = this.gameDetails.currentCell
    log.currentRoom = this.gameDetails.currentRoom
    log.currentEntry = this.gameDetails.currentEntry
    log.gravity = this.gameDetails.gravity

    // this isn't _perfect_ but should be good enough for backing out
    log.doorCounter = this.gameDetails.doorCounter

    // things aboout the log
    // stores cell/room combos.  this is enough to 'replay' the whole deal.
    // session?
    // day/long rest?
    // notes? - probably just for tracking the 'state' between sessions, maybe _major_ events

    if (
      this.gameDetails.gameLog.length > 0 &&
      log.currentRoom == this.gameDetails.gameLog[0].currentRoom &&
      log.currentCell == this.gameDetails.gameLog[0].currentCell
    ) {
      // don't double up, but maybe allow 'upsert'.  we'd need to filter out stuff..
    } else {
      this.gameDetails.gameLog.unshift(log)
    }
  }

  checkLog (log = {}) {
    // require room, allow cell
    return (
      this.gameDetails.gameLog.filter((f) => {
        return log.cellToCheck && log.cellToCheck >= 0
          ? f.currentCell == log.cellToCheck && f.currentRoom == log.roomToCheck
          : true && f.currentRoom == log.roomToCheck
      }).length > 0
    )
  }

  reviewLog (count = 1) {
    // kick back the last count logs, pop to consume
    return this.gameDetails.gameLog.slice(0, count)
  }

  // Add a method to handle commands
  async executeCommand (command, params = {}) {
    switch (command) {
      case GameCommands.PREVIEW:
        await this.preview(params)
        return true
      case GameCommands.MOVE:
        if (this.move()) {
          this.display()
          this.save()
        }
        return true
      case GameCommands.DISPLAY:
        this.display()
        return true
      case GameCommands.CATALOG:
        this.catalog()
        return true
      case GameCommands.TRACE:
        this.trace()
        return true
      case GameCommands.BACK:
        this.back()
        return true
      case GameCommands.CLOSE:
        this.close()
        return true
      case GameCommands.REVIEW:
        console.log(this.reviewLog(10))
        return true
      case GameCommands.EXIT:
        this.save()
        return false // Signal to stop the game loop
      default:
        throw new Error(`Unknown command: ${command}`)
    }
  }
}

// Create an input handler class
class GameInputHandler {
  static async getNextCommand () {
    const response = await prompts([
      {
        type: 'select',
        name: 'location',
        message: 'Which thing?',
        choices: [
          {
            title: 'Preview',
            description:
              "Display doors, allow selection, display what's on the other side.",
            value: GameCommands.PREVIEW
          },
          {
            title: 'Move',
            description: 'Moves through current open door (from preview)',
            value: GameCommands.MOVE
          },
          {
            title: 'Display',
            description: '(Re)print the details for the current room.',
            value: GameCommands.DISPLAY
          },
          // {
          //   title: 'Rest',
          //   description: 'Use if the party rests, might trigger an event',
          //   value: GameCommands.REST
          // },
          {
            title: 'Close',
            description: 'Closes the currently open door.',
            value: GameCommands.CLOSE
          },
          {
            title: 'Catalog',
            description: 'Gives summary of each room for each cell of the currently occupied room',
            value: GameCommands.CATALOG
          },
          // {
          //   title: 'Add Notes',
          //   description:
          //     'Add notes for current room (will be displayed by cell.',
          //   value: GameCommands.ADD_NOTES
          // },
          {
            title: 'Review',
            description: 'Displays last 10 rooms.  (needs work)',
            value: GameCommands.REVIEW
          },
          {
            title: 'Trace',
            description:
              'Run 20000 context-aware paths from the current location.  (mostly just fun)',
            value: GameCommands.TRACE
          },
          {
            title: 'Back',
            description: "Programmatic 'back', use only for 'mistakes'",
            value: GameCommands.BACK
          },
          {
            title: 'Exit',
            description: 'See the tin',
            value: GameCommands.EXIT
          }
        ]
      }
    ])

    return response.location
  }

  static async getDoorPreview (prompt) {
    const response = await prompts(prompt)
    return response.door
  }
}

// Main game loop handler
class GameLoop {
  constructor (game, isNewGame = false) {
    this.gameState = new GameState(game, isNewGame)
  }

  // The main game loop is now separate from input handling
  async start () {
    let continueGame = true

    while (continueGame) {
      const command = await GameInputHandler.getNextCommand()
      continueGame = await this.gameState.executeCommand(command)
    }
  }
}

// Refactored main game initialization
function initializeGame (gameName) {
  const game = new Store({
    path: process.cwd() + '/.config/games/' + gameName + '.json'
  })

  if (!game.get('name')) {
    console.log('NEW GAME!!!!!')
    const init = new Store({ path: process.cwd() + '/.config/default.json' }) // used to build a new one
    const initRooms = new Store({
      path: process.cwd() + '/.config/rooms.json'
    })

    const newGame = generate(gameName, init, initRooms.get('roomList'))
    return new GameLoop(newGame, true)
  } else {
    return new GameLoop(game)
  }
}

// Main entry point
prompts([
  {
    type: 'text',
    name: 'game',
    message: "What's your game called?"
  }
]).then((gameName) => {
  const gameLoop = initializeGame(gameName.game)
  gameLoop.start()
})

function generate (name, init, rooms) {
  // we reinitialize with the defaults now that we know it doesn't exist
  const build = new Store(
    {
      path: process.cwd() + '/.config/games/' + name + '.json'
    },
    init.get('initer')
  )

  build.set('name', name)

  // There's no explicit reason why we must have exactly roomCount rooms
  // if we set a key in each room, and ensure those rooms are in cells
  // this should work
  const roomDefault = shuffle(Object.keys(rooms))

  const cells = build.get('cells')
  // indexes for cells
  const cellList = Array.from(
    { length: init.get('cellCount') },
    (_, i) => `${i}`
  )

  // extract which rooms have keys
  const keyRooms = shuffle(Object.keys(rooms).filter((r) => rooms[r].key))
  const keyList = init.get('keyList')
  Object.keys(keyList).forEach((k) => (keyList[k] = keyRooms.pop()))

  // keys will be room Ids used in cells
  // values will be instances of 'room' objects
  const roomList = {}

  // build a list of cell templates
  Object.keys(keyList).forEach((color, idx) => {
    const newCell = { ...init.get('cellTemplate') }
    newCell.cellRooms = {}
    newCell.color = color
    newCell.roomMap = deepCopy(init.get('cellMap'))
    newCell.key = keyList[color]
    newCell.otherKeyCell = null
    cells[`${idx}`] = newCell
  })

  // 1st Pass gets us the key rooms assigned to both the cell and the paired cell.
  Object.keys(cells).forEach((cell) => {
    const otherKeyCell = shuffle(
      Object.keys(cells).filter(
        (x) =>
          x !== cell &&
          !Object.keys(cells)
            .map((c) => cells[c].otherKeyCell)
            .includes(x)
      )
    ).pop()

    const roomId = cells[cell].key
    cells[cell].cellRooms[roomId] = cells[cell].roomMap.shift()
    cells[cell].cellRooms[roomId].otherCell = otherKeyCell
    cells[cell].otherKeyCell = otherKeyCell

    cells[otherKeyCell].cellRooms[roomId] = cells[otherKeyCell].roomMap.pop()
    cells[otherKeyCell].cellRooms[roomId].otherCell = cell

    roomDefault.splice(roomDefault.indexOf(roomId), 1)
    roomList[roomId] = rooms[roomId]
  })

  // 2nd pass fills out each cell
  Object.keys(cells).forEach((cell) => {
    cellList.splice(cellList.indexOf(cell), 1)

    cells[cell].roomMap.forEach((rm) => {
      const cellRooms = Object.keys(roomList).filter((r) =>
        Object.keys(cells[cell].cellRooms).includes(r)
      )

      // get the *includeGroup* rooms already assigned to this cell
      const includeGroupList = cellRooms
        .map((x) => roomList[x].includeGroup)
        .filter((x) => x != null)

      // look for unassigned rooms with an include group in our list
      const includeGroupRooms = Object.keys(rooms).filter(
        (r) =>
          roomDefault.includes(r) &&
          includeGroupList.includes(rooms[r].includeGroup)
      )

      const excludeGroupList = cellRooms.map(r => r.excludeGroup).filter(r => r != null)

      const roomId = includeGroupRooms.length ? includeGroupRooms.pop() : roomDefault.filter(r => !excludeGroupList.includes(rooms[r].excludeGroup)).sort((a, b) => rooms[a].includeGroup >= 0 ? 1 : rooms[b].includeGroup >= 0 ? -1 : 0).pop()

      roomDefault.splice(roomDefault.indexOf(roomId), 1)

      // const roomId = roomDefault.pop()

      // use the cell with the most remaining rooms as the 'other cell'
      const otherCell = cellList
        .filter(
          (c) => cells[c].roomMap && Object.keys(cells[c].roomMap).length > 0
        )
        .sort((a, b) =>
          cells[a].roomMap.length > cells[b].roomMap.length ? 1 : -1
        )
        .pop()

      const otherCellRoom = cells[otherCell].roomMap.shift()

      roomList[roomId] = rooms[roomId]

      cells[cell].cellRooms[roomId] = deepCopy(rm)
      cells[cell].cellRooms[roomId].otherCell = otherCell

      cells[otherCell].cellRooms[roomId] = otherCellRoom
      cells[otherCell].cellRooms[roomId].otherCell = cell

      // initialize stuff
      const gameDetails = build.get('gameDetails')
      gameDetails.notes = {}
    })
    delete cells[cell].roomMap
  })

  const gameDetails = build.get('gameDetails')

  // don't have more than 1 start room ya dummies
  const startRoom = Object.keys(roomList)
    .filter((r) => roomList[r].start == true)
    .pop()

  const endRoom = Object.keys(roomList)
    .filter((r) => roomList[r].exit == true)
    .pop()

  gameDetails.startCell = Object.keys(cells)
    .filter(
      (c) =>
        Object.keys(cells[c].cellRooms).includes(startRoom) &&
        cells[c].key == startRoom
    )
    .pop()
  gameDetails.startRoom = startRoom

  gameDetails.currentCell = gameDetails.startCell
  gameDetails.currentRoom = startRoom

  gameDetails.exitCell = Object.keys(cells)
    .filter((c) => Object.keys(cells[c].cellRooms).includes(endRoom))
    .pop()
  gameDetails.exitRoom = endRoom

  // now that cells are all filled, populate doors list with _roomID_
  //  position in array defines which door is which, room maps to current cell
  Object.keys(cells).forEach((c) => {
    const cell = cells[c]
    Object.keys(cell.cellRooms).forEach((lc) => {
      const linkCell = cell.cellRooms[lc]
      linkCell.doors.forEach((d, i) => {
        linkCell.doors[i] = Object.keys(cell.cellRooms).filter((f) => {
          return cell.cellRooms[f].position == d
        })[0]
      })
    })
  })

  // console.log("roomList: " + Object.keys(roomList).length);

  build.set('rooms', roomList)
  build.set('cells', cells)
  build.set('gameDetails', gameDetails)

  return build
}

function deepCopy (obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj // Primitive value or null
  }

  const copy = Array.isArray(obj) ? [] : {}

  for (const key in obj) {
    if (obj.hasOwn(key)) {
      copy[key] = deepCopy(obj[key])
    }
  }

  return copy
}

function shuffle (a) {
  let j, x, i
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1))
    x = a[i]
    a[i] = a[j]
    a[j] = x
  }
  return a
}
