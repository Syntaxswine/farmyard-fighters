import {passable,neighbors} from './core/maps.js';
import {sceneryPoint,sceneryId} from './scenery-catalog.js';

// The authored crash has an exit on local +Z. Place survivors outside that
// opening; no boarding, evacuation animation or campaign progression is implied.
export function helicopterStart(map,prop){
 const placed=(map.props||[]).find(p=>p.kind==='helicopter-crash-smoke'&&sceneryId(p)===sceneryId(prop));
 if(!placed)throw Error('Select a survivors / smoke helicopter first.');
 const points=[[5,6],[7,6],[5,8],[7,8]].map(xy=>{const p=sceneryPoint(placed,xy);return {x:p.x,y:p.y,z:p.z};});
 const occupied=p=>(map.guards||[]).some(g=>g.x===p.x&&g.y===p.y&&(g.z||0)===p.z);
 if(points.some(p=>!passable(map,p)||occupied(p)))throw Error('Clear the four survivor tiles beside the helicopter exit before setting the start.');
 // Check a local route between all four starts. A fence or closed room must
 // not silently strand half the squad on the other side of the crash.
 const key=p=>`${p.x},${p.y},${p.z||0}`,seen=new Set([key(points[0])]),queue=[points[0]];
 for(let i=0;i<queue.length;i++)for(const p of neighbors(map,queue[i]))if((p.z||0)===points[0].z&&Math.abs(p.x-points[0].x)<=10&&Math.abs(p.y-points[0].y)<=10&&!occupied(p)&&!seen.has(key(p))){seen.add(key(p));queue.push(p);}
 if(points.some(p=>!seen.has(key(p))))throw Error('Connect the survivor tiles beside the helicopter before setting the start.');
 const next=structuredClone(map);next.starts=points.map((p,i)=>{const unit={...next.starts[i],...p,heading:135};delete unit.towerPost;return unit;});return next;
}
