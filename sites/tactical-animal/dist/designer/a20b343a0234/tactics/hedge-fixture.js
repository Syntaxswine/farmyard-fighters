import {blankMap} from './core/maps.js';
import {HEDGE_VERSION,HEDGE_SEED} from './hedge-data.js';

export function hedgeFixtureMap(){
 const map=blankMap('Hedges · joined rows, gate and raised garden');
 map.starts=[{x:15,y:16,z:0,species:'horse',weapon:'rifle',heading:270},{x:16,y:17,z:0,species:'goat',weapon:'rifle',heading:270},{x:17,y:17,z:0,species:'donkey',weapon:'rifle',heading:270},{x:18,y:17,z:0,species:'sheep',weapon:'rifle',heading:270}];
 map.exits=[{x:15,y:19,z:0}];
 const add=(x,y,kind,z=0)=>map.props.push({x,y,z,kind:'hedge-'+kind,hedgeVersion:HEDGE_VERSION,hedgeSeed:HEDGE_SEED});
 for(let y=5;y<23;y++)for(let x=5;x<33;x++)map.terrain[y][x]='ground-grass';
 for(let x=7;x<=24;x++)if(x!==15){add(x,11,'tall');add(x,20,'short');}
 for(let y=12;y<=19;y++){add(7,y,'tall');add(24,y,'short');}
 for(let x=10;x<=20;x++)add(x,7,x<15?'short':'tall');
 for(let y=9;y<=15;y++)for(let x=28;x<=31;x++)map.upper[0][`${x},${y}`]='ground-wood-planks';
 for(let y=9;y<=15;y++)add(31,y,'tall',1);
 map.stairs=[{x:28,y:15,z:0,kind:'ladder'}];
 map.guards=[{x:15,y:9,z:0,species:'pig-foreman',weapon:'rifle',heading:90},{x:20,y:9,z:0,species:'pig-foreman',weapon:'rifle',heading:90}];
 return map;
}
