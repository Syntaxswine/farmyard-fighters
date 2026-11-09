import {DIMENSIONS} from './hybrid-world.js';

// The saved tutorial has the correct 240×240 plateau but no dense-foliage mask.
// These broad regions are an editable art study guided by the user's screenshot,
// not an extraction of, or a replacement for, their authored map.
export const TUTORIAL_FOLIAGE_REGIONS=[
 [30,29,23,22],[88,22,26,17],[146,23,21,17],[186,34,15,27],
 [24,83,20,27],[77,73,27,23],[136,82,24,29],[184,90,13,25],
 [38,137,25,16],[91,135,24,16],[133,154,17,13],
 [212,123,12,13],[184,163,14,12],[140,207,17,17],[203,195,18,15],[178,229,10,12],[230,193,11,24]
];
export function tutorialFoliagePlan(map){
 if(map?.width!==240||map?.height!==240||!Array.isArray(map.terrain)||!Array.isArray(map.upper))throw Error('This study needs the saved 240×240 tutorial map');
 const width=map.width,depth=map.height,heights=new Float32Array(width*depth),blocked=new Uint8Array(width*depth),cells=[];
 for(let z=0;z<depth;z++)for(let x=0;x<width;x++){
  let level=map.terrain[z]?.[x]!=='void'?0:-1;
  for(let l=0;l<map.upper.length;l++)if(map.upper[l]?.[x+','+z]&&map.upper[l][x+','+z]!=='void')level=l+1;
  if(level<0)throw Error('Missing visible tutorial terrain');heights[z*width+x]=level*DIMENSIONS.floorSpacing;
  const waviness=.11*Math.sin(x*.17)*Math.cos(z*.14)+.06*Math.cos((x+z)*.19);
  const dense=TUTORIAL_FOLIAGE_REGIONS.some(([cx,cz,rx,rz])=>((x-cx)/(rx*1.16))**2+((z-cz)/(rz*1.16))**2<1+waviness)||x<7||z<7||x>=width-8||z>=depth-8;
  if(dense){blocked[z*width+x]=1;cells.push([x,z]);}
 }
 const heightAt=(x,z)=>x>=0&&z>=0&&x<width&&z<depth?heights[Math.floor(z)*width+Math.floor(x)]:null;
 const blockedAt=(x,z)=>x>=0&&z>=0&&x<width&&z<depth?!!blocked[Math.floor(z)*width+Math.floor(x)]:false;
 // Seal accidental tiny islands of clear cells inside the illustrated masses.
 // Broad corridors remain untouched. Marker reservations are applied afterward.
 const seen=new Uint8Array(width*depth),steps=[[1,0],[-1,0],[0,1],[0,-1]];let sealedPinholes=0;
 for(let i=0;i<blocked.length;i++)if(!blocked[i]&&!seen[i]){const component=[i];seen[i]=1;for(let j=0;j<component.length;j++){const id=component[j],x=id%width,z=Math.floor(id/width);for(const [dx,dz]of steps){const u=x+dx,v=z+dz,k=v*width+u;if(u>=0&&v>=0&&u<width&&v<depth&&!blocked[k]&&!seen[k]){seen[k]=1;component.push(k);}}}if(component.length<=8){sealedPinholes+=component.length;component.forEach(k=>blocked[k]=1);}}
 const clearRoom=(x,z,h)=>[-1,0,1].every(dz=>[-1,0,1].every(dx=>!blockedAt(x+dx,z+dz)&&heightAt(x+dx,z+dz)===h));
 const reservedMarkers=[];
 for(const marker of [...(map.starts||[]),...(map.exits||[])]){
  const {x,y:z}=marker,h=heightAt(x,z);if(h===null||Math.abs(h-(marker.z||0)*DIMENSIONS.floorSpacing)>1e-6)continue;
  const start=z*width+x,parent=new Int32Array(width*depth).fill(-1),queue=[start];parent[start]=start;let target=-1;
  for(let j=0;j<queue.length;j++){const id=queue[j],u=id%width,v=Math.floor(id/width);if(clearRoom(u,v,h)){target=id;break;}for(const [dx,dz]of steps){const xx=u+dx,zz=v+dz,k=zz*width+xx;if(xx>=1&&zz>=1&&xx<width-1&&zz<depth-1&&parent[k]===-1&&heightAt(xx,zz)===h){parent[k]=id;queue.push(k);}}}
  if(target<0)throw Error('Cannot connect a tutorial marker to clear terrain');
  const corridor=[];for(let id=target;;id=parent[id]){const u=id%width,v=Math.floor(id/width);corridor.push([u,v]);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)if(heightAt(u+dx,v+dz)===h)blocked[(v+dz)*width+u+dx]=0;if(id===start)break;}
  reservedMarkers.push({x,z,level:marker.z||0,corridor});
 }
 cells.length=0;for(let z=0;z<depth;z++)for(let x=0;x<width;x++)if(blockedAt(x,z))cells.push([x,z]);
 const nearDense=(x,z)=>[-3,-2,0,2,3].some(dz=>[-3,-2,0,2,3].some(dx=>blockedAt(x+dx,z+dz)));
 const findClear=(px,pz)=>{let best=null,distance=Infinity;for(let z=1;z<depth-1;z++)for(let x=1;x<width-1;x++)if(!blockedAt(x,z)&&nearDense(x,z)&&[-1,0,1].every(dz=>[-1,0,1].every(dx=>!blockedAt(x+dx,z+dz)&&heightAt(x+dx,z+dz)===heightAt(x,z)))){const d=(x-px)**2+(z-pz)**2;if(d<distance){best=[x,heightAt(x,z),z];distance=d;}}return best;};
 return {width,depth,heights,blocked,cells,heightAt,blockedAt,reservedMarkers,focus:{corridor:findClear(101,95),cliff:findClear(153,165),clearing:findClear(181,206)},source:{name:map.name,props:map.props.length,terrain:'sector-library/tutorial-step-1/rough-plateau.json',foliage:'Screenshot-inspired study regions; source map is untouched.',sealedPinholes,reservedMarkers:reservedMarkers.length}};
}
