import * as T from './vendor/three.module.js';
import {paintedFireMaterial,FIRE_ASSETS} from './painted-fire-effects.js';

export const HELICOPTER_SMOKE=FIRE_ASSETS.smoke;
const smooth=(a,b,x)=>T.MathUtils.smoothstep(x,a,b);

// A small residual plume, separate from collision, ground bounds and the model.
// The caller owns the borrowed painted atlas and supplies elapsed seconds.
export function createHelicopterSmoke(texture,aircraft){
 const source=aircraft.root.getObjectByName('Exhaust dark throat');
 if(!source||aircraft.root.userData.helicopter.state!=='survivable')throw Error('Residual smoke needs the survivable helicopter');
 const group=new T.Group(),plane=new T.PlaneGeometry(1,1),origin=new T.Vector3();let disposed=false;
 group.name='Residual engine smoke';group.visible=false;
 const cards=Array.from({length:7},(_,i)=>{
  const mesh=new T.Mesh(plane,paintedFireMaterial(texture,{smoke:true,seed:i*1.618}));
  mesh.name='Painted smoke wisp '+i;mesh.frustumCulled=false;group.add(mesh);return mesh;
 });
 function locate(){source.getWorldPosition(origin);return origin;}
 return {group,cards,
  bounds(){locate();return new T.Box3(origin.clone().add(new T.Vector3(-2.3,-.6,-1.5)),origin.clone().add(new T.Vector3(.8,3.35,1)));},
  update(seconds,camera,visible=true){
   if(disposed)return;group.visible=!!visible;if(!visible)return;
   locate();const time=Number.isFinite(seconds)?Math.max(0,seconds):0;
   for(const [i,m]of cards.entries()){
    const age=(time+i*4.7/cards.length)%4.7,f=age/4.7;
    m.position.copy(origin).add(new T.Vector3(-.27*age+.06*Math.sin(age*2+i)*f,.47*age,-.08*age+.08*Math.sin(i*2.1+age)*f));
    m.quaternion.copy(camera.quaternion);m.rotateZ(.10*Math.sin(i*1.3+age*.35));
    m.scale.set(.30+.58*f,.55+.85*f,1);
    m.material.uniforms.opacity.value=(.20+.035*Math.sin(i*2.1+time*.7))*smooth(0,.40,age)*(1-smooth(2.8,4.7,age));
    m.material.uniforms.clock.value=time*.25;
   }
  },
  dispose(){if(disposed)return;disposed=true;group.visible=false;group.removeFromParent();plane.dispose();cards.forEach(m=>m.material.dispose());}
 };
}
