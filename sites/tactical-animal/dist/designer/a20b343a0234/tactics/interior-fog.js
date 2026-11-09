import {MAP_LEVELS} from './map-layers.js';
import {EDGES} from './environment.js';

const key=(x,y,z)=>z?`${x},${y},${z}`:`${x},${y}`;
// Door openings are boundaries for identifying a room, even while open.
// Their actual sight permissions still come exclusively from terrainVisibility.
export const roomBoundary=kind=>!!EDGES[kind]?.opaque||kind==='door'||kind?.startsWith('doorway-')||kind?.startsWith('jail-');

export function interiorCells(map){
 const ground=map.terrain||map.map||[],height=ground.length,width=ground[0]?.length||0,n=width*height,interiors=[];
 if(!n)return interiors;
 const edges=map.edges||{},at=(x,y,z)=>z?map.upper?.[z-1]?.[`${x},${y}`]:ground[y]?.[x];
 for(let z=0;z<MAP_LEVELS;z++){
  const visited=new Uint8Array(n);
  for(let start=0;start<n;start++){
   const sx=start%width,sy=Math.floor(start/width),terrain=at(sx,sy,z);
   if(visited[start]||!terrain||terrain==='void'||terrain==='wall')continue;
   const cells=[start];visited[start]=1;let enclosed=true,boundary=false;
   for(let i=0;i<cells.length;i++){
    const id=cells[i],x=id%width,y=Math.floor(id/width);
    for(const [dx,dy,axis,ex,ey]of [[1,0,'e',x,y],[-1,0,'e',x-1,y],[0,1,'s',x,y],[0,-1,'s',x,y-1]]){
     const edge=`${axis}:${ex}:${ey}${z?':'+z:''}`;
     if(roomBoundary(edges[edge])){boundary=true;continue;}
     const nx=x+dx,ny=y+dy,t=at(nx,ny,z);
     if(nx<0||ny<0||nx>=width||ny>=height||!t||t==='void'){enclosed=false;continue;}
     if(t==='wall'){boundary=true;continue;}
     const next=ny*width+nx;if(!visited[next]){visited[next]=1;cells.push(next);}
    }
   }
   if(enclosed&&boundary)for(const id of cells){const x=id%width,y=Math.floor(id/width);interiors.push({x,y,z,key:key(x,y,z),room:z*n+start});}
  }
 }
 return interiors;
}

// Use the existing saved exploration record; Easy's outdoor reveal is not LOS.
export const concealedInteriorCells=(cells,state)=>cells.filter(p=>!state.seen?.has(p.key)&&!state.visible?.has(p.key));

// Standard exploration must not advertise buildings in undiscovered terrain.
export function knownInteriorRooms(cells,state){
 if(state.difficulty==='easy')return new Set(cells.map(p=>p.room));
 const rooms=new Set();
 for(const p of cells)if(!rooms.has(p.room))for(const [dx,dy]of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
  const k=key(p.x+dx,p.y+dy,p.z);if(state.seen?.has(k)||state.visible?.has(k)){rooms.add(p.room);break;}
 }
 return rooms;
}
