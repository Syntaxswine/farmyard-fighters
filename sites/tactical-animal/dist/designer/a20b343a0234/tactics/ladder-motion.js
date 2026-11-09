import {createEquipmentStow,supportsStow} from './equipment-stow.js';
import * as T from './vendor/three.module.js';
import {createLadderPaintCorrection} from './ladder-paint.js';
import {createLadderGrip} from './ladder-grip.js';
import {createBattlePosture} from './battle-posture.js';
import {holdSkin,disposeAbove} from './skin-holds.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),ease=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
const compiledRoutes=new Map();
// Workers with a live ladder motion. Its gloves take the gripping hand's triangles, positions and weights for their own
// and give them back at dispose, outside the skin hold, so a second ladder made over a live one would save the first's
// glove as the hand and put it back for good if the first were disposed first: one live ladder per worker.
const CLIMBING=new WeakSet();
// Transfer numerical preparation from the background worker without rerunning its solver.
export function exportLadderRoutes(){return [...compiledRoutes].map(([key,r])=>[key,{angles:r.angles,frames:Object.fromEntries(Object.entries(r.frames).map(([id,rows])=>[id,rows.map(f=>({pole:f.pole.toArray(),axis:f.axis.toArray()}))])),timing:r.timing?[...r.timing]:[]}]);}
export function importLadderRoutes(rows){for(const [key,r]of rows){compiledRoutes.set(key,{angles:r.angles,frames:Object.fromEntries(Object.entries(r.frames).map(([id,frames])=>[id,frames.map(f=>({pole:new T.Vector3(...f.pole),axis:new T.Vector3(...f.axis)}))])),timing:new Map(r.timing)});}while(compiledRoutes.size>32)compiledRoutes.delete(compiledRoutes.keys().next().value);}
export function clearLadderRoutes(){compiledRoutes.clear();}
export const LADDER_PRESETS={
 floor:{height:2.12,plane:.35,width:.60,firstRung:.1325,spacing:.265,rungs:8,railTop:3.02},
 tower:{height:6.36,plane:.35,width:.70,firstRung:.22,spacing:.28,rungs:22,railTop:7.29,rungThickness:.06,rungDepth:.08,railThickness:.075}
};
export const WIDE_LADDER_EXIT=.94;
export const ladderRailZ=(d,y,side=1)=>side*T.MathUtils.lerp(d.width,d.exitWidth||d.width,T.MathUtils.clamp((y-d.height)/.35,0,1))/2;
export function ladderRailSegments(d){const ys=d.exitWidth?[0,d.height,d.height+.35,d.railTop]:[0,d.railTop],segments=[];for(const side of [-1,1])for(let i=1;i<ys.length;i++){const a=V(d.plane,ys[i-1],ladderRailZ(d,ys[i-1],side)),b=V(d.plane,ys[i],ladderRailZ(d,ys[i],side));segments.push({a,b});}return segments;}

