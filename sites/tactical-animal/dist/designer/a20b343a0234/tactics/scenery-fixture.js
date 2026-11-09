import {blankMap} from './core/maps.js';
import {SCENERY_PROPS} from './scenery-catalog.js';

// A small integration preview, separate from the user's authored tutorial.
export function sceneryFixture(){
 const map=blankMap('Helicopter crash and new furnishings');
 for(let y=12;y<40;y++)for(let x=12;x<44;x++){map.upper[0][`${x},${y}`]='ground-grass';map.upper[1][`${x},${y}`]='ground-grass';}
 map.props=[{kind:'helicopter-crash-smoke',x:20,y:22,z:2},{kind:'helicopter-utility',x:50,y:22,z:0},{kind:'helicopter-wreck',x:50,y:38,z:0,rotated:true}];
 map.starts=[{x:25,y:29,z:2},{x:27,y:29,z:2},{x:25,y:31,z:2},{x:27,y:31,z:2}].map(p=>({...p,heading:135}));
 map.exits=[{x:18,y:29,z:2}];
 Object.keys(SCENERY_PROPS).filter(kind=>!kind.startsWith('helicopter-')&&!kind.startsWith('machine-')&&!kind.startsWith('stone-arch-')).forEach((kind,i)=>map.props.push({kind,x:18+i*2,y:18,z:2}));
 return map;
}
