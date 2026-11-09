import * as T from './vendor/three.module.js';
import {createPigForeman,PIG_FOREMAN_PAINT} from './pig-foreman.js';
import {createModelPaint} from './horse-model-paint.js';

// Band fit is authored per species; ears, horns and comb keep their own shapes.
export const RED_HAT_FITS={
 horse:{center:[.005,1.555,0],scale:[.68,.66,.65]},
 goat:{center:[.025,1.54,0],scale:[.58,.62,.56]},
 bull:{center:[.015,1.55,0],scale:[.67,.68,.66]},
 cow:{center:[-.005,1.565,0],scale:[.67,.65,.67]},
 donkey:{center:[-.005,1.545,0],scale:[.63,.64,.60]},
 sheep:{center:[-.02,1.635,0],scale:[.78,.65,.82]},
 skunk:{center:[.005,1.565,0],scale:[.61,.62,.59]},
 'pig-director':{center:[-.015,1.635,0],scale:[.96,.82,.98]},
 rabbit:{center:[.018,1.525,0],scale:[.60,.60,.59]},
 dog:{center:[.005,1.545,0],scale:[.66,.62,.62]},
 hen:{center:[.055,1.53,0],scale:[.65,.58,.62],combClearance:{front:.075,inner:.023,outer:.065}}
};

export function fitRedHatGeometry(source,head,fit){
 const geometry=source.clone(),p=geometry.attributes.position,n=geometry.attributes.normal;
 const scale=new T.Vector3(...fit.scale),center=new T.Vector3(...fit.center);
 const inverse=head.matrixWorld.clone().invert(),normal=new T.Matrix3().getNormalMatrix(new T.Matrix4().makeScale(...fit.scale));
 for(let i=0;i<p.count;i++){
  const v=new T.Vector3().fromBufferAttribute(p,i).sub(new T.Vector3(-.025,1.55,0)).multiply(scale).add(center);
  // Shape the rear crown around the hen's comb, preserving a seated front band.
  // This creates a central recess instead of lifting the cap above the skull.
  if(fit.combClearance){const c=fit.combClearance,t=1-T.MathUtils.smoothstep(Math.abs(v.z),c.inner,c.outer);if(v.x<c.front)v.x=T.MathUtils.lerp(v.x,c.front,t);}
  v.applyMatrix4(inverse);
  p.setXYZ(i,v.x,v.y,v.z);
  const a=new T.Vector3().fromBufferAttribute(n,i).applyMatrix3(normal).normalize();n.setXYZ(i,a.x,a.y,a.z);
 }
 if(fit.combClearance)geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}

export async function createRedHatCap(renderer,worker,profile,loader,sceneLighting=false){
 const fit=RED_HAT_FITS[profile.id];if(!fit)return null;
 const response=await fetch('./pig-foreman-10k-data.json');if(!response.ok)throw Error('Red Hat cap mesh failed to load');
 const donor=createPigForeman(await response.json());
 let paint,geometry;
 try{
  paint=createModelPaint(renderer,donor,await loader.loadAsync(PIG_FOREMAN_PAINT),{species:'pig-foreman',sceneLighting});
  worker.root.updateMatrixWorld(true);const head=worker.bones.find(b=>b.name==='head');
  const source=donor.parts.find(p=>p.name.includes('service cap'));
  geometry=fitRedHatGeometry(source.geometry,head,fit);
  const cap=new T.Mesh(geometry,paint.material);cap.name='fitted Red Hat cap';head.add(cap);
  return {mesh:cap,triangles:geometry.index.count/3,setGrey(value){cap.material=value?worker.grey:paint.material;},dispose(){cap.removeFromParent();geometry.dispose();paint.dispose();donor.dispose();}};
 }catch(error){geometry?.dispose();paint?.dispose();donor.dispose();throw error;}
}
