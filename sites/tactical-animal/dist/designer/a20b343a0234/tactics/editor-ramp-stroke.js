import {MAP_LEVELS} from './map-layers.js';
import {RAMP_DIRECTIONS} from './cliff-ramps.js';

// Anchor at the existing high ledge; drag along its face to add parallel lanes.
export function rampStroke(map,start,end=start,surface='grass'){
 const z=start.z||0,cliffs=new Map((map.props||[]).filter(p=>(p.z||0)===z&&p.kind.startsWith('cliff-')).map(p=>[p.x+','+p.y,p])),full=(x,y)=>{const p=cliffs.get(x+','+y);return p?.kind==='cliff-ledge'&&(p.cliffMask??15)===15;};
 if(z>=MAP_LEVELS-1)throw Error('A ramp needs a playable upper level.');
 if(!full(start.x,start.y))throw Error('Start on a full, straight cliff ledge and drag along its wall.');
 if(!['grass','sand','road','concrete','wood','woodsupport','woodgold'].includes(surface))throw Error('Choose a ramp surface.');
 const edge=(start.edge||'').split(':'),axis=edge[0],ex=Number(edge[1]),ey=Number(edge[2]),preferred=axis==='e'?(ex<start.x?'east':'west'):axis==='s'?(ey<start.y?'south':'north'):null;
 const exposed=Object.entries(RAMP_DIRECTIONS).filter(([, [dx,dy]])=>!cliffs.has((start.x-dx)+','+(start.y-dy)));
 let entry=exposed.find(([d])=>d===preferred);
 if(!entry&&exposed.length===1)entry=exposed[0];
 if(!entry)throw Error('Click the exposed face of the cliff wall.');
 const [direction,[dx,dy]]=entry,from=dx?start.y:start.x,to=dx?end.y:end.x,lanes=[],landings=[];
 for(let i=Math.min(from,to);i<=Math.max(from,to);i++){
  const x=dx?start.x:i,y=dx?i:start.y;
  if(!full(x,y)||cliffs.has((x-dx)+','+(y-dy)))throw Error('Keep the whole drag on one straight, exposed ledge wall.');
  landings.push({x,y,z:z+1});
  const run=surface.startsWith('wood')?3:4,low={x:x-dx*run,y:y-dy*run};
  lanes.push({x:low.x+(dx<0?1-run:0),y:low.y+(dy<0?1-run:0),z,kind:`ramp-${surface}-${direction}`,rotated:false});
 }
 return {lanes,landings,orientation:[dx,dy]};
}
