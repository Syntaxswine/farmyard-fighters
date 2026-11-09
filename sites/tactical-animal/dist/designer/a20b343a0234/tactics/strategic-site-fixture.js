import {blankMap} from './core/maps.js';

// Explicit review map; never changes Quick Fight or an existing campaign save.
export function strategicSiteFixture(){
 const m=blankMap('Strategic structures · fire, explosives and sabotage');
 m.props=[{kind:'site-radio',x:24,y:24,z:0,sabotage:true},{kind:'site-radar',x:38,y:24,z:0,sabotage:true},{kind:'site-sam',x:31,y:38,z:0,sabotage:true}];
 m.starts=[{x:30,y:24,z:0,species:'horse',weapon:'flamethrower'},{x:18,y:29,z:0,species:'donkey',weapon:'rpg'},{x:35,y:30,z:0,species:'goat',weapon:'launcher'},{x:29,y:43,z:0,species:'sheep',weapon:'grenade'}];
 m.exits=[{x:20,y:20,z:0}];
 for(let y=17;y<48;y++)for(let x=16;x<49;x++)m.terrain[y][x]='ground-grass';
 return m;
}
