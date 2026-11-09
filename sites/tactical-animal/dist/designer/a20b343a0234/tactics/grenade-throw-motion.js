import * as T from './vendor/three.module.js';
const V=(a=[0,0,0])=>new T.Vector3(...a),Q=()=>new T.Quaternion(),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const blend=(t,a,b)=>smooth((t-a)/(b-a));
const turn=(axis,a)=>Q().setFromAxisAngle(V(axis),a),UP=V([0,1,0]),DEG=Math.PI/180;
// FM 3-23.30 standing throw: pull the pin with the free hand, turn side-on with the grenade shoulder high and
// the free hand pointing at the target, throw overhand so it arcs, and let the arm follow through.
export const GRENADE_THROW={duration:4.6,pin:.50,drop:.70,plant:1.60,release:1.92,lever:1.945,gravity:9.81,target:5};
export const GRENADE_KEYS=[{time:.46,label:'Pull pin'},{time:1.24,label:'Turn & load'},{time:1.60,label:'Plant'},{time:1.92,label:'Release'},{time:2.14,label:'Follow through'},{time:3.90,label:'Recover'}];
const PHASES=[[.30,'Ready'],[.72,'Pull pin'],[1.24,'Turn & load'],[1.60,'Stride'],[1.92,'Throw'],[2.12,'Follow through'],[3.85,'Recover'],[Infinity,'Watch']];
// Quintic Hermite through [t,...values] rows, continuous to the acceleration (a cubic's acceleration steps at
// every key, which reads as a jolt of force). Slopes are Catmull-Rom, limited so a channel never overshoots its
// keys (flat at extremes and at the ends); key accelerations come from the neighbouring slopes; pins fixes a slope.
function track(rows,pins={}){
 const keys=rows.map(([t,...p])=>({t,p})),n=keys.length;
 keys.forEach((k,i)=>{const a=keys[i-1],b=keys[i+1];k.v=pins[i]||k.p.map((x,j)=>{if(!a||!b)return 0;const l=(x-a.p[j])/(k.t-a.t),r=(b.p[j]-x)/(b.t-k.t);if(l*r<=0)return 0;const m=(b.p[j]-a.p[j])/(b.t-a.t);return Math.sign(m)*Math.min(Math.abs(m),3*Math.abs(l),3*Math.abs(r));});});
 keys.forEach((k,i)=>{k.a=k.p.map((x,j)=>i&&i<n-1?(keys[i+1].v[j]-keys[i-1].v[j])/(keys[i+1].t-keys[i-1].t):0);});
 return t=>{let i=1;while(i<n-1&&t>keys[i].t)i++;const a=keys[i-1],b=keys[i],dt=b.t-a.t,u=clamp((t-a.t)/dt),u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;
  const h0=1-10*u3+15*u4-6*u5,h1=u-6*u3+8*u4-3*u5,h2=.5*u2-1.5*u3+1.5*u4-.5*u5,h3=.5*u3-u4+.5*u5,h4=-4*u3+7*u4-3*u5,h5=10*u3-15*u4+6*u5;
  return a.p.map((x,j)=>h0*x+h5*b.p[j]+dt*(h1*a.v[j]+h4*b.v[j])+dt*dt*(h2*a.a[j]+h3*b.a[j]));};
}
const logq=q=>{const w=clamp(q.w,-1,1),s=Math.sqrt(1-w*w);return s<1e-9?V():V([q.x,q.y,q.z]).multiplyScalar(2*Math.acos(w)/s);};
const expq=r=>{const a=r.length();return a<1e-12?Q():Q().setFromAxisAngle(r.clone().divideScalar(a),a);};
// Orientation keys joined by cubic rotation-vector segments: angular velocity flows through a key unless the
// rotation reverses there, so a wrist can snap through release instead of stopping on a pose.
function spinTrack(rows){
 const keys=rows.map(([t,q])=>({t,q:q.clone().normalize()}));for(let i=1;i<keys.length;i++)if(keys[i].q.dot(keys[i-1].q)<0)keys[i].q.set(-keys[i].q.x,-keys[i].q.y,-keys[i].q.z,-keys[i].q.w);
 const d=keys.slice(1).map((k,i)=>logq(k.q.clone().multiply(keys[i].q.clone().invert())));
 keys.forEach((k,i)=>{if(!i||i===keys.length-1){k.w=V();return;}const a=d[i-1].clone().divideScalar(k.t-keys[i-1].t),b=d[i].clone().divideScalar(keys[i+1].t-k.t);k.w=a.dot(b)<=0?V():a.add(b).multiplyScalar(.5);});
 return t=>{let i=1;while(i<keys.length-1&&t>keys[i].t)i++;const a=keys[i-1],b=keys[i],dt=b.t-a.t,u=clamp((t-a.t)/dt),u2=u*u,u3=u2*u;
  return expq(d[i-1].clone().multiplyScalar(3*u2-2*u3).addScaledVector(a.w,dt*(u3-2*u2+u)).addScaledVector(b.w,dt*(u3-u2))).multiply(a.q);};
}
// A hand basis from its thumb-side (+X) and wrist-ward (+Y) directions.
const hand=(x,y)=>{const Y=V(y).normalize(),X=V(x).addScaledVector(Y,-V(x).dot(Y)).normalize();return Q().setFromRotationMatrix(new T.Matrix4().makeBasis(X,Y,X.clone().cross(Y)));};
const arcDir=(az,el,side=1)=>V([Math.cos(el)*Math.cos(az),Math.sin(el),side*Math.cos(el)*Math.sin(az)]);
// A hand laid along a direction: fingers along it, palm facing as asked (the left palm is +Z, the right -Z).
const along=(dir,palmFacing,side)=>{const Y=V(dir).normalize().negate(),Z=V(palmFacing).multiplyScalar(-side).addScaledVector(Y,-V(palmFacing).multiplyScalar(-side).dot(Y)).normalize();return hand(Y.clone().cross(Z).toArray(),Y.toArray());};
const trunkQ=(yaw,flex,lean)=>turn([0,1,0],yaw).multiply(turn([1,0,0],-lean)).multiply(turn([0,0,1],-flex));
// Pelvis height, yaw (negative turns the throwing side back), forward tilt and lean to the free side. Its
// horizontal path is not keyed: the balance planner below places it. The hips spin up and brake while both
// hooves are down and turn at a steady rate on one hoof (a single sole can barely twist the body).
const pelvisAt=track([
 [0,0,0,0,0],[.30,-.015,0,.02,0],[.50,-.022,-.01,.02,.005],[.66,-.035,-.08,.02,.01],[.84,-.058,-.30,.02,.02],[.92,-.06,-.50,.025,.015],
 [1.00,-.06,-.70,.03,.005],[1.07,-.06,-.875,.035,-.005],[1.14,-.06,-1.05,.04,-.015],[1.30,-.065,-1.13,.04,-.03],[1.48,-.07,-1.10,.03,-.03],
 [1.60,-.07,-1.02,.03,-.02],[1.72,-.066,-.72,.04,.01],[1.84,-.06,-.30,.05,.05],[1.92,-.056,-.06,.06,.06],[2.05,-.07,.14,.12,.05],
 [2.20,-.085,.24,.22,.03],[2.40,-.088,.24,.20,.02],[2.60,-.065,.20,.12,0],[2.85,-.05,.10,.06,0],[3.10,-.042,.05,.04,0],[3.28,-.036,.03,.03,0],
 [3.45,-.03,.015,.02,0],[3.85,0,0,0,0]]);
