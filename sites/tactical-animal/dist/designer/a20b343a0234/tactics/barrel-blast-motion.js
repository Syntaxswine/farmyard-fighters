import * as T from './vendor/three.module.js';
import {DRUM_HEIGHT,DRUM_RADIUS} from './painted-cargo.js';
import {clamp,smooth} from './painted-fire-state.js';
import {TANK_TIME,tankBlastState} from './tank-blast-motion.js';
export const BARREL_TIME=TANK_TIME;
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),TAU=Math.PI*2,FLOOR=.003;
export function barrelBlastState(seconds){
 const blast=tankBlastState(seconds);
 return {...blast,phase:!blast.active?'Intact drum':blast.age<.14?'Rupture':blast.age<.58?'Outward blast':blast.age<1.2?'Falling shell':blast.age<2.7?'Ground fire':'Scorched ground'};
}

// Split the actual painted cargo triangles, including its hoops and bungs.
// Borrow the intact model; fragment geometry/materials belong to this instance.
function splitDrum(intact,orientation,surfaceAt){
 const buckets=Array.from({length:8},()=>new Map()),point=V(),normal=V(),matrix=new T.Matrix3();
 intact.updateMatrixWorld(true);
 const inverse=new T.Matrix4().copy(intact.matrixWorld).invert();
 intact.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone(),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  const localHeight=mesh.position.y,cap=mesh.geometry.type!=='LatheGeometry'&&(localHeight>.74||localHeight<.06),capIndex=localHeight>.74?6:7;
  matrix.getNormalMatrix(mesh.matrixWorld);
  const local=new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
  for(let i=0;i<p.count;i+=3){
   point.set((p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3,(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3).applyMatrix4(local);
   const tear=Math.atan2(point.x,point.z)+.085*Math.sin(point.y*17+point.x*5);
   const sector=cap?capIndex:Math.min(5,Math.floor(((tear+TAU)%TAU)/TAU*6)),bucket=buckets[sector];
   if(!bucket.has(mesh.material))bucket.set(mesh.material,{position:[],normal:[],uv:[],castShadow:mesh.castShadow,userData:{...mesh.userData}});
   const out=bucket.get(mesh.material);
   for(let j=i;j<i+3;j++){
    point.fromBufferAttribute(p,j).applyMatrix4(mesh.matrixWorld);normal.fromBufferAttribute(n,j).applyMatrix3(matrix).normalize();
    out.position.push(...point.toArray());out.normal.push(...normal.toArray());out.uv.push(uv?.getX(j)||0,uv?.getY(j)||0);
   }
  }
  g.dispose();
 });
 return buckets.map((bucket,i)=>{
  const root=new T.Group();root.name=i===6?'Released drum lid':i===7?'Released drum base':'Torn drum panel '+(i+1);
  for(const [source,data]of bucket){
   const geometry=new T.BufferGeometry();for(const key of ['position','normal','uv'])geometry.setAttribute(key,new T.Float32BufferAttribute(data[key],key==='uv'?2:3));
   const material=source.clone();material.side=T.DoubleSide;material.alphaHash=true;material.transparent=false;
   // Three's clone omits shader callbacks; keep the painted explosive-red finish.
   material.onBeforeCompile=source.onBeforeCompile;material.customProgramCacheKey=source.customProgramCacheKey;
   const mesh=new T.Mesh(geometry,material);mesh.castShadow=data.castShadow;mesh.userData=data.userData;
   mesh.customDepthMaterial=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide,alphaHash:true});root.add(mesh);
  }
  const center=new T.Box3().setFromObject(root).getCenter(V()),vertices=[];
  for(const mesh of root.children){mesh.geometry.translate(-center.x,-center.y,-center.z);mesh.geometry.computeBoundingSphere();
   const a=mesh.geometry.attributes.position;for(let j=0;j<a.count;j++)vertices.push(V().fromBufferAttribute(a,j));
  }
  const radial=V(Math.sin((i+.5)*TAU/6),0,Math.cos((i+.5)*TAU/6)),surface=i<6?radial:V(0,1,0);
  surface.applyQuaternion(orientation);
  const rest=new T.Quaternion().setFromUnitVectors(surface,V(0,1,0));
  const bearing=Math.atan2(center.z,center.x)+(i===6?.3:0),speed=i===6?.65:i===7?.4:.72+(i%3)*.18;
  const velocity=V(Math.cos(bearing)*speed,i===6?3.5:i===7?1.65:2.3+(i%2)*.35,Math.sin(bearing)*speed);
  const spin=V(Math.cos(i*1.7),.35,Math.sin(i*1.7)).normalize(),rate=i===6?3.3:1.5+(i%3)*.25;
  const rotation=t=>new T.Quaternion().setFromAxisAngle(spin,t*rate);
  const minimum=q=>{const m=new T.Matrix4().makeRotationFromQuaternion(q).elements;let y=Infinity;for(const v of vertices)y=Math.min(y,m[1]*v.x+m[5]*v.y+m[9]*v.z);return y;};
  const floorAt=(p,q)=>{const m=new T.Matrix4().makeRotationFromQuaternion(q).elements;let y=-Infinity;for(const v of vertices){const x=m[0]*v.x+m[4]*v.y+m[8]*v.z,z=m[2]*v.x+m[6]*v.y+m[10]*v.z;y=Math.max(y,surfaceAt(p.x+x,p.z+z)-(m[1]*v.x+m[5]*v.y+m[9]*v.z));}return FLOOR+y;};
  const height=t=>{const p=center.clone().addScaledVector(velocity,t);p.y-=4.905*t*t;return p.y-floorAt(p,rotation(t));};
  // First surface contact, not a center-point clamp. No fragment can tunnel
  // through the floor during its initial tumble or the short settling phase.
  let low=0,high=1/240;while(high<3&&height(high)>0){low=high;high+=1/240;}
  for(let j=0;j<35;j++){const t=(low+high)/2;if(height(t)>0)low=t;else high=t;}
  const flight=high,landing=center.clone().addScaledVector(velocity,flight);landing.y-=4.905*flight*flight;
  return {root,center,velocity,rotation,minimum,floorAt,flight,landing,rest,vertices};
 });
}

