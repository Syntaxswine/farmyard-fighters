import {createFactoryMachine} from './factory-machine-model.js';
import {createMachinePaint} from './factory-machine-paint.js';

// The scene owns a library; instances only own their transform and children.
export function createFactoryMachineLibrary(renderer,data,texture,{preparePaint=createMachinePaint}={}){
 const started=performance.now(),prototype=createFactoryMachine(data),paint=preparePaint(renderer,prototype,texture,{lit:true});
 for(const [i,p]of prototype.parts.entries())p.material=paint.materials[i];
 let disposed=false;
 return {preparations:1,preparationMs:performance.now()-started,triangleCount:prototype.parts.reduce((n,p)=>n+p.geometry.index.count/3,0),
  geometryBytes:prototype.parts.reduce((n,p)=>n+p.geometry.index.array.byteLength+Object.values(p.geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0),0),
  estimatedTextureBytes:Math.round(texture.image.width*texture.image.height*(4*4/3+1)+1536*1024*8),
  build(){if(disposed)throw Error('Factory machine library is disposed');const root=prototype.root.clone(true);return {root,parts:root.children,dispose(){root.clear();}};},
  dispose(){if(disposed)return;disposed=true;paint.dispose();prototype.dispose();}
 };
}
