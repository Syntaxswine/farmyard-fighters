import {withSpeakingHead} from './speaking-head.js';
// Run the existing game mesh's garment fitting in a worker. The main thread
// receives the same bind-space attributes, not a second approximation of the rig.
export function preparePortraitRig(profile,data,head){
 const worker=profile.create(head?withSpeakingHead(data,head):data);
 try{return worker.parts.map(part=>({name:part.name,index:part.geometry.index.array.slice(),attributes:Object.fromEntries(Object.entries(part.geometry.attributes).map(([key,a])=>[key,{array:a.array.slice(),itemSize:a.itemSize,normalized:a.normalized}])),layerFit:part.geometry.userData.layerFit}));}
 finally{const skeletons=new Set();worker.root.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});worker.dispose();for(const s of skeletons)s.dispose();}
}
