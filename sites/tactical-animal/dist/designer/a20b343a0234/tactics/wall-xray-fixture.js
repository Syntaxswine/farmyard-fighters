import {blankMap,stampRoom} from './core/maps.js';
export function wallXrayFixture(){
 const map=blankMap('Cursor wall X-ray study');stampRoom(map,3,3,6,6);
 map.edges['e:8:6']='door-wood-closed';map.edges['e:8:5']='window-brick';map.edges['s:6:8']='door-steel-closed';
 map.starts=[{x:8,y:6,z:0},{x:6,y:8,z:0},{x:8,y:8,z:0},{x:4,y:5,z:0}];
 map.exits=[{x:9,y:6,z:0}];
 return map;
}
