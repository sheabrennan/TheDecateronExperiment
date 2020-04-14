"use strict";

var Store = require("data-store");
var init = new Store("default", { base: "./.config" }); //used to build a new one
var initRooms = new Store("rooms", { base: "./.config" });
var prompts = require("prompts");

prompts.override(require("yargs").argv);

prompts([
  {
    type: "text",
    name: "game",
    message: "What's your game called?"
  }
])
  .then(gameName => {
    let game = new Store(gameName.game, { base: "./.config/games" });
    if (!game.get("name")) {
      return generate(gameName.game, init, initRooms.get("roomList"));
    } else {
      return game;
    }
  })
  .then(game => {
    play(game, true);
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
  let colors = shuffle(init.get("colorList"));

  //keys will be room Ids used in cells
  // values will be instances of 'room' objects
  let roomList = {};

  //build a list of cell templates
  cellList.forEach(cell => {
    let newCell = { ...init.get("cellTemplate") };
    newCell.linkedCells = {};
    newCell.color = colors.shift();
    newCell.roomMap = JSON.parse(JSON.stringify(init.get("cellMap")));

    cells[cell] = newCell;
  });

  //For each cell in the template
  //  drop the cell from the cell list (we only go through once)
  //  create a temp array of remaining cellList, this'll source our 2nd referenced cell
  //  for our current cell, loop through *every* entry in 'roomMap'
  Object.keys(cells).forEach(c => {
    //we're filling this cell, no circular maps
    cellList.shift();
    let cellsToFill = [...cellList];

    //keys are strings here, need int initially, the rest works.
    let intc = parseInt(c);

    cells[c].roomMap.forEach(rm => {
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
      //TODO: is there a way to eliminate single step victories... probably not here..
      if (roomList[roomId].start && !build.get("gameDetails.cell")) {
        let gameDetails = build.get("gameDetails");

        gameDetails.currentCell = intc;
        gameDetails.currentRoom = roomId;

        gameDetails.startCell = intc;
        gameDetails.startRoom = roomId;
      }

      if (roomList[roomId].exit && !build.get("gameDetails.cell")) {
        let gameDetails = build.get("gameDetails");
        gameDetails.endCell = intc;
        gameDetails.endRoom = roomId;
      }
    });
    //just cruft now
    delete cells[c].roomMap;
  });

  //now that cells are all filled, populate doors list with _roomID_
  //  position in array defines which door is which, room maps to current cell
  Object.keys(cells).forEach(c => {
    let cell = cells[c];
    Object.keys(cell.linkedCells).forEach(lc => {
      let linkCell = cell.linkedCells[lc];
      linkCell.doors.forEach((d, i) => {
        linkCell.doors[i] = Object.keys(cell.linkedCells).filter(f => {
          return cell.linkedCells[f].position == d;
        })[0];
      });
    });
  });

  build.set("rooms", roomList);
  return build;
}

async function play(game, initGame = false) {
  //get current cell and room
  //display room show doors, highlight entry door.  room details
  //list of zork-style actions

  let cells = game.get("cells");
  let rooms = game.get("rooms");
  let gameDetails = game.get("gameDetails");

  if (initGame) {
    //init pick a random entry and gravity if it doesn't work
    gameDetails.currentEntry = gameDetails.currentEntry || 0;
    gameDetails.gravity = gravitron();
    gameDetails.currentDoors = lexicalMapper();

    //addLog();
    console.log("Welcome to: " + game.name);
    display();
    initGame = false;
  }

  let resp = await playPrompt();

  switch (resp.location) {
    case "preview":
      await preview(gameDetails);
      break;
    case "move":
      move();
      display();
      break;
    case "display":
      display();
      break;
    case "undo":
      back();
    case "review":
      reviewLog(10)
        .reverse()
        .forEach(l => console.log(l));
      break;
    case "close":
      close();
      display();
      break;
    case "trace":
      //TODO: add some fun here
      //  simulate from current location?
      //  incorporate weighted logic by rooms already seen
      //  'allow' random reteat (ie: out the entry door)
      let ticker = [];
      for (let t = 50000; t > 0; t--) {
        process.stdout.write("    " + t + " Simulations left.\r");
        gameDetails.ticks = 1;
        trace();
        ticker.push(gameDetails.ticks);
        //reset our init
        gameDetails.currentCell = gameDetails.startCell;
        gameDetails.currentRoom = gameDetails.startRoom;
      }
      console.log("\nDone!");
      //Min of 1 is a single step win. _ s c a r y _
      //these don't mean anything really, just fun.
      console.log("Min: " + Math.min(...ticker));
      console.log("Max: " + Math.max(...ticker));
      console.log(
        "Avg: " + Math.ceil(ticker.reduce((a, b) => a + b, 0) / ticker.length)
      );

      initGame = true;
      break;
    case "back":
      //need to unwind a step
      back();
      break;
    case "exit":
      return "exit";
  }
  //there's a better way to do this...
  save();
  play(game, initGame);

  //TODO: better destructing here...
  function display(
    color = cells[gameDetails.currentCell].color,
    room = rooms[gameDetails.currentRoom]
  ) {
    //TODO figure out display enrichment

    // this is just flavor for the people
    // some games may tie it to a thing (ie: keys, items, elements)
    room.color = color;

    //what do we need to see:
    // Current Cell - Doesn't tell us anything, maybe troubleshootig
    // Current Room - Ditto
    // Entry Door - this is orientation key #1.  should be lexical ref from currentDoors not an id
    // Gravity - this is orientation key #1, should be lexital ref OR description
    // Open Door - this only matters because preview resets it.

    //Room Details:
    //    Description - Narative of the room.  short, descriptive and 'enough'
    //    Size/Shape  - ToTM style rough estimates
    //    Mechanics   - This is the special secret stuff about the room.
    //    Key/Item    - Probably doesn't need to be seperate from mechanics, but can be.
    //    Bad Guys    - just a quick url link to the things. TODO: roll20?!?
    //    Exit        - We need to show this when they're in the right room.  the Mechanics will explain, but this is _the warning_
    console.log(`                  
            \\ - - - - - - - - - - - - - \\
            | \\                     up  | \\
            |   \\                       |   \\
            |     \\                     |     \\
            |       \\     front         |       \\
            |         \\                 |         \\
            |           - - - - - - - - - - - - - - -
            |           |               |           |
            |           |               |           |
            |   left    |               |   right   |
            |           |               |           |
            |           |               |           |
            |           |               |           |
            \\- - - - - -| - - - - - - - \\           |
              \\         |                 \\         |
                \\       |                   \\       |
                  \\     |        back         \\     |
                    \\   |                       \\   |
                      \\ |  down                   \\ |
                        - - - - - - - - - - - - - - -
`)
    console.log("Current Cell: " + gameDetails.currentCell);
    console.log("Current Room: " + gameDetails.currentRoom);
    console.log("Entry Door: " + gameDetails.currentDoors[gameDetails.currentEntry] + " ("+gameDetails.currentEntry+")");
    console.log("CurrentDoors: "+ gameDetails.currentDoors);
    console.log("Gravity: " + (gameDetails.currentDoors[gameDetails.gravity]?gameDetails.currentDoors[gameDetails.gravity]:"\n     "+rooms[gameDetails.currentRoom].gravity.desc)+" ("+gameDetails.gravity+")");
    console.log("Open Door: " + gameDetails.currentDoors[gameDetails.currentOpenDoor]);
    console.log("Details:");
    console.log(room);
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
      // otherwise the room is in otherCell dool list (hopefully)
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

      

      //naratively, doors close when you say.  programmatically, it closes as soon as possible.
      close();
    } else {
      console.log("No open door!");
    }
  }

  function lexicalMapper(
    gravityTuple = [gameDetails.currentEntry, gameDetails.gravity]
  ) {
    //'special' gravity is lame.. why do i do this...
    gravityTuple[1] = gravityTuple[1]>=0?gravityTuple[1]:0;

    //this whole thing is garbagea and while it works, i'm sorry.
    var identityTuple = gameDetails.lexicalMap.entryGravityTuple.map(m => {
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
        //every entry to this room will (potentially) be different
        //have to dump special gravity, just default to zero cause
        return gameDetails.gravity>=0?gameDetails.gravity:0;
      case "special":
        //we can't set details gravity to a string, we need numeric for orientation
        return -1;
      default:
        return rooms[room].gravity.gravity;
    }
  }

  function trace() {
    //this is a 'random' walk out.

    // TODO: consider an optimized version that tracks visited rooms
    //        it isn't unreasonable to allow players to keep track of
    //        of rooms visited.  _maybe_ require some kind of DC

    //game current location cell/room
    //   get door list
    //   remove entry from list
    //   randomly pick door and cell for it
    //   get room
    //   is it exit room/cell?
    //      y - done.
    //      n - set current cell/room
    //          recall

    let doors = shuffle([...gameDetails.currentDoors.keys()]);
    let nextDoor = doors.pop();
    //check if we randomly found our entry door, take the next option
    if (gameDetails.currentDoors[nextDoor] == gameDetails.currentEntry)
      nextDoor = doors.pop();

    //take a random cell.  it's either the current cell or the 'other' cell this room exists in
    let nextCell = shuffle([
      gameDetails.currentCell,
      cells[gameDetails.currentCell].linkedCells[gameDetails.currentRoom]
        .otherCell
    ]).pop();

    //despite being in cell:room, *doors* can still be 'through' the other cell's instance.
    // because 'nextDoor' is positional to the array, we get the right room regardles off
    // which cell is chosen
    let nextRoom =
      cells[nextCell].linkedCells[gameDetails.currentRoom].doors[nextDoor];

    //load our details up for next pass
    gameDetails.currentCell = nextCell;
    gameDetails.currentRoom = nextRoom;
    gameDetails.currentEntry = nextDoor;
    gameDetails.gravity = gravitron();

    //play() _does_ update this, but we're recusing here, so have to do it ourselves
    gameDetails.currentDoors = lexicalMapper([nextDoor, gameDetails.gravity]);

    // console.log(
    //   "Cell:Room: " +
    //     nextCell +
    //     ":" +
    //     nextRoom +
    //     " door!: " +
    //     nextDoor +
    //     " g: " +
    //     gameDetails.gravity +
    //     " t: " +
    //     gameDetails.ticks
    // );

    //if the room's an exit, we're done.
    if (
      rooms[gameDetails.currentRoom].exit &&
      gameDetails.endCell == gameDetails.currentCell
    ) {
      //console.log("WE DID IT!!!!");
      return true;
    }
    //ticks track a path length.
    gameDetails.ticks++;

    //TODO: this isn't TCO and i _think_ it's the nested closure/promise resolution for our async play
    //but i don't actually understand JS (especially this async stuff)
    return trace();
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
            value: "preview"
          },
          {
            title: "Move",
            value: "move"
          },
          {
            title: "Close",
            value: "close"
          },
          {
            title: "Display",
            value: "display"
          },
          {
            title: "Review",
            value: "review"
          },
          {
            title: "Trace",
            value: "trace"
          },
          {
            title: "Back",
            value: "back"
          },
          {
            title: "Exit",
            value: "exit"
          }
        ]
      }
    ]);
  }

  async function preview() {
    //prompt doors list
    //randomize cell for room selected
    //set current open door room/cellto prompetd
    //  show room in correct orientation
    //display

    //if there's already a door open, close it.
    //this might feel weird but it's easier.  use close yourself naratively
    if (gameDetails.currentOpenDoor >= 0) close();

    // a random cell, either current or 'other'
    let nextCell = shuffle([
      gameDetails.currentCell,
      cells[gameDetails.currentCell].linkedCells[gameDetails.currentRoom]
        .otherCell
    ]).pop();

    var respChoices = gameDetails.currentDoors.map((d, i) => {
      let door = {
        title: d,
        value: i
      };

      if (i == gameDetails.currentEntry) door.title += " (Entry)";
      if (i == gameDetails.gravity) door.title += " (Gravity)";
      if (i == gameDetails.currentOpenDoor) door.title += " (Open)";

      return door;
    });

    let resp = await prompts([
      {
        type: "select",
        name: "door",
        message: "Which door?",
        choices: [...respChoices, { title: "Exit", value: -1 }]
      }
    ]);

    if (resp.door >= 0) {
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
        gameDetails.currentOpenDoorGravity
      ]);

      console.log("Open Cell: " + gameDetails.currentOpenDoorCell);
      console.log("Open Room: " + gameDetails.currentOpenDoorRoom);
      //this _should_ be the lexical name of the 'otherside' of the open door.
      console.log("Open Door Entry: " + openDoorEntryDoors[openDoorEntryId] + " (" + openDoorEntryId +")");
      console.log("Openn Current Doors: "+ openDoorEntryDoors);
      console.log("Open Door Gravity: " + (openDoorEntryDoors[gameDetails.currentOpenDoorGravity]?openDoorEntryDoors[gameDetails.currentOpenDoorGravity]:"\n     "+rooms[gameDetails.currentOpenDoorRoom].gravity.desc)+" ("+gameDetails.currentOpenDoorGravity+")");
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
  }

  function save() {
    //game details will always be changing.
    //there's probably a better way...
    game.set("gameDetails", gameDetails);
  }

  function back(count = 1) {
    //this is _unwinding_ what we did.
    //if count is > gameLog, it's a reset.
    //if there's only one element, it

    //close whatever door was open, if any
    close();
    console.log("B: " + gameDetails.gameLog);
    let newCurrent = gameDetails.gameLog
      .splice(
        0,
        count > gameDetails.gameLog.length ? gameDetails.gameLog.length : count
      )
      .pop();
    console.log("A: " + gameDetails.gameLog);
    for (let k in newCurrent) {
      gameDetails[k] = newCurrent[k];
    }

    //this _assumes_ our log has current room and entry defined
    //which it _has_ to i guess... not totally happy.
    gameDetails.currentDoors = lexicalMapper();
  }

  function addLog(
    log = {
      currentCell: gameDetails.currentCell,
      currentRoom: gameDetails.currentRoom,
      currentEntry: gameDetails.currentEntry,
      currentGravity: gameDetails.gravity
    }
  ) {
    //things aboout the log
    // stores cell/room combos.  this is enough to 'replay' the whole deal.
    // session?
    // day/long rest?
    // notes? - probably just for tracking the 'state' between sessions, maybe _major_ events

    //should we guard against pushing the same entry?
    gameDetails.gameLog.unshift(log);
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
