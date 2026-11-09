import {isHedge} from './hedge-data.js';
import {isStoneArch} from './scenery-catalog.js';
import {localEnvironmentFamily} from './environment-regions.js';
import {biomeTree} from './biome-gameplay-data.js';
import {isStrategicSite} from './strategic-site-rules.js';
import {foliageAt,foliageKey,foliageTreeAt} from './foliage-data.js';
import {canopyPresentation} from './editor-canopies.js';
import {roofVisualKind} from './climbable-roofs.js';
import {bankInfo,BANK_YAW} from './ramp-banks.js';
import {isRamp,rampInfo,woodenRampParts} from './cliff-ramps.js';
import {isCliff} from './cliff-map.js';
import {PROPS,propCells} from './environment.js';
import {cliffSupportAt} from './cliff-support.js';
import {environmentModel} from './environment-models.js';
import {DIMENSIONS as D} from './hybrid-world.js';
import {grassTufts,coverUndergrowth} from './foliage-models.js';
import {damagedWallVisuals} from './wall-breaches.js';
import {damagedFloorVisuals} from './floor-breaches.js';

// The visual catalog deliberately does not replace simulation collision volumes.
export function environmentVisuals(world,map,{biomes=false}={}){map=canopyPresentation(map);
 const result=world.boxes.filter(b=>!b.archSurface&&!b.foliageVolume&&b.kind!=='prop'&&!b.id.includes(':slope:')),fallbackTrees=[];
 const occupied=new Set((map.coverOccupiedProps||map.props||[]).flatMap(p=>(isStrategicSite(p)?Array.from({length:64},(_,i)=>({x:p.x+i%8,y:p.y+Math.floor(i/8)})):isCliff(p)?[p]:propCells(p)).map(c=>`${c.x},${c.y},${p.z||0}`)));
 const sandyCaps=new Set((map.props||[]).filter(p=>isCliff(p)&&(p.cliffSand??0)>=.5).map(p=>foliageKey(p.x,p.y,(p.z||0)+1)));
 const coverBox=b=>{const {x,y,z=0}=b.source;return {...b,foliage:map.foliage?.[foliageKey(x,y,z)],family:map.environment?localEnvironmentFamily(map.environment,x+.5,y+.5):null,habitat:['ground-dirt','ground-gravel'].includes(b.material)||sandyCaps.has(foliageKey(x,y,z))?'dry':'grass'};};
 // Walls use edge keys, not floor coordinates; only floors can seed foliage.
 for(const b of world.boxes)if(!b.archSurface&&!biomes&&b.kind==='floor'&&!occupied.has(`${b.source.x},${b.source.y},${b.source.z||0}`)){
  const box=coverBox(b);result.push(...(box.foliage?[]:grassTufts(b)),...coverUndergrowth(box));
  if(b.kind==='floor'&&foliageTreeAt(map,b.source.x,b.source.y,b.source.z||0))fallbackTrees.push({kind:'tree-broadleaf',...b.source,foliageHeight:b.center[1]+D.slab/2});
 }
 // A ledge cap replaces its floor slab. Keep foliage on that supported surface
 // even though there is no ordinary floor mesh to seed its visual instances.
 for(const [layer,tiles]of (biomes?[]:map.upper||[]).entries())for(const [key,terrain]of Object.entries(tiles)){
  const [x,y]=key.split(',').map(Number),z=layer+1;if(!foliageAt(map,x,y,z))continue;const source={x,y,z},support=cliffSupportAt(map,source);
  if(support&&!occupied.has(`${x},${y},${z}`)){result.push(...coverUndergrowth(coverBox({id:`floor:${x},${y},${z}`,kind:'floor',material:terrain,source,center:[x,support.level*D.floorSpacing+support.height-D.slab/2,y],size:[1,D.slab,1]})));if(foliageTreeAt(map,x,y,z))fallbackTrees.push({kind:'tree-broadleaf',x,y,z,foliageHeight:support.level*D.floorSpacing+support.height});}
 }
 const add=(id,source,kind,material,center,size,shape='box',rotation=[0,0,0])=>result.push({id,source,kind,material,center,size,shape,rotation});
 for(const p of [...(map.props||[]),...fallbackTrees]){
  if(isStoneArch(p)||isHedge(p)||isCliff(p)||biomes&&biomeTree(p.kind))continue;
  const bank=bankInfo(p);if(bank){const id='prop:'+p.x+','+p.y+','+(p.z||0)+':'+p.kind;add(id,{prop:id,x:p.x,y:p.y,z:p.z||0},'ramp-bank',bank.surface==='grass'?'ground-grass':'sand',[p.x,(p.z||0)*D.floorSpacing,p.y],[1,1,1],'rampbank-'+bank.side+'-'+bank.step);result.at(-1).yaw=BANK_YAW[bank.direction];continue;}
  if(isRamp(p)){const r=rampInfo(p),yaw={east:0,south:-Math.PI/2,west:Math.PI,north:Math.PI/2}[r.direction],center=[(r.low.x+r.high.x)/2,r.z*D.floorSpacing+1,(r.low.y+r.high.y)/2],source={x:p.x,y:p.y,z:p.z||0,prop:'prop:'+p.x+','+p.y+','+(p.z||0)+':'+p.kind};
   if(r.surface.startsWith('wood')){for(const [i,part] of woodenRampParts(p,D.floorSpacing).entries())add(source.prop+':timber:'+i,source,'ramp',r.surface==='woodgold'?'ground-wood-planks':'wood',part.center,part.size,'box',part.rotation);continue;}
   add('ramp:'+p.x+','+p.y+':rock',source,'ramp','sand',center,[4,2,1],'ramp');result.at(-1).yaw=yaw;
   add('ramp:'+p.x+','+p.y+':surface',source,'ramp',r.surface==='road'?'ground-asphalt':r.surface==='concrete'?'ground-concrete':r.surface==='grass'?'ground-grass':'sand',[center[0],center[1]+.01,center[2]],[Math.sqrt(20),.02,1],'box',[0,0,Math.atan(.5)]);result.at(-1).yaw=yaw;continue;
  }
  const rule=PROPS[p.kind];if(!rule)continue;
  const id=`prop:${p.x},${p.y},${p.z||0}:${p.kind}`,source={prop:id,x:p.x,y:p.y,z:p.z||0},base=p.foliageHeight??(p.z||0)*D.floorSpacing;
  if(p.kind.startsWith('roof-')){
   if(roofVisualKind(p.kind)==='roof-corrugated-sloped')add(id+':sheet',source,'roof','metal',[p.x+.5,base-D.slab-.16,p.y+.5],[2,.32,2],'wedge',[0,p.rotated?-Math.PI/2:0,0]);
   // Corrugation and folded eaves remain below the walkable top of the roof.
   if(p.kind.includes('corrugated'))for(let i=0;i<14;i++)add(id+':rib:'+i,source,'roof','metal',p.rotated?[p.x+.5,base-.007,p.y-.45+i*.145]:[p.x-.45+i*.145,base-.007,p.y+.5],p.rotated?[2,.018,.025]:[.025,.018,2]);
   continue;
  }
  const cells=propCells(p),w=Math.max(...cells.map(q=>q.x))-p.x+1,d=Math.max(...cells.map(q=>q.y))-p.y+1;
  const h=rule.tall?D.wall:rule.cover?D.lowCover:rule.visualHeight?Math.min(1.8,rule.visualHeight/40):.2;
  for(const [i,part]of environmentModel(p.kind,rule.w,rule.h,h).entries()){
   const [x,y,z]=part.center;
   // Parent Y rotation is composed by the renderer before each local rotation.
   add(id+':model:'+i,source,'prop',part.material,[p.x+(w-1)/2+(p.rotated?-z:x),base+y,p.y+(d-1)/2+(p.rotated?x:z)],part.size,part.shape,part.rotation);
   result.at(-1).yaw=p.rotated?-Math.PI/2:0;
  }
 }
 for(const b of world.boxes){
  if(b.kind==='fence'&&b.id.endsWith(':bar:0')){
   const [axis]=b.source.edge.split(':'),east=axis==='e';
   for(const y of [.2,1.7])add(b.id+':rail:'+y,b.source,'fence','dark-metal',[b.center[0]+(east?0:.5),b.center[1]-1+y,b.center[2]+(east?.5:0)],east?[.045,.045,1]:[1,.045,.045]);
   if(b.material==='fence-chainlink')for(let i=-6;i<=8;i++)for(const sign of [-1,1]){
    // Clip both diagonal wire families to the panel rectangle.
    const intercept=i*.2,lo=Math.max(0,sign===1?.2-intercept:intercept-1.7),hi=Math.min(1,sign===1?1.7-intercept:intercept-.2);
    if(hi<=lo)continue;const t=(lo+hi)/2,y=intercept+sign*t,length=(hi-lo)*Math.sqrt(2);
    add(b.id+`:wire:${i}:${sign}`,b.source,'fence','metal',[b.center[0]+(east?0:t),b.center[1]-1+y,b.center[2]+(east?t:0)],[.009,length,.009],'cylinder',east?[sign*Math.PI/4,0,0]:[0,0,-sign*Math.PI/4]);
   }
  }
  if(b.kind==='wall'&&b.id.endsWith(':door')){
   const east=b.size[0]<b.size[2];add(b.id+':handle',b.source,'wall','dark-metal',[b.center[0]+(east?b.size[0]/2+.025:.3),b.center[1]+.03,b.center[2]+(east?.3:b.size[2]/2+.025)],east?[.05,.045,.18]:[.18,.045,.05]);
  }
 }
 return damagedFloorVisuals(damagedWallVisuals(result,map),map);
}
