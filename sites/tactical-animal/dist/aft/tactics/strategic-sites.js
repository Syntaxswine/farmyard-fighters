import * as THREE from './vendor/three.module.js';
import {softBox} from './painted-environment-scene.js';
import {analyzeSiteClearance} from './strategic-site-clearance.js';

export const STRATEGIC_SITE_ATLAS='../assets/environment/strategic-sites/material-atlas.png';
export const STRATEGIC_SITES=Object.freeze([
 {id:'radio',name:'Radio tower',tiles:[8,8],note:'Striped open mast · service hut · folded lattice wreck'},
 {id:'radar',name:'Radar tower',tiles:[8,8],note:'Segmented dish · open trestle · fractured reflector wreck'},
 {id:'sam',name:'SAM site',tiles:[8,8],note:'Twin raised missiles · turntable mount · torn launcher wreck'},
]);
export const SITE_SLAB_HEIGHT=.24;
const V=(x,y,z)=>new THREE.Vector3(x,y,z),UP=V(0,1,0);
// Convex outline of one solid foundation in the site's local X/Z plane.
// The SAM's round foundation must not be displayed as a square bounding box.
function foundationOutline(mesh){
 const points=new Map(),p=mesh.geometry.attributes.position;
 for(let i=0;i<p.count;i++){const v=V().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);points.set(v.x.toFixed(6)+','+v.z.toFixed(6),[v.x,v.z]);}
 const sorted=[...points.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 const half=items=>{const h=[];for(const p of items){while(h.length>=2&&cross(h.at(-2),h.at(-1),p)<=1e-9)h.pop();h.push(p);}h.pop();return h;};
 return [...half(sorted),...half(sorted.slice().reverse())];
}

