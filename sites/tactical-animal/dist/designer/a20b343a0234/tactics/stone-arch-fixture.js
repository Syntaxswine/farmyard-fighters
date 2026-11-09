import {blankMap,setTerrain} from './core/maps.js';
import {stoneArchData} from './stone-arch-geometry.js';

// Separately authored timber approaches keep the rock assets reusable.
export function archApproaches(map,prop){
 const large=prop.kind==='stone-arch-large';
 if(large){
  // Large landmark is north–south over an east–west road.
  const rise=stoneArchData(prop.kind).rise;
  for(let x=prop.x;x<prop.x+3;x++)for(const side of [-1,1]){
   const north=side<0,landing=prop.y+(north?-1:12),direction=north?'south':'north';
   for(let z=0;z<rise;z++){
    const start=north?landing-4*(rise-z)+1:landing+4*(rise-z)-3,end=north?start+3:start-1;
    if(z)for(let y=start-(north?1:0);y<=start+(north?2:3);y++)setTerrain(map,x,y,z,'ground-wood-planks');
    setTerrain(map,x,end,z+1,'ground-wood-planks');
    map.props.push({kind:'ramp-woodgold-'+direction,x,y:start,z});
   }
  }
 }else{
  for(let y=prop.y;y<prop.y+3;y++){
   setTerrain(map,prop.x-1,y,1,'ground-wood-planks');setTerrain(map,prop.x+6,y,1,'ground-wood-planks');
   map.props.push({kind:'ramp-woodgold-east',x:prop.x-4,y,z:0},{kind:'ramp-woodgold-west',x:prop.x+7,y,z:0});
  }
 }
 return map;
}
export function stoneArchFixture(){
 const map=blankMap('Natural stone arches · two independent routes');
 map.terrain.forEach(row=>row.fill('ground-grass'));
 for(let x=7;x<43;x++)for(let y=24;y<30;y++)map.terrain[y][x]='ground-asphalt';
 const large={kind:'stone-arch-large',x:20,y:21,z:0,rotation:90,rotated:true},small={kind:'stone-arch-small',x:36,y:37,z:0,rotation:0,rotated:false};
 if(map.levels>stoneArchData(large.kind).rise){map.props.push(large);archApproaches(map,large);}
 map.props.push(small);archApproaches(map,small);
 for(let y=33;y<45;y++)for(let x=38;x<40;x++)map.terrain[y][x]='ground-dirt';
 map.starts=[{x:31,y:38,z:0},{x:39,y:38,z:1},{x:38,y:34,z:0},{x:45,y:38,z:0}];map.exits=[{x:42,y:27,z:0}];
 return map;
}
