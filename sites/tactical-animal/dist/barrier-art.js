import * as T from './aft/tactics/vendor/three.module.js';
import {buildWorld} from './aft/tactics/hybrid-world.js';
import {environmentVisuals} from './aft/tactics/environment-visuals.js';

// Borrow the existing AFT fence/jail-bar geometry and transparent-barrier policy.
const cache=new Map();
export function barrierParts(kind){
  if(!cache.has(kind)){
    const map={width:1,height:1,terrain:[['yard']],edges:{'s:0:0':kind},props:[],upper:[]};
    cache.set(kind,environmentVisuals(buildWorld(map),map).filter(p=>p.kind==='fence').map(p=>({...p,center:[p.center[0],p.center[1]-1,p.center[2]-.5]})));
  }
  return cache.get(kind);
}
export function barrierGeometry(){return {box:new T.BoxGeometry(1,1,1),cylinder:new T.CylinderGeometry(.5,.5,1,6)};}
export function barrierPanel(kind,geometries,material){
  const root=new T.Group();
  for(const p of barrierParts(kind)){const mesh=new T.Mesh(geometries[p.shape||'box'],material);mesh.position.fromArray(p.center);mesh.scale.fromArray(p.size);mesh.rotation.set(...(p.rotation||[0,0,0]));root.add(mesh);}
  return root;
}
