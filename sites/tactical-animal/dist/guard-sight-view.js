import * as T from './aft/tactics/vendor/three.module.js';
import {sightOf} from './aft/tactics/core/perception.js';
import {getTourWorld} from './mount-dora-activity.js';
import {alive,canSee,geometry,sightRange} from './solo-game.js';
import {worldBounds} from './world-grid.js';

const ANGLE_STEP=3,UPDATE_MS=100,GROUND_OFFSET=.045;
const MAX_POINTS=(360/ANGLE_STEP+6)*2;
const radians=degrees=>degrees*Math.PI/180;

function edgeDistance(origin,direction,min,max){
  if(Math.abs(direction)<1e-9)return Infinity;
  return ((direction>0?max:min)-origin)/direction;
}

// The visual probes use the same target posture, pace, terrain, and sight
// predicate as a guard looking at the player. The rays form a ground outline.
export function guardSightOutline(state,guard,player,window){
  const bounds=worldBounds(state);
  const x0=Math.max(bounds.x,window.x)-.5,y0=Math.max(bounds.y,window.y)-.5;
  const x1=Math.min(bounds.x+bounds.w,window.x+window.w)-.5,y1=Math.min(bounds.y+bounds.h,window.y+window.h)-.5;
  const target={team:'squad',stance:player.stance,sneaking:player.sneaking};
  const heading=Number.isFinite(guard.heading)?guard.heading:0,{field,bino}=sightOf(guard);
  const angles=new Set(Array.from({length:360/ANGLE_STEP},(_,i)=>-180+i*ANGLE_STEP));
  // Include the hard field edges so that even the short rear blind wedge is
  // represented. The game can still spot someone within touching distance.
  for(const side of [-1,1]){
    for(const offset of [bino/2,field/2-.001,field/2+.001]){
      if(offset<180)angles.add(side*offset);
    }
  }
  function probe(offset){
    const angle=radians(heading+offset),dx=Math.cos(angle),dy=Math.sin(angle);
    const place=distance=>{target.x=guard.x+dx*distance;target.y=guard.y+dy*distance;};
    place(1);
    const limit=Math.max(0,Math.min(sightRange(guard,target),
      edgeDistance(guard.x,dx,x0,x1),edgeDistance(guard.y,dy,y0,y1))-.0001);
    place(limit);
    let reach=limit;
    if(limit&&!canSee(state,guard,target)){
      let low=0,high=limit;
      while(high-low>.1){
        const mid=(high+low)/2;place(mid);
        if(canSee(state,guard,target))low=mid;else high=mid;
      }
      reach=low;
      place(reach);
    }
    return {x:target.x,y:target.y,reach,offset};
  }
  const rays=[...angles].sort((a,b)=>a-b).map(probe),outline=[];
  for(let i=0;i<rays.length;i++){
    const a=rays[i],b=rays[i+1]??{...rays[0],offset:180};
    outline.push(a);
    if(b.offset-a.offset>1&&Math.abs(b.reach-a.reach)>1.5)outline.push(probe((a.offset+b.offset)/2));
  }
  return outline;
}

export class GuardSightView{
  constructor(parent){
    this.parent=parent;
    this.outlines=new Map();
    this.material=new T.LineBasicMaterial({color:0xff534b,transparent:true,opacity:.94,depthWrite:false,toneMapped:false,fog:false});
  }
  remove(id,record){
    record.line.removeFromParent();
    record.line.geometry.dispose();
    this.outlines.delete(id);
  }
  update(state,player,visible,window,now){
    const guards=visible.filter(unit=>unit.team==='guard'&&alive(unit));
    const ids=new Set(guards.map(guard=>guard.id));
    for(const [id,record] of this.outlines)if(!ids.has(id))this.remove(id,record);
    if(!guards.length)return;

    const scenery=getTourWorld(state)?.revision??geometry(state);
    const context=[window.key,player.stance,player.sneaking].join(':');
    const force=scenery!==this.scenery||context!==this.context;
    this.scenery=scenery;this.context=context;
    for(const guard of guards){
      let record=this.outlines.get(guard.id);
      const pose=[guard.x,guard.y,guard.heading,guard.stance].join(':');
      if(record&&!force&&(pose===record.pose||now-record.at<UPDATE_MS))continue;
      if(!record){
        const buffer=new T.BufferGeometry();
        buffer.setAttribute('position',new T.BufferAttribute(new Float32Array(MAX_POINTS*3),3).setUsage(T.DynamicDrawUsage));
        const line=new T.LineLoop(buffer,this.material);
        line.name='Guard sight outline';
        line.frustumCulled=false;
        this.parent.add(line);
        record={line};
        this.outlines.set(guard.id,record);
      }
      const outline=guardSightOutline(state,guard,player,window),buffer=record.line.geometry,position=buffer.getAttribute('position');
      for(const [index,point] of outline.entries())position.setXYZ(index,point.x,GROUND_OFFSET,point.y);
      position.needsUpdate=true;buffer.setDrawRange(0,outline.length);
      record.pose=pose;record.at=now;
    }
  }
  dispose(){
    for(const [id,record] of this.outlines)this.remove(id,record);
    this.material.dispose();
  }
}