// Upper trunk relative to the pelvis: the shoulders stay closed while the hips start to open (separation),
// then rotate, tilt forward and toward the free side so the arm comes over the top.
const chestAt=track([
 [0,0,0,0],[.30,0,.04,0],[.70,0,.04,0],[1.00,-.20,-.02,-.05],[1.20,-.36,-.06,-.10],[1.60,-.45,-.07,-.12],
 [1.72,-.46,-.05,-.08],[1.80,-.36,-.01,.04],[1.88,-.18,.05,.17],[1.92,-.08,.08,.22],[2.05,.08,.20,.20],[2.20,.16,.34,.12],
 [2.45,.18,.30,.05],[2.80,.06,.14,0],[3.20,.02,.05,0],[3.70,0,0,0]]);
// Throwing palm on arcs about the shoulder, in the chest frame: [t, azimuth (0 forward, 90 out to the side),
// elevation, reach] in degrees and metres. Reach stays inside the arm, so the elbow never locks or snaps.
// The release key is solved from the target: the hand passes over the throwing shoulder with the elbow still
// bent, the elbow finishes extending about 40 ms later, and the arm sweeps forward and down across the body.
const RELEASE_ARC=[92,60,.40];
const rightArcRows=[[0,-26,-18,.36],[.30,-26,-18,.36],[.45,-27,-17,.355],[.62,-27,-16,.355],[.78,-25,-14,.355],[.95,30,12,.30],[1.10,95,40,.33],
 [1.22,125,45,.37],[1.45,128,45,.37],[1.60,132,43,.375],[1.72,150,32,.36],[1.80,148,40,.37],[1.86,128,52,.40],null,[1.96,72,60,.47],[2.02,60,56,.47],[2.10,46,46,.47],
 [2.22,26,24,.475],[2.40,0,-12,.48],[2.62,-10,-40,.47],[2.85,0,-52,.46],[3.10,30,-56,.45],[3.70,43.5,-64.6,.508]];
// Elbow direction (chest frame); the closing key is the rest pose's own elbow, added once the rig is known.
const rightPoleRows=[[0,-.25,-.75,.6],[.78,-.25,-.7,.65],[1.0,-.25,-.35,.9],[1.22,-.3,-.25,.92],[1.60,-.3,-.25,.92],[1.72,0,-.3,.95],[1.84,.25,-.35,.9],[1.92,.2,-.55,.8],[2.05,.3,-.3,.9],[2.30,.5,.1,.85],[2.70,.1,-.5,.8]];
// Palm down at the chest, so the ring lies flat on top of the fist where the free hand can hook it.
const rightHand=spinTrack([[0,hand([0,0,-1],[-1,0,0])],[.62,hand([0,.15,-1],[-1,0,0])],[.80,hand([0,.6,-.8],[-1,0,0])],
 [1.05,hand([0,.4,-.9],[-.5,-.85,0])],[1.22,hand([0,0,-1],[0,-1,0])],[1.60,hand([0,0,-1],[.1,-1,0])],[1.74,hand([0,0,-1],[.45,-.9,0])],[1.86,hand([0,0,-1],[-.15,-1,0])],
 [1.98,hand([-.1,0,-1],[-.75,-.65,0])],[2.14,hand([-.4,-.3,-.85],[-.6,.2,.3])],[2.32,hand([-.5,-.2,-.8],[-.25,.9,.3])],[2.75,hand([.4,-.1,-.9],[0,1,.1])],[3.70,hand([1,0,0],[0,1,0])]]);
// The free hand: index finger in the ring, a twist toward the body, a pull along the pin, the ring dropped.
const RING_CENTER=V([.026,.049,.017]),LEVER_CENTER=V([.015,.011,0]),HOOK=V([.030,-.070,0]),LEFT_IN_RING=hand([0,-1,-.5],[0,-.5,1]);
const twistAt=t=>-.75*blend(t,.30,.40),pullAt=t=>.045*blend(t,.40,GRENADE_THROW.pin);
// Then the free WRIST on arcs about its shoulder (it holds nothing once the ring is dropped): it points along the
// throwing line, fingers joined and a little above level, reach .497 of .505 leaving the elbow about 20 degrees soft,
// and tucks to the side.
const leftArcRows=[[.90,40,10,.38],[1.12,84,26,.497],[1.62,86,28,.497],[1.74,70,20,.45],[1.86,35,-30,.30],[1.98,20,-45,.26],[2.30,15,-50,.27],[2.70,30,-62,.42],[3.70,54.8,-67.8,.485]];
const leftPoleRows=[[1.12,0,-1,-.3],[1.62,0,-1,-.3],[1.86,-.7,-.6,-.35],[2.30,-.7,-.6,-.35]];
const POINT=along(arcDir(85*DEG,27*DEG,-1).toArray(),[0,-1,0],-1),TUCK=hand([0,1,0],[-1,0,0]);
const leftHandRows=[[1.12,POINT],[1.62,POINT],[1.86,TUCK],[2.30,TUCK],[3.70,hand([1,0,0],[0,1,0])]];
// Finger curl (negative closes): the grip opens through release; the free hand hooks, lets go, points, tucks.
const curl=(side,t)=>side===1?(-.9+.82*blend(t,GRENADE_THROW.release-.025,GRENADE_THROW.release+.05))*(1-blend(t,2.7,3.6)):(-.25-.45*blend(t,.18,.30)+.62*blend(t,.66,.74)-.42*blend(t,1.80,1.95))*(1-blend(t,2.8,3.6));
// Hooves: steps between plants, and the rear hoof's pivot on its toe as the hips drive through: the heel lifts and
// the hoof rolls a little onto its inner edge (the knee drops in), so one inner corner carries it and stays put.
const STEPS={1:[{t0:.84,t1:1.14,to:[-.23,.05],yaw:-1.35,lift:.05},{t0:1.64,t1:2.10,pivot:true,yaw:-.50,pitch:.55,roll:.09},{t0:2.10,t1:2.55,to:[-.035,.232],yaw:0,lift:.07}],
 '-1':[{t0:1.30,t1:1.60,to:[.16,-.03],yaw:-.15,lift:.085},{t0:3.10,t1:3.45,to:[-.035,-.232],yaw:0,lift:.055}]};
// Where the hooves are asked to push, [t, x, z]: between both hooves, on the stance sole while the other swings,
// gliding hoof to hoof in double support. Sole centres sit .042 ahead of the ankle. The planner adds a small
// push toward the stepping hoof before the first step (the anticipatory shift of gait initiation) and a
// matching settle at the end, sized so the body starts and ends at rest.
const COP=[[0,.007,0],[.30,.007,0],[.84,.007,-.17],[1.14,.007,-.21],[1.30,-.221,.091],[1.60,-.20,.091],[1.78,.19,-.024],[2.10,.21,-.024],
 [2.55,.20,-.024],[3.10,.007,.17],[3.45,.007,.18],[3.85,.007,0],[4.6,.007,0]];
