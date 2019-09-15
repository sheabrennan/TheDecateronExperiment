const Store = require('data-store');
const init = new Store('default',{base: './.config'}); //used to build a new one

const prompts = require('prompts');
prompts.override(require('yargs').argv);

if()
checkStore();


async function checkStore(){

}


function generate(init,rooms){
    
}