// Local frame: +X faces the ladder/landing, +Y up, Z spans the rungs. The
// integration owner supplies this frame's world transform and playback time.
export function createLadderMotion(worker,profile,definition=LADDER_PRESETS.floor,{preparedOnly=false}={}){
 if(profile.unarmed)throw new Error('Hen wing contacts are not authored for ladder climbing');
 if(CLIMBING.has(worker))throw new Error('This worker already has a live ladder motion, whose gloves hold its hands: dispose it first');
 const d={...definition,...(definition.hatch?{hatch:{...definition.hatch}}:{})},root=worker.root,bones=worker.bones,named=Object.fromEntries(bones.map(b=>[b.name,b]));
 if(profile.id.startsWith('pig')&&(d.exitWidth||d.width)<WIDE_LADDER_EXIT)throw new Error('Pig climbing requires the authored 0.94-wide flared exit; original narrow handholds do not fit');
 if(!supportsStow(worker.weapon?.id||'rifle'))throw new Error('Unsupported ladder equipment');
 if(d.hatch&&(worker.weapon?.id||'rifle')!=='rifle')throw new Error('Wooden hatch equipment clearance currently supports the rifle only');
 const openGrips=!!(d.hatch||d.exitWidth),entry={position:root.position.clone(),quaternion:root.quaternion.clone()};checkFrame();
 if(!['height','plane','width','firstRung','spacing','rungs','railTop'].every(k=>Number.isFinite(d[k]))||['exitWidth','rungThickness','rungDepth','railThickness','railDepth','landingHandHeight','landingHandSpan','stowSide'].some(k=>d[k]!==undefined&&(!Number.isFinite(d[k])||d[k]<=0))||!(d.height>0&&d.firstRung>=0&&d.spacing>0&&Number.isInteger(d.rungs)&&d.rungs>=6&&d.rungs<=128&&d.width>.4&&(!d.exitWidth||d.exitWidth>=d.width)&&d.railTop>=d.height+.65&&d.firstRung+(d.rungs-1)*d.spacing<d.height))throw new Error('Ladder requires finite rung geometry and upper handholds at least 0.65 above its landing');
 if(d.hatch&&(!['front','back','half'].every(k=>Number.isFinite(d.hatch[k]))||d.hatch.front<=d.plane||d.hatch.back>=d.plane||d.hatch.half<d.width/2))throw new Error('Invalid hatch clearance geometry');
 worker.pose('neutral');root.position.set(0,0,0);root.rotation.set(0,0,0);root.updateMatrixWorld(true);
 const rest=new Map(bones.map(b=>[b,b.getWorldPosition(V())])),saved=worker.parts.map(p=>({p,si:p.geometry.attributes.skinIndex.clone(),sw:p.geometry.attributes.skinWeight.clone()}));
 createBattlePosture(worker,['dog','rabbit'].includes(profile.id)?{...profile,proneAim:{...profile.proneAim,tuckHem:false}}:profile); // Approved hem/pastern corrections only.
 // Preserve the inner sleeve corridor while keeping medial shirt on torso.
 if(['dog','rabbit'].includes(profile.id))for(const part of worker.parts.filter(p=>p.name.includes('shirt'))){const a=part.geometry.attributes;for(let i=0;i<a.position.count;i++){const p=V().fromBufferAttribute(a.position,i),side=p.z<0?-1:1,upper=named['upperArm'+side],lower=named['forearm'+side],axis=rest.get(lower).clone().sub(rest.get(upper)),t=T.MathUtils.clamp(p.clone().sub(rest.get(upper)).dot(axis)/axis.lengthSq(),0,1.2),distance=p.distanceTo(rest.get(upper).clone().addScaledVector(axis,t)),corridor=(1-T.MathUtils.smoothstep(distance,.095,.13))*T.MathUtils.smoothstep(Math.abs(p.z),profile.id==='dog'?.215:.24,profile.id==='dog'?.235:.27);let u=0,l=0;const other=[];for(let j=0;j<4;j++){const b=bones[a.skinIndex.getComponent(i,j)],w=a.skinWeight.getComponent(i,j);if(b===upper)u+=w;else if(b===lower)l+=w;else if(w>0&&b!==named.spine&&b!==named.hips)other.push([a.skinIndex.getComponent(i,j),w]);}const medial=profile.id==='rabbit'?T.MathUtils.smoothstep(Math.abs(p.z),.21,.25):1,total=Math.max((u+l)*medial,corridor),elbow=1-T.MathUtils.smoothstep(p.y,.98,1.06);
  // Weight on any other bone (the collar's on the head, from the character's layer fit) stays as it is.
  if(!other.length){a.skinIndex.setXYZW(i,bones.indexOf(named.spine),bones.indexOf(upper),bones.indexOf(lower),0);a.skinWeight.setXYZW(i,1-total,total*(1-elbow),total*elbow,0);}
  else{const k=1-other.reduce((n,[,x])=>n+x,0),slots=[[bones.indexOf(named.spine),(1-total)*k],[bones.indexOf(upper),total*(1-elbow)*k],[bones.indexOf(lower),total*elbow*k],...other].filter(([,x])=>x>1e-6).sort((x,y)=>y[1]-x[1]).slice(0,4),sum=slots.reduce((n,[,x])=>n+x,0)||1;while(slots.length<4)slots.push([0,0]);a.skinIndex.setXYZW(i,...slots.map(([b])=>b));a.skinWeight.setXYZW(i,...slots.map(([,x])=>x/sum));}}a.skinWeight.needsUpdate=a.skinIndex.needsUpdate=true;}
 // The compact foreman's central rear seat belongs to the pelvis, not one
 // thigh chosen by the sign of a nearly-zero Z coordinate.
 if(profile.id==='pig-foreman')for(const part of worker.parts.filter(p=>p.name.includes('trousers'))){const a=part.geometry.attributes,hip=bones.indexOf(named.hips);for(let i=0;i<a.position.count;i++){const x=a.position.getX(i),y=a.position.getY(i),z=Math.abs(a.position.getZ(i)),blend=(1-T.MathUtils.smoothstep(x,-.18,-.07))*(1-T.MathUtils.smoothstep(z,.025,.11))*T.MathUtils.smoothstep(y,.50,.58)*(1-T.MathUtils.smoothstep(y,.70,.80));if(blend===0)continue;const weights=new Map([[hip,blend]]);for(let j=0;j<4;j++){const k=a.skinIndex.getComponent(i,j);weights.set(k,(weights.get(k)||0)+a.skinWeight.getComponent(i,j)*(1-blend));}const rows=[...weights].filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=rows.reduce((v,[,w])=>v+w,0);while(rows.length<4)rows.push([0,0]);a.skinIndex.setXYZW(i,...rows.map(([k])=>k));a.skinWeight.setXYZW(i,...rows.map(([,w])=>w/sum));}a.skinWeight.needsUpdate=a.skinIndex.needsUpdate=true;}
 // Keep the central belly/seat on the pelvis instead of dragging it with one thigh.
 if(profile.id.startsWith('pig'))for(const part of worker.parts.filter(p=>p.name.includes('trousers'))){const a=part.geometry.attributes,hip=bones.indexOf(named.hips),low=profile.id==='pig-foreman'?.56:.62,high=profile.id==='pig-foreman'?.66:.73;for(let i=0;i<a.position.count;i++){const blend=(1-T.MathUtils.smoothstep(Math.abs(a.position.getZ(i)),.035,.11))*T.MathUtils.smoothstep(a.position.getY(i),low,high);if(!blend)continue;const weights=new Map([[hip,blend]]);for(let j=0;j<4;j++){const k=a.skinIndex.getComponent(i,j);weights.set(k,(weights.get(k)||0)+a.skinWeight.getComponent(i,j)*(1-blend));}const rows=[...weights].filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=rows.reduce((v,[,w])=>v+w,0);while(rows.length<4)rows.push([0,0]);a.skinIndex.setXYZW(i,...rows.map(([k])=>k));a.skinWeight.setXYZW(i,...rows.map(([,w])=>w/sum));}a.skinWeight.needsUpdate=a.skinIndex.needsUpdate=true;}
 // The director's long waistcoat bends over the belly; preserve torso influence
 // at its front instead of pinning the entire lower panel to the pelvis.
 if(profile.id==='pig-director')for(const part of worker.parts.filter(p=>p.name.includes('shirt'))){const a=part.geometry.attributes,spine=bones.indexOf(named.spine);for(let i=0;i<a.position.count;i++){const blend=T.MathUtils.smoothstep(a.position.getX(i),.12,.27)*(1-T.MathUtils.smoothstep(Math.abs(a.position.getZ(i)),.16,.23))*T.MathUtils.smoothstep(a.position.getY(i),.70,.80);if(!blend)continue;const rows=new Map([[spine,blend]]);for(let j=0;j<4;j++){const k=a.skinIndex.getComponent(i,j);rows.set(k,(rows.get(k)||0)+a.skinWeight.getComponent(i,j)*(1-blend));}const w=[...rows].filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=w.reduce((n,[,v])=>n+v,0);while(w.length<4)w.push([0,0]);a.skinIndex.setXYZW(i,...w.map(([k])=>k));a.skinWeight.setXYZW(i,...w.map(([,v])=>v/sum));}a.skinIndex.needsUpdate=a.skinWeight.needsUpdate=true;}
 const activeSkin=worker.parts.map(p=>({p,si:p.geometry.attributes.skinIndex.clone(),sw:p.geometry.attributes.skinWeight.clone()}));
 const transitionSkin=activeSkin.map((a,i)=>({...a,source:saved[i],mixedSI:a.si.clone(),mixedSW:a.sw.clone()}));
 const paintCorrection=createLadderPaintCorrection(worker,profile);
 const limbs=[],palm=V(.10,-.024,0),contacts={};
 for(const side of [-1,1]){
  const a=named['upperArm'+side],b=named['forearm'+side],c=named['hand'+side];limbs.push({id:'hand'+side,side,a,b,c,offset:palm.clone(),pole:V(-.22,-.5,side*.6),finger:named['fingers'+side]});
  const hip=named['thigh'+side],knee=named['shin'+side],ankle=named['hoof'+side];
  const foot=worker.parts.find(p=>/hoof|boot|foot/.test(p.name)&&p.name.endsWith(' '+side)),pos=foot.geometry.attributes.position;let sole=Infinity;for(let i=0;i<pos.count;i++)sole=Math.min(sole,pos.getY(i));
  let tip=-Infinity,halfWidth=0;for(let i=0;i<pos.count;i++){tip=Math.max(tip,pos.getX(i));halfWidth=Math.max(halfWidth,Math.abs(pos.getZ(i)-rest.get(ankle).z));}
  const offset=V(tip,sole,rest.get(ankle).z).sub(rest.get(ankle)),stance=Math.min(.18,d.width/2-halfWidth-.045);
  limbs.push({id:'foot'+side,side,a:hip,b:knee,c:ankle,offset,stance,pole:V(1,.4,side*.6)});
 }
 for(const l of limbs){if(l.finger&&profile.id==='pig-director'){l.surface=[];for(const part of worker.parts.filter(p=>d.hatch||p.name.includes('shirt'))){const a=part.geometry.attributes;for(let i=0;i<a.position.count;i+=(d.hatch?6:1)){const weights=Array.from({length:4},(_,j)=>({bone:bones[a.skinIndex.getComponent(i,j)],weight:a.skinWeight.getComponent(i,j)})).filter(w=>w.weight>0);if(weights.some(w=>(w.bone===l.a||w.bone===l.b)&&w.weight>.1))l.surface.push({point:V().fromBufferAttribute(a.position,i),weights});}}}l.la=rest.get(l.a).distanceTo(rest.get(l.b));l.lb=rest.get(l.b).distanceTo(rest.get(l.c));contacts[l.id]=rest.get(l.c).clone().add(l.offset);}
 const grips=limbs.filter(l=>l.finger).map(l=>({limb:l,asset:createLadderGrip(worker,l.side,rest.get(l.c).y,{wooden:!!d.hatch,opening:openGrips})}));
 if(d.hatch){
  for(const {limb:l,asset}of grips)asset.update(rest.get(l.c).clone().add(l.offset),new T.Quaternion());
  for(const l of limbs.filter(l=>l.finger||profile.id.startsWith('pig'))){l.surface=[];for(const part of worker.parts){const a=part.geometry.attributes,ids=[...new Set(part.geometry.index.array)];for(let k=0;k<ids.length;k+=3){const i=ids[k],weights=Array.from({length:4},(_,j)=>({bone:bones[a.skinIndex.getComponent(i,j)],weight:a.skinWeight.getComponent(i,j)})).filter(w=>w.weight>0);if(weights.some(w=>(w.bone===l.a||w.bone===l.b)&&w.weight>.1))l.surface.push({point:V().fromBufferAttribute(a.position,i),weights});}}}
  for(const {asset}of grips)asset.restore();
 }
 const equipmentStow=createEquipmentStow(worker,profile,d.hatch?{riflePlacement:{back:profile.id.startsWith('pig')?-.08:-.13,side:profile.id==='skunk'?.34:-.15,axis:[0,1,0],preserveAxisRoll:true}}:profile.id==='skunk'&&d.exitWidth?{riflePlacement:{back:-.13,side:.34,axis:[0,1,0],preserveAxisRoll:true}}:{});
 const phases=[],neutral=structuredClone(Object.fromEntries(Object.entries(contacts).map(([k,v])=>[k,v.toArray()])));
 let state=Object.fromEntries(Object.entries(contacts).map(([k,v])=>[k,{point:v.clone(),kind:k.startsWith('hand')?'free':'floor',index:null}]));
 const rung=(index,side,hand)=>{let y=d.firstRung+index*d.spacing,rail=hand&&(index>=d.rungs||y>d.height-.20);if(rail)y=Math.max(y,d.height+.14);return {point:V(d.plane,y+(hand?0:(d.rungThickness||.055)/2),rail?ladderRailZ(d,y,side):side*(hand?d.width*.36:limbs.find(l=>l.id==='foot'+side).stance)),kind:rail?'rail':'rung',index};};
 const add=(label,id,target,duration=.48)=>{const from=Object.fromEntries(Object.entries(state).map(([k,v])=>[k,{...v,point:v.point.clone()}]));if(id)state[id]=target;phases.push({label,id,from,to:Object.fromEntries(Object.entries(state).map(([k,v])=>[k,{...v,point:v.point.clone()}])),duration});};
 const firstHand=Math.floor((Math.min(rest.get(named['upperArm-1']).y,rest.get(named.upperArm1).y)+.04-d.firstRung)/d.spacing)-(profile.id.startsWith('pig')&&!d.hatch?1:0);
 add('Reach left hand','hand-1',rung(firstHand,-1,true),1.1);add('Reach right hand','hand1',rung(firstHand+1,1,true),1.1);
 add('Mount left foot','foot-1',rung(0,-1,false),1.1);add('Mount right foot','foot1',rung(1,1,false),1.1);
 const fi={'-1':0,'1':1},hi={'-1':firstHand,'1':firstHand+1};
 const lastFoot=d.rungs-(d.height-(d.firstRung+(d.rungs-1)*d.spacing)>.20?1:2);
 while(fi[-1]<lastFoot||fi[1]<lastFoot)for(const side of [-1,1]){
  const next=Math.min(fi[side]+(profile.id.startsWith('pig')?1:2),lastFoot),advance=next-fi[side];if(next===fi[side])continue;
  fi[side]=next;add('Step '+(side===-1?'left':'right'),'foot'+side,rung(next,side,false),.9);
  hi[side]+=advance;const hand=rung(hi[side]+(d.hatch&&profile.id==='pig-director'&&fi[side]>=lastFoot-6?1:0),side,true);hand.point.y=Math.min(hand.point.y,d.hatch?d.height+.77:d.railTop-.005);add('Reach '+(side===-1?'left':'right'),'hand'+side,hand,profile.id.startsWith('pig')?1.5:1.1);
 }
 for(const side of [-1,1])add('Lift '+(side===-1?'left':'right')+' hand to upper hold','hand'+side,{point:V(d.plane,d.hatch?d.height+.77:d.railTop-.005,ladderRailZ(d,d.hatch?d.height+.77:d.railTop-.005,side)),kind:'rail',index:d.rungs+3},1.1);
 if(d.hatch){add('Straighten before hatch exit',null,null,1.4);add('Lean through hatch',null,null,1.4);}
 if(d.hatch)for(const side of [-1,1])add('Brace forward hatch post','hand'+side,{point:V(d.hatch.front-.02,d.height+.74,side*.58),kind:'rail',index:null},1.1);
 add('Step onto landing','foot1',{point:V((d.hatch?.front??d.plane)+.38,d.height,Math.min(.18,d.width/2-.18)),kind:'landing',index:null},2.0);
 add('Bring left foot through','foot-1',{point:V((d.hatch?.front??d.plane)+(d.hatch?.38:.28),d.height,-Math.min(.18,d.width/2-.18)),kind:'landing',index:null},2.0);
 add('Release left hand','hand-1',{point:V((d.hatch?.front??d.plane)+.35+neutral['hand-1'][0],d.height+(d.landingHandHeight??neutral['hand-1'][1]),-(d.landingHandSpan??Math.abs(neutral['hand-1'][2]))),kind:'free',index:null},1.4);
 add('Release right hand','hand1',{point:V((d.hatch?.front??d.plane)+.35+neutral.hand1[0],d.height+(d.landingHandHeight??neutral.hand1[1]),d.landingHandSpan??neutral.hand1[2]),kind:'free',index:null},1);
 let elapsed=0;for(const p of phases){p.start=elapsed;elapsed+=p.duration;p.end=elapsed;}const duration=elapsed;
 const hatchRiseStart=d.hatch?phases.find(p=>p.label==='Straighten before hatch exit').start:0,hatchAdvanceStart=d.hatch?phases.find(p=>p.label==='Lean through hatch').start:0;
 let result=null,disposed=false;const routeAngles={},routeCosts={},routeFrames={},routeSteps=Math.ceil(duration*30),angleStep=Math.PI/36,angleCount=d.hatch?73:61,angleOrigin=(angleCount-1)/2;let bakingFrame=-1;
 function checkFrame(){root.parent?.updateMatrixWorld(true);if(root.scale.distanceTo(V(1,1,1))>1e-8||(root.parent&&!root.parent.matrixWorld.elements.every((v,i)=>Math.abs(v-(i%5===0?1:0))<1e-8)))throw new Error('Ladder motion requires an unscaled actor under an identity scene parent; use origin and heading');}
 function worldRotation(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));root.updateMatrixWorld(true);}
 const rails=ladderRailSegments(d).map(({a,b})=>{const axis=b.clone().sub(a),length=axis.length();return {center:a.clone().add(b).multiplyScalar(.5),axis:axis.normalize(),length};});
 const hatchBoxes=[];if(d.hatch){const f=d.hatch.front,b=d.hatch.back,box=(x,y,z,w,h,l)=>hatchBoxes.push([x,y,z,w/2,h/2,l/2]);for(const side of [-1,1]){for(const y of [.47,.91])box((f+b)/2,d.height+y,side*.58,1.04,.085,.085);for(const x of [f-.02,b+.02])box(x,d.height+.46,side*.58,.085,.92,.085);box((f+b)/2,d.height-.15,side*.58,1.12,.18,.16);box((f+b)/2,d.height-.055,side*1.5,1,.11,2);}if(profile.id.startsWith('pig'))for(const y of [1.97,4.09,6.21])box(d.plane+.19,y,0,.18,.18,2.9);for(const y of [.47,.91])box(b+.02,d.height+y,0,.085,.085,1.16);for(const [x,len]of [[f+1.875,3.75],[b-.125,.25]])box(x,d.height-.055,0,len,.11,5);}
 function railDistance(p){let distance=Infinity;for(const {center,axis,length}of rails){const dy=p.y-center.y,dz=p.z-center.z,x=Math.abs(p.x-d.plane)-(d.railDepth||d.railThickness||.07)/2,y=Math.abs(dy*axis.y+dz*axis.z)-length/2,z=Math.abs(-dy*axis.z+dz*axis.y)-(d.railThickness||.07)/2;distance=Math.min(distance,Math.hypot(Math.max(0,x),Math.max(0,y),Math.max(0,z))+Math.min(Math.max(x,y,z),0));}for(const q of hatchBoxes){const x=Math.abs(p.x-q[0])-q[3],y=Math.abs(p.y-q[1])-q[4],z=Math.abs(p.z-q[2])-q[5];distance=Math.min(distance,Math.hypot(Math.max(0,x),Math.max(0,y),Math.max(0,z))+Math.min(Math.max(x,y,z),0));}return distance;}
 function routeJoint(l,start,target,circle,pole,radius,axis,time){
  const preferred=pole.clone(),frames=routeFrames[l.id]??=[];
  const frame=bakingFrame>=0?bakingFrame:Math.min(routeSteps,Math.floor(time/duration*routeSteps));
  if(bakingFrame>=0){if(frame){const previous=frames[frame-1];pole=previous.pole.clone().applyQuaternion(new T.Quaternion().setFromUnitVectors(previous.axis,axis));}frames[frame]={pole:pole.clone(),axis:axis.clone()};}
  else{const previous=frames[frame];pole=previous.pole.clone().applyQuaternion(new T.Quaternion().setFromUnitVectors(previous.axis,axis));}
  const tangent=axis.clone().cross(pole),leg=l.id.startsWith('foot');
  const candidate=angle=>circle.clone().addScaledVector(pole,radius*Math.cos(angle)).addScaledVector(tangent,radius*Math.sin(angle));
  // Non-arm contributions are constant across all candidate elbow bends.
  // Resolve them once per frame rather than recursively updating the rig for
  // every vertex in every candidate. The scored painted surface is unchanged.
  const restA=rest.get(l.b).clone().sub(rest.get(l.a)).normalize(),restB=rest.get(l.c).clone().sub(rest.get(l.b)).normalize();
  const surface=l.surface&&(d.hatch?start.y>d.height-.4:time>phases.at(-4).start)?l.surface.map(vertex=>{
   const row={a:V(),aw:0,b:V(),bw:0,fixed:V()};for(const {bone,weight}of vertex.weights){const v=vertex.point.clone().sub(rest.get(bone));if(bone===l.a){row.a.addScaledVector(v,weight);row.aw+=weight;}else if(bone===l.b){row.b.addScaledVector(v,weight);row.bw+=weight;}else{if(d.hatch&&bone===l.c)v.applyQuaternion(l.currentQuaternion).add(target);else bone.localToWorld(v);row.fixed.addScaledVector(v,weight);}}return row;
  }):null;
  function score(angle){const mid=candidate(angle);let cost=(1-preferred.dot(pole.clone().multiplyScalar(Math.cos(angle)).addScaledVector(tangent,Math.sin(angle))))*.0003;
   for(const [a,b,thickness,end]of [[start,mid,leg?.15:profile.id==='sheep'?.23:profile.id==='dog'?.22:.20,1],[mid,target,leg?.10:profile.id.startsWith('pig')?.20:.13,leg?.85:1]])for(let u=.1;u<=end+.001;u+=.1){const p=a.clone().lerp(b,u);cost+=40*Math.max(0,(b===target&&!leg?T.MathUtils.lerp(thickness,.055,T.MathUtils.smoothstep(u,.8,1)):thickness)-railDistance(p))**2;
    if(leg&&p.x>d.plane-.15&&p.x<d.plane+1.5&&p.y>d.height-.12-thickness&&p.y<d.height+thickness)cost+=60*Math.max(0,Math.min(p.x-d.plane+.15,d.height+thickness-p.y))**2;
   }
   if(surface){const qa=new T.Quaternion().setFromUnitVectors(restA,mid.clone().sub(start).normalize()),qb=new T.Quaternion().setFromUnitVectors(restB,target.clone().sub(mid).normalize());for(const vertex of surface){const p=vertex.a.clone().applyQuaternion(qa).addScaledVector(start,vertex.aw).add(vertex.b.clone().applyQuaternion(qb)).addScaledVector(mid,vertex.bw).add(vertex.fixed);cost+=(d.hatch?2000:200)*Math.max(0,(d.hatch?.025:.008)-railDistance(p))**2;}}
   return cost;
  }
  let angle=0;
  if(bakingFrame>=0){const costs=new Float64Array(angleCount);for(let j=0;j<angleCount;j++)costs[j]=score((j-angleOrigin)*angleStep);(routeCosts[l.id]??=[])[bakingFrame]=costs;}
  else{const frame=T.MathUtils.clamp(time/duration*routeSteps,0,routeSteps),i=Math.floor(frame),path=routeAngles[l.id];angle=T.MathUtils.lerp(path[i],path[Math.min(i+1,routeSteps)],frame-i);}
  l.routeAngle=angle;return candidate(angle);
 }
 function applyPose(progress,{direction='up',heading=0,origin=[0,0,0]}={}){
  if(disposed)throw new Error('Ladder motion is disposed');held();checkFrame();
  if(!supportsStow(worker.weapon?.id||'rifle'))throw new Error('Unsupported ladder equipment');
  if(d.hatch&&(worker.weapon?.id||'rifle')!=='rifle')throw new Error('Wooden hatch equipment clearance currently supports the rifle only');
  if(!Number.isFinite(progress)||!Number.isFinite(heading)||!Array.isArray(origin)||origin.length!==3||!origin.every(Number.isFinite)||!['up','down'].includes(direction))throw new Error('Invalid ladder playback transform');
  const value=T.MathUtils.clamp(progress,0,1),t=(direction==='down'?1-value:value)*duration,phase=phases.find(p=>t<=p.end)||phases.at(-1),u=ease((t-phase.start)/phase.duration),sample={};
  worker.pose('neutral');for(const {p,si,sw}of activeSkin){p.geometry.setAttribute('skinIndex',si);p.geometry.setAttribute('skinWeight',sw);}paintCorrection.set(true);root.rotation.set(0,0,0);root.position.set(0,0,0);
  const mounted=ease(t/1.1)*(1-ease((t-(duration-1))/1)),heavy=profile.id.startsWith('pig'),upperBody=d.hatch&&heavy?T.MathUtils.smoothstep((T.MathUtils.lerp(phase.from['foot-1'].point.y,phase.to['foot-1'].point.y,u)+T.MathUtils.lerp(phase.from.foot1.point.y,phase.to.foot1.point.y,u))/2,d.height-1.8,d.height-1.1):0;named.hips.rotation.z=(heavy?-.12*(1-upperBody):.04)*mounted;named.spine.rotation.z=(heavy?-.13*(1-upperBody)-(profile.id==='pig-director'?.10*upperBody:0):.045)*mounted;named.head.rotation.z=-.10*mounted;named.head.rotation.y=(heavy?-.70*(1-(d.hatch?T.MathUtils.smoothstep(upperBody,.10,.45):0)):-.45)*mounted;
  if(profile.id==='skunk')named.hips.rotation.y=-.14*ease((t-phases.at(-4).start)/(duration-phases.at(-4).start));
  const swing=Math.sin(Math.PI*u);named.spine.rotation.x=(phase.id?.endsWith('-1')?-.035:.035)*swing*mounted;root.updateMatrixWorld(true);
  for(const [id,a]of Object.entries(phase.from)){
   const b=phase.to[id],point=a.point.clone().lerp(b.point,u),moving=id===phase.id;
   if(moving&&id.startsWith('foot')&&b.kind==='landing'){
    // Lift behind the lip first; crossing and lowering happen above the deck.
    const retract=ease(u/.20),lift=ease((u-.15)/.40),cross=ease((u-.55)/.35),clear=Math.max(a.point.y,b.point.y)+.06;
    point.x=T.MathUtils.lerp(a.point.x-.24*retract,b.point.x,cross);
    point.y=u<.55?T.MathUtils.lerp(a.point.y,clear,lift):T.MathUtils.lerp(clear,b.point.y,ease((u-.90)/.10));
    point.z+=(id.endsWith('-1')?-1:1)*.06*swing*(1-T.MathUtils.smoothstep(u,.35,.65));
    }else if(moving&&id.startsWith('hand')&&b.kind==='free'&&d.hatch){
    // Leave the post inward, beneath the upper rail, before returning to carry.
    const inward=ease((u-.15)/.30),forward=ease((u-.45)/.55);
    point.z=T.MathUtils.lerp(a.point.z,b.point.z,inward);
    point.x=T.MathUtils.lerp(a.point.x,b.point.x,forward);
    point.y=T.MathUtils.lerp(a.point.y,b.point.y,forward);
   }else if(moving&&id.startsWith('hand')&&d.hatch&&b.kind==='rail'&&b.point.x>d.plane+.1){
    // Open at the stile, pass above the enclosure, lower inside it, then
    // approach the forward post from its inner face before closing fingers.
    const cross=ease((u-.50)/.15),lower=ease((u-.65)/.15),seat=ease((u-.80)/.12),side=id.endsWith('-1')?-1:1;
    point.x=T.MathUtils.lerp(a.point.x-.10*ease((u-.15)/.10),b.point.x,cross);
    point.y=u<.50?T.MathUtils.lerp(a.point.y,d.railTop+.16,ease((u-.35)/.15)):T.MathUtils.lerp(d.railTop+.16,b.point.y,lower);
    point.z=T.MathUtils.lerp(a.point.z-side*.20*ease((u-.25)/.10),b.point.z-side*.20,cross)+side*.20*seat;

   }else if(moving&&id.startsWith('hand')&&(b.kind==='free'||d.hatch&&b.kind==='rail'&&b.point.x>d.plane+.1)){
    const clear=d.railTop+.12,cross=ease((u-.35)/.40);
    point.x=T.MathUtils.lerp(a.point.x-.08*ease((u-(openGrips?.15:0))/(openGrips?.20:.25)),b.point.x,cross);
    if(openGrips)point.z=T.MathUtils.lerp(a.point.z,b.point.z,cross);
    point.y=u<.4?T.MathUtils.lerp(a.point.y,clear,ease((u-(openGrips?.15:0))/(openGrips?.25:.4))):T.MathUtils.lerp(clear,b.point.y,ease((u-.60)/.40));
   }else if(moving){const opening=openGrips&&id.startsWith('hand'),travel=ease((u-(opening?.27:.20))/(opening?.46:.60)),withdraw=opening?ease((u-.12)/.15)*(1-ease((u-.73)/.15)):ease(u/.20)*(1-ease((u-.80)/.20));point.copy(a.point).lerp(b.point,travel);point.x-=(id.startsWith('foot')?.25:.23)*withdraw;if(d.hatch&&id.startsWith('hand')&&a.kind==='rail'&&b.kind==='rail')point.z-=(id.endsWith('-1')?-1:1)*.11*withdraw;point.y+=.035*Math.sin(Math.PI*travel);}
   const kind=moving?(u===0?a.kind:u===1?b.kind:'swing'):a.kind;
   const wrist=(kind,y,x)=>{const q=new T.Quaternion().setFromAxisAngle(V(1,0,0),kind==='rail'?(id.endsWith('-1')?-1:1)*(Math.PI/2+(d.exitWidth&&y>d.height&&y<d.height+.35?Math.atan((d.exitWidth-d.width)/.7):0)):0);if(kind==='rail'&&d.hatch&&x>d.plane+.1)q.premultiply(new T.Quaternion().setFromAxisAngle(V(0,1,0),(id.endsWith('-1')?1:-1)*Math.PI/2));if(kind==='rail'&&!openGrips)q.premultiply(new T.Quaternion().setFromAxisAngle(V(0,1,0),(id.endsWith('-1')?-1:1)*Math.PI*ease((t-phases.at(-4).start)/4)));return q;};
   sample[id]={gripSurfaces:[a,b].filter(c=>c.kind==='rung'||c.kind==='rail').map(c=>({kind:c.kind,index:c.index,point:c.point.toArray()})),point,kind,index:u<.5?a.index:b.index,planted:kind!=='free'&&(!moving||u===0||u===1),quaternion:wrist(a.kind,a.point.y,a.point.x).slerp(wrist(b.kind,b.point.y,b.point.x),moving?(openGrips?(!d.hatch&&b.kind==='free'?ease((u-.45)/.40):ease((u-.27)/.46)):u):0),grasp:openGrips&&moving&&id.startsWith('hand')?(a.kind==='free'?ease((u-.92)/.08):b.kind==='free'?1-ease(u/.15):1-ease(u/.15)*(1-ease((u-.92)/.08))):a.kind==='free'?moving?u:0:b.kind==='free'?1-u:1};
  }
  const feet=[sample['foot-1'].point,sample.foot1.point],pigHatchX=T.MathUtils.lerp(-.14,-.085,upperBody)+.19*T.MathUtils.smoothstep((sample['foot-1'].point.y+sample.foot1.point.y)/2-.14,d.height-(profile.id==='pig-foreman'?.87:.99),d.height-(profile.id==='pig-foreman'?.68:.79)),landing=ease((t-phases.at(-4).start)/(duration-phases.at(-4).start));
  const desired=V(T.MathUtils.lerp(d.hatch?T.MathUtils.lerp(heavy?pigHatchX:T.MathUtils.lerp(-.12,.04,T.MathUtils.smoothstep((feet[0].y+feet[1].y)/2,d.height-2,d.height-.7)),.50,ease((t-hatchAdvanceStart)/1.4)):-.12,(d.hatch?.front??d.plane)+(d.hatch?.34:.29),landing),(feet[0].y+feet[1].y)/2-(.14-(d.hatch?.10*ease((t-hatchRiseStart)/1.4):0))*mounted+(heavy?.24*Math.sin(Math.PI*landing):0),(phase.id?.endsWith('-1')?.015:-.015)*swing*mounted);
  const constraints=limbs.map(l=>{const target=sample[l.id].point.clone().sub(l.offset.clone().applyQuaternion(sample[l.id].quaternion)),start=l.a.getWorldPosition(V());return {l,target,center:target.clone().sub(start),radius:(l.la+l.lb)*.992,minRadius:Math.abs(l.la-l.lb)+.015};});
  // Project the pelvis into the intersection of actual limb reach volumes.
  // Targets stay on the authored rung; neither bones nor contact points stretch.
  const position=desired.clone();for(let n=0;n<400;n++){let error=0;for(const c of constraints){const v=position.clone().sub(c.center),len=v.length();if(len>c.radius){position.copy(c.center).addScaledVector(v,c.radius/len);error=Math.max(error,len-c.radius);}else if(len<c.minRadius){position.copy(c.center).addScaledVector(len>1e-8?v.normalize():V(-1,0,0),c.minRadius);error=Math.max(error,c.minRadius-len);}}if(heavy){const clearance=mounted*(1-upperBody)*(1-T.MathUtils.smoothstep(position.y,d.height-.65,d.height-.45)),limit=T.MathUtils.lerp(d.plane+1.2,-.14,clearance);if(position.x>limit){error=Math.max(error,position.x-limit);position.x=limit;}}if(d.hatch&&position.y>d.height-1.2){const minX=T.MathUtils.lerp(heavy?pigHatchX:0,.50,ease((t-hatchAdvanceStart)/1.4));error=Math.max(error,Math.abs(position.z),minX-position.x);position.z=0;position.x=Math.max(position.x,minX);}if(error<1e-8)break;}
  root.position.copy(position);root.updateMatrixWorld(true);const checks=[];
  if(profile.id==='pig-foreman'&&!d.hatch){const y=named.head.getWorldPosition(V()).y,under=T.MathUtils.smoothstep(y,d.height-.70,d.height-.45)*(1-T.MathUtils.smoothstep(y,d.height-.12,d.height+.15));named.head.rotation.y-=.55*under;root.updateMatrixWorld(true);}
  for(const {l,target}of constraints){
   const start=l.a.getWorldPosition(V()),axis=target.clone().sub(start),distance=axis.length(),reach=l.la+l.lb;
   if(distance>reach+1e-5||distance<Math.abs(l.la-l.lb)+1e-7)throw new Error(profile.id+' ladder '+l.id+' outside reach at '+progress.toFixed(4)+' distance '+distance+' range '+Math.abs(l.la-l.lb)+'..'+reach+' phase '+phase.label+' root '+position.toArray()+' target '+target.toArray()+' start '+start.toArray());
   axis.normalize();const along=(l.la*l.la-l.lb*l.lb+distance*distance)/(2*distance),pole=l.pole.clone().addScaledVector(axis,-l.pole.dot(axis)).normalize(),circle=start.clone().addScaledVector(axis,along),radius=Math.sqrt(Math.max(0,l.la*l.la-along*along));
   // Turn a high knee outward before it enters the ladder/deck plane.
   // The joint stays on its exact two-bone circle, so this cannot stretch a leg.
   if(l.id.startsWith('foot')){
    const forward=V(1,0,0).addScaledVector(axis,-axis.x),projection=forward.length();
    if(projection>1e-6&&radius>1e-6){forward.divideScalar(projection);const foot=sample[l.id].point,release=Math.max(T.MathUtils.smoothstep(circle.y-radius,d.height+.02,d.height+.20),T.MathUtils.smoothstep(foot.y,d.height-.16,d.height)*T.MathUtils.smoothstep(foot.x,d.plane-.08,d.plane+.24)),limit=T.MathUtils.clamp((d.plane-.18+.98*release-circle.x)/(radius*projection),-1,1),dot=pole.dot(forward);if(dot>limit){const across=axis.clone().cross(forward);if(across.z*l.side<0)across.negate();pole.copy(forward).multiplyScalar(limit).addScaledVector(across,Math.sqrt(1-limit*limit));}}
   }
   l.currentQuaternion=sample[l.id].quaternion;const mid=routeJoint(l,start,target,circle,pole,radius,axis,t);
   worldRotation(l.a,new T.Quaternion().setFromUnitVectors(rest.get(l.b).clone().sub(rest.get(l.a)).normalize(),mid.clone().sub(start).normalize()));
   worldRotation(l.b,new T.Quaternion().setFromUnitVectors(rest.get(l.c).clone().sub(rest.get(l.b)).normalize(),target.clone().sub(mid).normalize()));worldRotation(l.c,sample[l.id].quaternion);if(l.finger)l.finger.rotation.z=1.7*sample[l.id].grasp;
   checks.push({id:l.id,routeAngle:l.routeAngle,...sample[l.id],error:l.c.localToWorld(l.offset.clone()).distanceTo(sample[l.id].point)});
  }
  equipmentStow.apply();
  for(const {limb,asset}of grips)asset.update(sample[limb.id].point.clone().sub(root.position),sample[limb.id].quaternion,1,1-sample[limb.id].grasp);
  root.rotation.y=-heading*Math.PI/180;root.position.copy(position).applyQuaternion(root.quaternion).add(new T.Vector3(...origin));root.updateMatrixWorld(true);worker.skeleton.update();
  result={progress:value,direction,time:t,duration,phase:direction==='up'?phase.label:({'Step onto landing':'Back onto top rung','Bring left foot through':'Step back from landing','Release left hand':'Grip left handhold','Release right hand':'Grip right handhold'}[phase.label]||phase.label.replace('Reach','Lower').replace('Step','Lower foot').replace('Mount','Dismount')),root:position.toArray(),worldRoot:root.position.toArray(),contacts:checks.map(c=>({...c,point:c.point.toArray(),worldPoint:c.point.clone().applyQuaternion(root.quaternion).add(new T.Vector3(...origin)).toArray()})),supported:true};return result;
 }
 // Playback timing is separate from the approved geometric trajectory. Keep
 // route compilation on its original clock. The iron exit retains 0.84s;
 // the wooden hatch reserves time for its additional supported hand transfers.
 const timingMaps=new Map();
 const playbackDuration=6,exitCount=d.hatch?10:4,exitStart=phases.at(-exitCount).start,exitDurations=d.hatch?[.20,.20,.15,.30,.40,.40,.27,.27,.18,.12]:[.27,.27,.18,.12],exitSeconds=exitDurations.reduce((n,x)=>n+x,0);
 let clock=0;const playbackPhases=phases.map((p,i)=>{const seconds=i<phases.length-exitCount?p.duration/exitStart*(6-exitSeconds):exitDurations[i-(phases.length-exitCount)],entry={label:p.label,id:p.id,start:clock,end:clock+seconds,poseStart:p.start,poseEnd:p.end};clock+=seconds;return entry;});playbackPhases.at(-1).end=playbackDuration;
 function apply(progress,options={}){
  const direction=options.direction??'up';if(!Number.isFinite(progress)||!['up','down'].includes(direction))throw new Error('Invalid ladder playback transform');
  const value=T.MathUtils.clamp(progress,0,1),time=value*playbackDuration,pathTime=(direction==='down'?1-value:value)*playbackDuration,phase=playbackPhases.find(p=>pathTime<=p.end)||playbackPhases.at(-1),u=T.MathUtils.clamp((pathTime-phase.start)/(phase.end-phase.start),0,1),map=timingMaps.get(phase.poseStart);
  let fraction=u;if(map){const ramp=.10,travel=u<ramp?u*u/(2*ramp*(1-ramp)):u>1-ramp?1-(1-u)**2/(2*ramp*(1-ramp)):(u-ramp/2)/(1-ramp),distance=travel*map.at(-1);let lo=0,hi=map.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(map[mid]<distance)lo=mid;else hi=mid;}fraction=(lo+(map[hi]===map[lo]?0:(distance-map[lo])/(map[hi]-map[lo])))/(map.length-1);if(u===1)fraction=1;}
  const poseTime=T.MathUtils.lerp(phase.poseStart,phase.poseEnd,fraction),poseProgress=poseTime/duration;
  const pose=applyPose(direction==='down'?1-poseProgress:poseProgress,options);
  Object.assign(pose,{progress:value,time,duration:playbackDuration,poseTime});return pose;
 }
 // Blend the temporary glove and shirt weights into an already posed
 // handoff. This preserves the ordinary actor at zero and the climb at one.
 function transition(amount){
  if(disposed)throw new Error('Ladder motion is disposed');held();if(!Number.isFinite(amount))throw new Error('Invalid ladder transition amount');
  const w=T.MathUtils.clamp(amount,0,1);paintCorrection.set(w);
  for(const {p,si,sw,source,mixedSI,mixedSW}of transitionSkin){
   if(w===0){p.geometry.setAttribute('skinIndex',source.si);p.geometry.setAttribute('skinWeight',source.sw);continue;}
   if(w===1){p.geometry.setAttribute('skinIndex',si);p.geometry.setAttribute('skinWeight',sw);continue;}
   for(let i=0;i<si.count;i++){const weights=new Map();for(let j=0;j<4;j++){const a=source.si.getComponent(i,j),b=si.getComponent(i,j);weights.set(a,(weights.get(a)||0)+source.sw.getComponent(i,j)*(1-w));weights.set(b,(weights.get(b)||0)+sw.getComponent(i,j)*w);}const rows=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=rows.reduce((n,r)=>n+r[1],0);while(rows.length<4)rows.push([0,0]);mixedSI.setXYZW(i,...rows.map(r=>r[0]));mixedSW.setXYZW(i,...rows.map(r=>r[1]/sum));}mixedSI.needsUpdate=mixedSW.needsUpdate=true;p.geometry.setAttribute('skinIndex',mixedSI);p.geometry.setAttribute('skinWeight',mixedSW);
  }
  for(const {limb,asset}of grips){const point=root.worldToLocal(limb.c.localToWorld(limb.offset.clone())),quaternion=root.getWorldQuaternion(new T.Quaternion()).invert().multiply(limb.c.getWorldQuaternion(new T.Quaternion()));asset.update(point,quaternion,w,openGrips?1:0);}
  root.updateMatrixWorld(true);worker.skeleton.update();
 }
 // The worker's own weights, as saved before the ladder corrected them. Disposing puts them back through the skin hold
 // (skin-holds.js): at once, or after a controller made later that holds the skin too (the idle), and built its own on
 // the ladder's, is disposed as well. The gloves come off at dispose either way (reset). While such a controller holds
 // the skin, the ladder may not put its weights on again.
 const putBack=()=>{for(const {p,si,sw}of saved){p.geometry.setAttribute('skinIndex',si);p.geometry.setAttribute('skinWeight',sw);}};
 let hold=null;const held=()=>{if(hold&&!hold.top)throw new Error('Ladder motion cannot put its weights on while the skin is held by '+disposeAbove(hold));};
 // Off the ladder: the sling, the gloves and the paint come off; with `skin`, the worker's own weights go back on; with
 // `pose`, the worker stands in `mode` at the entry. Disposed under a controller made later that holds the skin (the
 // idle), the pose and the root are that controller's, and are left alone.
 function reset(mode,skin,pose=true){equipmentStow.restore();if(pose){root.position.set(0,0,0);root.rotation.set(0,0,0);}for(const {asset}of grips)asset.restore();if(skin)putBack();if(pose)worker.pose(mode);paintCorrection.set(false);if(pose){root.position.copy(entry.position);root.quaternion.copy(entry.quaternion);}result=null;root.updateMatrixWorld(true);worker.skeleton.update();}
 function restore(mode='carry'){if(disposed)throw new Error('Ladder motion is disposed');held();reset(mode,true);}
 // Solve the bend routes across the whole clip once. Adjacent samples may
 // move at most five degrees: a locally cheaper elbow solution cannot snap
 // across the rail when a contact is released. Playback still solves exact
 // contacts and rigid bone lengths at the requested time, including scrubbing.
 const routeKey=JSON.stringify([profile.id,d,bones.map(b=>rest.get(b).toArray()),limbs.map(l=>[l.offset.toArray(),l.stance])]),cached=compiledRoutes.get(routeKey);
 try{
 if(!cached&&preparedOnly)throw Error('Prepared ladder route does not match this rig');
 if(cached){Object.assign(routeAngles,cached.angles);Object.assign(routeFrames,cached.frames);}else{
 for(let frame=0;frame<=routeSteps;frame++){bakingFrame=frame;applyPose(frame/routeSteps);}
 bakingFrame=-1;
 for(const l of limbs){
  const rows=routeCosts[l.id],backtrack=[];let previous=rows[0].slice();
  for(let i=1;i<=routeSteps;i++){const next=new Float64Array(angleCount),back=new Uint8Array(angleCount);
   for(let j=0;j<angleCount;j++){let best=Infinity;for(let k=Math.max(0,j-1);k<=Math.min(angleCount-1,j+1);k++){const cost=previous[k]+(j-k)**2*.00001;if(cost<best){best=cost;back[j]=k;}}next[j]=best+rows[i][j];}previous=next;backtrack.push(back);
  }
  let j=previous.indexOf(Math.min(...previous));const path=new Float64Array(routeSteps+1);for(let i=routeSteps;i>=0;i--){path[i]=(j-angleOrigin)*angleStep;if(i)j=backtrack[i-1][j];}routeAngles[l.id]=path;delete routeCosts[l.id];
 }
 compiledRoutes.set(routeKey,{angles:routeAngles,frames:routeFrames});if(compiledRoutes.size>32)compiledRoutes.delete(compiledRoutes.keys().next().value);
 }
 // Retiming follows the exact already-solved pose curve. Translation, wrist
 // rotation and finger opening all contribute, so a planted opening/closing
 // interval cannot disappear just because its wrist has not moved.
 const storedTiming=compiledRoutes.get(routeKey)?.timing;if(storedTiming)for(const [key,map]of storedTiming)timingMaps.set(key,map);
 if(d.hatch&&!storedTiming)for(const phase of phases.filter(p=>/Lift.*upper|Brace forward/.test(p.label))){const map=new Float64Array(257);let previous;for(let i=0;i<map.length;i++){const r=applyPose((phase.start+(phase.end-phase.start)*i/(map.length-1))/duration),l=limbs.find(l=>l.id===phase.id),current={point:l.c.getWorldPosition(V()),q:l.c.getWorldQuaternion(new T.Quaternion()),grasp:r.contacts.find(c=>c.id===l.id).grasp};if(previous)map[i]=map[i-1]+.02*phase.duration/(map.length-1)+current.point.distanceTo(previous.point)+.08*current.q.angleTo(previous.q)+.15*Math.abs(current.grasp-previous.grasp);previous=current;}timingMaps.set(phase.start,map);}
 if(d.hatch)compiledRoutes.get(routeKey).timing=timingMaps;
 reset('neutral',true);
 }catch(error){reset('neutral',true);equipmentStow.dispose();paintCorrection.dispose();for(const {asset}of grips)asset.dispose();putBack();throw error;}
 hold=holdSkin(worker,'ladder motion',putBack);CLIMBING.add(worker);
 return {grips:grips.map(g=>g.asset),duration:playbackDuration,definition:d,phases:playbackPhases.map(p=>({...p})),apply,diagnostics:()=>result,restore,transition,stow:()=>equipmentStow.apply(),stowBlend:w=>equipmentStow.blend(w),syncStow:()=>equipmentStow.sync(),get equipmentState(){return equipmentStow.state;},dispose(){if(disposed)return;disposed=true;CLIMBING.delete(worker);try{reset('neutral',false,hold.top);equipmentStow.dispose();paintCorrection.dispose();for(const {asset}of grips)asset.dispose();}finally{hold.release();}}};
}
