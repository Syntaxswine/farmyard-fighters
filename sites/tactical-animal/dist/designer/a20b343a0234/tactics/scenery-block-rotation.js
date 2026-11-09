import {isScenery,scenerySize,sceneryOrientation} from './scenery-catalog.js';

// Rotate a reusable scenery block as data, with no renderer-dependent state.
// Other directional prop families still have their own two-state conventions;
// refuse them rather than silently reversing their appearance on a half turn.
export function rotateSceneryBlock(block){
 if(block?.kind!=='red-shift-block'||block.size!==24)throw Error('Open a 24 × 24 scenery block first.');
 if((block.props||[]).some(p=>!isScenery(p))||(block.canopies||[]).length)throw Error('Block rotation supports scenery blocks. Rotate other directional objects individually.');
 if(block.environment)throw Error('World-aligned environment data cannot be rotated as a block.');
 const out=structuredClone(block),size=block.size,point=p=>({...p,x:size-1-p.y,y:p.x}),key=k=>{const [x,y,...z]=k.split(',').map(Number),p=point({x,y});return [p.x,p.y,...z].join(',');};
 const kind=t=>typeof t==='string'?t.replace(/north|east|south|west|(?<=-)(?:nw|ne|se|sw)(?=-|$)/g,v=>({north:'east',east:'south',south:'west',west:'north',nw:'ne',ne:'se',se:'sw',sw:'nw'})[v]):t;
 const sparse=s=>Object.fromEntries(Object.entries(s||{}).map(([k,v])=>[key(k),kind(v)])),edge=k=>{const [axis,x,y,z]=k.split(':'),p=axis==='e'?['s',size-1-(+y),+x]:['e',size-2-(+y),+x];if(z)p.push(+z);return p.join(':');},edges=s=>Object.fromEntries(Object.entries(s||{}).map(([k,v])=>[edge(k),v]));
 out.terrain=Array.from({length:size},()=>Array(size));for(let y=0;y<size;y++)for(let x=0;x<size;x++)out.terrain[x][size-1-y]=kind(block.terrain[y][x]);
 out.upper=block.upper.map(sparse);out.edges=edges(block.edges);if(block.edgeLocks)out.edgeLocks=edges(block.edgeLocks);
 out.props=block.props.map(p=>{const {h}=scenerySize(p),q={...p,x:size-p.y-h,y:p.x,...sceneryOrientation(p,1)};if(p.lightTargets)q.lightTargets=p.lightTargets.map(point);return q;});
 for(const field of ['guards','stairs','climbs'])out[field]=(block[field]||[]).map(p=>{const q=point(p);if(p.heading!==undefined)q.heading=(p.heading+90)%360;if(p.dx!==undefined){q.dx=-p.dy;q.dy=p.dx;}if(p.patrol)q.patrol=p.patrol.map(point);return q;});
 if(block.foliage)out.foliage=sparse(block.foliage);if(block.landPaint)out.landPaint=sparse(block.landPaint);
 if(block.breaches)out.breaches={edges:edges(block.breaches.edges),upper:block.breaches.upper.map(sparse)};
 if(block.connections)out.connections=Object.fromEntries(Object.entries(block.connections).map(([k,v])=>[kind(k),v]));
 return out;
}
