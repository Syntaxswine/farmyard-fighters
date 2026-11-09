import {createHedgePlan} from './hedge-layout.js';
import {hedgeGroups} from './hedge-data.js';
import {hedgeCellSurfaces,hedgeWoodTriangles} from './hedge-surfaces.js';

export function hedgeObstacles(map){
 const boxes=[];
 for(const group of hedgeGroups(map)){
  const plan=createHedgePlan(group.cells),byCell=new Map();for(const b of plan.wood){const key=b.cell.join(',');if(!byCell.has(key))byCell.set(key,[]);byCell.get(key).push(b);}
  for(const c of plan.cells){
   const key=`${c.x},${c.z}`,{base,simBase}=group.bases.get(key),source={x:c.x,y:c.z,z:group.level},shape=hedgeCellSurfaces(plan,c);
   const add=(triangles,part,blocksShot)=>{if(!triangles.length)return;const points=triangles.flat(),min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));boxes.push({id:`hedge:${key},${group.level}:${part}`,source,triangles,min,max,blocksSight:true,blocksShot,base,simBase});};
   add([...shape.core,...shape.closure],'leaves',false);
   for(const [i,b]of (byCell.get(key)||[]).entries())add(hedgeWoodTriangles(b),'wood:'+i,true);
  }
 }
 return boxes;
}
