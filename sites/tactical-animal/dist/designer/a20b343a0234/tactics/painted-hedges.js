import {hedgeCellSurfaces} from './hedge-surfaces.js';
import * as T from './vendor/three.module.js';
import {createHedgePlan,hedgeHash,HEDGE_CHUNK_SIZE} from './hedge-layout.js';
import {createScreenMaterials,SCREEN_PANELS} from './foliage-screen-paint.js';
import {atlasRect} from './biome-foliage-paint.js';
export {SCREEN_ATLAS,FRINGE_ATLAS} from './foliage-screen-paint.js';

const lerp=(a,b,t)=>a+(b-a)*t;
function buffer(){return {position:[],normal:[],uv:[],color:[]};}
function vertex(out,p,n,uv,color){out.position.push(...p);out.normal.push(...n);out.uv.push(...uv);out.color.push(...color);}
function triangle(out,points,normal,color,uvs=[[0,0],[1,0],[1,1]]){
 const ab=new T.Vector3(...points[1]).sub(new T.Vector3(...points[0])),ac=new T.Vector3(...points[2]).sub(new T.Vector3(...points[0]));
 const order=ab.cross(ac).dot(new T.Vector3(...normal))<0?[0,2,1]:[0,1,2];
 for(const i of order)vertex(out,points[i],normal,uvs[i],color);
}
function quad(out,p,normal,color,uv=[[0,0],[1,0],[1,1],[0,1]]){triangle(out,[p[0],p[1],p[2]],normal,color,[uv[0],uv[1],uv[2]]);triangle(out,[p[0],p[2],p[3]],normal,color,[uv[0],uv[2],uv[3]]);}
function geometry(data){const g=new T.BufferGeometry();for(const name of ['position','normal','uv','color'])g.setAttribute(name,new T.Float32BufferAttribute(data[name],name==='uv'?2:3));g.computeBoundingSphere();g.computeBoundingBox();return g;}
function smoothCoreNormals(buffers){
 const sums=new Map(),key=(p,i)=>p.slice(i,i+3).map(n=>Math.round(n*1e5)).join(',');
 for(const {position:p}of buffers)for(let i=0;i<p.length;i+=9){
  const a=new T.Vector3(...p.slice(i,i+3)),b=new T.Vector3(...p.slice(i+3,i+6)),c=new T.Vector3(...p.slice(i+6,i+9)),face=b.sub(a).cross(c.sub(a));
  for(let j=0;j<9;j+=3){const k=key(p,i+j);if(!sums.has(k))sums.set(k,new T.Vector3());sums.get(k).add(face);}
 }
 // Share area-weighted normals even where a top/side or spatial chunk splits.
 // Analytic normals are inaccurate at a coarse clipped end-cap triangle.
 for(const {position:p,normal:n}of buffers)for(let i=0;i<p.length;i+=3){const v=sums.get(key(p,i)).clone().normalize();n[i]=v.x;n[i+1]=v.y;n[i+2]=v.z;}
}
export function createPaintedHedges(cells,textures={},options={}){
 const plan=createHedgePlan(cells,options),root=new T.Group();root.name='painted-hedges';
 const paint=createScreenMaterials(textures.screen??null),materials=Object.values(paint),grey=new T.MeshStandardMaterial({color:0x8c9182,roughness:1,side:T.DoubleSide});materials.push(grey);
 paint.temperate.color.setRGB(.88,1.03,.78);
 const coreShader=paint.temperate.onBeforeCompile;
 paint.temperate.onBeforeCompile=s=>{coreShader(s);s.fragmentShader=s.fragmentShader
  .replace('vec3 p=vScreenWorld*.38;','vec3 p=vScreenWorld*.92;')
  .replace('p*.71+vec2(.37,.83)-warp','mat2(.8,-.6,.6,.8)*p*.83+vec2(.37,.83)-warp.yx')
  .replace('.08+.07*screenNoise(p*.43)','.48+.08*screenNoise(p*.43)');
 };paint.temperate.customProgramCacheKey=()=> 'painted-hedge-leaf-v2';
 const fringe=new T.MeshStandardMaterial({map:textures.fringe??null,color:0xdce3c2,roughness:1,vertexColors:true,side:T.DoubleSide,alphaTest:.4});materials.push(fringe);
 fringe.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <opaque_fragment>','outgoingLight=mix(outgoingLight,diffuseColor.rgb*1.25,.65);\n#include <opaque_fragment>');};fringe.customProgramCacheKey=()=> 'painted-hedge-fringe-v1';
 const rect=atlasRect(SCREEN_PANELS.temperate),fringeUV=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>[rect.origin[0]+u*rect.size[0],rect.origin[1]+v*rect.size[1]]);
 const buckets=new Map(),owned=[],meshes=[];let disposed=false,greyMode=false,detail=true;
 function bucket(c){const k=`${Math.floor(c.x/HEDGE_CHUNK_SIZE)},${Math.floor(c.z/HEDGE_CHUNK_SIZE)}`;if(!buckets.has(k))buckets.set(k,{core:buffer(),leaves:buffer(),wood:buffer()});return buckets.get(k);}
 function tint(x,z){const n=hedgeHash(Math.floor(x/3),Math.floor(z/3),plan.seed+41);return [.83+n*.12,.86+n*.11,.78+n*.10];}
 for(const c of plan.cells){
  const out=bucket(c);
  for(const points of hedgeCellSurfaces(plan,c).core){
   const a=new T.Vector3(...points[0]),normal=new T.Vector3(...points[1]).sub(a).cross(new T.Vector3(...points[2]).sub(a)).normalize().toArray();
   for(const p of points)vertex(out.core,p,normal,[p[0],p[1]-c.base],tint(p[0],p[2]));
  }
  // Small leaf sprays soften shoulders without hiding a neighboring clear tile.
  const random=i=>hedgeHash(c.x*53+i,c.z,(c.seed??plan.seed)+61);
  for(let i=0;i<(c.kind==='tall'?26:18);i++){
   const angle=random(i*5)*Math.PI*2,dist=.28+random(i*5+1)*.10,x=c.x+Math.cos(angle)*dist,z=c.z+Math.sin(angle)*dist,f=plan.sample(x,z,c.base);
   if(f.distance<.16)continue;
   const nx=(x-f.cx)/(f.distance||1),nz=(z-f.cz)/(f.distance||1),width=.18+random(i*5+2)*.20,height=.15+random(i*5+3)*.19;
   const cx=f.cx+nx*f.radius*.99,cz=f.cz+nz*f.radius*.99,edge=plan.surface(cx,cz,c.base),y=c.base+.12+(edge-c.base-.15)*random(i*5+4),top=Math.min(y+height,edge+(c.kind==='tall'?.09:.035));
   const points=[[-1,0],[1,0],[1,1],[-1,1]].map(([u,v])=>[cx+nz*u*width/2+nx*v*.025,lerp(y,top,v),cz-nx*u*width/2+nz*v*.025]);
   if(points.some(p=>!plan.contains(p[0],p[2],c.base,.006)))continue;
   quad(out.leaves,points,[nx,.18,nz],tint(x,z),fringeUV);
  }
 }
 for(const beam of plan.wood){
  const a=new T.Vector3(...beam.a),b=new T.Vector3(...beam.b),mid=a.clone().add(b).multiplyScalar(.5),g=new T.CylinderGeometry(beam.radius*.72,beam.radius,a.distanceTo(b),5,1);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize()));g.translate(...mid.toArray());
  const expanded=g.toNonIndexed(),out=bucket({x:beam.cell[0],z:beam.cell[1]}).wood;
  for(let i=0;i<expanded.attributes.position.count;i++)vertex(out,[0,1,2].map(k=>expanded.attributes.position.array[i*3+k]),[0,1,2].map(k=>expanded.attributes.normal.array[i*3+k]),[0,1].map(k=>expanded.attributes.uv.array[i*2+k]),[.72,.66,.54]);
  expanded.dispose();g.dispose();
 }
 smoothCoreNormals([...buckets.values()].map(b=>b.core));
 for(const [chunk,data]of buckets)for(const [layer,material]of [['core',paint.temperate],['wood',paint.wood],['leaves',fringe]]){
  if(options.chunk&&chunk!==options.chunk||!data[layer].position.length)continue;
  const g=geometry(data[layer]),mesh=new T.Mesh(g,material);mesh.name=`hedge:${chunk}:${layer}`;mesh.userData={layer,paint:material};mesh.castShadow=layer!=='leaves';mesh.receiveShadow=layer!=='leaves';root.add(mesh);owned.push(g);meshes.push(mesh);
 }
 root.updateMatrixWorld(true);
 const bounds=new T.Box3().setFromObject(root),contract={units:'world; 1 unit = 1 tile',coordinates:'Authored coordinates in root-local space; transform with root.matrixWorld after placement. Keep root scale at one.',placement:'Saved hedge-short / hedge-tall props; renderer receives cells through hedgeGroups.',cells:plan.cells.map(c=>({...c})),wood:plan.wood.map(b=>({a:[...b.a],b:[...b.b],radius:b.radius,tipRadius:b.radius*.72})),sight:'Use the finite core geometry for leaf screening; leaves are not solid projectile cover.',bounds:bounds.isEmpty()?null:{min:bounds.min.toArray(),max:bounds.max.toArray()}};
 function update(){for(const m of meshes){m.visible=m.userData.layer!=='leaves'||(detail&&!greyMode);m.material=greyMode?grey:m.userData.paint;}}
 return {root,plan,contract,stats(){return {cells:plan.cells.length,chunks:buckets.size,meshes:meshes.length,triangles:owned.reduce((n,g)=>n+g.attributes.position.count/3,0),woodBeams:plan.wood.length};},setGrey(value){greyMode=!!value;update();},setDetail(value){detail=!!value;update();},dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const g of owned)g.dispose();for(const m of materials)m.dispose();root.clear();}};
}
