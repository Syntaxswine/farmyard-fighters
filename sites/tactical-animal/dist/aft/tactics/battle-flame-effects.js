import * as T from './vendor/three.module.js';
import {shotPoint,visibleShotPath} from './battle-shot-effects.js';

export function flamePhase(elapsed,reduced=false){
 return {duration:reduced?180:1100,discharged:reduced||elapsed>=150,aim:0,recoil:0,elapsed,flame:!reduced&&elapsed>=70&&elapsed<1000};
}
// Visual billows follow the saved, scenery-clipped fan. They never reroll hits
// or query hidden victims. One reusable instanced mesh keeps playback bounded.
export class BattleFlameEffects {
 constructor(scene){
  this.mesh=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshBasicMaterial({transparent:true,opacity:.8,depthWrite:false,toneMapped:false}),144);
  this.fan=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({transparent:true,opacity:.8,vertexColors:true,side:T.DoubleSide,depthWrite:false,toneMapped:false}));
  this.mesh.frustumCulled=this.fan.frustumCulled=false;this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.pose=new T.Object3D();this.color=new T.Color();scene.add(this.fan,this.mesh);this.hide();
 }
 hide(){this.mesh.visible=this.fan.visible=false;}
 update(active,state,muzzle){
  if(!active.event.flame||!active.phase.flame)return;
  const shape=active.event.flame,from=muzzle?.origin||shotPoint({...shape.origin,unitId:active.event.shooter},state),t=active.phase.elapsed;
  if(!active.flamePaths)active.flamePaths=shape.rays.map(ray=>visibleShotPath(state,[from,shotPoint(ray,state)]));
  const front=Math.min(1,(t-70)/190),fade=Math.min(1,(1000-t)/240),vertices=[],colors=[];
  const emit=(path,f,index)=>{
   const end=path.at(-1)||from,p=from.clone().lerp(end,f*front);vertices.push(p.x,p.y,p.z);
   const edge=Math.abs(index/(shape.rays.length-1)*2-1);this.color.setHex(f===0?0xffefb3:f<.6?0xffc45d:edge>.85?0xc64321:0xee852b);colors.push(this.color.r,this.color.g,this.color.b);
  };
  for(let i=1;i<active.flamePaths.length;i++){
   const left=active.flamePaths[i-1],right=active.flamePaths[i];if(left.length<2||right.length<2)continue;
   emit(left,0,i-1);emit(left,.5,i-1);emit(right,.5,i);
   emit(left,.5,i-1);emit(left,1,i-1);emit(right,1,i);
   emit(left,.5,i-1);emit(right,1,i);emit(right,.5,i);
  }
  const old=this.fan.geometry;this.fan.geometry=new T.BufferGeometry();this.fan.geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));this.fan.geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));old.dispose();this.fan.material.opacity=.78*fade;this.fan.visible=vertices.length>0;
  let count=0;
  for(let i=0;i<144;i++){
   const path=active.flamePaths[(i*13)%shape.rays.length];if(path.length<2)continue;
   const age=(t-70-i%9*38)/500;if(age<0||age>1.4)continue;
   const f=Math.min(.98,(age+(Math.sin(i*12.9898)*.05))%1);if(f<0)continue;
   const end=path.at(-1),p=from.clone().lerp(end,f),radius=(.05+.26*f)*fade;
   this.pose.position.copy(p);this.pose.position.y+=Math.sin(i*2.3+t*.015)*radius*.35;
   this.pose.scale.set(radius*1.7,radius*.65,radius*1.2);this.pose.rotation.set(i*.2,t*.001+i,0);this.pose.updateMatrix();
   this.mesh.setMatrixAt(count,this.pose.matrix);this.color.setHex(i%4===0?0xffd579:i%3===0?0xf29433:0xf7ad45);this.mesh.setColorAt(count++,this.color);
  }
  this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;this.mesh.visible=count>0;
 }
 dispose(){for(const mesh of [this.mesh,this.fan]){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}this.mesh.dispose();}
}
