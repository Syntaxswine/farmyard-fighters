import {siteSupportAt} from './strategic-site-rules.js';
import {rampSupportAt} from './cliff-ramps.js';
// Full, flat ledge tiles support the authored logical floor above at a physical 2m.
// Curved tiles and crags require a separately validated support footprint.
export function cliffSupportAt(map,p){
 const z=p.z||0;if(z<1)return null;
 return (map.props||[]).some(q=>q.kind==='cliff-ledge'&&(q.cliffMask??15)===15&&q.x===Math.round(p.x)&&q.y===Math.round(p.y)&&(q.z||0)===z-1)?{level:z-1,height:2}:null;
}
export function updateCliffSupports(state){for(const u of state.units){const support=siteSupportAt(state,u)||rampSupportAt(state,u)||cliffSupportAt(state,u);if(support&&!u.towerPost)u.cliffSupport=support;else delete u.cliffSupport;}}
