import {blankMap} from './core/maps.js';
import {localEnvironmentProfile,environmentSummary,ENVIRONMENTS} from './environment-regions.js';
export const ENVIRONMENT_PREVIEW_KEY='farmyard-commando-environment-preview-v1';
export function environmentPreviewKey(field,index){localEnvironmentProfile(field,index);return `${field.seed}-${index}`;}
export function environmentPreviewMap(field,index){
 const profile=localEnvironmentProfile(field,index),summary=environmentSummary(field,index%30,Math.floor(index/30),1,1,12);
 if(!profile)throw Error('Generate a world with environment regions first.');
 const map=blankMap('Environment '+(index%30+1)+','+(Math.floor(index/30)+1)+' · '+ENVIRONMENTS[summary[0].family].name);
 map.environment=profile;map.foliage={};
 // A small sample near the center keeps this preview quick to load. It is not
 // a tactical assignment and does not invent roads, river entrances or walls.
 for(let y=104;y<132;y++)for(let x=104;x<132;x++)if(x<115||x>121)map.foliage[`${x},${y},0`]=[65,x<115];
 map.starts=[{x:118,y:118,z:0},{x:119,y:118,z:0},{x:118,y:119,z:0},{x:119,y:119,z:0}];map.exits=[{x:118,y:122,z:0}];
 return map;
}
