/*TODO:  
  verify room structure, 
    description, badguys have changed
    new keys (ie: nokey) for preventing
  
*/

var Store = require("data-store");
var init = new Store("default", { base: "./.config" }); //used to build a new one
var initRooms = new Store("rooms", { base: "./.config" });
var prompts = require("prompts");
const chalk = require("chalk");

prompts.override(require("yargs").argv);

prompts([
  {
    type: "text",
    name: "game",
    message: "What's your game called?",
  },
]).then((gameName) => {
  let game = new Store(gameName.game, { base: "./.config/games" });
  if (!game.get("name")) {
    return play(generate(gameName.game, init, initRooms.get("roomList")), true);
  } else {
    return play(game);
  }
});

function generate(name, init, rooms) {
  //we reinitialize with the defaults now that we know it doesn't exist
  let build = new Store(name, { base: "./.config/games" }, init.get("initer"));

  build.set("name", name);

  //just an empty object {} from initer
  //will be our 'matestpiece'
  let cells = build.get("cells");

  //a randomized list of room indexes 0-'roomCount'
  let roomDefault = shuffle([...Array(init.get("roomCount")).keys()]);

  //indexes for cells
  let cellList = [...Array(init.get("cellCount")).keys()];

  //flavor, cells get colors
  let keyList = init.get("keyList")
  let colors = shuffle(keyList.keys());

  //keys will be room Ids used in cells
  // values will be instances of 'room' objects
  let roomList = {};

  //build a list of cell templates
  cellList.forEach((cell) => {
    let newCell = { ...init.get("cellTemplate") };
    newCell.linkedCells = {};
    newCell.color = colors.shift();
    newCell.roomMap = JSON.parse(JSON.stringify(init.get("cellMap")));
    newCell.key = keyList[newCell.color]
    cells[cell] = newCell;
  });

  //For each cell in the template
  //  drop the cell from the cell list (we only go through once)
  //  create a temp array of remaining cellList, this'll source our 2nd referenced cell
  //  for our current cell, loop through *every* entry in 'roomMap'
  Object.keys(cells).forEach((c) => {
    //we're filling this cell, no circular maps
    cellList.shift();
    let cellsToFill = [...cellList];

    //keys are strings here, need int initially, the rest works.
    let intc = parseInt(c);

    cells[c].roomMap.forEach((rm) => {
      //this is the id in our decateron
      let roomId = roomDefault.pop();

      //currently this only supports roomCount rooms
      //more randomness could be applied if we could ensure
      // start and end are included
      roomList[roomId] = rooms[roomId];

      //this isn't _actually_ random, but the rooms are, so no need for 'extra'
      let randomCell = cellsToFill.pop();
      let otherCellRoom = cells[randomCell].roomMap.shift();

      //quick reference for other room
      // used for doors index reference
      rm.otherCell = randomCell;
      otherCellRoom.otherCell = intc;

      //save the room map object
      cells[c].linkedCells[roomId] = rm;
      cells[randomCell].linkedCells[roomId] = otherCellRoom;

      //technically the start room is in 2 cells, here we just pick the current cell to start.
      if (roomList[roomId].start && !build.get("gameDetails.cell")) {
        let gameDetails = build.get("gameDetails");

        gameDetails.currentCell = intc;
        gameDetails.currentRoom = roomId;

        gameDetails.startCell = intc;
        gameDetails.startRoom = roomId;
      }

      if (roomList[roomId].exit && !build.get("gameDetails.cell")) {
        let gameDetails = build.get("gameDetails");
        gameDetails.exitCell = intc;
        gameDetails.exitRoom = roomId;
      }
    });
    //just cruft now
    delete cells[c].roomMap;
  });

  //now that cells are all filled, populate doors list with _roomID_
  //  position in array defines which door is which, room maps to current cell
  Object.keys(cells).forEach((c) => {
    let cell = cells[c];
    Object.keys(cell.linkedCells).forEach((lc) => {
      let linkCell = cell.linkedCells[lc];
      linkCell.doors.forEach((d, i) => {
        linkCell.doors[i] = Object.keys(cell.linkedCells).filter((f) => {
          return cell.linkedCells[f].position == d;
        })[0];
      });
    });
  });

  build.set("rooms", roomList);
  return build;
}