// All roots borrow library-owned resources. Dispose the library after removing
// its roots; the caller retains ownership of the supplied atlas.
export function createStrategicSiteLibrary(atlas){
 if(!atlas?.isTexture)throw new TypeError('A painted texture atlas is required');
 const geometries=new Set(),materials=new Set(),textures=new Set(),cache=new Map(),templates=new Map(),clearances=new Map();
 let disposed=false;
 const own=g=>(geometries.add(g),g);
 const normalizeUV=g=>{
  const uv=g.attributes.uv;let minU=Infinity,minV=Infinity,maxU=-Infinity,maxV=-Infinity;
  for(let i=0;i<uv.count;i++){minU=Math.min(minU,uv.getX(i));minV=Math.min(minV,uv.getY(i));maxU=Math.max(maxU,uv.getX(i));maxV=Math.max(maxV,uv.getY(i));}
  for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)-minU)/(maxU-minU||1),(uv.getY(i)-minV)/(maxV-minV||1));
  return g;
 };
 const geo=(key,create)=>{if(!cache.has(key))cache.set(key,own(create()));return cache.get(key);};
 const paint=(cell,color=0xffffff)=>{
  const t=atlas.clone();t.colorSpace=THREE.SRGBColorSpace;
  t.offset.set(cell%4*.25+.006,cell<4?.512:.012);t.repeat.set(.238,.476);
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.needsUpdate=true;textures.add(t);
  const m=new THREE.MeshStandardMaterial({map:t,color,roughness:.94,metalness:0});
  materials.add(m);return m;
 };
 const mat={red:paint(0),ivory:paint(1),olive:paint(2),concrete:paint(3),steel:paint(4),char:paint(5),rust:paint(6),ash:paint(7)};
 const plain=color=>{const m=new THREE.MeshStandardMaterial({color,roughness:1});materials.add(m);return m;};
 mat.dark=plain(0x292d27);mat.brass=plain(0xb49552);
 for(const [name,material]of Object.entries(mat))material.name='site-'+name;
 const group=(parent,name)=>{const g=new THREE.Group();g.name=name;parent.add(g);return g;};
 function mesh(parent,g,m,p=[0,0,0],r=[0,0,0]){
  const o=new THREE.Mesh(g,m);o.position.set(...p);o.rotation.set(...r);o.castShadow=o.receiveShadow=true;parent.add(o);return o;
 }
 function box(parent,m,p,s,r=[0,0,0],bevel=0){
  const key='box:'+s.join(',')+':'+bevel;
  return mesh(parent,geo(key,()=>bevel?normalizeUV(softBox(...s,bevel,1)):new THREE.BoxGeometry(...s)),m,p,r);
 }
 function cylinder(parent,m,p,rt,rb,h,segments=12,r=[0,0,0],open=false){
  return mesh(parent,geo(['cyl',rt,rb,h,segments,open].join(':'),()=>new THREE.CylinderGeometry(rt,rb,h,segments,1,open)),m,p,r);
 }
 function beam(parent,m,a,b,width=.06,depth=width){
  const av=V(...a),bv=V(...b),length=av.distanceTo(bv),o=box(parent,m,av.clone().add(bv).multiplyScalar(.5).toArray(),[width,length,depth]);
  o.quaternion.setFromUnitVectors(UP,bv.sub(av).normalize());return o;
 }
 function tube(parent,m,points,r=.028){
  const c=new THREE.CatmullRomCurve3(points.map(p=>V(...p)));
  return mesh(parent,own(new THREE.TubeGeometry(c,Math.max(8,points.length*4),r,6,false)),m);
 }
 function torus(parent,m,p,r,t=.025,rot=[0,0,0],arc=Math.PI*2){
  return mesh(parent,geo(['torus',r,t,arc].join(':'),()=>new THREE.TorusGeometry(r,t,6,32,arc)),m,p,rot);
 }
 function footing(parent,x,z,size=.65){
  const f=group(parent,'footing');f.position.set(x,.24,z);
  box(f,mat.concrete,[0,.16,0],[size,.32,size],[0,0,0],.035);
  box(f,mat.steel,[0,.345,0],[size*.65,.05,size*.65]);
  for(const dx of [-1,1])for(const dz of [-1,1])cylinder(f,mat.rust,[dx*size*.23,.39,dz*size*.23],.025,.025,.075,6);
  return f;
 }
 function hut(parent,x,z,w=1.6,d=1.8,damage=false){
  const h=group(parent,'service-hut');h.position.set(x,.24,z);
  h.userData.door={width:1.10,height:1.85,threshold:.22,localCenter:[-.10,1.145,d/2+.034]};
  box(h,mat.concrete,[0,.11,0],[w+.2,.22,d+.2],[0,0,0],.025);
  box(h,damage?mat.char:mat.olive,[0,1.22,0],[w,2.04,d],[0,0,0],.035);
  box(h,damage?mat.rust:mat.olive,[0,2.29,0],[w+.13,.13,d+.14],[0,0,damage?.06:0],.025);
  box(h,mat.dark,[-.10,1.145,d/2+.015],[1.10,1.85,.025]);
  // Keep the damaged door's swung corner within the unchanged concrete plinth.
  box(h,damage?mat.char:mat.olive,[-.10,1.145,d/2+(damage?.024:.034)],[1.04,1.79,.033],[0,damage?-.1:0,0],.012);
  box(h,mat.brass,[.28,1.09,d/2+.063],[.036,.13,.035]);
  for(let i=0;i<5;i++)box(h,mat.dark,[w/2+.012,1.60+i*.065,-.27],[.023,.03,.72]);
  box(h,mat.ivory,[-.10,1.85,d/2+.057],[.29,.09,.016]);
  for(const dx of [-1,1])for(const dz of [-1,1])box(h,damage?mat.rust:mat.steel,[dx*(w/2-.055),1.23,dz*(d/2-.02)],[.065,2.1,.065]);
  return h;
 }
 function cabinet(parent,x,z,damage=false){
  const c=group(parent,'control-cabinet');c.position.set(x,.24,z);
  box(c,mat.concrete,[0,.10,0],[.75,.2,.65],[0,0,0],.025);
  box(c,damage?mat.char:mat.olive,[0,.65,0],[.62,.95,.50],[0,0,damage?.12:0],.025);
  box(c,mat.dark,[0,.86,.265],[.42,.20,.024]);
  for(const dx of [-.13,0,.13])cylinder(c,mat.brass,[dx,.63,.285],.035,.035,.024,8,[Math.PI/2,0,0]);
  for(let i=0;i<3;i++)box(c,mat.steel,[0,.32+i*.07,.27],[.40,.028,.02]);
 }
 function siteBase(root,damage){
  const pad=group(root,'hardstanding');
  box(pad,mat.concrete,[0,.10,0],[8,.20,8]);
  // Separate panels give the 8 x 8 footprint an unobtrusive, countable rhythm.
  for(let x=0;x<4;x++)for(let z=0;z<4;z++)box(pad,damage&&((x+z)%4===1)?mat.ash:mat.concrete,[-3+x*2,.22,-3+z*2],[1.984,.04,1.984]);
  for(const x of [-3.78,3.78])for(const z of [-3.78,3.78])box(pad,mat.ivory,[x,.242,z],[.21,.004,.21]);
 }
 function rubble(parent,seed,center=[0,0,0],count=10){
  const r=group(parent,'scattered-fragments');
  for(let i=0;i<count;i++){
   const a=i*2.399+seed,rad=.5+(i%4)*.43,x=center[0]+Math.cos(a)*rad,z=center[2]+Math.sin(a)*rad;
   const s=[.14+(i%3)*.1,.10+(i%4)*.04,.20+(i%2)*.20];
   // Fragments are uneven wedges, visually distinct from fixed square footings.
   const g=own(softBox(...s,.018,1)),p=g.attributes.position;
   for(let j=0;j<p.count;j++){const px=p.getX(j),py=p.getY(j),pz=p.getZ(j);p.setXYZ(j,px+py*.22,py*(.72+.20*px/s[0]+.16*pz/s[2]),pz);}
   g.computeVertexNormals();normalizeUV(g);
   const fragment=mesh(r,g,i%3===0?mat.concrete:i%2?mat.char:mat.rust,[x,0,z],[0,a,0]);
   fragment.updateMatrixWorld(true);fragment.position.y=.24-new THREE.Box3().setFromObject(fragment,true).min.y;
  }
 }
 function ground(group,x,z,rotation){
  group.position.set(x,0,z);group.rotation.set(...rotation);group.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(group,true);group.position.y+=.24-b.min.y;
  group.userData.groundContact=true;
 }
 function lattice(parent,name,length,bottom,top,bays,damage=false,skip=0){
  const g=group(parent,name),step=length/bays;
  for(let i=0;i<bays;i++){
   const y=i*step,lo=bottom+(top-bottom)*i/bays,hi=bottom+(top-bottom)*(i+1)/bays,m=damage?(i%3===0?mat.char:i%2?mat.ivory:mat.red):(i%2?mat.ivory:mat.red);
   for(const sx of [-1,1])for(const sz of [-1,1])beam(g,m,[sx*lo,y,sz*lo],[sx*hi,y+step,sz*hi],.092);
   for(let face=0;face<4;face++){
    const side=face<2?-1:1,axis=face%2;
    const p=(n,h,t)=>axis?[side*t,h,n*t]:[n*t,h,side*t];
    beam(g,m,p(-1,y,lo),p(1,y,lo),.061);
    if(!(damage&&i===skip&&face===1)){
     beam(g,m,p(-1,y,lo),p(1,y+step,hi),.045);
     beam(g,m,p(1,y,lo),p(-1,y+step,hi),.045);
    }
   }
  }
  return g;
 }
 function littleDish(parent,p,rot=[0,0,0],damage=false){
  const g=group(parent,'microwave-dish');g.position.set(...p);g.rotation.set(...rot);
  const geometry=geo('littleDish',()=>{
   const positions=[],uvs=[];
   for(let s=0;s<20;s++){
    const a=s/20*Math.PI*2,b=(s+1)/20*Math.PI*2;
    for(const p of [[0,0,-.12],[Math.cos(a)*.4,Math.sin(a)*.4,0],[Math.cos(b)*.4,Math.sin(b)*.4,0]]){positions.push(...p);uvs.push(p[0]/.8+.5,p[1]/.8+.5);}
   }
   const d=new THREE.BufferGeometry();d.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));d.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));d.computeVertexNormals();return d;
  });
  mesh(g,geometry,damage?mat.char:mat.ivory);torus(g,mat.steel,[0,0,0],.40,.015);
  beam(g,mat.steel,[0,0,-.05],[0,0,-.52],.045);box(g,mat.olive,[0,0,-.52],[.11,.11,.11]);
  beam(g,mat.steel,[0,-.32,0],[0,0,.19],.025);box(g,mat.ivory,[0,0,.19],[.07,.07,.10]);
  return g;
 }
 function radio(root,damage){
  const base=group(root,'tower-foundations');for(const x of [-1.05,1.05])for(const z of [-1.05,1.05])footing(base,x+.60,z-.30);
  // The 2 x 2 hut belongs at the center of four cells, not on a single-cell
  // center. Its plinth fits X[-4,-2], Z[1,3]; the cabinet stays on its own tile.
  const hutX=-3,hutZ=2;
  hut(root,hutX,hutZ,1.5,1.8,damage);cabinet(root,2.5,-2.5,damage);
  tube(root,mat.dark,[[hutX+.40,.28,hutZ+.35],[hutX+1.25,.28,hutZ],[.25,.28,1.1],[.48,.46,.62]]);
  if(!damage){
   const tower=lattice(root,'radio-mast',7.65,1.05,.25,6);tower.position.set(.60,.63,-.30);
   for(let i=0;i<24;i++)beam(tower,mat.steel,[-.17,i*.30,-.28],[.17,i*.30,-.28],.028);
   for(const x of [-.19,.19])beam(tower,mat.steel,[x,0,-.28],[x,7.0,-.28],.035);
   box(tower,mat.ivory,[0,7.69,0],[.65,.12,.65]);
   beam(tower,mat.steel,[0,7.70,0],[0,8.95,0],.055);
   for(const x of [-.36,.36]){beam(tower,mat.red,[0,7.75,0],[x,7.75,0],.05);beam(tower,mat.steel,[x,7.75,0],[x,8.52,0],.028);}
   littleDish(tower,[.60,4.15,.10],[0,-Math.PI/2,0]);
   littleDish(tower,[0,6.42,.37],[0,Math.PI,0]);
   box(tower,mat.red,[0,8.97,0],[.12,.12,.12],[0,0,0],.02);
  }else{
   for(const x of [-1.05,1.05])for(const z of [-1.05,1.05])beam(root,mat.char,[x+.60,.60,z-.30],[x+.56,.97+(x>0?.22:0),z-.26],.095);
   const a=lattice(root,'fallen-mast-lower',3.65,1.04,.67,3,true);ground(a,.20,.48,[.10,.52,-1.40]);
   const b=lattice(root,'fallen-mast-upper',3.50,.64,.25,3,true);ground(b,-.55,-1.45,[1.47,.10,-.36]);
   const dish=littleDish(root,[0,0,0],[0,0,0],true);dish.name='fallen-radio-dish';ground(dish,2.9,2.7,[1.2,0,.5]);
   tube(root,mat.rust,[[1.7,.29,1.8],[2.8,.33,1.4],[3.25,.40,1.8],[3.45,.31,2.2]],.04);
   rubble(root,2,[.8,0,.4],12);
  }
 }
 function reflector(parent,name,damage=false){
  const g=group(parent,name),R=2.02,depth=.56,sectors=24,rings=5;
  const pt=(r,a)=>V(r*Math.cos(a),r*Math.sin(a),depth*((r/R)**2-1));
  for(let s=0;s<sectors;s++){
   if(damage&&s>=2&&s<=6)continue;
   const a=s/sectors*Math.PI*2,b=(s+1)/sectors*Math.PI*2,pos=[],uv=[];
   for(let ring=0;ring<rings;ring++){
    const r0=R*ring/rings,r1=R*(ring+1)/rings,verts=ring===0?[pt(0,a),pt(r1,a),pt(r1,b)]:[pt(r0,a),pt(r1,a),pt(r1,b),pt(r0,a),pt(r1,b),pt(r0,b)];
    for(const p of verts){pos.push(...p.toArray());uv.push(p.x/(R*2)+.5,p.y/(R*2)+.5);}
   }
   const geom=own(new THREE.BufferGeometry());geom.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geom.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geom.computeVertexNormals();
   mesh(g,geom,damage?(s%8===0?mat.char:mat.olive):mat.olive);
   beam(g,damage?mat.rust:mat.steel,pt(R,a).toArray(),pt(R,b).toArray(),.05);
   if(s%2===0){
    const pts=Array.from({length:6},(_,i)=>pt(R*i/5,a).add(V(0,0,-.05)).toArray());
    tube(g,damage?mat.rust:mat.steel,pts,.028);
   }
   if(s%3===0){
    const seam=Array.from({length:6},(_,i)=>pt(R*i/5,a).add(V(0,0,.007)).toArray());
    tube(g,damage?mat.char:mat.olive,seam,.014);
   }
  }
  cylinder(g,mat.steel,[0,0,-.74],.29,.38,.32,12,[Math.PI/2,0,0]);
  if(!damage)beam(g,mat.steel,[-1.12,0,-.77],[1.12,0,-.77],.14);
  for(const a of [Math.PI/2,Math.PI*7/6,Math.PI*11/6]){
   if(damage&&a===Math.PI/2)continue;
   beam(g,damage?mat.rust:mat.ivory,pt(1.68,a).toArray(),[0,0,.85],.047);
  }
  cylinder(g,damage?mat.char:mat.ivory,[0,0,.85],.13,.18,.32,12,[Math.PI/2,0,0]);
  return g;
 }
 function radar(root,damage){
  const base=group(root,'tower-foundations');for(const x of [-1.10,1.10])for(const z of [-.95,.95])footing(base,x+.3,z-.25,.72);
  // Center the 2 x 2 service hut between its four occupied cells, matching
  // the radio hut's grid convention while preserving the smaller hut body.
  hut(root,-3,2,1.5,1.50,damage);
  cabinet(root,2.9,2.55,damage);
  if(!damage){
   const trestle=lattice(root,'radar-trestle',2.95,1.1,.76,3);trestle.position.set(.3,.64,-.25);
   const deck=group(root,'maintenance-platform');deck.position.set(.3,3.65,-.25);
   box(deck,mat.steel,[0,0,0],[2.25,.15,2.12]);
   for(let i=0;i<8;i++)box(deck,mat.olive,[-.94+i*.27,.09,0],[.21,.055,2.0]);
   for(const x of [-1.05,1.05]){beam(deck,mat.red,[x,.1,-.95],[x,.63,-.95],.055);beam(deck,mat.red,[x,.63,-.95],[x,.63,.65],.055);}
   for(const x of [-.2,.2])beam(root,mat.steel,[x+.3,.30,-1.42],[x+.3,3.67,-1.42],.04);
   for(let i=0;i<12;i++)beam(root,mat.ivory,[.10,.43+i*.27,-1.42],[.5,.43+i*.27,-1.42],.03);
   const yoke=group(root,'dish-yoke');yoke.position.set(.3,3.78,-.25);
   cylinder(yoke,mat.olive,[0,.17,0],.60,.72,.38,16);
   box(yoke,mat.olive,[0,.27,-.55],[2.38,.22,.75],[0,0,0],.018);
   for(const x of [-1.03,1.03]){box(yoke,mat.red,[x,1.24,-.80],[.18,2.28,.27],[0,0,x*.10],.025);cylinder(yoke,mat.ivory,[x,2.28,-.70],.26,.26,.22,12,[0,0,Math.PI/2]);}
   const dish=reflector(root,'radar-reflector');dish.position.set(.3,6.13,-.16);dish.rotation.x=-.28;
  }else{
   const supports=group(root,'buckled-trestle');
   for(const x of [-1.1,1.1])for(const z of [-.95,.95])tube(supports,mat.char,[[x+.3,.63,z-.25],[x+.2,1.10,z-.25],[x*.5+.55,1.43,z*.65-.25]],.065);
   const d=reflector(root,'fallen-reflector',true);ground(d,.35,-.25,[-.62,.16,-.35]);
   const deck=group(root,'fallen-platform');box(deck,mat.char,[0,0,0],[2.1,.15,1.8]);for(const x of [-1,1])beam(deck,mat.red,[x,.04,-.8],[x,.48,-.8],.07);ground(deck,.9,2.2,[.08,.2,.18]);
   const shard=group(root,'broken-dish-sector');
   const shape=new THREE.Shape();shape.moveTo(0,0);shape.absarc(0,0,1.8,0,.9,false);shape.lineTo(0,0);
   const sg=own(normalizeUV(new THREE.ShapeGeometry(shape,10)));mesh(shard,sg,mat.olive);
   beam(shard,mat.rust,[0,0,0],[1.8,0,0],.045);ground(shard,-1.5,-1.85,[-Math.PI/2,0,1.6]);
   rubble(root,4,[.6,0,.1],12);
  }
 }
 function missile(parent,name,damage=false,length=2.85){
  const g=group(parent,name);
  cylinder(g,damage?mat.char:mat.ivory,[0,0,0],.17,.17,length,16,[Math.PI/2,0,0],damage);
  for(const z of [-length*.33,length*.34])cylinder(g,damage?mat.rust:mat.steel,[0,0,z],.176,.176,.055,16,[Math.PI/2,0,0]);
  if(!damage)cylinder(g,mat.red,[0,0,length/2+.34],0,.17,.68,16,[Math.PI/2,0,0]);
  cylinder(g,mat.dark,[0,0,-length/2-.018],.12,.14,.04,12,[Math.PI/2,0,0]);
  for(let i=0;i<4;i++){
   const fin=group(g,'missile-fin');fin.rotation.z=i*Math.PI/2;
   const shape=new THREE.Shape();shape.moveTo(.1,-length/2+.12);shape.lineTo(.48,-length/2-.10);shape.lineTo(.44,-length/2+.55);shape.lineTo(.1,-length/2+.82);
   const geom=own(normalizeUV(new THREE.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:false})));geom.rotateX(Math.PI/2);geom.translate(0,.018,0);
   mesh(fin,geom,damage?mat.rust:mat.ivory);
  }
  return g;
 }
 function sam(root,damage){
  const base=group(root,'launcher-foundation');
  cylinder(base,mat.concrete,[0,.38,0],2.05,2.15,.28,32);
  cylinder(base,damage?mat.char:mat.olive,[0,.65,0],1.43,1.58,.28,24);
  torus(base,mat.steel,[0,.81,0],1.26,.04,[Math.PI/2,0,0]);
  for(const x of [-1.85,1.85])for(const z of [-1.5,1.5]){footing(base,x,z,.62);beam(base,mat.olive,[x,.66,z],[x*.40,.73,z*.40],.19);}
  cabinet(root,-2.95,2.5,damage);cabinet(root,2.85,-2.7,damage);
  tube(root,mat.dark,[[-2.85,.3,2.2],[-2.1,.29,1.7],[-1.35,.55,.45]]);
  if(!damage){
   box(root,mat.olive,[0,1.1,0],[1.54,.64,1.43],[0,0,0],.045);
   for(const x of [-.72,.72])box(root,mat.olive,[x,1.69,0],[.28,1.04,.78],[0,0,0],.045);
   cylinder(root,mat.steel,[0,1.92,0],.27,.27,2.05,16,[0,0,Math.PI/2]);
   const launch=group(root,'elevated-launcher');launch.position.set(0,2.00,0);launch.rotation.x=-.46;
   for(const x of [-.71,.71]){
    const rail=group(launch,'launch-rail');
    for(const side of [-1,1])box(rail,mat.olive,[x+side*.18,0,0],[.075,.24,4.16],[0,0,0],.008);
    for(const z of [-1.7,-.8,.3,1.55])box(rail,mat.steel,[x,-.13,z],[.48,.06,.13]);
    const m=missile(launch,x<0?'missile-left':'missile-right');m.position.set(x,.29,0);
    for(const z of [-1.1,.7])box(launch,mat.steel,[x,.10,z],[.13,.14,.13]);
   }
   beam(launch,mat.steel,[-.90,-.13,1.3],[.90,-.13,1.3],.10);
   const ramTop=V(0,-.13,1.3).applyEuler(launch.rotation).add(launch.position),ramBase=V(0,.94,.80);
   beam(root,mat.steel,ramBase.toArray(),ramTop.toArray(),.13);
   beam(root,mat.olive,ramBase.toArray(),ramBase.clone().lerp(ramTop,.61).toArray(),.23);
   cylinder(root,mat.steel,ramTop.toArray(),.14,.14,.28,12,[0,0,Math.PI/2]);
  }else{
   box(root,mat.char,[0,1.0,0],[1.48,.50,1.37],[0,0,.12],.04);
   const rail=group(root,'broken-launch-rails');
   for(const x of [-.73,.73])for(const side of [-1,1])tube(rail,mat.char,[[x+side*.17,0,-1.8],[x+side*.17,.05,-.3],[x+side*.25,.48,.85],[x+side*.35,.19,1.5]],.055);
   for(const [z,y,span]of [[-1.8,0,.90],[-.3,.05,.90],[.85,.48,.98]])beam(rail,mat.rust,[-span,y,z],[span,y,z],.10);
   rail.position.set(.3,1.22,.25);rail.rotation.z=.20;
   const body=missile(root,'fallen-missile',true,1.72);ground(body,-2.65,-.50,[-.07,.55,.02]);
   const nose=group(root,'detached-nose');cylinder(nose,mat.red,[0,0,0],0,.17,.68,16,[Math.PI/2,0,0]);cylinder(nose,mat.char,[0,0,-.36],.17,.17,.07,16,[Math.PI/2,0,0]);ground(nose,2.6,2.0,[0,.80,0]);
   const tail=group(root,'fallen-rail');box(tail,mat.olive,[0,0,0],[.40,.18,2.0]);ground(tail,1.9,-1.65,[0,-.6,.13]);
   rubble(root,7,[0,0,.5],13);
  }
 }
 // Shells and torn sheet metal remain legible from rear and low views.
 for(const m of Object.values(mat))m.side=THREE.DoubleSide;
 // Bake each semantic assembly by material. Clones stay cheap while wreckage
 // remains independently measurable for grounded contact and footprint checks.
 function pack(assembly){
  assembly.updateMatrixWorld(true);const inv=assembly.matrixWorld.clone().invert(),buckets=new Map();
  assembly.traverse(o=>{
   if(!o.isMesh)return;
   const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(inv.clone().multiply(o.matrixWorld));
   if(!buckets.has(o.material))buckets.set(o.material,[]);
   buckets.get(o.material).push(g);
  });
  assembly.clear();
  for(const [m,parts]of buckets){
   const merged=own(new THREE.BufferGeometry());
   for(const [attr,size]of [['position',3],['normal',3],['uv',2]]){
    const length=parts.reduce((n,g)=>n+g.attributes[attr].array.length,0),values=new Float32Array(length);let at=0;
    for(const g of parts){values.set(g.attributes[attr].array,at);at+=g.attributes[attr].array.length;}
    merged.setAttribute(attr,new THREE.BufferAttribute(values,size));
   }
   merged.computeBoundingBox();merged.computeBoundingSphere();mesh(assembly,merged,m);
   for(const g of parts)g.dispose();
  }
 }
 for(const site of STRATEGIC_SITES)for(const state of ['intact','destroyed']){
  const root=new THREE.Group();root.name=site.id+'-'+state;
  root.userData={siteId:site.id,state,footprint:[8,8],tileSize:1,slabHeight:.24};
  siteBase(root,state==='destroyed');({radio,radar,sam})[site.id](root,state==='destroyed');
  // Record each permanent concrete component before material batching. These
  // anchors (including hut/cabinet plinths) must remain identical after damage.
  root.updateMatrixWorld(true);root.userData.foundations=[];
  for(const assembly of root.children){
   if(assembly.name==='scattered-fragments'||assembly.name==='hardstanding')continue;
   assembly.traverse(o=>{if(o.isMesh&&o.material===mat.concrete){
    const b=new THREE.Box3().setFromObject(o,true),center=b.getCenter(new THREE.Vector3());
    root.userData.foundations.push({id:assembly.name+':'+center.x.toFixed(3)+','+center.z.toFixed(3),name:assembly.name,min:b.min.toArray(),max:b.max.toArray(),outline:foundationOutline(o)});
   }});
  }
  // Loose top-level meshes are also packed into one assembly.
  const detail=group(root,'fixed-detail');for(const o of [...root.children])if(o.isMesh)detail.attach(o);
  for(const assembly of root.children)pack(assembly);
  root.updateMatrixWorld(true);templates.set(site.id+':'+state,root);
 }
 const used=new Set();for(const root of templates.values())root.traverse(o=>{if(o.geometry)used.add(o.geometry);});
 for(const g of geometries)if(!used.has(g)){g.dispose();geometries.delete(g);}
 cache.clear();
 return {
  build(id,{state='intact'}={}){
   if(disposed)throw Error('Strategic site library has been disposed');
   const template=templates.get(id+':'+state);if(!template)throw RangeError('Unknown strategic site or state: '+id+'/'+state);
   const root=template.clone(true);root.updateMatrixWorld(true);
   return {root,site:STRATEGIC_SITES.find(s=>s.id===id),state,bounds:new THREE.Box3().setFromObject(root,true)};
  },
  clearance(id,{state='intact',profile='horse'}={}){
   if(disposed)throw Error('Strategic site library has been disposed');
   const template=templates.get(id+':'+state);if(!template)throw RangeError('Unknown strategic site or state');
   const key=id+':'+state+':'+profile;
   if(!clearances.has(key))clearances.set(key,analyzeSiteClearance(template,profile));
   return structuredClone(clearances.get(key));
  },
  stats(){return {geometries:geometries.size,materials:materials.size,textures:textures.size,templates:templates.size,disposed};},
  dispose(){if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();templates.clear();cache.clear();clearances.clear();geometries.clear();materials.clear();textures.clear();},
 };
}
