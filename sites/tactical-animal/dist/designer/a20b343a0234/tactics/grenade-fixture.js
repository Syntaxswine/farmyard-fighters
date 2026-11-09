import {blankMap} from './core/maps.js';
export function grenadeFixture(){
 const m=blankMap('Grenade range · lob, rebound and rooftop throws');
 m.starts=['horse','goat','pig-director','hen'].map((species,i)=>({x:20+i*2,y:24,z:0,species,weapon:'grenade',stats:{strength:50,agility:50,dexterity:65,explosives:75}}));
 m.exits=[{x:18,y:26,z:0}];
 for(let y=12;y<=32;y++)for(let x=15;x<=40;x++)m.terrain[y][x]='ground-grass';
 for(let y=18;y<=22;y++)for(let x=27;x<=31;x++){m.terrain[y][x]='floor';m.upper[0][`${x},${y}`]='floor';}
 for(let y=18;y<=22;y++){m.edges[`e:26:${y}`]='wall-concrete';m.edges[`e:31:${y}`]='wall-concrete';}
 for(let x=27;x<=31;x++){m.edges[`s:${x}:17`]='wall-concrete';m.edges[`s:${x}:22`]=x===29?'door':'wall-concrete';}
 m.stairs=[{x:29,y:21,z:0,kind:'ladder'}];
 for(let y=24;y<=28;y++)m.edges[`e:31:${y}`]='wall-concrete';
 m.props=[{kind:'crate-wood',x:27,y:27,z:0},{kind:'crate-wood',x:35,y:25,z:0}];
 return m;
}
