// Adapted from the authoritative AFT window-sneak study; see window-shatter-provenance.json.
import * as T from './aft/tactics/vendor/three.module.js';
import {WALL_DIMENSIONS} from './world-dimensions.js';
const D={wallThickness:Math.max(.20,WALL_DIMENSIONS.thickness),windowBottom:.85,windowTop:1.55};

// Presentation only. The game owns damage, passage permission and saved state.
export const WINDOW_TYPES=Object.freeze(['window-brick','window-concrete','window-corrugated']);
export const SHATTER_DURATION=2.2;
export const SHATTER_FADE_START=1.3;
export const WINDOW_PANE=Object.freeze({width:.95,bottom:D.windowBottom+.025,top:D.windowTop-.025});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function rng(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const gravity=7.8,burstTime=.1;
const landingTime=p=>(p.kick+Math.sqrt(p.kick**2+2*gravity*Math.max(0,p.center[1]-(p.floorHeight||0)-.008)))/gravity;
const settlingTime=p=>burstTime+landingTime(p)+2*p.bounce;
export function shatterTiming(pieces){const fadeStart=Math.max(SHATTER_FADE_START,...pieces.map(settlingTime));return {fadeStart,duration:fadeStart+SHATTER_DURATION-SHATTER_FADE_START};}

export function fracturePane(seed=17,bounds=WINDOW_PANE,maxShards=70,floorHeight=0){
 const p=bounds.min?{width:bounds.max[0]-bounds.min[0],left:bounds.min[0],bottom:bounds.min[1],top:bounds.max[1]}:{...bounds,left:-bounds.width/2};
 if(![p.width,p.left,p.bottom,p.top,floorHeight,maxShards].every(Number.isFinite)||p.width<=0||p.top<=p.bottom||p.bottom<floorHeight||maxShards<4)throw Error('Unsupported pane or receiving floor');
 const pairs=Math.floor(Math.min(70,maxShards,Math.max(4,p.width*(p.top-p.bottom)*114))/2),nx=Math.max(1,Math.min(pairs,Math.round(Math.sqrt(pairs*p.width/(p.top-p.bottom))))),ny=Math.max(1,Math.floor(pairs/nx)),random=rng(seed),points=[];
 for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++)points.push([(x+(x&&x<nx?(random()-.5)*.7:0))/nx*p.width+p.left,p.bottom+(y+(y&&y<ny?(random()-.5)*.7:0))/ny*(p.top-p.bottom),0]);
 const pieces=[];
 const add=(a,b,c)=>{const vertices=[a,b,c],center=[0,1,2].map(i=>(a[i]+b[i]+c[i])/3),local=vertices.map(v=>v.map((n,i)=>n-center[i]));
  pieces.push({center,local,floorHeight,radius:Math.max(...local.map(v=>Math.hypot(...v))),spread:(random()-.5)*.8,depth:.15+random()*.85,kick:.1+random()*.6,spin:[(random()-.5)*8,(random()-.5)*8,(random()-.5)*12],tint:random(),bounce:.08+random()*.07});};
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const a=points[y*(nx+1)+x],b=points[y*(nx+1)+x+1],c=points[(y+1)*(nx+1)+x],d=points[(y+1)*(nx+1)+x+1];if(random()<.5){add(a,b,d);add(a,d,c);}else{add(a,b,c);add(b,d,c);}}
 return pieces;
}

// Glass first clears the wall thickness, then falls. No fragment remains on the
// sill or in the aperture. Analytic sampling supports rewind without simulation drift.
export function shardPose(piece,time,direction=1){
 const t=clamp(time,0,Math.max(SHATTER_DURATION,settlingTime(piece)+SHATTER_DURATION-SHATTER_FADE_START)),sign=direction<0?-1:1,burst=burstTime,g=gravity;
 const flight=Math.max(0,t-burst),land=landingTime(piece);
 const bounceTime=2*piece.bounce,elapsed=clamp(flight-land,0,bounceTime),settled=flight>=land+bounceTime;
 const travel=Math.min(flight,land+bounceTime),clearZ=(D.wallThickness/2+piece.radius+.035)*Math.min(t/burst,1);
 let y=piece.center[1]+piece.kick*flight-g*flight*flight/2;
 if(flight>=land)y=(piece.floorHeight||0)+.008+g*.5*elapsed*(bounceTime-elapsed);
 const flatten=clamp((flight-(land-.13))/.13,0,1),spinTime=Math.min(flight,land);
 return {position:[piece.center[0]+piece.spread*travel,Math.max((piece.floorHeight||0)+.008,y),sign*(clearZ+piece.depth*travel)],rotation:[piece.spin[0]*spinTime*(1-flatten)+Math.PI/2*flatten,(piece.spin[1]*(1-flatten)+piece.spin[2]*flatten)*spinTime,piece.spin[2]*spinTime*(1-flatten)],settled,flatten};
}