const copAt=t=>{let i=1;while(i<COP.length-1&&t>COP[i][0])i++;const a=COP[i-1],b=COP[i],u=smooth((t-a[0])/(b[0]-a[0]));return [a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u];};
const hump=(t,a,b)=>t<=a||t>=b?0:Math.sin(Math.PI*(t-a)/(b-a))**2;
// Segment masses for balance (kg, 74.9 in all): the horse head is counted at 6 kg.
const SEGMENTS=[['pelvis','chest',18],['chest','neck',13],['neck','headTip',6],...[-1,1].flatMap(s=>[['pelvis','hip'+s,1],['chest','shoulder'+s,1],['shoulder'+s,'elbow'+s,1.9],['elbow'+s,'wrist'+s,1.1],
 ['wrist'+s,'palm'+s,.45],['hip'+s,'knee'+s,9.5],['knee'+s,'ankle'+s,3],['ankle'+s,'toe'+s,.5],['ankle'+s,'heel'+s,.5]])];
const bottom=(hull,q)=>{let m=Infinity;for(const p of hull){const y=p.clone().applyQuaternion(q).y;if(y<m)m=y;}return m;};
// Loose bodies: ballistic flight (optional linear drag), two bounces, then a roll or slide to rest.
function toss(p0,v0,q0,w0,hull,{drag=0,keep=.35,bounce=.22,settle=.45,lie=q=>q,roll=0}={}){
 const G=GRENADE_THROW.gravity,k=drag,decay=a=>k?(1-Math.exp(-k*a))/k:a,fly=(p,v,a)=>k?V([p.x+v.x*decay(a),p.y+(v.y+G/k)*decay(a)-G/k*a,p.z+v.z*decay(a)]):p.clone().addScaledVector(v,a).add(V([0,-.5*G*a*a,0]));
 const vel=(v,a)=>k?V([v.x*Math.exp(-k*a),(v.y+G/k)*Math.exp(-k*a)-G/k,v.z*Math.exp(-k*a)]):v.clone().add(V([0,-G*a,0])),rot=(q,w,a)=>expq(w.clone().multiplyScalar(a)).multiply(q);
 const above=(p,v,q,w,a)=>fly(p,v,a).y+bottom(hull,rot(q,w,a))>0;
 const legs=[];let p=p0.clone(),v=v0.clone(),q=q0.clone(),w=w0.clone(),start=0;
 for(let n=0;n<2;n++){let a=.002;while(a<4&&above(p,v,q,w,a))a+=.004;let lo=Math.max(0,a-.004),hi=a;for(let i=0;i<44;i++){const m=(lo+hi)/2;if(above(p,v,q,w,m))lo=m;else hi=m;}
  legs.push({start,p,v,q,w,end:start+hi});const vi=vel(v,hi);p=fly(p,v,hi);q=rot(q,w,hi);v=V([vi.x*keep,-vi.y*bounce,vi.z*keep]);w=w.clone().multiplyScalar(.45);start+=hi;}
 // A body lying down rolls about its own long axis (horizontal once it lies on its side), as far as the slide carries it.
 const slide=V([v.x,0,v.z]),qRest=lie(q),axis=roll&&slide.lengthSq()>1e-10?UP.clone().applyQuaternion(qRest):null,spin=axis?V().crossVectors(UP,slide).dot(axis)/roll:0,qs=q;
 return {impacts:legs.map(l=>l.end),rest:start+settle,at(age){for(const l of legs)if(age<=l.end){const a=Math.max(0,age-l.start);return {p:fly(l.p,l.v,a),q:rot(l.q,l.w,a),phase:l===legs[0]?'flight':'bounce'};}
  const s=clamp(age-start,0,settle),d=s-.5*s*s/settle,qq=qs.clone().slerp(qRest,smooth(s/settle));if(axis)qq.premultiply(turn(axis.toArray(),d*spin));const pp=p.clone().addScaledVector(slide,d);pp.y=-bottom(hull,qq);return {p:pp,q:qq,phase:'rest'};}};
}
const lieOnSide=q=>{const y=UP.clone().applyQuaternion(q),flat=y.clone().setY(0);if(flat.lengthSq()<1e-8)flat.set(1,0,0);return Q().setFromUnitVectors(y,flat.normalize()).multiply(q);};
const lieFlat=q=>{const n=V([0,0,1]).applyQuaternion(q);return Q().setFromUnitVectors(n,V([0,n.y<0?-1:1,0])).multiply(q);};
// Elbow or knee of a two-bone limb whose end must reach target, bent toward pole.
function bend(start,target,l1,l2,pole){const axis=target.clone().sub(start),d=Math.min(axis.length(),l1+l2-1e-9);axis.normalize();const along=(l1*l1-l2*l2+d*d)/(2*d),side=pole.clone().addScaledVector(axis,-pole.dot(axis)).normalize();return start.clone().addScaledVector(axis,along).addScaledVector(side,Math.sqrt(Math.max(0,l1*l1-along*along)));}
// x'' = w2 (x - p) on a uniform grid with both ends held (Thomas algorithm for the tridiagonal system).
function pendulum(w2,p,x0,xn,dt){const n=w2.length-1,c=new Float64Array(n),d=new Float64Array(n),x=new Float64Array(n+1);x[0]=x0;x[n]=xn;
 for(let i=1;i<n;i++){const b=-(2+dt*dt*w2[i]),r=-dt*dt*w2[i]*p[i]-(i===1?x0:0)-(i===n-1?xn:0),m=b-(i>1?c[i-1]:0);c[i]=1/m;d[i]=(r-(i>1?d[i-1]:0))/m;}
 for(let i=n-1;i>=1;i--)x[i]=d[i]-(i<n-1?c[i]*x[i+1]:0);return x;}

