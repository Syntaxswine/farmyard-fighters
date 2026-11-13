import {createBuildingModel} from './source/packages/building-catalog/three.js';
import {MATERIALS} from './source/packages/building-catalog/index.js';
import {createRoofGroup} from './source/packages/roof-core/three.js';
import {createRailwayKit} from './source/packages/railway-visuals/three.js';
import {TRELLIS_BEAMS} from '../../aft/tactics/bridge-trellis.js';
import {ART_REVISION,ATLAS_URL,placementsForBounds,solidsForBounds} from './manifest.js';
const tiles=new Map(MATERIALS.map(m=>[m.id,m.tile]));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const closed=ring=>ring.length>1&&Math.hypot(...ring[0].map((v,i)=>v-ring.at(-1)[i]))<1e-6?ring.slice(0,-1):ring;
// The smallest rectangle around an outline, from its edges: the frame roof() builds a
// pitched roof in (x along c, s; town y runs south).
function fit(points){let best;
  const loop=closed(points);for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length],angle=Math.atan2(b[1]-a[1],b[0]-a[0]),c=Math.cos(angle),s=Math.sin(angle),ps=loop.map(p=>[p[0]*c+p[1]*s,-p[0]*s+p[1]*c]),lo=[Math.min(...ps.map(p=>p[0])),Math.min(...ps.map(p=>p[1]))],hi=[Math.max(...ps.map(p=>p[0])),Math.max(...ps.map(p=>p[1]))],area=(hi[0]-lo[0])*(hi[1]-lo[1]);if(!best||area<best.area)best={angle,c,s,lo,hi,area};}return best;
}
// The ridge axis roof() takes for a ridge bearing in the town (degrees clockwise from north,
// so a bearing points (sin, -cos)): 'x' where the ridge runs along fit()'s x.
const ridgeAxisIn=(f,bearingDeg)=>{const t=bearingDeg*Math.PI/180;return Math.abs(f.c*Math.sin(t)-f.s*Math.cos(t))>=Math.SQRT1_2?'x':'y';};
// The ridge axis roof() takes: along a ridge bearing where one is given, else the
// treatment's axis, else the fitted rectangle's longer side.
const ridgeAxis=(f,bearingDeg,roofAxis)=>Number.isFinite(bearingDeg)?ridgeAxisIn(f,bearingDeg):roofAxis||(f.hi[0]-f.lo[0]>=f.hi[1]-f.lo[1]?'x':'y');
// The ridge roof() builds for an outline (and bearing), as a town direction [east, south].
export function ridgeDirection(points,bearingDeg){const f=fit(points);return ridgeAxis(f,bearingDeg)==='x'?[f.c,f.s]:[-f.s,f.c];}
const TRELLIS_THICKNESS=.4;
// Open structures: only their roofs fade, while the focus stands under one.
const OPEN_KINDS=new Set(['pavilion','stage','boathouse']);
// AFT's one-tile timber trellis panel (TRELLIS_BEAMS: two posts, two rails and an X
// brace in a 1 x 2 m panel) cut down to `height` along a run from `from` to `to`
// (local [x,z] metres): one panel per metre of the run, panel heights scaled, beam
// sections at TRELLIS_THICKNESS of AFT's so they still read. Each box is set by
// yaw about Y, then the roll that tilts it within the panel (Three's XYZ order).
export function trellisBoxes(from,to,height){
 const dx=to[0]-from[0],dz=to[1]-from[1],len=Math.hypot(dx,dz);if(len<1e-6||height<=0)return [];
 const u=[dx/len,dz/len],yaw=-Math.atan2(dz,dx),count=Math.max(1,Math.round(len)),panel=len/count,scale=height/2,boxes=[];
 for(let i=0;i<count;i++)for(const beam of TRELLIS_BEAMS){
  const a=[(i+beam.a[0])*panel,beam.a[1]*scale],b=[(i+beam.b[0])*panel,beam.b[1]*scale],along=(a[0]+b[0])/2;
  boxes.push({centre:[from[0]+u[0]*along,(a[1]+b[1])/2,from[1]+u[1]*along],size:[Math.hypot(b[0]-a[0],b[1]-a[1]),beam.width*TRELLIS_THICKNESS,.16*TRELLIS_THICKNESS],yaw,roll:Math.atan2(b[1]-a[1],b[0]-a[0])});
 }
 return boxes;
}

