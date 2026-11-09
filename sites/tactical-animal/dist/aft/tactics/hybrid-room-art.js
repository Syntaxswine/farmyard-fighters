// Presentation experiment for the architect's room gate. No simulation imports.
import * as THREE from './vendor/three.module.js';
import {DIMENSIONS} from './hybrid-world.js';
import {surfaceUV,materialKind} from './hybrid-materials.js';
export const ROOM_SURFACES=Object.freeze({
 brick:{file:'hybrid-surfaces/brick-factory-v1.png',period:2}, // four bricks × ten courses
 concrete:{file:'ground-concrete.png',period:2},
 grass:{file:'ground-grass.png',period:1.5},
 metal:{file:'hybrid-surfaces/metal-factory-v1.png',period:2},
 wood:{file:'hybrid-surfaces/wood-factory-v2.png',period:1},
});
export function cullInternalSlabFaces(geometry,box,slabs){
 if(!slabs||!box.id.startsWith('floor:'))return;
 const {x,y,z=0}=box.source,neighbors=[[x+1,y,z],[x-1,y,z],null,null,[x,y+1,z],[x,y-1,z]],indices=geometry.index.array,next=[];geometry.clearGroups();
 for(let face=0;face<6;face++){if(neighbors[face]&&slabs.has(neighbors[face].join(',')))continue;geometry.addGroup(next.length,6,face);next.push(...indices.slice(face*6,face*6+6));}geometry.setIndex(next);
}
export function createRoomArt(renderer,onReady=()=>{}){
 const materials=new Map(),textures=new Map(),loader=new THREE.TextureLoader();
 function material(kind){
  if(materials.has(kind))return materials.get(kind);
  const surface=ROOM_SURFACES[kind]||ROOM_SURFACES.concrete;
  let texture=textures.get(surface.file);if(!texture){texture=loader.load('../assets/environment/'+surface.file,onReady);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.set(surface.file,texture);}
  const m=new THREE.MeshStandardMaterial({map:texture,roughness:.95,color:kind==='metal'?0xb4bebb:kind==='wood'?0xffffff:kind==='brick'?0xd7c4ad:0xd4cfbe});materials.set(kind,m);return m;
 }
 function geometry(box,period){const g=new THREE.BoxGeometry(...box.size),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;for(let i=0;i<p.count;i++){const q=surfaceUV([p.getX(i)+box.center[0],p.getY(i)+box.center[1],p.getZ(i)+box.center[2]],[n.getX(i),n.getY(i),n.getZ(i)]);uv.setXY(i,q[0]/period,q[1]/period);}return g;}
 function mesh(box,slabs){
  const kind=materialKind(box),facade=material(kind),cap=material('concrete'),period=(ROOM_SURFACES[kind]||ROOM_SURFACES.concrete).period;
  const g=geometry(box,period),wall=box.kind==='wall'&&!box.id.endsWith(':door'),east=box.size[0]<box.size[2];
  // Vertical facades carry brick; tops, reveals, end caps and undersides are stone.
  if(!materials.has('roof-edge'))materials.set('roof-edge',new THREE.MeshStandardMaterial({color:0x414b43,roughness:.85}));
  const edge=materials.get('roof-edge'),faces=wall?(east?[facade,facade,cap,cap,cap,cap]:[cap,cap,cap,cap,facade,facade]):box.kind==='roof'?[edge,edge,facade,edge,edge,edge]:facade;
  // Each material keeps its own period even on narrow stone end caps.
  if(wall){const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;for(let i=0;i<p.count;i++){const side=east?Math.abs(n.getX(i))>.5:Math.abs(n.getZ(i))>.5;if(!side){const q=surfaceUV([p.getX(i)+box.center[0],p.getY(i)+box.center[1],p.getZ(i)+box.center[2]],[n.getX(i),n.getY(i),n.getZ(i)]);uv.setXY(i,q[0]/ROOM_SURFACES.concrete.period,q[1]/ROOM_SURFACES.concrete.period);}}}
  cullInternalSlabFaces(g,box,slabs);
  const result=new THREE.Mesh(g,faces);result.position.fromArray(box.center);result.castShadow=wall||box.kind!=='floor';result.receiveShadow=true;return result;
 }
 const pixels=new Uint8Array(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const r=Math.hypot((x-31.5)/31.5,(y-31.5)/31.5),i=(y*64+x)*4;pixels[i+3]=Math.round(110*Math.max(0,1-r)**1.6);}
 const shadowTexture=new THREE.DataTexture(pixels,64,64);shadowTexture.magFilter=THREE.LinearFilter;shadowTexture.minFilter=THREE.LinearFilter;shadowTexture.needsUpdate=true;
 const shadowMaterial=new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
 function contact(unit){const m=new THREE.Mesh(new THREE.PlaneGeometry(unit.stance==='prone'?1.6:.85,.65),shadowMaterial);m.rotation.set(-Math.PI/2,0,-(unit.heading||0)*Math.PI/180);m.position.set(unit.x,(unit.z||0)*DIMENSIONS.floorSpacing+.004,unit.y);m.userData.sharedMaterial=true;return m;}
 return {mesh,material,contact,dispose(){shadowTexture.dispose();shadowMaterial.dispose();for(const m of materials.values())m.dispose();for(const t of textures.values())t.dispose();}};
}
