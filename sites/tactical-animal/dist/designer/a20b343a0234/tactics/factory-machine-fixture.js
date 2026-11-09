import {blankMap} from './core/maps.js';
import {sceneryOrientation} from './scenery-catalog.js';

// Disposable editor/playtest fixtures, never written over authored sectors.
export function factoryMachineFixture(mode='review'){
 const map=blankMap('Factory machines · '+mode);map.guards=[];map.props=[];
 for(let y=8;y<=43;y++)for(let x=8;x<=46;x++)map.terrain[y][x]='ground-concrete';
 map.starts=[{x:20,y:38,z:0},{x:22,y:38,z:0},{x:20,y:40,z:0},{x:22,y:40,z:0}].map(p=>({...p,heading:270}));map.exits=[{x:17,y:38,z:0}];
 const forms=['lathe','mill','press'],count=mode==='baseline'?0:mode==='small'?3:mode==='stress'?30:12;
 if(mode!=='review'){map.starts=[{x:44,y:38,z:0},{x:46,y:38,z:0},{x:44,y:40,z:0},{x:46,y:40,z:0}].map(p=>({...p,heading:270}));map.exits=[{x:42,y:40,z:0}];}
 for(let i=0;i<count;i++){const col=mode==='stress'?i%6:i%3,row=Math.floor(i/(mode==='stress'?6:3));map.props.push({kind:'machine-'+forms[i%3],x:12+col*5,y:12+row*6,z:0,...sceneryOrientation({rotation:Math.floor(i/3)%4*90})});}
 if(mode==='cover'){
  map.props=[{kind:'machine-press',x:24,y:24,z:0,...sceneryOrientation({rotation:0})}];map.starts=[{x:21,y:24,z:0},{x:18,y:28,z:0},{x:20,y:28,z:0},{x:18,y:30,z:0}].map(p=>({...p,heading:0}));map.exits=[{x:17,y:28,z:0}];map.guards=[{x:29,y:24,z:0,species:'pig-foreman',weapon:'rifle',heading:180}];
 }
 if(mode==='review'){
  // Raised, supported lathe with ordinary stairs. The separate northern ceiling
  // is intentionally empty: attempting a mill/press there must fail atomically.
  for(let y=24;y<=29;y++)for(let x=37;x<=42;x++)map.upper[0][`${x},${y}`]='ground-concrete';
  map.stairs=[{x:37,y:27,z:0,type:'stairs'}];map.props.push({kind:'machine-lathe',x:39,y:25,z:1,...sceneryOrientation({rotation:270})});
  for(let y=15;y<=17;y++)for(let x=39;x<=40;x++)map.upper[0][`${x},${y}`]='ground-concrete';
  map.guards=[{x:9,y:19,z:0,species:'pig-foreman',weapon:'rifle',heading:0},{x:29,y:19,z:0,species:'pig-foreman',weapon:'rifle',heading:180}];
 }
 return map;
}
