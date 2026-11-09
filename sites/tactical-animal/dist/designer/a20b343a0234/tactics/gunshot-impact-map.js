import {blankMap} from './core/maps.js';

// Small playable review map. Unlike the JSON artist fixture this does not
// pre-resolve any attacks: use the ordinary shot planner and damage rules.
export function gunshotImpactMap(){
 const map=blankMap('Gunshot impact review');
 map.starts=[{x:10,y:10,weapon:'rifle',heading:0},{x:9,y:11,weapon:'shotgun',heading:0},{x:8,y:11,weapon:'sniper',heading:0},{x:9,y:12,weapon:'assault',heading:0}];
 map.guards=[{x:16,y:10},{x:17,y:13},{x:14,y:16},{x:20,y:15}].map(p=>({...p,species:'pig-foreman',weapon:'pistol',heading:45,outfit:'red-hats'}));
 map.exits=[{x:10,y:13}];return map;
}
