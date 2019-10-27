const Store = require('data-store');
const init = new Store('default',{base: './.config'}); //used to build a new one
const initRooms = new Store('rooms',{base: './.config'});

const argv = require('yargs').argv;
const prompts = require('prompts');
prompts.override(require('yargs').argv);

let config;

if(argv.exp){
    config = new Store(exp, {base: './.config/games'});
    //maybe a validation?
}

//our only key to start is currentLocation.  
//if you don't have a currentLocation, you aren't valid
if(config && config.get('name')){  
    play(config);
}else{
    generate(init,initRooms.get('roomList'))
}

async function generate(init,rooms){
    let game = await prompts([{
        type: 'text',
        name: 'game',
        message: "What's your game called?"
    }]);

    let build = new Store(game.game,{base: './.config'});

    if(build.has('name')){
       console.log('This game already exists. Try again.');
       game = null;
       generate(init, rooms);

       //this isn't right
       return;
    }

    //we reinitialize with the defaults now that we know it doesn't exist
    build = new Store(game.game,{base: './.config/games'},init.get('initer'));
    build.set('name',game.game);

    const roomDefault = [...Array(init.get('roomCount')).keys()]
    const roomList = [...Array(init.get('cellRoomCount'))].map(r => { return shuffle([...roomDefault])})

    //we don't _really_ need this i guess, but it lets us have a 'name' array for cells if we want easily
    const cellList = [...Array(init.get('cellCount')).keys()];

    const colors = shuffle(init.get('colorList'));
    cellList.forEach((cell) => {
        let newCell = Object.assign({},init.get('cellTemplate'));
        newCell.id=cell;
        newCell.color=colors.shift();
        newCell.roomList = {};
        newCell.map=init.get('cellMap');
        newCell.map.forEach((roomLoc,roomLocIndex,cm) => {
            //since we have 2 'copies' of each room, alternating lists lets us easily ensure
            //we don't get duplicates
            let nextRoom = roomList[cell%2].pop();
            // let x = 0;
            // while(Object.values(newCell.roomList).indexOf(nextRoom)!=-1 && x<10){
            //     console.log('room exists! try again.')
            //     roomList[cell%2].unshift(nextRoom);
            //     nextRoom = roomList[cell%2].pop();
            //     x++;
            // }

            let room = Object.assign({},init.get('roomTemplate'));
            Object.assign(room,rooms.pop());

            room.id = nextRoom;
            roomLoc.roomid = nextRoom;
            
            room.position = roomLoc.position;
            room.cell = cell;

            //we can't fill this until the cell is finished
            //but with these values we can map it eventually (i think)
            room.doorList = roomLoc.doors;
            newCell.roomList[roomLoc.position] = room.id;

            //this is an 'incomplete' room list.  we'll have 2 copies of each room, one for each cell
            // need to loop after by cell get all rooms, then get all same room id's (for the other cells)
            build.union('tmprooms',room);

        })

        build.union('cells',newCell)
        //map out doors for all rooms in the cell

    })

    //by cell, get all 8 rooms
    let filledRooms = [];
    let tmprooms = build.get('tmprooms');

    build.get('cells').forEach(c => {
        Object.keys(c.roomList).forEach(position => {
                               tmprooms.find(r => r.cell == c.id && r.id == c.roomList[position])
        });
    });

    // console.log("CELLS!!!!");
    // console.log(build.get('cells'));
    // console.log("ROOOMS!!!!!");
    // console.log(build.get('tmprooms'));
    let test = build.get('cells');
    let roomValidation = {}
    for (var a in test){
        let incell = test[a].roomList;
        for( var b in incell){
            roomValidation[incell[b]] = roomValidation[incell[b]]+1 || 1;
        }
    }
    console.log("dupes: "+ Object.keys(roomValidation).filter(x => {return roomValidation[x] != 2}))
}


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

/** 
 * 
//if no config loaded, enter build loop,

//build loop
    shuffle color list in place (not a big deal, just flavor)
    create shuffled roomCount length array

    shift from first cell list
    setup cell from template
        id: cellList index
        shift and set color
        copy cellMap
        while cellMap length, 
            shift cellMap array
            shift room array
                if element exists and cell exists in cell list OR cellList length = cellRoomCount, shift again
            grab room from roomList @ room array element
            setup roomTemplate
                copy params from room array element
                id: some index (0-39)
                position: cellMap key
                cell: push cell id
                set doors to cellMap value //do we need to build this map?
            add "cellMap key: roomId" to cell roomList
        next cell!

**/