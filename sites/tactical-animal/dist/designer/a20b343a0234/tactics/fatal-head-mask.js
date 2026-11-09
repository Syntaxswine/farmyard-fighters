import * as T from './vendor/three.module.js';
// Native head/neck surfaces are authored per species. Unknown or changed models
// keep their ordinary casualty appearance rather than guessing a destructive cut.
export const FATAL_HEAD_PROFILES={
 horse:'unified skull jaw neck and ears',goat:'unified goat skull ears and swept horns',bull:'unified bull skull ears and short horns',cow:'unified cow skull ears and forehead tuft',donkey:'unified donkey skull muzzle and long ears',sheep:'unified sheep skull ears and wool',skunk:'unified skunk skull rounded ears and muzzle','pig-foreman':'unified pig skull folded ears and snout','pig-director':'unified director skull folded ears and snout',rabbit:'unified rabbit skull and leaf ears',dog:'unified dog skull and upright ears',hen:'head and feathered neck'
};
// The donkey's lower jaw shares low head weights with its long neck. Its
// authored collar envelope removes the connected anterior shelf as well.
export const FATAL_HEAD_ENVELOPES={donkey:{top:1.32,front:.075}};
// The hen's feathered breast closes above the ordinary .45 neck cut. Keep a
// slightly taller neck rim so the painted seal sits above that body surface.
export const FATAL_HEAD_CUTOFFS={hen:.8};
const V=()=>new T.Vector3();
const HEAD_FEATURE=/\b(?:mane|beard|comb|beak|wattles?|cap|eyes?|teeth|tooth|horns?|ears?)\b/i;
const vertexKey=p=>p.position.map(n=>Math.round(n*1e5)).join(','),edgeKey=(a,b)=>{const x=vertexKey(a),y=vertexKey(b);return x<y?x+'|'+y:y+'|'+x;};
// The influence cut can expose disconnected low-weight jaw islands. Retain the
// collar-connected component, rather than joining every boundary to one centre.
function collarComponent(vertices,edges){
 const count=vertices.length/3,parent=Array.from({length:count},(_,i)=>i),owners=new Map(),find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 for(let i=0;i<count;i++)for(let k=0;k<3;k++){const key=edgeKey(vertices[i*3+k],vertices[i*3+(k+1)%3]);if(owners.has(key))parent[find(i)]=find(owners.get(key));else owners.set(key,i);}
 const groups=new Map();for(let i=0;i<count;i++){const key=find(i);if(!groups.has(key))groups.set(key,{triangles:[],minY:Infinity,area:0});const group=groups.get(key),points=vertices.slice(i*3,i*3+3);group.triangles.push(i);group.minY=Math.min(group.minY,...points.map(p=>p.position[1]));group.area+=new T.Triangle(...points.map(p=>new T.Vector3(...p.position))).getArea();}
 const minimum=Math.min(...[...groups.values()].map(g=>g.minY)),group=[...groups.values()].filter(g=>g.minY<=minimum+.02).sort((a,b)=>b.area-a.area)[0];if(!group)return {vertices:[],edges:[],discardedComponents:0};
 const kept=group.triangles.flatMap(i=>vertices.slice(i*3,i*3+3)),keys=new Set();for(let i=0;i<kept.length;i+=3)for(let k=0;k<3;k++)keys.add(edgeKey(kept[i+k],kept[i+(k+1)%3]));return {vertices:kept,edges:edges.filter(([a,b])=>keys.has(edgeKey(a,b))),discardedComponents:groups.size-1};
}
function boundaryLoops(edges){
 const groups=[],remaining=new Set(edges),at=new Map();for(const edge of edges)for(const p of edge){const key=vertexKey(p);if(!at.has(key))at.set(key,[]);at.get(key).push(edge);}
 while(remaining.size){const start=remaining.values().next().value,stack=[start],group=[];remaining.delete(start);while(stack.length){const edge=stack.pop();group.push(edge);for(const p of edge)for(const next of at.get(vertexKey(p))||[])if(remaining.delete(next))stack.push(next);}groups.push(group);}return groups;
}
function weight(vertex,head){let sum=0;for(let i=0;i<4;i++)if(vertex.skinIndex[i]===head)sum+=vertex.skinWeight[i];return sum;}
function mixVertex(a,b,t){
 const out={};for(const key of Object.keys(a))if(key!=='skinIndex'&&key!=='skinWeight')out[key]=a[key].map((n,i)=>T.MathUtils.lerp(n,b[key][i],t));
 const slots=new Map();for(const [vertex,factor]of [[a,1-t],[b,t]])for(let k=0;k<4;k++)slots.set(vertex.skinIndex[k],(slots.get(vertex.skinIndex[k])||0)+vertex.skinWeight[k]*factor);
 const sorted=[...slots].filter(([,w])=>w>1e-8).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=sorted.reduce((s,[,w])=>s+w,0);while(sorted.length<4)sorted.push([0,0]);out.skinIndex=sorted.map(([i])=>i);out.skinWeight=sorted.map(([,w])=>w/sum);
 for(const name of ['normal','paintNormal'])if(out[name]){const normal=new T.Vector3(...out[name]).normalize();out[name]=normal.toArray();}return out;
}
function geometryFrom(vertices,attributes){const geometry=new T.BufferGeometry();for(const [name,attribute]of Object.entries(attributes)){const values=vertices.flatMap(p=>p[name]);geometry.setAttribute(name,name==='skinIndex'?new T.Uint16BufferAttribute(values,attribute.itemSize):new T.Float32BufferAttribute(values,attribute.itemSize));}return geometry;}
function anchorNeck(geometry,head,parent){const indices=geometry.attributes.skinIndex;for(let i=0;i<indices.count;i++)for(let k=0;k<4;k++)if(indices.getComponent(i,k)===head)indices.setComponent(i,k,parent);}
function clipped(source,head,cutoff,envelope){
 const a=source.geometry.attributes,index=source.geometry.index,count=index?index.count:a.position.count,cache=new Map(),vertices=[],edges=[];
 const read=i=>{if(!cache.has(i)){const p={};for(const [name,attribute]of Object.entries(a))p[name]=Array.from({length:attribute.itemSize},(_,k)=>attribute.getComponent(i,k));cache.set(i,p);}return cache.get(i);};
 const planes=[{value:p=>weight(p,head),limit:cutoff},...(envelope?[{value:p=>p.position[1],limit:envelope.top},{value:p=>p.position[0],limit:envelope.front}]:[])];
 for(let t=0;t<count;t+=3){let polygon=[0,1,2].map(k=>read(index?index.getX(t+k):t+k));
  for(const plane of planes){if(!polygon.length)break;const next=[];let previous=polygon.at(-1),wp=plane.value(previous);for(const current of polygon){const wc=plane.value(current),inside=wc<=plane.limit,wasInside=wp<=plane.limit;if(inside!==wasInside)next.push(mixVertex(previous,current,(plane.limit-wp)/(wc-wp)));if(inside)next.push(current);previous=current;wp=wc;}polygon=next;}
  for(let k=1;k+1<polygon.length;k++)vertices.push(polygon[0],polygon[k],polygon[k+1]);
 }
 const boundary=new Map();for(let i=0;i<vertices.length;i+=3)for(let k=0;k<3;k++){const pair=[vertices[i+k],vertices[i+(k+1)%3]],key=edgeKey(...pair);if(boundary.has(key))boundary.get(key).count++;else boundary.set(key,{pair,count:1});}
 for(const {pair,count}of boundary.values())if(count===1&&planes.some(plane=>pair.every(p=>Math.abs(plane.value(p)-plane.limit)<1e-5)))edges.push(pair);
 const kept=collarComponent(vertices,edges);return {geometry:geometryFrom(kept.vertices,a),edges:kept.edges,discardedComponents:kept.discardedComponents};
}
function closureGeometry(edges){
 const points=edges.flat(),center=points.reduce((a,p,i)=>i?mixVertex(a,p,1/(i+1)):p,null),origin=new T.Vector3(...center.position);let radius=.01;for(const p of points){const v=new T.Vector3(...p.position).sub(origin);radius=Math.max(radius,Math.hypot(v.x,v.z));}
 const vertices=[];for(const edge of edges){const normal=new T.Triangle(...[center,...edge].map(v=>new T.Vector3(...v.position))).getNormal(V());vertices.push(...(normal.y>=0?[center,...edge]:[center,edge[1],edge[0]]));}
 const geometry=geometryFrom(vertices,{position:{itemSize:3},skinIndex:{itemSize:4},skinWeight:{itemSize:4}}),uv=vertices.flatMap(p=>[(p.position[0]-origin.x)/(radius*2)+.5,(p.position[2]-origin.z)/(radius*2)+.5]);geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();return geometry;
}
function closureMaterial(texture){texture.colorSpace=T.SRGBColorSpace;const material=new T.MeshBasicMaterial({map:texture,toneMapped:false,side:T.DoubleSide});material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','vec4 paint=texture2D(map,vec2(.5,0.)+vMapUv*.5);diffuseColor.rgb*=mix(vec3(.035,.004,.006),paint.rgb,paint.a);');};material.customProgramCacheKey=()=> 'painted-fatal-head-closure-v1';return material;}
export function createFatalHeadMask(worker,{species,texture,cutoff=FATAL_HEAD_CUTOFFS[species]??.45}={}){
 const primaryName=FATAL_HEAD_PROFILES[species],primary=worker.parts.find(p=>p.name===primaryName),skeleton=primary?.skeleton||worker.skeleton,head=skeleton?.bones.find(b=>b.name==='head'),headIndex=skeleton?.bones.indexOf(head)??-1,records=[],caps=[],headSurfaces=new Set(primary?[primary]:[]);let material,destroyed=false,disposed=false,reason='ready',attachments=new Map(),attachmentsPrepared=false;
 if(!primaryName||!primary||headIndex<0||!primary.isSkinnedMesh)reason='unsupported-model';
 else if(!texture?.isTexture||!Number.isFinite(cutoff)||cutoff<.2||cutoff>.8)throw Error('Shared closure texture and a valid head cut are required');
 const headVisible=head?.visible;
 if(reason==='ready'){
  const candidates=[];worker.root.traverse(mesh=>{if(mesh.isSkinnedMesh&&mesh.skeleton===skeleton)candidates.push(mesh);});
  for(const source of candidates){const a=source.geometry.attributes;if(!a.skinIndex||!a.skinWeight)continue;let maximum=0;for(let i=0;i<a.position.count;i++){let w=0;for(let k=0;k<4;k++)if(a.skinIndex.getComponent(i,k)===headIndex)w+=a.skinWeight.getComponent(i,k);maximum=Math.max(maximum,w);}
   let ancestor=source.parent,headLocal=false;while(ancestor&&ancestor!==worker.root){if(headSurfaces.has(ancestor))headLocal=true;ancestor=ancestor.parent;}
   const extra=!worker.parts.includes(source)&&headLocal,secondary=source!==primary&&HEAD_FEATURE.test(source.name);if(source!==primary&&!secondary&&!extra)continue;
   if(!extra&&maximum<=cutoff)continue;
   const built=secondary||extra?{geometry:geometryFrom([],a),edges:[],discardedComponents:0}:clipped(source,headIndex,cutoff,FATAL_HEAD_ENVELOPES[species]);records.push({source,original:source.geometry,masked:built.geometry,discardedComponents:built.discardedComponents});headSurfaces.add(source);
   // The avian breast already has a closed top. Keep its surviving neck/seal
   // with the breast, rather than twisting it open with an absent head bone.
   const fixedNeck=species==='hen'&&source===primary,parentIndex=skeleton.bones.indexOf(head.parent);if(fixedNeck)anchorNeck(built.geometry,headIndex,parentIndex);
   if(source===primary&&built.edges.length)for(const loop of boundaryLoops(built.edges)){material ||= closureMaterial(texture);const geometry=closureGeometry(loop);if(fixedNeck)anchorNeck(geometry,headIndex,parentIndex);const cap=new T.SkinnedMesh(geometry,material);cap.name='Painted sealed neck closure';cap.skeleton=source.skeleton;cap.bindMode=source.bindMode;cap.bindMatrix.copy(source.bindMatrix);cap.bindMatrixInverse.copy(source.bindMatrixInverse);cap.frustumCulled=false;cap.castShadow=cap.receiveShadow=false;cap.visible=false;cap.raycast=()=>{};source.add(cap);caps.push(cap);}
  }
  if(!caps.length)reason='no-neck-boundary';
 }
 const supported=reason==='ready';
 function originalGeometry(source){return records.find(r=>r.source===source)?.original||source.geometry;}
 function retainsOriginalVertex(source,id){
  const record=records.find(r=>r.source===source);if(!destroyed||!record)return true;if(source!==primary)return false;
  const a=record.original.attributes;let influence=0;for(let k=0;k<4;k++)if(a.skinIndex.getComponent(id,k)===headIndex)influence+=a.skinWeight.getComponent(id,k);
  const envelope=FATAL_HEAD_ENVELOPES[species];return influence<=cutoff&&(!envelope||a.position.getY(id)<=envelope.top&&a.position.getX(id)<=envelope.front);
 }
 function refreshAttachments(){if(disposed)return;const next=new Map();for(const surface of headSurfaces)surface.traverse(node=>{if(node!==surface&&node.isMesh&&!caps.includes(node))next.set(node,attachments.has(node)?attachments.get(node):node.visible);});for(const [node,visible]of attachments)if(!next.has(node))node.visible=visible;attachments=next;attachmentsPrepared=true;for(const [node,visible]of attachments)node.visible=destroyed?false:visible;}
 function setDestroyed(value){if(disposed)return false;destroyed=supported&&!!value;if(destroyed&&!attachmentsPrepared)refreshAttachments();for(const r of records)r.source.geometry=destroyed?r.masked:r.original;for(const cap of caps)cap.visible=destroyed;if(head)head.visible=destroyed?false:headVisible;for(const [node,visible]of attachments)node.visible=destroyed?false:visible;return destroyed;}
 return {supported,reason,primaryName,get destroyed(){return destroyed;},records,caps,setDestroyed,refreshAttachments,originalGeometry,retainsOriginalVertex,withIntactGeometry(callback){const previous=destroyed;setDestroyed(false);try{return callback();}finally{setDestroyed(previous);}},diagnostics(){return {supported,reason,species,cutoff,maskedParts:records.map(r=>({name:r.source.name,before:(r.original.index?.count||r.original.attributes.position.count)/3,after:r.masked.attributes.position.count/3,discardedComponents:r.discardedComponents})),closureLoops:caps.length,closureTriangles:caps.reduce((sum,c)=>sum+c.geometry.attributes.position.count/3,0),attachments:attachments.size};},dispose(){if(disposed)return;setDestroyed(false);disposed=true;attachments.clear();for(const r of records)r.masked.dispose();for(const cap of caps){cap.removeFromParent();cap.geometry.dispose();}material?.dispose();}};
}