export function createGrenadeThrow(worker,grenade,{releaseArc=RELEASE_ARC,animal='horse',boneNames={},wing=false,preparedBalance=null}={}){
 if(grenade.id!=='grenade')throw Error('Grenade throw needs the grenade prop');
 const root=worker.root,bones=Object.fromEntries(worker.bones.map(b=>[boneNames[b.name]||b.name,b]));
 worker.equipWeapon(grenade);root.position.set(0,0,0);root.quaternion.identity();worker.pose('neutral');
 const rest=new Map(worker.bones.map(b=>[b,b.getWorldPosition(V())])),at0=b=>rest.get(bones[b]).clone(),palm=V([.052,-.010,0]),grip=grenade.anchors.grip.position.clone(),savedFeet=[];
 const restHips=at0('hips'),spineOffset=at0('spine').sub(restHips),headOffset=at0('head').sub(at0('spine')),rightShoulder=at0('upperArm1').sub(at0('spine')),leftShoulder=at0('upperArm-1').sub(at0('spine'));
 const pinHook=wing?V([.048,-.016,0]):HOOK;
 const THIGH={},SHOULDER={1:rightShoulder,'-1':leftShoulder},LENGTH={},BEND={};for(const s of [-1,1]){THIGH[s]=at0('thigh'+s).sub(restHips);const d=(a,b)=>at0(a+s).distanceTo(at0(b+s));LENGTH[s]={arm:[d('upperArm','forearm'),d('forearm','hand')],leg:[d('thigh','shin'),d('shin','hoof')]};
  // The direction each rest elbow and knee already bends, so the throw opens and closes on the rig's own neutral stance.
  const bent=(a,b,c)=>{const o=at0(a+s),axis=at0(c+s).sub(o).normalize(),e=at0(b+s).sub(o);return e.addScaledVector(axis,-e.dot(axis)).normalize();};BEND[s]={arm:bent('upperArm','forearm','hand'),leg:bent('thigh','shin','hoof')};}
 const rightPole=track([...rightPoleRows.map(r=>animal==='skunk'&&r[0]>=1.0&&r[0]<=1.84?[r[0],.85,-.25,.5]:r),[3.70,...BEND[1].arm.toArray()]]);
 // The director's low belly is part of the pelvis, not either thigh. Preserve
 // that garment volume when the legs bend and the trunk turns above it.
 const savedCloth=[];
 if(animal==='pig-director')for(const mesh of worker.parts.filter(p=>p.name.includes('trousers'))){
  const a=mesh.geometry.attributes;savedCloth.push({mesh,index:a.skinIndex.clone(),weight:a.skinWeight.clone()});
  for(let i=0;i<a.position.count;i++){
   const keep=blend(a.position.getY(i),.53,.73)*(1-blend(Math.abs(a.position.getZ(i)),.35,.42));if(!keep)continue;
   const weights=new Map([[worker.bones.indexOf(bones.hips),keep]]);
   for(let j=0;j<4;j++){const b=a.skinIndex.array[i*4+j],w=a.skinWeight.array[i*4+j]*(1-keep);if(w>0)weights.set(b,(weights.get(b)||0)+w);}
   const pairs=[...weights];while(pairs.length<4)pairs.push([0,0]);a.skinIndex.setXYZW(i,...pairs.map(p=>p[0]));a.skinWeight.setXYZW(i,...pairs.map(p=>p[1]));
  }a.skinIndex.needsUpdate=a.skinWeight.needsUpdate=true;
 }
 // Preserve the approved horse curves. Fit other mammals to native soles,
 // shoulder breadth and leg reach, without scaling the character or its bones.
 const footMesh=side=>worker.parts.find(p=>/hoof|boot|foot|toes/.test(p.name)&&p.name.endsWith(' '+side));
 if([-1,1].some(s=>!footMesh(s)))throw Error('Missing authored foot surface: '+animal);
 const baseLeg=Math.hypot(.054,.295,.076)+Math.hypot(.059,.355,.036),stride=Math.min(1,LENGTH[1].leg.reduce((a,b)=>a+b)/baseLeg);
 const steps=animal==='horse'?STEPS:Object.fromEntries([-1,1].map(s=>[s,STEPS[s].map(e=>({...e,to:e.to&&[at0('hoof'+s).x+(e.to[0]+.035)*stride,at0('hoof'+s).z+(e.to[1]-s*.232)*stride]}))]));
 let pressure=copAt;
 const extraWidth=rightShoulder.z-.205;
 const arcRow=(t,p,side=1)=>{const d=p.length();return [t,Math.atan2(side*p.z,p.x)/DEG,Math.asin(p.y/d)/DEG,d];};
 const armRows=rightArcRows.map(row=>{if(!row||animal==='horse')return row;const [t,a,e,r]=row,p=arcDir(a*DEG,e*DEG).multiplyScalar(r);
  if(t<=.78&&extraWidth!==0){p.z-=extraWidth;if(animal.startsWith('pig-')){p.x+=.115;p.y+=.18;if(animal==='pig-director')p.z-=.06;}if(wing){p.x+=.14;p.y+=.10;}}
  // The skunk's raised plume occupies the horse's low backswing. Load above it.
  if(animal==='skunk'&&t>=1.10&&t<=1.80)return [t,a,Math.max(e,88),r];
  if(wing&&t===3.70)return arcRow(t,at0('hand1').add(palm).sub(at0('upperArm1')));
  return arcRow(t,p);
 });
 const freeArcRows=leftArcRows.map(row=>wing&&row[0]===3.70?arcRow(row[0],at0('hand-1').sub(at0('upperArm-1')),-1):row);
 // Heuristic relative masses: a larger belly/chest drives the pigs' balance.
 const fraction=(a,b)=>a==='pelvis'&&b==='chest'?.281:a==='chest'&&b==='neck'?.216:a==='neck'?.081:a.startsWith('shoulder')?.028:a.startsWith('elbow')?.016:a.startsWith('wrist')?.006:a.startsWith('hip')?.10:a.startsWith('knee')?.0465:a.startsWith('ankle')?.00725:0;
 const segments=SEGMENTS.map(([a,b,m])=>[a,b,animal==='horse'?m:75*fraction(a,b)*(a==='pelvis'&&b==='chest'?(animal.startsWith('pig-')?1.6:wing?1.3:1):a==='chest'&&b==='neck'&&animal.startsWith('pig-')?1.3:1)]),mass=segments.reduce((s,x)=>s+x[2],0);
 for(const side of [-1,1]){const foot=footMesh(side),a=foot.geometry.attributes;
  savedFeet.push({foot,index:a.skinIndex.clone(),weight:a.skinWeight.clone()});
  for(let i=0;i<a.position.count;i++){const u=blend(a.position.getY(i),.10,.20);a.skinIndex.setXYZW(i,worker.bones.indexOf(bones['hoof'+side]),worker.bones.indexOf(bones['shin'+side]),0,0);a.skinWeight.setXYZW(i,1-u,u,0,0);}a.skinIndex.needsUpdate=a.skinWeight.needsUpdate=true;
 }
 // Rigid sole points relative to each ankle: the hoof bone alone carries everything below 10 cm.
 const soles={};for(const side of [-1,1]){const foot=footMesh(side),a=foot.geometry.attributes.position,ankle=rest.get(bones['hoof'+side]),pts=[];for(let i=0;i<a.count;i++){const p=V().fromBufferAttribute(a,i);if(p.y<.10)pts.push(p.sub(ankle));}soles[side]=pts;}
 const footQ=(yaw,pitch,roll=0)=>turn([0,1,0],yaw).multiply(turn([0,0,1],-pitch)).multiply(turn([1,0,0],roll));
 const ankleY=rest.get(bones.hoof1).y,lowest=(side,q)=>{let m=Infinity;for(const p of soles[side]){const y=p.clone().applyQuaternion(q).y;if(y<m)m=y;}return m;};
 // The pivot turns about the sole vertex that carries the hoof at full heel lift, so the contact itself stays put.
 const toe={};for(const side of [-1,1]){const q=footQ(0,.55,-side*.09);toe[side]=soles[side].reduce((b,p)=>p.clone().applyQuaternion(q).y<b.clone().applyQuaternion(q).y?p:b).clone();}
 // Loose parts: casing, ring and lever, each with its own collision hull about its own centre.
 const loose={ring:grenade.parts.find(p=>p.name==='pull ring'),lever:grenade.parts.find(p=>p.name==='curved safety lever')},hullOf=(meshes,c)=>{const out=[];for(const m of meshes){const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++)out.push(V().fromBufferAttribute(a,i).sub(c));}return out;};
 const casing=hullOf(grenade.parts.filter(p=>!Object.values(loose).includes(p)),V()),ringHull=hullOf([loose.ring],RING_CENTER),leverHull=hullOf([loose.lever],LEVER_CENTER);
 const G=GRENADE_THROW.gravity,rel=GRENADE_THROW.release,D=GRENADE_THROW.duration;
 // Hooves: flat, swinging between plants (never below the floor), or pivoting on the toe with the toe fixed.
 const kneePole=(yaw,side)=>BEND[side].leg.clone().applyQuaternion(turn([0,1,0],yaw));
 function hoof(side,t){let s={ankle:rest.get(bones['hoof'+side]).clone(),yaw:0,pitch:0,roll:0};
  for(const e of steps[side]){if(t<e.t0)break;const u=t<e.t1?blend(t,e.t0,e.t1):1;
   if(e.pivot){const tip=s.ankle.clone().add(toe[side].clone().applyQuaternion(footQ(s.yaw,0))),yaw=T.MathUtils.lerp(s.yaw,e.yaw,u),pitch=e.pitch*u,roll=-side*e.roll*u,q=footQ(yaw,pitch,roll),ankle=tip.sub(toe[side].clone().applyQuaternion(q));ankle.y=-lowest(side,q);
    const next={ankle,yaw,pitch,roll};if(t<e.t1)return {...next,q,contact:'toe'};s=next;continue;}
   const end={ankle:V([e.to[0],ankleY,e.to[1]]),yaw:e.yaw,pitch:0,roll:0};if(t>=e.t1){s=end;continue;}
   const yaw=T.MathUtils.lerp(s.yaw,e.yaw,u),pitch=s.pitch*(1-u),roll=s.roll*(1-u),q=footQ(yaw,pitch,roll),ankle=s.ankle.clone().lerp(end.ankle,u);ankle.y+=e.lift*Math.sin(Math.PI*u);ankle.y=Math.max(ankle.y,-lowest(side,q)+1e-4*Math.sin(Math.PI*u));return {ankle,yaw,pitch,q,contact:'air'};}
  return {...s,q:footQ(s.yaw,s.pitch,s.roll),contact:s.pitch>1e-9?'toe':'flat'};}
 // Pressure targets follow the actual load-bearing sole, including narrow paws
 // and the foreman's shorter steps. Horse targets retain the approved baseline.
 if(animal!=='horse'){
  const supportCentre=(side,t)=>{const f=hoof(side,t),ps=soles[side].map(p=>p.clone().applyQuaternion(f.q).add(f.ankle)),low=Math.min(...ps.map(p=>p.y)),contact=ps.filter(p=>p.y<low+.001),box=new T.Box3().setFromPoints(contact);return box.getCenter(V());};
  const sides=[0,0,-1,-1,1,1,-1,-1,-1,1,1,0,0];
  const rows=COP.map(([t],i)=>{const side=sides[i],p=side?supportCentre(side,t):supportCentre(-1,t).add(supportCentre(1,t)).multiplyScalar(.5);return [t,p.x,p.z];});
  pressure=t=>{let i=1;while(i<rows.length-1&&t>rows[i][0])i++;const a=rows[i-1],b=rows[i],u=blend(t,a[0],b[0]);return [a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u];};
 }
 // ---- pure kinematics for a given horizontal pelvis path xz(t) -> [dx,dz]; nothing is integrated ----
 function kinematics(xz){
  const memo=new Map(),trunk=t=>{let r=memo.get(t);if(r)return r;const [dy,yaw,flex,lean]=pelvisAt(t),[dx,dz]=xz(t),[cy,cf,cl]=chestAt(t),qp=trunkQ(yaw*(wing?.78:1),flex,lean),local=trunkQ(cy*(wing?.78:1),cf,cl),hips=restHips.clone().add(V([dx,dy-(wing?.035*blend(t,.7,1.3)*(1-blend(t,2.7,3.7)):animal==='horse'?0:.025*blend(t,.7,1.2)*(1-blend(t,3.45,3.85))),dz]));
   r={hips,qp,local,qc:qp.clone().multiply(local),chest:hips.clone().add(spineOffset.clone().applyQuaternion(qp)),lean:lean+cl};if(memo.size>64)memo.clear();memo.set(t,r);return r;};
  const toWorld=(tr,p)=>tr.chest.clone().add(V(p).applyQuaternion(tr.qc)),toLocal=(tr,p)=>p.clone().sub(tr.chest).applyQuaternion(tr.qc.clone().invert());
  const handWorld=t=>trunk(t).qc.clone().multiply(rightHand(t)),turnRate=(f,t,h=1e-5)=>{const a=f(t-h),b=f(t+h);return logq(b.multiply(a.invert())).divideScalar(2*h);};
  // Release: palm above and ahead of the throwing shoulder, elbow still bent; the centre is launched on an arc
  // that lands short of the target tile, so the casing rolls onto it.
  const trR=trunk(rel),relQ=handWorld(rel),relPalm=toWorld(trR,arcDir(releaseArc[0]*DEG,releaseArc[1]*DEG).multiplyScalar(releaseArc[2]).add(rightShoulder).toArray()),relCenter=relPalm.clone().sub(grip.clone().applyQuaternion(relQ)),spinAt=turnRate(handWorld,rel);
  const aim=V([GRENADE_THROW.target-.62,.045,0]),angle=.52,dist=Math.hypot(aim.x-relCenter.x,aim.z-relCenter.z),rise=aim.y-relCenter.y;
  const speed=Math.sqrt(G*dist*dist/(2*Math.cos(angle)**2*(dist*Math.tan(angle)-rise))),launch=V([aim.x-relCenter.x,0,aim.z-relCenter.z]).normalize().multiplyScalar(speed*Math.cos(angle)).setY(speed*Math.sin(angle));
  // The chest-frame arc rates that give the centre exactly the launch velocity at release.
  const relLocal=toLocal(trR,relPalm),h=1e-5,frameVel=toWorld(trunk(rel+h),relLocal.toArray()).sub(toWorld(trunk(rel-h),relLocal.toArray())).divideScalar(2*h);
  const gripVel=grip.clone().applyQuaternion(handWorld(rel+h)).sub(grip.clone().applyQuaternion(handWorld(rel-h))).divideScalar(2*h);
  const rate=launch.clone().sub(frameVel).add(gripVel).applyQuaternion(trR.qc.clone().invert()),[az,el,r]=[releaseArc[0]*DEG,releaseArc[1]*DEG,releaseArc[2]];
  const out=arcDir(az,el),eAz=V([-Math.cos(el)*Math.sin(az),0,Math.cos(el)*Math.cos(az)]),eEl=V([-Math.sin(el)*Math.cos(az),Math.cos(el),-Math.sin(el)*Math.sin(az)]);
  const arcRows=armRows.map(r=>r||[rel,...releaseArc]),arc=track(arcRows,{[arcRows.findIndex(r=>r[0]===rel)]:[rate.dot(eAz)/(r*Math.cos(el)**2)/DEG,rate.dot(eEl)/r/DEG,rate.dot(out)]});
  const reachOf=LENGTH[1].arm[0]+LENGTH[1].arm[1],soft=(d,k,L)=>d>k?k+(L-k)*Math.tanh((d-k)/(L-k)):d;
  const palmWorld=t=>{const [a,e,d]=arc(t),tr=trunk(t),p=toWorld(tr,arcDir(a*DEG,e*DEG).multiplyScalar(d).add(rightShoulder).toArray());if(t<=rel)return p;
   const sh=toWorld(tr,rightShoulder.toArray()),off=palm.clone().applyQuaternion(handWorld(t)),w=p.clone().sub(off).sub(sh),n=w.length();return sh.add(w.multiplyScalar(soft(n,.95*reachOf,.995*reachOf)/n)).add(off);},heldCenter=t=>palmWorld(t).sub(grip.clone().applyQuaternion(handWorld(t)));
  // Free hand while hooked in the ring: held in the grenade's frame, so the pull is exact; then carried clear
  // in the chest frame, so it travels with the trunk.
  const ringOnGrenade=t=>{const q=handWorld(t),c=heldCenter(t);return {position:RING_CENTER.clone().add(V([pullAt(t),0,0])).applyQuaternion(q).add(c),quaternion:q.clone().multiply(turn([1,0,0],twistAt(t)))};};
  const hookedHand=t=>{const r=ringOnGrenade(Math.min(t,GRENADE_THROW.pin)),q=r.quaternion.clone().multiply(LEFT_IN_RING);return {palm:r.position.clone().sub(pinHook.clone().sub(palm).applyQuaternion(q)),q};};
  const pulled=hookedHand(GRENADE_THROW.pin),pinTrunk=trunk(GRENADE_THROW.pin),pulledLocal=toLocal(pinTrunk,pulled.palm),pulledQ=pinTrunk.qc.clone().invert().multiply(pulled.q),carry=V([.06,-.03,-.12]);
  function freeHand(t){if(t<=GRENADE_THROW.pin){const f=hookedHand(t);f.palm.add(V([-.02,.06,-.07]).applyQuaternion(trunk(t).qc).multiplyScalar(1-blend(t,0,.22)));return f;}
   const u=blend(t,GRENADE_THROW.pin,GRENADE_THROW.drop),tr=trunk(t);return {palm:toWorld(tr,pulledLocal.clone().addScaledVector(carry,u).toArray()),q:tr.qc.clone().multiply(pulledQ).multiply(turn([0,0,1],.35*u))};}
  const dropPose=freeHand(GRENADE_THROW.drop),dropChest=trunk(GRENADE_THROW.drop),qDrop=dropChest.qc.clone().invert().multiply(dropPose.q);
  const dropAt=toLocal(dropChest,dropPose.palm.clone().sub(palm.clone().applyQuaternion(dropPose.q))).sub(leftShoulder),dropR=dropAt.length();
  const leftArc=track([[GRENADE_THROW.drop,Math.atan2(-dropAt.z,dropAt.x)/DEG,Math.asin(dropAt.y/dropR)/DEG,dropR],...freeArcRows]),leftPole=track([[GRENADE_THROW.drop,.2,-.8,-.55],...leftPoleRows,[3.70,...BEND[-1].arm.toArray()]]),leftHand=spinTrack([[GRENADE_THROW.drop,qDrop],...leftHandRows]);
  const leftAt=(t,tr)=>{if(t<GRENADE_THROW.drop){const f=freeHand(t);return {wrist:f.palm.sub(palm.clone().applyQuaternion(f.q)),q:f.q,pole:V([.2,-.8,-.55])};}const [a,e,d]=leftArc(t);return {wrist:toWorld(tr,arcDir(a*DEG,e*DEG,-1).multiplyScalar(d).add(leftShoulder).toArray()),q:tr.qc.clone().multiply(leftHand(t)),pole:V(leftPole(t))};};
  const flight=toss(relCenter,launch,relQ,spinAt,casing,{keep:.38,bounce:.24,settle:.55,lie:lieOnSide,roll:.034}),settled=flight.at(flight.rest).p;
  // Lever: the striker spring flips it off a moment after release; drag on the light strip makes it fall short.
  const sepAge=GRENADE_THROW.lever-rel,sep=flight.at(sepAge),sepVel=flight.at(sepAge+1e-5).p.sub(flight.at(sepAge-1e-5).p).divideScalar(2e-5),leverStart=LEVER_CENTER.clone().applyQuaternion(sep.q).add(sep.p);
  const leverFlight=toss(leverStart,sepVel.add(spinAt.clone().cross(leverStart.clone().sub(sep.p))).add(V([2.2,.8,0]).applyQuaternion(sep.q)),sep.q,spinAt.clone().add(V([0,0,-38]).applyQuaternion(sep.q)),leverHull,{drag:2.2,keep:.30,bounce:.25,settle:.30,lie:lieFlat});
  // Ring: rides the grenade until the pin clears, then the free hand, then falls when that hand opens.
  const ringInHand=t=>{const f=freeHand(t),hook=f.palm.clone().add(pinHook.clone().sub(palm).applyQuaternion(f.q));return {position:hook,quaternion:f.q.clone().multiply(LEFT_IN_RING.clone().invert())};};
  const ringLetGo=ringInHand(GRENADE_THROW.drop),ringVel=ringLetGo.position.clone().sub(ringInHand(GRENADE_THROW.drop-1e-4).position).divideScalar(1e-4).add(V([.05,.25,-.35]));
  const ringFlight=toss(ringLetGo.position,ringVel,ringLetGo.quaternion,V([4,-6,3]),ringHull,{keep:.3,bounce:.3,settle:.25,lie:lieFlat});
  const ring=t=>{if(t<GRENADE_THROW.pin)return {...ringOnGrenade(t),phase:'pin'};if(t<GRENADE_THROW.drop)return {...ringInHand(t),phase:'hand'};const f=ringFlight.at(t-GRENADE_THROW.drop);return {position:f.p,quaternion:f.q,phase:f.phase==='rest'?'dropped':'falling'};};
  const projectile=t=>{const age=t-rel;if(age<0)return {position:heldCenter(t),quaternion:handWorld(t),phase:'held'};const f=flight.at(age);return {position:f.p,quaternion:f.q,phase:f.phase};};
  const lever=t=>{if(t<GRENADE_THROW.lever){const b=projectile(t);return {position:LEVER_CENTER.clone().applyQuaternion(b.quaternion).add(b.position),quaternion:b.quaternion,phase:'held'};}const f=leverFlight.at(t-GRENADE_THROW.lever);return {position:f.p,quaternion:f.q,phase:f.phase==='rest'?'dropped':'flying'};};
  // Head: eyes on the target, a glance at the pin, then the grenade's flight; it stays upright as the trunk leans,
  // turning at most about 80 degrees from the chest with a smooth limit.
  function look(tr,t){const eye=tr.chest.clone().add(headOffset.clone().applyQuaternion(tr.qc)).add(V([0,.17,0])),age=t-rel-.07,target=V([GRENADE_THROW.target,.35,0]);
   if(t>.24&&t<.70)target.lerp(heldCenter(t),.55*blend(t,.24,.34)*(1-blend(t,.56,.68)));
   if(age>0){const g=age<flight.impacts[0]?flight.at(age).p:settled.clone();g.lerp(settled,blend(age,flight.impacts[0]-.30,flight.impacts[0]-.02));target.lerp(g,.8*blend(age,0,.14)*(1-blend(t,3.55,4.05)));}
   const d=target.sub(eye),want=turn([0,1,0],Math.atan2(-d.z,d.x)).multiply(turn([0,0,1],clamp(Math.atan2(d.y,Math.hypot(d.x,d.z)),-.55,.40))),q=tr.qc.clone().invert().multiply(want);
   const v=logq(q),a=v.length(),k=1,L=1.45;return a>k?expq(v.multiplyScalar((k+(L-k)*Math.tanh((a-k)/(L-k)))/a)):q;}
  // Segment end points for balance (the same two-bone solutions the bones receive in at()).
  function body(t){const tr=trunk(t),P={pelvis:tr.hips,chest:tr.chest},neck=tr.chest.clone().add(headOffset.clone().applyQuaternion(tr.qc));P.neck=neck;P.headTip=V([.14,.32,0]).applyQuaternion(tr.qc.clone().multiply(look(tr,t))).add(neck);
   for(const s of [-1,1]){const hip=tr.hips.clone().add(THIGH[s].clone().applyQuaternion(tr.qp)),f=hoof(s,t),sh=tr.chest.clone().add(SHOULDER[s].clone().applyQuaternion(tr.qc));
    P['hip'+s]=hip;P['ankle'+s]=f.ankle;P['knee'+s]=bend(hip,f.ankle,...LENGTH[s].leg,kneePole(f.yaw,s));P['toe'+s]=V([.145,-ankleY,0]).applyQuaternion(f.q).add(f.ankle);P['heel'+s]=V([-.06,-ankleY,0]).applyQuaternion(f.q).add(f.ankle);
    const arm=s===1?{q:handWorld(t),wrist:null,pole:V(rightPole(t))}:leftAt(t,tr),wrist=arm.wrist||palmWorld(t).sub(palm.clone().applyQuaternion(arm.q));
    P['shoulder'+s]=sh;P['wrist'+s]=wrist;P['elbow'+s]=bend(sh,wrist,...LENGTH[s].arm,arm.pole.applyQuaternion(tr.qc));P['palm'+s]=palm.clone().applyQuaternion(arm.q).add(wrist);}
   return P;}
  const releaseRates=[rate.dot(eAz)/(r*Math.cos(el)**2)/DEG,rate.dot(eEl)/r/DEG,rate.dot(out)];
  return {xz,trunk,toWorld,handWorld,palmWorld,heldCenter,leftAt,look,body,flight,launch,relCenter,ring,projectile,lever,releaseRates};
 }
 // ---- balance: the centre of mass rides a linear inverted pendulum over the centre-of-pressure plan ----
 // x'' = w2 (x - p), w2 = Fy / (M y), with p the planned pressure point shifted by what the arms' and trunk's
 // angular momentum needs (dL/dt about the centre of mass moves the required pressure point by dL/Fy). Both ends
 // are held, and the anticipatory push and the end settle are sized so the body starts and ends at rest. The
 // pelvis is then shifted until the real segment centre of mass follows that path.
 const centre=P=>{const c=V();for(const [a,b,m] of segments)c.addScaledVector(P[a],m/2).addScaledVector(P[b],m/2);return c.divideScalar(mass);};
 function momentum(k,t,c,h=.002){const A=k.body(t-h),B=k.body(t),C=k.body(t+h),vc=centre(C).sub(centre(A)).divideScalar(2*h),L=V();
  for(const [a,b,m] of segments){const mid=P=>P[a].clone().add(P[b]).multiplyScalar(.5),dir=P=>P[b].clone().sub(P[a]).normalize(),len=B[b].distanceTo(B[a]),vm=mid(C).sub(mid(A)).divideScalar(2*h);
   L.add(mid(B).sub(c).cross(vm.sub(vc)).multiplyScalar(m)).add(dir(B).cross(dir(C).sub(dir(A)).divideScalar(2*h)).multiplyScalar(m*len*len/12));}return L;}
 const DT=.0025,N=Math.round(D/DT),GRID=Array.from({length:N+1},(_,i)=>i*DT),SENSITIVITY=1.29;
 const table=rows=>{const M=[0,1].map(c=>{const y=rows.map(r=>r[c]),m=new Float64Array(N+1),cp=new Float64Array(N),dp=new Float64Array(N);for(let i=1;i<N;i++){const r=6*(y[i+1]-2*y[i]+y[i-1])/(DT*DT),d=4-(i>1?cp[i-1]:0);cp[i]=1/d;dp[i]=(r-(i>1?dp[i-1]:0))/d;}for(let i=N-1;i>=1;i--)m[i]=dp[i]-(i<N-1?cp[i]*m[i+1]:0);return {y,m};});
  return t=>{const u=clamp(t/DT,0,N-1e-9),i=Math.floor(u),f=u-i,g=1-f;return M.map(({y,m})=>m[i]*g*g*g*DT*DT/6+m[i+1]*f*f*f*DT*DT/6+(y[i]-m[i]*DT*DT/6)*g+(y[i+1]-m[i+1]*DT*DT/6)*f);};};
 function plan(k){const C=GRID.map(t=>centre(k.body(t))),Lm=GRID.map((t,i)=>momentum(k,t,C[i]));
  const ydd=C.map((c,i)=>i&&i<N?(C[i+1].y-2*c.y+C[i-1].y)/(DT*DT):0),Fy=ydd.map(a=>mass*(G+a)),w2=Fy.map((f,i)=>f/(mass*C[i].y));
  const dL=Lm.map((l,i)=>Lm[Math.min(N,i+1)].clone().sub(Lm[Math.max(0,i-1)]).divideScalar((Math.min(N,i+1)-Math.max(0,i-1))*DT));
  // Standing still means the centre of mass is over the pressure point, so the plan starts and ends exactly under
  // the actual opening and closing poses' centres of mass.
  const solve=(axis,shift)=>{const x0=C[0].getComponent(axis?2:0),xn=C[N].getComponent(axis?2:0),p=GRID.map((t,i)=>pressure(t)[axis]+(x0-pressure(0)[axis])*(1-blend(t,.10,.50))+(xn-pressure(D)[axis])*blend(t,3.45,3.85)+shift(i)),base=pendulum(w2,p,x0,xn,DT);
   const a=pendulum(w2,GRID.map(t=>hump(t,animal==='horse'?.30:.10,.84)),0,0,DT),b=pendulum(w2,GRID.map(t=>hump(t,3.45,4.20)),0,0,DT);
   const m11=a[1],m12=b[1],m21=-a[N-1],m22=-b[N-1],r1=base[0]-base[1],r2=base[N-1]-base[N],det=m11*m22-m12*m21,al=(r1*m22-m12*r2)/det,be=(m11*r2-m21*r1)/det;
   return {path:base.map((x,i)=>x+al*a[i]+be*b[i]),push:[al,be]};};
  const X=solve(0,i=>-dL[i].z/Fy[i]),Z=solve(1,i=>dL[i].x/Fy[i]);
  const rows=GRID.map((t,i)=>{const [dx,dz]=k.xz(t);return [dx+SENSITIVITY*(X.path[i]-C[i].x),dz+SENSITIVITY*(Z.path[i]-C[i].z)];});
  return {rows,xz:table(rows),residual:Math.max(...GRID.map((t,i)=>Math.hypot(X.path[i]-C[i].x,Z.path[i]-C[i].z))),push:{x:X.push,z:Z.push}};}
 let kin,balance;if(preparedBalance){if(preparedBalance.animal!==animal||preparedBalance.rows.length!==GRID.length)throw Error('Grenade balance preparation does not match this rig');balance=preparedBalance;kin=kinematics(table(balance.rows));}else{kin=kinematics(()=>[0,0]);for(let pass=0;pass<6;pass++){balance=plan(kin);kin=kinematics(balance.xz);}}
 const {trunk,handWorld,palmWorld,leftAt,look,flight,launch,relCenter,ring,projectile,lever}=kin;
 // Two-bone limb with twist: the bend plane maps onto the rest bend plane, so thighs and forearms turn with the
 // hips and shoulder instead of keeping their rest twist (no candy-wrapper at the hip or elbow).
 let time=0,state,disposed=false;
 function rotate(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(Q()).invert().multiply(q));root.updateMatrixWorld(true);}
 const basis=(d,n)=>{const x=d.clone().normalize(),z=n.clone().addScaledVector(x,-n.dot(x)).normalize();return new T.Matrix4().makeBasis(x,z.clone().cross(x),z);};
 const align=(d0,n0,d1,n1)=>Q().setFromRotationMatrix(basis(d1,n1).multiply(basis(d0,n0).transpose()));
 function limb(a,b,c,target,pole){const ra=rest.get(a),rb=rest.get(b),rc=rest.get(c),start=a.getWorldPosition(V()),l1=ra.distanceTo(rb),l2=rb.distanceTo(rc),d=target.distanceTo(start);
  if(d>l1+l2+1e-6||d<Math.abs(l1-l2)+1e-7)throw Error('Throw pose unreachable: '+a.name+' at '+time.toFixed(3)+' ('+d.toFixed(4)+' / '+(l1+l2).toFixed(4)+')');
  const mid=bend(start,target,l1,l2,pole),d0a=rb.clone().sub(ra),d0b=rc.clone().sub(rb),n0=d0a.clone().cross(d0b).normalize(),d1a=mid.clone().sub(start),d1b=target.clone().sub(mid);let n1=d1a.clone().cross(d1b);if(n1.lengthSq()<1e-12)n1=target.clone().sub(start).cross(pole);n1.normalize();
  rotate(a,align(d0a,n0,d1a,n1));rotate(b,align(d0b,n0,d1b,n1));return mid;}
 // A loose part's geometry is authored in grenade space; place it at a world pose about its own centre.
 function place(mesh,center,pose){const m=new T.Matrix4().compose(pose.position.clone().sub(center.clone().applyQuaternion(pose.quaternion)),pose.quaternion,V([1,1,1]));grenade.root.matrix.clone().invert().multiply(m).decompose(mesh.position,mesh.quaternion,mesh.scale);}
 return {worker,grenade,bones,animal,footMesh,launch:launch.clone(),releaseCenter:relCenter.clone(),impacts:flight.impacts.map(a=>rel+a),projectile,ring,lever,palmAt:palmWorld,
  preparedBalance:{animal,rows:balance.rows,residual:balance.residual,push:balance.push},balance:{residual:balance.residual,push:balance.push,cop:pressure,centre:t=>centre(kin.body(t))},release:{arc:releaseArc,rates:kin.releaseRates},
  at(t){if(!Number.isFinite(t))throw Error('Throw time must be finite');time=clamp(t,0,D);root.position.set(0,0,0);root.quaternion.identity();worker.pose('neutral');
   const tr=trunk(time);bones.hips.position.copy(tr.hips);bones.hips.quaternion.copy(tr.qp);bones.spine.quaternion.copy(tr.local);bones.head.quaternion.copy(look(tr,time));root.updateMatrixWorld(true);
   const feet={};for(const side of [-1,1]){const f=hoof(side,time);feet[side]=f;limb(bones['thigh'+side],bones['shin'+side],bones['hoof'+side],f.ankle,kneePole(f.yaw,side));rotate(bones['hoof'+side],f.q);}
   const rq=handWorld(time);limb(bones.upperArm1,bones.forearm1,bones.hand1,palmWorld(time).sub(palm.clone().applyQuaternion(rq)),V(rightPole(time)).applyQuaternion(tr.qc));rotate(bones.hand1,rq);bones.fingers1.rotation.z=curl(1,time);
   const L=leftAt(time,tr);limb(bones['upperArm-1'],bones['forearm-1'],bones['hand-1'],L.wrist,L.pole.applyQuaternion(tr.qc));rotate(bones['hand-1'],L.q);bones['fingers-1'].rotation.z=curl(-1,time);
   const ball=projectile(time),rp=ring(time),lp=lever(time);grenade.root.visible=true;grenade.root.position.copy(ball.position);grenade.root.quaternion.copy(ball.quaternion);grenade.root.updateMatrix();
   place(loose.ring,RING_CENTER,rp);place(loose.lever,LEVER_CENTER,lp);root.updateMatrixWorld(true);worker.skeleton.update();
   const actual=bones.hand1.localToWorld(palm.clone()),gripAt=grenade.anchors.grip.getWorldPosition(V()),released=time>=rel;
   state={time,phase:PHASES.find(([end])=>time<end)[1],released,ball:{phase:ball.phase,position:ball.position.toArray(),quaternion:ball.quaternion.toArray(),groundClearance:ball.position.y+bottom(casing,ball.quaternion)},
    ring:{phase:rp.phase,position:rp.position.toArray(),groundClearance:rp.position.y+bottom(ringHull,rp.quaternion)},lever:{phase:lp.phase,position:lp.position.toArray(),groundClearance:lp.position.y+bottom(leverHull,lp.quaternion)},
    palm:actual.toArray(),gripError:released?null:actual.distanceTo(gripAt),feet:Object.fromEntries(Object.entries(feet).map(([s,f])=>[s,{target:f.ankle.toArray(),ankle:bones['hoof'+s].getWorldPosition(V()).toArray(),contact:f.contact,planted:f.contact==='flat',yaw:f.yaw}])),
    hips:bones.hips.getWorldPosition(V()).toArray(),chest:bones.spine.getWorldPosition(V()).toArray()};return state;
  },
  diagnostics(){return state;},
  dispose(){if(disposed)return;disposed=true;worker.pose('neutral');for(const m of Object.values(loose)){m.position.set(0,0,0);m.quaternion.identity();m.scale.set(1,1,1);}for(const s of [...savedFeet,...savedCloth.map(s=>({...s,foot:s.mesh}))]){s.foot.geometry.attributes.skinIndex.copy(s.index);s.foot.geometry.attributes.skinWeight.copy(s.weight);s.foot.geometry.attributes.skinIndex.needsUpdate=s.foot.geometry.attributes.skinWeight.needsUpdate=true;}}
 };
}
