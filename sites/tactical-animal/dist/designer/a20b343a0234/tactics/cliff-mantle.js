import {createRoofMantle} from './roof-mantle.js';
import {createHenRoofMantle} from './hen-roof-mantle.js';
import {createCliffTiles} from './cliff-tiles.js';
import {CLIFF_HEIGHT} from './cliff-models.js';

// Both surfaces have the same two-unit lip at x=0,
// so the approved motion can be compared without changing its contacts or rig.
// cliff-journey.js connects this motion to committed gameplay traversal.
export const CLIFF_MANTLE_TILES=Object.freeze(Array.from({length:12},(_,i)=>
 Object.freeze({x:Math.floor(i/4),z:i%4-2,mask:15,variant:0})));
export function createCliffMantleSurface(){
 if(CLIFF_HEIGHT!==2)throw Error('Mantle study requires a two-unit cliff');
 return createCliffTiles('ledge',CLIFF_MANTLE_TILES);
}
export function createCliffMantle(worker,profile){
 return profile.unarmed?createHenRoofMantle(worker,profile):createRoofMantle(worker,profile);
}