async function play(game, initGame = false) {
  let cells = game.get("cells");
  let rooms = game.get("rooms");
  let gameDetails = game.get("gameDetails");

  if (initGame) {
    gameDetails.currentEntry = gameDetails.currentEntry || 0;
    gameDetails.gravity = gravitron();
    gameDetails.currentDoors = lexicalMapper();
    trace();
    initGame = false;
  }

  let resp = await playPrompt();

  switch (resp.location) {
    //lets you 'open' a door.
    case "preview":
      await preview(gameDetails);
      break;
    case "move":
      move() ? display() : console.log("\n");
      console.log('avg outs: ' + trace(1000,true).avg);
      console.dir(gameDetails.shortestPath)
      break;
    case "display":
      display();
      break;
    case "review":
      reviewLog(10)
        .reverse()
        .forEach((l) => console.log(l));
      break;
    case "close":
      close();
      display();
      break;
    case "trace":
      console.dir(trace(20000, true));
      break;
    case "back":
      //need to unwind a step
      back();
      display();
      break;
    case "exit":
      return "exit";
  }

  //there's a better way to do this...
  save();
  play(game, initGame);

  function display(
    color = cells[gameDetails.currentCell].color,
    room = rooms[gameDetails.currentRoom]
  ) {
    room.color = color;

    //Room Details:
    //    Description - Narative of the room.  short, descriptive and 'enough'
    //    Size/Shape  - ToTM style rough estimates
    //    Mechanics   - This is the special secret stuff about the room.
    //    Key/Item    - Probably doesn't need to be seperate from mechanics, but can be.
    //    Bad Guys    - just a quick url link to the things. TODO: roll20?!?
    //    Exit        - We need to show this when they're in the right room.  the Mechanics will explain, but this is _the warning_

    console.log(gameDetails.currentCell + ":" + gameDetails.currentRoom);

    console.log(
      chalk.keyword(color)(`
                           ${(
                             "Up " +
                             (gameDetails.currentEntry ==
                             gameDetails.currentDoors.indexOf("Up")
                               ? "(E)"
                               : "")
                           ).padEnd(8, " ")}
            - - - - - - - - - - - - - - -
            | \\                         | \\
            |   \\                       |   \\
            |     \\                     |     \\
            |       \\       ${(
              "Front " +
              (gameDetails.currentEntry ==
              gameDetails.currentDoors.indexOf("Front")
                ? "(E)"
                : "")
            ).padEnd(8, " ")}    |       \\
            |         \\                 |         \\
            |           - - - - - - - - - - - - - - -
            |           |               |           |
            |           |               |           |
            |  ${(
              "Left " +
              (gameDetails.currentEntry ==
              gameDetails.currentDoors.indexOf("Left")
                ? "(E)"
                : "")
            ).padEnd(8, " ")} |               |  ${(
        "Right " +
        (gameDetails.currentEntry == gameDetails.currentDoors.indexOf("Right")
          ? "(E)"
          : "")
      ).padEnd(8, " ")} |
            |           |               |           |
            |           |               |           |
            |           |               |           |
            - - - - - - | - - - - - - - -           |
              \\         |                 \\         |
                \\       |                   \\       |
                  \\     |      ${(
                    "Back " +
                    (gameDetails.currentEntry ==
                    gameDetails.currentDoors.indexOf("Back")
                      ? "(E)"
                      : "")
                  ).padEnd(8, " ")}       \\     |
                    \\   |                       \\   |
                      \\ |                         \\ |
                        - - - - - - - - - - - - - - -
                                     ${(
                                       "Down " +
                                       (gameDetails.currentEntry ==
                                       gameDetails.currentDoors.indexOf("Down")
                                         ? "(E)"
                                         : "")
                                     ).padEnd(8, " ")}
`)
    );

    console.log(`
    ${chalk.keyword(color)("Name:" + room.name + "  (" + color + ")")}
    Size: ${room.size.join(" x ")}
    ${gameDetails.gravity < 0 ? "Special Gravity: " + room.gravity.desc : ""}
    Description: ${room.description}
    Bad Guys: ${room.badguys}
    
          `);
  }

  function move() {
    //you can't move unless there's an open door.
    if (gameDetails.currentOpenDoor >= 0) {
      //first, save the current entry
      addLog();

      console.log("Moving thru: " + gameDetails.currentOpenDoor);
      //save current cell/room in last cells
      gameDetails.lastCurrentCell = gameDetails.currentCell;
      gameDetails.lastCurrentRoom = gameDetails.currentRoom;

      //set current cell, room, entry
      
      gameDetails.currentCell = gameDetails.currentOpenDoorCell;
      gameDetails.currentRoom = gameDetails.currentOpenDoorRoom;
      //we can't gravitron, since random would change...
      gameDetails.gravity = gameDetails.currentOpenDoorGravity;

      //use the currentCell/Room to figure out which door we just came through
      // if the room is in our currentCell door list, that's our entry
      // otherwise the room is in otherCell door list (hopefully)
      gameDetails.currentEntry =
        cells[gameDetails.currentCell].linkedCells[
          gameDetails.currentRoom
        ].doors.indexOf(String(gameDetails.lastCurrentRoom)) >= 0
          ? cells[gameDetails.currentCell].linkedCells[
              gameDetails.currentRoom
            ].doors.indexOf(String(gameDetails.lastCurrentRoom))
          : cells[
              cells[gameDetails.currentCell].linkedCells[
                gameDetails.currentRoom
              ].otherCell
            ].linkedCells[gameDetails.currentRoom].doors.indexOf(
              String(gameDetails.lastCurrentRoom)
            );

      gameDetails.currentDoors = lexicalMapper();

      //i know we're closing this immediately.  but _maybe_ we need it somehow...
      gameDetails.currentOpenDoor = gameDetails.currentEntry;

      gameDetails.rested = false;
      //naratively, doors close when you say.  programmatically, it closes as soon as possible.
      close();
      return true;
    } else {
      console.log("No open door!");
      return false;
    }
  }

  function lexicalMapper(
    gravityTuple = [gameDetails.currentEntry, gameDetails.gravity]
  ) {
    //'special' gravity is lame.. why do i do this...
    gravityTuple[1] = gravityTuple[1] >= 0 ? gravityTuple[1] : 0;

    //this whole thing is garbagea and while it works, i'm sorry.
    var identityTuple = gameDetails.lexicalMap.entryGravityTuple.map((m) => {
      return m[0] == gravityTuple[0] && m[1] == gravityTuple[1] ? 1 : 0;
    });

    var orientation;
    if (identityTuple.indexOf(1) >= 0) {
      let orientationIndex = identityTuple.indexOf(1);
      orientation = gameDetails.lexicalMap.orientations[orientationIndex];
    }
    return orientation;
  }

  function gravitron(
    room = gameDetails.currentRoom,
    entry = gameDetails.currentEntry
  ) {
    //since gravity is room specific we'll count on the description to clarify
    // weirdness comes across
    switch (rooms[room].gravity.type) {
      case "fixed":
        //it's always pinned in a direction
        return rooms[room].gravity.gravity;
      case "random":
        //every entry to this room will (potentially) be different
        return Math.floor(Math.random() * 6);
      case "same":
        //every entry to this room will (potentially) be different gravity, but it matches the previous room
        //except special, because that's well, special  visited rooms off the opportunity to bring this into the narrative
        return gameDetails.gravity >= 0 ? gameDetails.gravity : 0;
      case "special":
        //we can't set details gravity to a string, we need numeric for orientation
        return -1;
      default:
        return rooms[room].gravity.gravity;
    }
  }

  function trace(count = 20000, checkVisited = false) {
    let ticker = [];
    var shortestPath = [];
    var tmpStartRoom = gameDetails.currentRoom;
    var tmpStartCell = gameDetails.currentCell;

    for (let t = count; t > 0; t--) {
      process.stdout.write("    " + t + " Simulations left.\r");
      gameDetails.ticks = 1;
      let originalLog = [...gameDetails.gameLog];

      walk({ checkVisited: checkVisited, allowEntryExit: true });

      let currentPath = gameDetails.gameLog.slice(originalLog.length);
      if(shortestPath.length == 0 || currentPath.length < shortestPath.length ){
        shortestPath = [...currentPath];
      }

      ticker.push(gameDetails.ticks);

      //reset our init
      gameDetails.currentCell = tmpStartCell;
      gameDetails.currentRoom = tmpStartRoom;

      gameDetails.gameLog = [...originalLog];
    }
    console.log("\nDone!");
    //Min of 1 is a single step win. _ s c a r y _

    gameDetails.currentEntry = gameDetails.currentEntry || 0;
    gameDetails.gravity = gravitron();
    gameDetails.currentDoors = lexicalMapper();
    gameDetails.shortestPath = shortestPath;

    return {
    min:  `${Math.min(...ticker)}`,
    max:  `${Math.max(...ticker)}`,
    avg:  `${Math.ceil(ticker.reduce((a, b) => a + b, 0) / ticker.length)}`
    }
  }

  function walk(params = { allowEntryExit: false, checkVisited: true }) {
    //allowEntryExit lets the walk go out the in door
    //checkVisited looks at the log to see if we've been to the room before, and skips it if we have

    //if the room's an exit, we're done.
    if (
      rooms[gameDetails.currentRoom].exit &&
      gameDetails.exitCell == gameDetails.currentCell
    ) {
      return true;
    }

    let doors = shuffle([...gameDetails.currentDoors.keys()]);

    for (var door in doors) {
      var nextDoor = doors.splice(door, 1).pop();

      //don't go out the in unless we said it's ok
      if (
        gameDetails.currentDoors[nextDoor] == gameDetails.currentEntry &&
        !params.allowEntryExit
      )
        continue;

      //take a random cell.  it's either the current cell or the 'other' cell this room exists in
      var nextCell = shuffle([
        gameDetails.currentCell,
        cells[gameDetails.currentCell].linkedCells[gameDetails.currentRoom]
          .otherCell,
      ]).pop();

      var nextRoom =
        cells[nextCell].linkedCells[gameDetails.currentRoom].doors[nextDoor];

      if (!params.checkVisited || doors.length == 0) {
        //we can charge ahead randomly, or go out the last door (if we've visited everything...)
        break;
      } else {
        if (checkLog({ currentCell: nextCell, currentRoom: nextRoom })) {
          continue;
        } else {
          break;
        }
      }
    }

    //track where we've been
    addLog();

    //load our details up for next pass
    gameDetails.currentCell = nextCell;
    gameDetails.currentRoom = nextRoom;
    gameDetails.currentEntry = nextDoor;
    gameDetails.gravity = gravitron();
    gameDetails.currentDoors = lexicalMapper([nextDoor, gameDetails.gravity]);

    //ticks track a path length.
    gameDetails.ticks++;

    //TODO: this isn't TCO right? and i _think_ it's the nested closure/promise resolution for our async play
    return walk(params);
  }

  function playPrompt() {
    return prompts([
      {
        type: "select",
        name: "location",
        message: "Which thing?",
        choices: [
          {
            title: "Preview",
            description: "Display doors, allow selection, display what's on the other side.",
            value: "preview",
          },
          {
            title: "Move",
            description: "Moves through current open door (from preview)",
            value: "move",
          },
          {
            title: "Display",
            description: "(Re)print the details for the current room.",
            value: "display",
          },
          {
            title: "Rest",
            description: "Use if the party rests, might trigger an event",
            value: "rest"
          },
          {
            title: "Close",
            description: "Closes the currently open door.",
            value: "close",
          },
          {
            title: "Review",
            description: "Displays last 10 rooms.  (needs work)",
            value: "review",
          },
          {
            title: "Trace",
            description: "Run 20000 context-aware paths from the current location.  (mostly just fun)",
            value: "trace",
          },
          {
            title: "Back",
            description: "Progromatic 'back', use only for 'mistakes'",
            value: "back",
          },
          {
            title: "Exit",
            description: "See the tin",
            value: "exit",
          },
        ],
      },
    ]);
  }

  async function preview() {
    //we assign only 1 cell here.  it's not _actually_ less randomness, since we regenerate this everytime preview is called,
    //but it does mean all the doors will lead to the same cell once preview is loaded
    let nextCell = shuffle([
      gameDetails.currentCell,
      cells[gameDetails.currentCell].linkedCells[gameDetails.currentRoom]
        .otherCell,
    ]).pop();

    var respChoices = gameDetails.currentDoors.map((d, i) => {
      let door = {
        title: d,
        value: i,
      };

      if (i == gameDetails.currentEntry) door.title += " (Entry)";
      if (i == gameDetails.gravity) door.title += " (Gravity)";

      // it might be fun to have the ability to have an item/ability/narrative device that lets
      // people know if they've been through a door/'finished' a room, etc.
      if (
        checkLog({
          currentCell: nextCell,
          currentRoom:
            cells[nextCell].linkedCells[gameDetails.currentRoom].doors[i],
        })
      ) {
        door.title = "(V)   " + door.title;
      } else {
        door.title = "      " + door.title;
      }

      //shortest path is a rough guess at the 'fastest path out'
      // only works if we picked the right cell above

      let nextRoom = cells[nextCell].linkedCells[gameDetails.currentRoom].doors[i];

    //this gives us the positional index of the 'other side' of the door.
    // Ie: where is the door we came through in the other room.
    let openDoorEntryId =
      cells[nextCell].linkedCells[
        nextRoom
      ].doors.indexOf(String(gameDetails.currentRoom)) >= 0
        ? cells[nextCell].linkedCells[
            nextRoom
          ].doors.indexOf(String(gameDetails.currentRoom))
        : cells[
            cells[nextCell].linkedCells[
              nextRoom
            ].otherCell
          ].linkedCells[gameDetails.currentRoom].doors.indexOf(
            String(gameDetails.currentRoom)
          )


      if(gameDetails.shortestPath[gameDetails.shortestPath.length] && gameDetails.shortestPath[gameDetails.shortestPath.length].currentCell == nextCell && gameDetails.shortestPath[gameDetails.shortestPath.length].currentEntry == openDoorEntryId ){
        door.title += " -> Shortest Path";
      }

      door.title = chalk.keyword(cells[nextCell].color)(door.title);
      return door;
    });

    let resp = await prompts([
      {
        type: "select",
        name: "door",
        message: "Which door?",
        choices: [...respChoices, { title: "Exit", value: -1 }],
      },
    ]);

    if (resp.door >= 0) {
      //if a door is already open, close it.
      if (gameDetails.currentOpenDoor >= 0) close();
      
      // keep track of the number of times any door is opened for... reasons?.
      gameDetails.doorCounter++;

      let nextRoom =
        cells[nextCell].linkedCells[gameDetails.currentRoom].doors[resp.door];

      gameDetails.currentOpenDoor = resp.door;
      gameDetails.currentOpenDoorRoom = nextRoom;
      gameDetails.currentOpenDoorCell = nextCell;

      //this gives us the positional index of the 'other side' of the door.
      // Ie: where is the door we came through in the other room.
      var openDoorEntryId =
        cells[gameDetails.currentOpenDoorCell].linkedCells[
          gameDetails.currentOpenDoorRoom
        ].doors.indexOf(String(gameDetails.currentRoom)) >= 0
          ? cells[gameDetails.currentOpenDoorCell].linkedCells[
              gameDetails.currentOpenDoorRoom
            ].doors.indexOf(String(gameDetails.currentRoom))
          : cells[
              cells[gameDetails.currentOpenDoorCell].linkedCells[
                gameDetails.currentOpenDoorRoom
              ].otherCell
            ].linkedCells[gameDetails.currentRoom].doors.indexOf(
              String(gameDetails.currentRoom)
            );

      //room and entryid gives us gravity
      gameDetails.currentOpenDoorGravity = gravitron(nextRoom, openDoorEntryId);

      //entry door index + gravity gives us the lexical map of door positions.
      let openDoorEntryDoors = lexicalMapper([
        openDoorEntryId,
        gameDetails.currentOpenDoorGravity,
      ]);
      console.dir(openDoorEntryDoors);
      console.log(
        chalk.keyword(cells[gameDetails.currentCell].color)(`
                           ${(gameDetails.currentOpenDoor ==
                           gameDetails.currentDoors.indexOf("Up")
                             ? "(O)"
                             : " "
                           ).padEnd(8, " ")}
            - - - - - - - - - - - - - - -
            | \\                         | \\
            |   \\                       |   \\
            |     \\                     |     \\
            |       \\       ${(gameDetails.currentOpenDoor ==
            gameDetails.currentDoors.indexOf("Front")
              ? "(O)"
              : ""
            ).padEnd(8, " ")}    |       \\
            |         \\                 |         \\
            |           - - - - - - - - - - - - - - -
            |           |               |           |
            |           |               |           |
            |  ${(gameDetails.currentOpenDoor ==
            gameDetails.currentDoors.indexOf("Left")
              ? "(O)"
              : ""
            ).padEnd(
              8,
              " "
            )} |               |  ${(gameDetails.currentOpenDoor ==
        gameDetails.currentDoors.indexOf("Right")
          ? "(O)"
          : ""
        ).padEnd(8, " ")} |
            |           |               |           |
            |           |               |           |
            |           |               |           |
            - - - - - - | - - - - - - - -           |
              \\         |                 \\         |
                \\       |                   \\       |
                  \\     |      ${(gameDetails.currentOpenDoor ==
                  gameDetails.currentDoors.indexOf("Back")
                    ? "(O)"
                    : ""
                  ).padEnd(8, " ")}       \\     |
                    \\   |                       \\   |
                      \\ |                         \\ |
                        - - - - - - - - - - - - - - -
                                     ${(gameDetails.currentOpenDoor ==
                                     gameDetails.currentDoors.indexOf("Down")
                                       ? "(O)"
                                       : ""
                                     ).padEnd(8, " ")}`)
      );

      console.log(
        chalk.keyword(cells[nextCell].color)(`
                         ${(
                           (gameDetails.currentOpenDoorGravity == 5
                             ? "(G)"
                             : " ") + (openDoorEntryId == 5 ? "(E)" : " ")
                         ).padEnd(8, " ")}
            - - - - - - - - - - - - - - -
            | \\                         | \\
            |   \\                       |   \\
            |     \\                     |     \\
            |       \\       ${(
              (gameDetails.currentOpenDoorGravity == 3 ? "(G)" : " ") +
              (openDoorEntryId == 3 ? "(E)" : "")
            ).padEnd(8, " ")}    |       \\
            |         \\                 |         \\
            |           - - - - - - - - - - - - - - -
            |           |               |           |
            |           |               |           |
            |  ${(
              (gameDetails.currentOpenDoorGravity == 1 ? "(G)" : " ") +
              (openDoorEntryId == 1 ? "(E)" : "")
            ).padEnd(8, " ")} |               |  ${(
          (gameDetails.currentOpenDoorGravity == 4 ? "(G)" : " ") +
          (openDoorEntryId == 4 ? "(E)" : "")
        ).padEnd(8, " ")} |
            |           |               |           |
            |           |               |           |
            |           |               |           |
            - - - - - - | - - - - - - - -           |
              \\         |                 \\         |
                \\       |                   \\       |
                  \\     |      ${(
                    (gameDetails.currentOpenDoorGravity == 0 ? "(G)" : " ") +
                    (openDoorEntryId == 0 ? "(E)" : "")
                  ).padEnd(8, " ")}       \\     |
                    \\   |                       \\   |
                      \\ |                         \\ |
                        - - - - - - - - - - - - - - -
                              ${(
                                (gameDetails.currentOpenDoorGravity == 2
                                  ? "(G)"
                                  : " ") + (openDoorEntryId == 2 ? "(E)" : "")
                              ).padEnd(8, " ")}`)
      );

      console.log(
        "Open Cell:Room " +
          gameDetails.currentOpenDoorCell +
          ":" +
          gameDetails.currentOpenDoorRoom
      );
      console.log(
        "Open Door Gravity: " +
          (openDoorEntryDoors[gameDetails.currentOpenDoorGravity]
            ? openDoorEntryDoors[gameDetails.currentOpenDoorGravity]
            : "\n     " + rooms[gameDetails.currentOpenDoorRoom].gravity.desc) +
          " (" +
          gameDetails.currentOpenDoorGravity +
          ")"
      );
      console.log("Open Door Details:");
      console.log(rooms[nextRoom].description);
    }
    return resp.door;
  }

  function close() {
    //i resisted 'closed'.
    gameDetails.currentOpenDoor = -1;
    gameDetails.currentOpenDoorRoom = -1;
    gameDetails.currentOpenDoorCell = -1;
    gameDetails.currentOpenDoorGravity = -1;
  }

  function save() {
    //game details will always be changing.
    //there's probably a better way...
    game.set("gameDetails", gameDetails);
  }

  function back(count = 1) {
    //this is _unwinding_ what we did.
    //if count is > gameLog, it's a reset.

    //close whatever door was open, if any
    close();

    //cut the requested number of elements, pull out the lastmost one
    let newCurrent = gameDetails.gameLog
      .splice(
        0,
        count > gameDetails.gameLog.length ? gameDetails.gameLog.length : count
      )
      .pop();
    //direct remap log properties onto game details.
    //this is convenient, but a _little_ dangerous :D
    for (let k in newCurrent) {
      gameDetails[k] = newCurrent[k];
    }

    //this _assumes_ our log has current room and entry defined
    //which it _has_ to i guess... not totally happy.
    gameDetails.currentDoors = lexicalMapper();
  }

  function addLog(log = {}) {
    //this isn't the _best_ way probably, but we'll always need these
    log.currentCell = gameDetails.currentCell;
    log.currentRoom = gameDetails.currentRoom;
    log.currentEntry = gameDetails.currentEntry;
    log.gravity = gameDetails.gravity;

    //this isn't _perfect_ but should be good enough for backing out
    log.doorCounter = gameDetails.doorCounter;

    //things aboout the log
    // stores cell/room combos.  this is enough to 'replay' the whole deal.
    // session?
    // day/long rest?
    // notes? - probably just for tracking the 'state' between sessions, maybe _major_ events

    if (
      gameDetails.gameLog.length > 0 &&
      log.currentRoom == gameDetails.gameLog[0].currentRoom &&
      log.currentCell == gameDetails.gameLog[0].currentCell
    ) {
      //don't double up, but maybe allow 'upsert'.  we'd need to filter out stuff..
    } else {
      gameDetails.gameLog.unshift(log);
    }
  }

  function checkLog(log = {}) {
    //how do logs work? do we need to class/object them?
    return gameDetails.gameLog.filter((f) => {
      return (
        f.currentCell == log.currentCell && f.currentRoom == log.currentRoom
      );
    }).length > 0
      ? true
      : false;
  }

  function reviewLog(count = 1) {
    //kick back the last count logs, pop to consume
    return gameDetails.gameLog.slice(0, count);
  }
} //end play

function shuffle(a) {
  var j, x, i;
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
  return a;
}