export function createWindowShatter({kind='window-brick',seed=17,direction=1,bounds=WINDOW_PANE,maxShards=70,floorHeight=0,includePane=true}={}){
 if(!WINDOW_TYPES.includes(kind)&&!kind.startsWith('window.'))throw new Error('Unsupported window: '+kind);
 const group=new T.Group();group.name='glass:'+kind;
 const pieces=fracturePane(seed,bounds,maxShards,floorHeight),timing=shatterTiming(pieces),positions=new Float32Array(pieces.length*9),colors=new Float32Array(positions.length),geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
 pieces.forEach((p,i)=>{const c=new T.Color().setRGB(.45+p.tint*.24,.65+p.tint*.22,.68+p.tint*.23);for(let v=0;v<3;v++)c.toArray(colors,i*9+v*3);});
 geometry.setAttribute('color',new T.BufferAttribute(colors,3));
 const material=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,transparent:true,opacity:.85,depthWrite:false});
 const shards=new T.Mesh(geometry,material);shards.frustumCulled=false;group.add(shards);
 const p=bounds.min?{width:bounds.max[0]-bounds.min[0],left:bounds.min[0],bottom:bounds.min[1],top:bounds.max[1]}:{...bounds,left:-bounds.width/2},paneGeometry=new T.PlaneGeometry(p.width,p.top-p.bottom),paneMaterial=new T.MeshStandardMaterial({color:0x8eafb0,roughness:.3,metalness:.25,transparent:true,opacity:.56,side:T.DoubleSide,depthWrite:false});
 const pane=new T.Mesh(paneGeometry,paneMaterial);pane.position.set(p.left+p.width/2,(p.bottom+p.top)/2,0);if(includePane)group.add(pane);
 // A pale reflected stroke makes intact glass readable at tactical zoom.
 const shineGeometry=new T.BufferGeometry().setFromPoints([new T.Vector3(p.left+p.width*.15,p.bottom+(p.top-p.bottom)*.1,.002),new T.Vector3(p.left+p.width*.38,p.top-(p.top-p.bottom)*.12,.002),new T.Vector3(p.left+p.width*.64,p.bottom+(p.top-p.bottom)*.14,.002),new T.Vector3(p.left+p.width*.82,p.top-(p.top-p.bottom)*.14,.002)]),shineMaterial=new T.LineBasicMaterial({color:0xe2ebe0,transparent:true,opacity:.7});
 const shine=new T.LineSegments(shineGeometry,shineMaterial);if(includePane)group.add(shine);
 const triangle=Array.from({length:3},()=>new T.Vector3()),q=new T.Quaternion(),e=new T.Euler();let current=-1,disposed=false;
 function sample(time){if(disposed)throw new Error('Window shatter is disposed');if(!Number.isFinite(time))throw new Error('Time must be finite');current=time;
  const fade=clamp((time-timing.fadeStart)/(timing.duration-timing.fadeStart),0,1);
  material.opacity=.85*(1-fade*fade*(3-2*fade));
  pane.visible=shine.visible=includePane&&time<0;shards.visible=time>=0&&time<timing.duration;if(time<0)return;
  pieces.forEach((piece,i)=>{const pose=shardPose(piece,time,direction);q.setFromEuler(e.set(...pose.rotation,'ZYX'));
   piece.local.forEach((point,j)=>triangle[j].set(...point).applyQuaternion(q));
   const lift=Math.max(0,floorHeight+.003-pose.position[1]-Math.min(...triangle.map(v=>v.y)));
   triangle.forEach((v,j)=>{v.x+=pose.position[0];v.y+=pose.position[1]+lift;v.z+=pose.position[2];v.toArray(positions,i*9+j*3);});});
  geometry.attributes.position.needsUpdate=true;
 }
 function dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const g of [geometry,paneGeometry,shineGeometry])g.dispose();for(const m of [material,paneMaterial,shineMaterial])m.dispose();}
 sample(-1);
 return {group,pieces,duration:timing.duration,fadeStart:timing.fadeStart,sample,dispose,diagnostics:()=>({kind,time:current,shards:pieces.length,intact:pane.visible,shardsVisible:shards.visible,opacity:material.opacity,cleared:current>=timing.duration,settled:current>=0&&pieces.every(p=>shardPose(p,current,direction).settled),bounds:Array.from(positions)})};
}