// The host owns renderer, scene, atlas and world transform. This module never
// fetches, starts a loop, mutates map data or allocates the rest of the town.
export function createMountDoraArt({THREE:T,atlas=null}={}){
 if(!T?.BufferGeometry||!T?.ShapeUtils)throw Error('Supply the game host Three.js.');
 if(atlas!==null&&!atlas.isTexture)throw Error('Atlas must be a host Three.js texture.');
 // Whole-atlas mip levels mix adjacent painted cells at town viewing distances.
 // One owned sampler shares the original image, without changing host settings.
 const sampler=atlas?.clone()??null;if(sampler){sampler.needsUpdate=true;}
 const root=new T.Group(),resident=new Map(),pool=new Map(),fades=new Map();let disposed=false,created=0,evicted=0,focusState=null,focusKey='',railKit=null;
 root.name='mount-dora-art';root.userData={artRevision:ART_REVISION,coordinates:'town east/south metres',metresPerUnit:1};
 function material(id,tint=[1,1,1],repeat=false,finish=null){
  const key=id+':'+tint+':'+repeat+(finish?':'+finish:'');if(pool.has(key))return pool.get(key);
  const glass=id==='glass',metal=finish==='silver'||finish==='stamped-tin';
  const luminance={silver:[.15,.75],'stamped-tin':[.58,.42],'painted-white':[.56,.44]}[finish];
  const m=new T.MeshStandardMaterial({color:glass?0x59726e:new T.Color(...tint),map:glass?null:sampler,roughness:glass?.32:metal?.6:.93,metalness:finish==='silver'?.28:metal?.16:0,side:T.DoubleSide,vertexColors:repeat,transparent:false});m.name='md:'+key;
  if(atlas&&!glass){const tile=tiles.get(id)??0,offset=[(tile%4)/4,(3-Math.floor(tile/4))/4],scale=.976/4;
   m.onBeforeCompile=s=>{const phase=repeat?`vec2(${offset}) + vec2(.003) + fract(vMapUv) * ${scale}`:'vMapUv',derivative=repeat?` * ${scale}`:'';s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP\nvec2 mdDx = dFdx(vMapUv)${derivative};\nvec2 mdDy = dFdy(vMapUv)${derivative};\nvec2 mdSafe = min(vec2(.12), max(abs(mdDx),abs(mdDy)) * 2.0 + vec2(.004));\nvec2 mdUV = clamp(${phase}, vec2(${offset}) + mdSafe, vec2(${offset}) + vec2(.25) - mdSafe);\nvec4 mdPaint = textureGrad(map, mdUV, mdDx, mdDy);\n${luminance?`mdPaint.rgb = vec3(${luminance[0]} + dot(mdPaint.rgb, vec3(.2126,.7152,.0722)) * ${luminance[1]});`:''}\ndiffuseColor *= mdPaint;\n#endif`);};m.customProgramCacheKey=()=>`md-atlas-safe:${tile}:${repeat}:${finish}`;
  }else if(!atlas&&!glass){const colors={plaster:0xddd5bf,'cream-siding':0xe2dac3,'sage-siding':0x84917e,'yellow-siding':0xe3c365,brick:0x9b604a,slate:0x535d60,'brown-shingle':0x74614b,'green-metal':0x4a695d,'red-timber':0x9e3e31,wood:0x9e8059,'dark-wood':0x594b3c,concrete:0xbcb7a8};m.color.multiply(new T.Color(colors[id]??0xc9c4b1));}
  if(!atlas&&luminance)m.color.set(finish==='silver'?0xbcc2be:finish==='stamped-tin'?0xdce1e2:0xece9e0);
  pool.set(key,m);return m;
 }
 function addMesh(group,g,m,role='body'){const o=new T.Mesh(g,m);o.castShadow=o.receiveShadow=true;o.userData.occlusionRole=role;group.add(o);return o;}
 function box(group,at,size,id='cream-siding',yaw=0){const g=new T.BoxGeometry(...size),tile=tiles.get(id)??0,uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(tile%4+.012+uv.getX(i)*.976)/4,(3-Math.floor(tile/4)+.012+uv.getY(i)*.976)/4);const o=addMesh(group,g,material(id));o.position.fromArray(at);o.rotation.y=yaw;return o;}
 function cylinder(group,at,r,h,id='cream-siding',top=r,sides=12){const g=new T.CylinderGeometry(top,r,h,sides),tile=tiles.get(id)??0,uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(tile%4+.012+uv.getX(i)*.976)/4,(3-Math.floor(tile/4)+.012+uv.getY(i)*.976)/4);const o=addMesh(group,g,material(id));o.position.fromArray(at);return o;}
 function shape(polygons,height,group,id,role='ground'){for(const polygon of polygons){const rings=polygon.map(closed),s=new T.Shape(rings[0].map(p=>new T.Vector2(p[0],-p[1])));for(const hole of rings.slice(1))s.holes.push(new T.Path(hole.map(p=>new T.Vector2(p[0],-p[1]))));const g=new T.ShapeGeometry(s);g.rotateX(-Math.PI/2);const colors=new Float32Array(g.attributes.position.count*3).fill(1);g.setAttribute('color',new T.BufferAttribute(colors,3));const o=addMesh(group,g,material(id,[1,1,1],true),role);o.position.y=height;}}
 function localPolygons(p){return p.polygons.map(poly=>poly.map(ring=>ring.map(q=>[q[0]-p.anchor[0],q[1]-p.anchor[1]])));}
 // Clip the actual native roof surface against the original footprint triangles.
 // Courtyard holes are triangulated first; no rectangle is drawn across them.
 function roof(group,polygons,treatment,stories,seed){
  for(const [pi,poly]of polygons.entries()){
   const f=fit(poly[0]),w=f.hi[0]-f.lo[0],d=f.hi[1]-f.lo[1];
   if(treatment.roofStyle==='flat'||w>190||d>190||w<.5||d<.5){shape([poly],stories*2.12,group,treatment.roof,'roof');for(const ring of poly){const loop=closed(ring);for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);box(group,[(a[0]+b[0])/2,stories*2.12-.06,(a[1]+b[1])/2],[len,.12,.16],treatment.wall||'cream-siding',-Math.atan2(b[1]-a[1],b[0]-a[0])).userData.occlusionRole='roof';}}continue;}
   const axis=ridgeAxis(f,treatment.ridgeBearingDeg,treatment.roofAxis),span=axis==='x'?d:w,pitch=Math.max(5,Math.min(treatment.pitch,Math.atan((treatment.roofRiseLimit||4)/(span/2))*180/Math.PI));
   // roof-core sets eaves on whole storeys, 1 to 5; a measured eave between them (a
   // boathouse's) is built on the nearest one it takes and lifted the difference.
   const layers=Math.min(5,Math.max(1,Math.round(stories))),lift=(stories-layers)*2.12;
   const native=createRoofGroup(T,{id:'md-roof-'+pi,x:24,y:24,width:w,depth:d,z:layers,style:treatment.roofStyle,axis,pitch,overhang:0,material:'slate',seed:seed>>>0},{materialMap:{slate:material(treatment.roof,[1,1,1],true,treatment.roofFinish),fascia:material('cream-siding',[1,1,1],true),soffit:material('dark-wood',[1,1,1],true)}});
   const mesh=native.children[0],ng=mesh.geometry,positions=[],normals=[],uvs=[],colors=[],rings=poly.map(closed),contour=rings[0].map(p=>new T.Vector2(...p)),holes=rings.slice(1).map(r=>r.map(p=>new T.Vector2(...p))),all=[...contour,...holes.flat()],triangles=T.ShapeUtils.triangulateShape(contour,holes).map(t=>t.map(i=>all[i].toArray()));
   const P=i=>{const a=ng.attributes.position,n=ng.attributes.normal,uv=ng.attributes.uv,col=ng.attributes.color,x=a.getX(i)-24+f.lo[0],z=a.getZ(i)-24+f.lo[1];return {p:[x*f.c-z*f.s,a.getY(i)+lift,x*f.s+z*f.c],n:[n.getX(i)*f.c-n.getZ(i)*f.s,n.getY(i),n.getX(i)*f.s+n.getZ(i)*f.c],uv:[uv.getX(i),uv.getY(i)],col:[col.getX(i),col.getY(i),col.getZ(i)]};};
   const interpolate=(a,b,t)=>Object.fromEntries(Object.keys(a).map(k=>[k,mix(a[k],b[k],t)]));
   function clip(input,tri){let result=input;const sign=cross(...tri)>=0?1:-1;for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3],prev=result;result=[];for(let i=0;i<prev.length;i++){const q=prev[i],v=prev[(i+1)%prev.length],qa=sign*cross(a,b,[q.p[0],q.p[2]]),va=sign*cross(a,b,[v.p[0],v.p[2]]);if(qa>=-1e-7)result.push(q);if((qa>1e-7&&va< -1e-7)||(qa< -1e-7&&va>1e-7))result.push(interpolate(q,v,qa/(qa-va)));}}return result;}
   // Top and underside use the same footprint; native vertical fascia is replaced
   // by the exact outline skirt below, so concavities do not get bounding-box caps.
   for(let i=0;i<ng.index.count;i+=3){const a=[0,1,2].map(k=>P(ng.index.getX(i+k)));if(Math.abs(a[0].n[1])<.001)continue;for(const tri of triangles){const cut=clip(a,tri);for(let j=1;j+1<cut.length;j++)for(const v of [cut[0],cut[j],cut[j+1]]){positions.push(...v.p);normals.push(...v.n);uvs.push(...v.uv);colors.push(...v.col);}}}
   const g=new T.BufferGeometry();for(const [key,data,size]of [['position',positions,3],['normal',normals,3],['uv',uvs,2],['color',colors,3]])g.setAttribute(key,new T.Float32BufferAttribute(data,size));g.computeBoundingBox();g.computeBoundingSphere();addMesh(group,g,material(treatment.roof,[1,1,1],true,treatment.roofFinish),'roof');native.dispose();
   // Close the original outline up to the roof underside. A one-metre maximum
   // sampling interval also covers sloping gable cuts on irregular footprints.
   const slope=Math.tan(pitch*Math.PI/180),height=p=>{const x=p[0]*f.c+p[1]*f.s-f.lo[0],z=-p[0]*f.s+p[1]*f.c-f.lo[1],distance=treatment.roofStyle==='hip'?Math.min(x,w-x,z,d-z):axis==='x'?Math.min(z,d-z):Math.min(x,w-x);return stories*2.12-.12+Math.max(0,distance)*slope;};
   const ps=[],ns=[],us=[],cs=[];for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],len=Math.hypot(...b.map((v,k)=>v-a[k])),n=Math.ceil(len);for(let j=0;j<n;j++){const x=mix(a,b,j/n),z=mix(a,b,(j+1)/n),low=stories*2.12-.12;const points=[[x[0],low,x[1]],[z[0],low,z[1]],[z[0],height(z),z[1]],[x[0],height(x),x[1]]];for(const k of [0,1,2,0,2,3]){ps.push(...points[k]);ns.push(-(b[1]-a[1])/len,0,(b[0]-a[0])/len);us.push(k===1||k===2?len*(j+1)/n:len*j/n,points[k][1]);cs.push(1,1,1);}}}
   const skirt=new T.BufferGeometry();for(const [k,a,n]of [['position',ps,3],['normal',ns,3],['uv',us,2],['color',cs,3]])skirt.setAttribute(k,new T.Float32BufferAttribute(a,n));addMesh(group,skirt,material(treatment.wall||'cream-siding',treatment.tint||[1,1,1],true),'roof');
  }
 }
 function arch(group,centre,width,height,yaw){const g=new T.TorusGeometry(width/2,.045,4,12,Math.PI),o=addMesh(group,g,material('cream-siding'));o.scale.y=height/(width/2);o.position.fromArray(centre);o.rotation.y=yaw;return o;}
 function facadeOrnament(group,p){const t=p.treatment,ring=closed(localPolygons(p)[0][0]),sign=ring.reduce((s,a,i)=>{const b=ring[(i+1)%ring.length];return s+a[0]*b[1]-b[0]*a[1];},0)>0?1:-1;for(let i=0;i<ring.length;i++){if(p.suppressedWallEdges.some(e=>e[0]===0&&e[1]===0&&e[2]===i))continue;const first=ring[i],last=ring[(i+1)%ring.length],len=Math.hypot(last[0]-first[0],last[1]-first[1]),normal=[(last[1]-first[1])/len*sign,-(last[0]-first[0])/len*sign],a=first.map((v,k)=>v+normal[k]*.15),b=last.map((v,k)=>v+normal[k]*.15),yaw=-Math.atan2(b[1]-a[1],b[0]-a[0]);if(len<2)continue;
   if(t.veranda){const n=Math.ceil(len/2.8);for(let j=0;j<n;j++){const q=mix(a,b,(j+.5)/n);arch(group,[q[0],1.48,q[1]],len/n-.16,.36,yaw);}for(let j=0;j<=n;j++){const q=mix(a,b,j/n);cylinder(group,[q[0],.96,q[1]],.065,1.92);if(t.ornate)for(const y of [.45,1.4])cylinder(group,[q[0],y,q[1]],.095,.09);}if(t.ornate){box(group,[(a[0]+b[0])/2,.66,(a[1]+b[1])/2],[len,.07,.08],'cream-siding',yaw);for(let j=0,n=Math.ceil(len/.35);j<=n;j++){const q=mix(a,b,j/n);box(group,[q[0],.39,q[1]],[.04,.54,.04]);}}}
   if(t.archedLowerWindows){const n=Math.floor((len-.8)/t.windowSpacing);for(let j=0;j<n;j++){const q=mix(a,b,(j+1)/(n+1));const s=new T.Shape();s.moveTo(-.775,0);for(let k=0;k<=12;k++){const angle=Math.PI-k*Math.PI/12;s.lineTo(Math.cos(angle)*.775,Math.sin(angle)*.37);}s.closePath();const o=addMesh(group,new T.ShapeGeometry(s),material('glass'));o.position.set(q[0],1.44,q[1]);o.rotation.y=yaw;arch(group,[q[0],1.44,q[1]],1.55,.37,yaw);for(const sign of [-1,1]){const u=(j+1)/(n+1)+sign*1.12/len,c=mix(a,b,u);box(group,[c[0],.98,c[1]],[.22,1.96,.22]);}}}
   if(t.cornice){for(const [y,h,d]of [[2.06,.18,.3],[t.stories*2.12-.12,.18,.26],[t.stories*2.12+.08,.15,.35]])box(group,[(a[0]+b[0])/2,y,(a[1]+b[1])/2],[len,h,d],'cream-siding',yaw);}
  }}
 function facadeWindows(t,a,b,length){
  let bottom=.65,top=1.65,sashes;
  if(t.depot&&a[0]===b[0]&&a[0]>0){
   sashes=t.depot.eastSashes;
   bottom=.37;top=1.77;
  }else if(t.depot&&a[1]===b[1]&&a[1]>0){
   sashes=t.depot.southSashes;
   bottom=.84;top=1.68;
  }else{
   const count=Math.floor((length-.8)/t.windowSpacing),width=t.type==='commercial'?1.7:.86;
   sashes=Array.from({length:count},(_,i)=>[(i+1)/(count+1),width]);
  }
  return sashes.map(([along,width])=>({type:'window',u0:length*along-width/2,u1:length*along+width/2,bottom,top}));
 }
 function depotRoof(group,polygons,t,seed){
  const {eaveOverhang,chimney,eastTrim}=t.depot,wall=polygons[0][0];
  const [westOverhang,northOverhang,eastOverhang,southOverhang]=eaveOverhang;
  const xs=wall.map(q=>q[0]),zs=wall.map(q=>q[1]);
  const west=Math.min(...xs),north=Math.min(...zs),east=Math.max(...xs),south=Math.max(...zs);
  const eaves=wall.map(([x,z])=>[x+(x<0?-westOverhang:eastOverhang),z+(z<0?-northOverhang:southOverhang)]);
  roof(group,[[eaves]],t,t.stories,seed);

  const eaveY=t.stories*2.12,fascia=eaves.map(([x,z])=>[x-Math.sign(x)*.04,z-Math.sign(z)*.04]);
  for(const [ring,y,height,role] of [[fascia,eaveY-.06,.12,'roof'],[wall,.07,.14,'body']]){
   for(let i=1;i<ring.length;i++){
    const [a,b]=[ring[i-1],ring[i]],dx=b[0]-a[0],dz=b[1]-a[1];
    const strip=box(group,[(a[0]+b[0])/2,y,(a[1]+b[1])/2],[Math.hypot(dx,dz)+.08,height,.08],'dark-wood',-Math.atan2(dz,dx));
    strip.userData.occlusionRole=role;
   }
  }
  for(const along of eastTrim){
   box(group,[east+.08,1.05,north+(south-north)*along],[.07,1.9,.16],'dark-wood');
  }

  const x=west+(east-west)*chimney[0],z=north+(south-north)*chimney[1];
  const slope=Math.tan(t.pitch*Math.PI/180);
  const rise=Math.min(x-west+westOverhang,east-x+eastOverhang,z-north+northOverhang,south-z+southOverhang)*slope;
  const top=eaveY+rise+.65;
  for(const [y,size] of [[top-.65,[.62,1.3,.7]],[top,[.76,.12,.84]]]){
   box(group,[x,y,z],size,'brick').userData.occlusionRole='roof';
  }
 }
 function building(group,p){
  const polygons=localPolygons(p),t=p.treatment,floors=[];
  for(let level=0;level<t.stories;level++){const walls=[];for(const [pi,polygon]of polygons.entries())for(const [ri,ring]of polygon.entries()){const loop=closed(ring),area=loop.reduce((n,a,i)=>{const b=loop[(i+1)%loop.length];return n+a[0]*b[1]-b[0]*a[1];},0),reverse=(area>0)!==(ri===0);for(let i=0;i<loop.length;i++){if(p.suppressedWallEdges.some(e=>e[0]===pi&&e[1]===ri&&e[2]===i))continue;let a=loop[i],b=loop[(i+1)%loop.length];if(reverse)[a,b]=[b,a];const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-5)continue;const openings=facadeWindows(t,a,b,length);walls.push({id:p.id+':'+level+':'+walls.length,a,b,length,level,interior:false,openings});}}
   floors.push({level,height:level*2.12,cells:[],holes:[],walls});
  }
  if(t.archedLowerWindows)for(const w of floors[0].walls)for(const o of w.openings){const mid=(o.u0+o.u1)/2;o.u0=mid-.775;o.u1=mid+.775;o.bottom=.18;o.top=1.44;}
  const b={id:p.id,refs:p.sourceIds,wall:t.wall,baseWall:t.baseWall,trim:t.trim,roof:t.roof,tint:t.tint,stories:t.stories,pitch:.1,layout:'exterior',floors,stairs:[],parts:[{x:0,z:0,w:2,d:2,stories:t.stories,roof:'flat'}]};
  if(t.turret)b.tower={x:t.turret.centre[0]-p.anchor[0],z:t.turret.centre[1]-p.anchor[1],r:t.turret.radius,stories:t.turret.stories};
  const native=createBuildingModel(T,b,{atlas,lod:'game'});
  for(const o of [...native.root.children]){if(['roof','details'].includes(o.userData.kind)){o.geometry.dispose();native.root.remove(o);}else{const id=o.userData.materialId;o.material=material(id==='interior'?'plaster':id,id===t.wall?t.tint:[1,1,1],false,id===t.wall?t.wallFinish:id===t.roof?t.roofFinish:null);if(t.turret&&o.userData.kind==='tower'&&id===t.roof){const pos=o.geometry.attributes.position,normal=o.geometry.attributes.normal,base=t.turret.stories*2.12-.12;for(let i=0;i<pos.count;i++){pos.setY(i,base+(pos.getY(i)-base)*t.turret.capRiseFactor);const n=new T.Vector3(normal.getX(i),normal.getY(i)/t.turret.capRiseFactor,normal.getZ(i)).normalize();normal.setXYZ(i,...n.toArray());}}}}
  for(const m of native.materials.values())m.dispose();group.add(native.root);
  group.userData.nativeBuildingRenderer=true;
  if(t.depot)depotRoof(group,polygons,t,p.seed);
  else roof(group,polygons,t,t.stories,p.seed);
  if(t.crossGable){const f=fit(polygons[0][0]);roof(group,polygons,{...t,roofAxis:f.hi[0]-f.lo[0]>=f.hi[1]-f.lo[1]?'y':'x'},t.stories,p.seed);}
  if(t.turret){const x=t.turret.centre[0]-p.anchor[0],z=t.turret.centre[1]-p.anchor[1],top=t.turret.stories*2.12-.12;cylinder(group,[x,top,z],1.59,.11,'cream-siding',1.59,8);for(let i=0;i<8;i++){const a=i*Math.PI/4;box(group,[x+Math.cos(a)*1.5,top-.95,z+Math.sin(a)*1.5],[.09,1.9,.09]);}}
  for(const q of t.frontGables||[]){const x=q[0]-p.anchor[0],z=q[1]-p.anchor[1],points=[[x-1.6,z-1.3],[x+1.6,z-1.3],[x+1.6,z+1.3],[x-1.6,z+1.3],[x-1.6,z-1.3]],dormer=new T.Group();dormer.position.y=.8;group.add(dormer);roof(dormer,[[points]],{...t,roofAxis:'x',pitch:48},t.stories,p.seed);const base=t.stories*2.12+.8,peak=base+Math.tan(48*Math.PI/180)*1.3;for(const side of [-1,1]){const a=new T.Vector3(x+1.61,base,z+side*1.3),b=new T.Vector3(x+1.61,peak,z),delta=b.clone().sub(a),m=cylinder(group,a.clone().add(b).multiplyScalar(.5).toArray(),.045,delta.length());m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());}}
  // Veranda rhythm remains on the mapped exterior: no new unverified floor plan
  // and no sidewalk-obstructing supports outside the closed building envelope.
  if(t.veranda){const ring=closed(polygons[0][0]);for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<6)continue;const yaw=-Math.atan2(dz,dx);box(group,[(a[0]+b[0])/2,1.94,(a[1]+b[1])/2],[len,.15,.28],'cream-siding',yaw);const n=Math.ceil(len/2.8);for(let j=0;j<=n;j++){const q=mix(a,b,j/n);box(group,[q[0],.96,q[1]],[.12,1.92,.12]);}}}
  if(t.veranda||t.archedLowerWindows||t.cornice)facadeOrnament(group,p);
 }
 function trellisRun(group,from,to,height){for(const t of trellisBoxes(from,to,height)){const o=box(group,t.centre,t.size,'wood',t.yaw);o.rotation.z=t.roll;}}
 // Nautilus railway:track-straight runs from start (local origin) toward +Z for
 // 2 m. Each part of the piece (bed, rails, ties, plates) becomes one instanced
 // mesh over the placement's pieces, each set at its chord's true angle and
 // length. Geometry and materials stay the kit's (shared, never disposed here).
 function railway(group,p){
  railKit??=createRailwayKit(T);
  const piece=railKit.create(p.asset),frames=p.pieces.map(([a,b])=>{const dx=b[0]-a[0],dz=b[1]-a[1],m=new T.Matrix4().makeRotationY(Math.atan2(dx,dz));m.scale(new T.Vector3(1,1,Math.hypot(dx,dz)/2));m.setPosition(a[0]-p.anchor[0],0,a[1]-p.anchor[1]);return m;});
  try{for(const part of piece.root.children){
   const per=part.isInstancedMesh?part.count:1,mesh=new T.InstancedMesh(part.geometry,part.material,frames.length*per),local=new T.Matrix4(),out=new T.Matrix4(),tint=new T.Color();
   part.updateMatrix();
   for(const [k,frame]of frames.entries())for(let i=0;i<per;i++){if(part.isInstancedMesh)part.getMatrixAt(i,local);else local.identity();out.multiplyMatrices(frame,part.matrix).multiply(local);mesh.setMatrixAt(k*per+i,out);if(part.instanceColor){part.getColorAt(i,tint);mesh.setColorAt(k*per+i,tint);}}
   mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingBox?.();mesh.computeBoundingSphere?.();
   mesh.name=p.id+':'+part.name;mesh.castShadow=mesh.receiveShadow=true;mesh.userData.occlusionRole='ground';mesh.userData.sharedGeometry=true;group.add(mesh);
  }}finally{piece.dispose();}
 }
 // Static, per-placement batches retain independent eviction and source identity.
 // No doors/animated objects are combined and no new whole-town buffer is built.
 function batchPlacement(group){
  group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),batches=new Map(),oldGeometry=new Set();
  group.traverse(o=>{if(!o.isMesh)return;if(Array.isArray(o.material))throw Error('Expected a single source material per static batch.');const role=o.userData.occlusionRole||'body',key=o.material.uuid+':'+role;if(!batches.has(key))batches.set(key,{material:o.material,role,position:[],normal:[],uv:[],color:[]});const b=batches.get(key),g=o.geometry,matrix=inverse.clone().multiply(o.matrixWorld),normal=new T.Matrix3().getNormalMatrix(matrix),a=g.attributes,index=g.index;oldGeometry.add(g);
   for(let i=0;i<(index?.count??a.position.count);i++){const n=index?index.getX(i):i,p=new T.Vector3().fromBufferAttribute(a.position,n).applyMatrix4(matrix),v=new T.Vector3().fromBufferAttribute(a.normal,n).applyMatrix3(normal).normalize();b.position.push(...p.toArray());b.normal.push(...v.toArray());b.uv.push(a.uv.getX(n),a.uv.getY(n));b.color.push(...(a.color?[a.color.getX(n),a.color.getY(n),a.color.getZ(n)]:[1,1,1]));}
  });
  group.clear();for(const g of oldGeometry)g.dispose();for(const b of batches.values()){const g=new T.BufferGeometry();for(const key of ['position','normal','uv','color'])g.setAttribute(key,new T.Float32BufferAttribute(b[key],key==='uv'?2:3));g.computeBoundingBox();g.computeBoundingSphere();const mesh=addMesh(group,g,b.material,b.role);mesh.name=group.name+':'+b.material.name+':'+b.role;}
 }
 function make(p){const group=new T.Group();group.name=p.id;group.position.set(p.anchor[0],0,p.anchor[1]);group.userData={placementId:p.id,sourceIds:p.sourceIds,provenance:p.provenance};try{
  if(p.kind==='building')building(group,p);
  else if(p.kind==='lighthouse'){
   for(let i=0;i<4;i++)cylinder(group,[0,(i+.5)*2.12,0],1.45-i*.14,2.12,i%2?'red-timber':'plaster',1.31-i*.14,16);
   cylinder(group,[0,8.48,0],1.45,.12,'plaster',1.45,16);cylinder(group,[0,9.03,0],.86,1.1,'glass',.86,6);
   for(let i=0;i<6;i++){const a=i*Math.PI/3;box(group,[Math.cos(a)*.86,9.03,Math.sin(a)*.86],[.09,1.1,.09]);}
   cylinder(group,[0,10.09,0],1.45,1.02,'red-timber',0,6);
   for(let i=0;i<16;i++){const a=i*Math.PI/8;box(group,[Math.cos(a)*1.28,8.85,Math.sin(a)*1.28],[.055,.72,.055]);}
  }else if(p.kind==='pavilion'||p.kind==='stage'){
   const points=p.points.map(q=>q.map((v,i)=>v-p.anchor[i]));shape([[points]],.016,group,'wood');
   for(const q of p.posts)cylinder(group,[q[0]-p.anchor[0],1,q[1]-p.anchor[1]],.15,2);
   roof(group,[[points]],{...p.treatment,wall:'cream-siding'},1,19);
  }else if(p.kind==='court'){
   const points=p.points.map(q=>q.map((v,i)=>v-p.anchor[i]));const color=p.treatment.sport==='tennis'?[.48,.65,.57]:[.39,.56,.58];
   // Source surface and outline only; overlapping records do not invent nets.
   const start=group.children.length;shape([[points]],.008,group,'concrete');for(const o of group.children.slice(start))o.material=material('concrete',color,true);
   for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);box(group,[(a[0]+b[0])/2,.018,(a[1]+b[1])/2],[len,.014,.06],'cream-siding',-Math.atan2(b[1]-a[1],b[0]-a[0]));}
  }else if(p.kind==='railway'){railway(group,p);group.updateMatrixWorld(true);return group;
  }else if(p.kind==='pier-deck'){
   const points=p.points.map(q=>q.map((v,i)=>v-p.anchor[i]));shape([[points]],p.deck?.topM??.016,group,'wood');
  }else if(p.kind==='boardwalk'||p.kind==='pier'){
   const [a,b]=p.ends.map(q=>q.map((v,i)=>v-p.anchor[i])),len=Math.hypot(b[0]-a[0],b[1]-a[1]),yaw=-Math.atan2(b[1]-a[1],b[0]-a[0]),top=p.deck?.topM??.005;
   // A raised deck runs on past a bend joint by deck.extend, covering the outer corner.
   const u=[(b[0]-a[0])/len,(b[1]-a[1])/len],[before,after]=p.deck?.extend??[0,0],s=a.map((v,i)=>v-u[i]*before),e=b.map((v,i)=>v+u[i]*after);
   box(group,[(s[0]+e[0])/2,top-.05,(s[1]+e[1])/2],[len+before+after,.1,p.width],'wood',yaw);
   // It stands on AFT trellis panels under both long edges and its capped ends.
   if(p.deck){const n=[-u[1],u[0]],inset=p.width/2-.16*TRELLIS_THICKNESS/2,under=top-.1;
    for(const side of [-1,1])trellisRun(group,s.map((v,i)=>v+n[i]*side*inset),e.map((v,i)=>v+n[i]*side*inset),under);
    for(const [k,end]of [a,b].entries())if(p.trellis?.caps?.[k])trellisRun(group,end.map((v,i)=>v-n[i]*inset),end.map((v,i)=>v+n[i]*inset),under);}
   // Long rails and sparse posts, with open ends and source-anchored joins.
   for(const ends of p.rails){const [x,z]=ends.map(q=>q.map((v,i)=>v-p.anchor[i]));box(group,[(x[0]+z[0])/2,.88,(x[1]+z[1])/2],[len,.08,.08],'wood',yaw);box(group,[(x[0]+z[0])/2,.46,(x[1]+z[1])/2],[len,.06,.06],'wood',yaw);for(let i=0,n=Math.ceil(len/2);i<=n;i++){const q=mix(x,z,i/n);cylinder(group,[q[0],.45,q[1]],.055,.9,'dark-wood',.055,6);}}
  }else if(p.kind==='boathouse'){
   // A roof the 2018 lidar sees over the lake, on inferred posts; walls unknown, drawn
   // open. Each piece stands at its own measured eave (build-playable.mjs).
   for(const [x,z,top]of p.posts)cylinder(group,[x-p.anchor[0],top/2,z-p.anchor[1]],.15,top,'dark-wood',.15,8);
   for(const piece of p.pieces){const points=piece.points.map(q=>q.map((v,i)=>v-p.anchor[i]));roof(group,[[points]],{...p.treatment,roofStyle:piece.style,pitch:piece.pitch,...(Number.isFinite(piece.ridgeBearingDeg)?{ridgeBearingDeg:piece.ridgeBearingDeg}:{})},piece.eave/2.12,p.seed);}
  }else throw Error('Unknown Mount Dora placement '+p.kind);
  batchPlacement(group);group.updateMatrixWorld(true);return group;
  }catch(error){release(group);throw error;}
 }
 function release(group){group.removeFromParent();const gs=new Set();group.traverse(o=>{if(!o.isMesh)return;if(o.userData.sharedGeometry)o.dispose();else gs.add(o.geometry);});for(const g of gs)g.dispose();group.clear();}
 function restoreFade(id){const state=fades.get(id);if(!state)return;for(const [mesh,base]of state.changes)mesh.material=base;for(const m of state.variants.values())m.dispose();fades.delete(id);}
 const inside=(p,ring)=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 function setFocus(point,{camera=null,eyeHeight=1.2,opacity=.22}={}){
  if(disposed)return;if(point===null){for(const id of [...fades.keys()])restoreFade(id);focusState=null;focusKey='';return;}
  if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||!Number.isFinite(eyeHeight)||!Number.isFinite(opacity)||opacity<.05||opacity>.8||camera&&!camera.isCamera)throw Error('Supply a town focus point, host camera and bounded fade opacity.');
  focusState={point:[...point],options:{camera,eyeHeight,opacity}};root.updateWorldMatrix(true,true);camera?.updateMatrixWorld(true);const eye=camera?.getWorldPosition(new T.Vector3()),direction=camera?.getWorldDirection(new T.Vector3()),target=root.localToWorld(new T.Vector3(point[0],eyeHeight,point[1])),key=[...target.toArray(),...(eye?.toArray()||[])].map(n=>Math.round(n*10)).join(',')+'|'+(direction?.toArray().map(n=>Math.round(n*1000)).join(',')||'')+'|'+opacity+'|'+created+','+evicted;if(key===focusKey)return;focusKey=key;
  let ray=null;if(camera){const screen=target.clone().project(camera);ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(screen.x,screen.y),camera);ray.far=Math.max(0,target.clone().sub(ray.ray.origin).dot(ray.ray.direction)-.05);}const wanted=new Set();
  for(const [id,group]of resident){const p=group.userData.placementRecord;if(!['building','lighthouse','pavilion','stage','boathouse'].includes(p.kind))continue;const open=OPEN_KINDS.has(p.kind),meshes=group.children.filter(m=>m.isMesh&&(!open||m.userData.occlusionRole==='roof'));if((open&&(p.pieces?p.pieces.some(q=>inside(point,q.points)):inside(point,p.points)))||(ray&&ray.intersectObjects(meshes,false).length))wanted.add(id);}
  for(const id of [...fades.keys()])if(!wanted.has(id)||fades.get(id).opacity!==opacity)restoreFade(id);
  for(const id of wanted){if(fades.has(id))continue;const group=resident.get(id),p=group.userData.placementRecord,open=OPEN_KINDS.has(p.kind),state={opacity,changes:[],variants:new Map()};for(const mesh of group.children){if(!mesh.isMesh||open&&mesh.userData.occlusionRole!=='roof')continue;const base=mesh.material;if(!state.variants.has(base)){const v=base.clone();v.onBeforeCompile=base.onBeforeCompile;v.customProgramCacheKey=base.customProgramCacheKey;v.transparent=true;v.opacity=opacity;v.depthWrite=false;v.needsUpdate=true;state.variants.set(base,v);}state.changes.push([mesh,base]);mesh.material=state.variants.get(base);}fades.set(id,state);}
 }
 function updateResident(bounds){if(disposed)return [];const placements=placementsForBounds(bounds),want=new Set(placements.map(p=>p.id));for(const [id,group]of resident)if(!want.has(id)){restoreFade(id);release(group);resident.delete(id);evicted++;}
  try{for(const p of placements)if(!resident.has(p.id)){const group=make(p);group.userData.placementRecord=p;resident.set(p.id,group);root.add(group);created++;}}catch(error){dispose();throw error;}
  if(focusState)setFocus(focusState.point,focusState.options);
  return placements;
 }
 function metrics(){let triangles=0,drawObjects=0;const geometries=new Set();root.traverse(o=>{if(!o.isMesh)return;drawObjects++;geometries.add(o.geometry);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});return {artRevision:ART_REVISION,resident:resident.size,created,evicted,drawObjects,triangles,geometries:geometries.size,materials:pool.size,occlusionMaterials:[...fades.values()].reduce((n,s)=>n+s.variants.size,0),fadedPlacements:[...fades.keys()],borrowedAtlas:!!atlas,ownedSamplers:sampler&&!disposed?1:0,disposed,coordinates:'town metres; host applies game offset once'};}
 function dispose(){if(disposed)return;for(const id of [...fades.keys()])restoreFade(id);disposed=true;focusState=null;for(const g of resident.values())release(g);resident.clear();for(const m of pool.values())m.dispose();pool.clear();railKit?.dispose();railKit=null;sampler?.dispose();root.removeFromParent();root.clear();}
 return {root,updateResident,setFocus,solidsForBounds,metrics,dispose};
}

// Optional owner for a single shared texture. Late ImageLoader completion after
// cancellation is disposed; the factory itself always treats the texture as borrowed.
export function loadMountDoraAtlas({THREE:T,signal,loader=new T.TextureLoader(),url=ATLAS_URL}={}){
 let disposed=false,texture=null,settled=false,rejectPromise;
 const abort=()=>{if(disposed)return;disposed=true;texture?.dispose();if(!settled){settled=true;rejectPromise(new DOMException('Mount Dora atlas cancelled','AbortError'));}signal?.removeEventListener('abort',abort);};
 const ready=new Promise((resolve,reject)=>{rejectPromise=reject;if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});texture=loader.load(url,t=>{if(disposed){if(t!==texture)t.dispose();return;}settled=true;texture=t;t.colorSpace=T.SRGBColorSpace;resolve(t);},undefined,error=>{if(disposed)return;settled=true;disposed=true;texture?.dispose();signal?.removeEventListener('abort',abort);reject(error);});});
 return {ready,dispose:abort};
}
