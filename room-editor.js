/*  "_template": {
    "name": "only necessary for 'managing' them, we'll put it in the 'logs' so unique names will help DMs",
    "size": [
      100,
      100,
      100,
      "not actually used for anything, could be textual description or array of dimessions, both, whatever"
    ],
    "description":{
      "default": "Narrative description for the room. ",
      "rest": "optional  if party rests in this room, what happens during/after the rest.",
      "disabled": "if party posseses the key for this room"
    }, 
    "mechanics": "Explinations for the DM, room and/or battle descriptions, ",
    "gravity": {
      "type": "enum{fixed/random/same/special} required",
      "gravity": "integer[0-5] required for fixed type, ignored for others",
      "desc": "details for anything weird, but largely just for 'special' gravity"
    },
    "badguys": [{
      "link": "link(s) to the enemy deets",
      "count": "1-??",
      "notes": "conditions for appearing, strategies, equipment/modifications, etc "
    }],
    "nokey": "true/false defaults to false.  used to keep keys out of these rooms. ie: start, end, or some special condition",
    "start": "true/false should only be one, but i _think_ it'll pick the first one",
    "exit": "true/false should oly be one, but i think it'll pick the first one",
    "orientationDC": "optional DC target to not get 'disoriented' after entering a room.",
  }*/

var Store = require("data-store");
var init = new Store("default", { base: "./.config" }); //used to build a new one
var initRooms = new Store("rooms", { base: "./.config" });
var prompts = require("prompts");
const chalk = require("chalk");

prompts.override(require("yargs").argv);

//if rooms file is provided, use it
//otherwise copy default-rooms


//we need 40 rooms exactly
//go through each room in file, display all the *template* parameters and show current