export function createBarrelBlastMotion(library,{skin='oxide',label='none',orientation='upright',position=[0,0,0],yaw=0,surfaceAt=()=>position[1]}={}){
 if(!['upright','sideways'].includes(orientation))throw Error('Unknown barrel orientation');
 const model=library.build('barrel-single',skin,label),root=new T.Group(),intact=new T.Group();root.name='Fuel barrel rupture';root.add(intact);
 model.root.position.y=-DRUM_HEIGHT/2;intact.add(model.root);
 if(orientation==='sideways')intact.rotation.z=Math.PI/2;
 intact.position.y=(orientation==='upright'?DRUM_HEIGHT/2:DRUM_RADIUS)+FLOOR;
 const localSurface=(x,z)=>surfaceAt(position[0]+Math.cos(yaw)*x+Math.sin(yaw)*z,position[2]-Math.sin(yaw)*x+Math.cos(yaw)*z)-position[1];
 const fragments=splitDrum(intact,intact.quaternion,localSurface);fragments.forEach(p=>root.add(p.root));
 root.position.fromArray(position);root.rotation.y=yaw;root.updateMatrixWorld(true);const origin=intact.getWorldPosition(V());
 let disposed=false;
 function apply(seconds){
  const state=barrelBlastState(seconds),age=Math.max(0,state.age),opacity=1-smooth((age-2.1)/.8);
  intact.visible=!state.active;
  for(const f of fragments){
   f.root.visible=state.active&&opacity>.001;
   if(age<f.flight){f.root.quaternion.copy(f.rotation(age));f.root.position.copy(f.center).addScaledVector(f.velocity,age);f.root.position.y-=4.905*age*age;}
   else{const settle=smooth((age-f.flight)/.26);f.root.quaternion.copy(f.rotation(f.flight)).slerp(f.rest,settle);f.root.position.copy(f.landing).add(V(f.velocity.x*.08*settle,0,f.velocity.z*.08*settle));f.root.position.y=f.floorAt(f.root.position,f.root.quaternion);}
   for(const mesh of f.root.children){mesh.material.opacity=opacity;mesh.customDepthMaterial.opacity=opacity;}
  }
  root.updateMatrixWorld(true);
  return {...state,origin:origin.toArray(),intactVisible:intact.visible,visibleFragments:fragments.filter(f=>f.root.visible).length};
 }
 apply(0);
 return {root,intact,model,origin,fragments,skin,label,orientation,apply,
  dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const f of fragments)for(const m of f.root.children){m.geometry.dispose();m.material.dispose();m.customDepthMaterial.dispose();}root.clear();}
 };
}
