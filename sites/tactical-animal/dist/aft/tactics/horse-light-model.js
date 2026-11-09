import * as THREE from './vendor/three.module.js';
import {createGripHand,createGripCuff} from './horse-grip-hand.js';
import {createWorkerRifle} from './horse-rifle.js';
import {graphicPaintGLSL} from './horse-graphic-paint.js';
export const LIGHT_ATLAS='../assets/characters/lowpoly-proof/horse-worker-light-atlas.png';
const V=a=>new THREE.Vector3(...a),clamp=THREE.MathUtils.clamp,smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
// Offline-reduced approved surfaces, real skeleton and normalized blended skin weights.
export function createLightHorse(data,texture=null){
 const root=new THREE.Group(),rig=new THREE.Group();root.add(rig);const bones=[],rest=[],lookup={};
 function bone(name,parent,world){world=data.bonePositions?.[name]||world;const b=new THREE.Bone();b.name=name;const i=bones.length;bones.push(b);lookup[name]=i;rest.push(V(world));if(parent!==null){bones[parent].add(b);b.position.copy(rest[i]).sub(rest[parent]);}else {rig.add(b);b.position.copy(rest[i]);}return i;}
 const hips=bone('hips',null,[0,.80,0]),spine=bone('spine',hips,[-.025,1.08,0]),head=bone('head',spine,[-.065,1.30,0]);
 const armSpread=data.species==='pig-director'?.085:0;
 const limbs=[];for(const side of [-1,1]){const sh=bone('upperArm'+side,spine,[-.045,1.191,side*(.205+armSpread)]),el=bone('forearm'+side,sh,[.022,.991,side*(.344+armSpread)]),wr=bone('hand'+side,el,[.061,.742,side*(.355+armSpread)]),finger=bone('fingers'+side,wr,[.072,.712,side*(.355+armSpread)]);const th=bone('thigh'+side,hips,[-.03,.77,side*.12]),kn=bone('shin'+side,th,[.024,.475,side*.196]),ho=bone('hoof'+side,kn,[-.035,.12,side*.232]);limbs.push({side,sh,el,wr,finger,th,kn,ho});}
 root.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);skeleton.calculateInverses();
 const material=new THREE.MeshStandardMaterial({map:texture,color:0xffffff,vertexColors:true,roughness:.92}),grey=new THREE.MeshStandardMaterial({color:0x999999,roughness:.88}),parts=[];
 const graphicUniform={value:1};
 material.onBeforeCompile=shader=>{
  shader.uniforms.uGraphicPaint=graphicUniform;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float region; varying float vRegion; varying vec3 vRestPosition; varying vec3 vRestNormal;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRegion=region;vRestPosition=position;vRestNormal=normal;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vRegion; varying vec3 vRestPosition; varying vec3 vRestNormal;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uGraphicPaint;\n'+graphicPaintGLSL);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
   vec4 texel=texture2D(map,vMapUv);
   float strength=(vRegion<1.5||vRegion>4.5)?0.24:0.46;
   diffuseColor.rgb*=mix(vec3(1.0),texel.rgb,strength);
  #endif`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 softBase=diffuseColor.rgb;
   diffuseColor.rgb=mix(softBase,graphicPaint(softBase,vRestPosition,normalize(vRestNormal),vRegion),uGraphicPaint);
   if(vRegion<1.5){
    float blaze=(1.0-smoothstep(0.014,0.024,abs(vRestPosition.z)))*smoothstep(1.386,1.416,vRestPosition.y)*smoothstep(0.004,0.030,vRestPosition.x);
    diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(0.77,0.70,0.55),vec3(1.0,.95,.78),uGraphicPaint),blaze);
    float nose=smoothstep(0.18,0.245,vRestPosition.x)*(1.0-smoothstep(1.375,1.402,vRestPosition.y));
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.16,0.092,0.058),nose*.70);
    vec2 eye=(vRestPosition.xy-vec2(0.058,1.477))/vec2(0.024,0.012);
    float eyeMask=(1.0-smoothstep(0.65,1.10,dot(eye,eye)))*smoothstep(0.065,0.082,abs(vRestPosition.z));
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.012,0.009,0.007),eyeMask);
    float scarf=smoothstep(1.247,1.254,vRestPosition.y)*(1.0-smoothstep(1.286,1.300,vRestPosition.y));
    diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(0.30,0.023,0.012),vec3(.58,.028,.012),uGraphicPaint),scarf);
   }
   float sleeveFold=exp(-pow((vRestPosition.y-1.01)/.023,2.0))*smoothstep(.22,.30,abs(vRestPosition.z));
   if(vRegion>2.5&&vRegion<3.5)diffuseColor.rgb*=1.0-.13*sleeveFold;
   if(vRegion>1.5&&vRegion<2.5){
    float glove=1.0-smoothstep(.760,.778,vRestPosition.y);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.045,.040,.034),glove);
    float cuff=smoothstep(.908,.925,vRestPosition.y);vec3 cloth=vec3(.887923,.775822,.577580);
    #ifdef USE_MAP
    vec2 cuffUV=vec2((2.035+clamp((vRestPosition.z+.44)/.88,.02,.98)*.93)/4.0,1.0-(.965-clamp((vRestPosition.y-.91)/.40,.02,.98)*.93)/4.0);
    cloth*=mix(vec3(1.0),texture2D(map,cuffUV).rgb,.46);
    #endif
    cloth*=1.0-.13*sleeveFold;cloth=mix(cloth,paintShirt(cloth,vRestPosition,normalize(vRestNormal)),uGraphicPaint);diffuseColor.rgb=mix(diffuseColor.rgb,cloth,cuff);
   }
   if(vRegion>3.5&&vRegion<4.5){
    // Pocket and seams are placed in garment space and follow skinning; grain stays quiet.
    vec2 q=abs(vRestPosition.zy-vec2(0.0,1.043))-vec2(.064,.043);
    float pocketDistance=length(max(q,0.0))+min(max(q.x,q.y),0.0)-.008;
    float pocket=(1.0-smoothstep(.001,.0035,abs(pocketDistance)))*smoothstep(.10,.13,vRestPosition.x);
    diffuseColor.rgb*=1.0-.34*pocket;
    float buttons=1.0-smoothstep(.006,.009,length(vec2(abs(vRestPosition.z)-.130,vRestPosition.y-1.143)));
    buttons*=smoothstep(.10,.13,vRestPosition.x);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.40,.27,.085),buttons);
    float knee=exp(-pow((vRestPosition.y-.445)/.03,2.0))*smoothstep(.025,.10,vRestPosition.x);
    diffuseColor.rgb*=1.0-.09*knee;
   }
  `);
 };
 material.customProgramCacheKey=()=> 'horse-light-graphic-paint-v2';
 function directorSleeve(x,y,z){const t=clamp(((x+.035)*.056+(y-1.217)*-.201+(Math.abs(z)-.285)*.144)/(.056**2+.201**2+.144**2),0,1);return (1-smooth(.108,.152,Math.hypot(x+.035-.056*t,y-1.217+.201*t,Math.abs(z)-.285-.144*t)))*smooth(.25,.32,Math.abs(z));}
 function weights(name,p){const [x,y,z]=p,l=limbs[z<0?0:1];if(name.includes('tail')||name.includes('utility pouch')||name.includes('utility belt'))return [[hips,1]];if(name.includes('mane')||name.includes('beard'))return [[head,1]];if(name.includes('skull')){const t=smooth(1.22,1.38,y);return [[spine,1-t],[head,t]];}
  if(name.includes('hoof')||name.includes('boot')||name.includes('foot'))return [[l.ho,1]];
  if(name.includes('forearm')){const h=1-smooth(.725,.81,y),f=(1-smooth(.682,.724,y))*.82;const u=smooth(.98,1.06,y);return [[l.sh,(1-h)*u],[l.el,(1-h)*(1-u)],[l.wr,h*(1-f)],[l.finger,h*f]];}
  if(name.includes('shirt')){const sleeve=data.species==='dog'?smooth(.20,.285,Math.abs(z))*Math.max(smooth(.96,1.055,y),smooth(.25,.30,Math.abs(z))*smooth(.90,.911,y)):data.species==='pig-director'?directorSleeve(x,y,z):data.species==='pig-foreman'?smooth(.270,.335,Math.abs(z)):data.species==='sheep'?smooth(.24,.33,Math.abs(z)):Math.max(smooth(.16,.255,Math.abs(z)),smooth(.20,.25,Math.abs(z))*(1-smooth(1.03,1.11,y))),elbow=1-smooth(.98,1.06,y);return [[spine,1-sleeve],[l.sh,sleeve*(1-elbow)],[l.el,sleeve*elbow]];}
  if(y>.86){const t=smooth(.86,1.02,y);return [[hips,1-t],[spine,t]];}const leg=1-smooth(.69,.83,y),knee=1-smooth(.42,.53,y),ankle=1-smooth(.17,.27,y);return [[hips,1-leg],[l.th,leg*(1-knee)],[l.kn,leg*knee*(1-ankle)],[l.ho,leg*knee*ankle]];
 }
 function uvColor(name,p,n,forcedPanel=null){const [x,y,z]=p;let panel=0,u=0,v=0,color=[1,1,1];
  if(name.includes('shirt')){panel=2;u=(z+.44)/.88;v=(y-.91)/.40;color=[1.2,1.16,1.03];}
  else if(name.includes('overalls')){const bib=x>.025&&y>.93&&Math.abs(z)<.16;panel=bib?4:3;u=bib?(z+.155)/.31:((z<0?z+.20:z-.20)/.28+.5);v=bib?(y-.94)/.23:(y-.14)/.8;color=[1.10,1.13,.96];}
  else if(name.includes('hoof')){panel=7;u=(z-(z<0?-.232:.232))/.21+.5;v=y/.22;color=[.72,.73,.70];}
  else if(name.includes('forearm')){panel=13;u=(x+.06)/.22;v=(y-.66)/.34;}
  else if(name.includes('mane')){panel=6;u=z/.13+.5;v=(y-1.22)/.33;}
  else {panel=0;u=(x+.14)/.43;v=(y-1.20)/.46;}
  if(forcedPanel!==null)panel=forcedPanel;
  u=clamp(u,.02,.98);v=clamp(v,.02,.98);return {panel,uv:[(panel%4+.035+u*.93)/4,1-(Math.floor(panel/4)+.965-v*.93)/4],color};
 }
 if(data.preparedParts){for(const part of data.preparedParts){const g=new THREE.BufferGeometry();for(const [key,a]of Object.entries(part.attributes))g.setAttribute(key,new THREE.BufferAttribute(a.array,a.itemSize,a.normalized));g.setIndex(new THREE.BufferAttribute(part.index,1));if(part.layerFit)g.userData.layerFit=part.layerFit;const m=new THREE.SkinnedMesh(g,material);m.name=part.name;m.frustumCulled=false;root.add(m);m.bind(skeleton);parts.push(m);}}
 else for(const source of data.parts){const g=new THREE.BufferGeometry(),p=[],norm=[],paintP=[],paintN=[],uv=[],colors=[],skinIndex=[],skinWeight=[],index=[],split=new Map();
  // Split at material-panel boundaries without changing positions or skin weights.
  for(let k=0;k<source.index.length;k+=3){const ids=source.index.slice(k,k+3),center=[0,0,0];for(const i of ids)for(let a=0;a<3;a++)center[a]+=source.position[i*3+a]/3;
   const triangleUV=uvColor(source.name,center,[0,0,0]);
   for(const i of ids){const pt=source.position.slice(i*3,i*3+3),nn=source.normal.slice(i*3,i*3+3),sample=uvColor(source.name,pt,nn,triangleUV.panel);const panel=triangleUV.panel;const key=i+':'+panel;let j=split.get(key);if(j===undefined){j=p.length/3;split.set(key,j);p.push(...pt);norm.push(...nn);paintP.push(...(source.paintPosition||source.position).slice(i*3,i*3+3));paintN.push(...(source.paintNormal||source.normal).slice(i*3,i*3+3));uv.push(...sample.uv);colors.push(...sample.color);const w=weights(source.name,(source.paintPosition||source.position).slice(i*3,i*3+3)).filter(a=>a[1]>0);while(w.length<4)w.push([0,0]);skinIndex.push(...w.map(a=>a[0]));skinWeight.push(...w.map(a=>a[1]));}index.push(j);}
  }
  const region=source.name.includes('skull')?1:source.name.includes('forearm')?2:source.name.includes('shirt')?3:source.name.includes('overalls')?4:source.name.includes('hoof')?5:6;
  const palette=new THREE.Color({1:0xb77a49,2:0xb77a49,3:0xf2e4c8,4:0x8c9064,5:0x665b4e,6:0x533823}[region]).toArray();
  for(let i=0;i<colors.length;i++)colors[i]=palette[i%3];
  g.setAttribute('paintPosition',new THREE.Float32BufferAttribute(paintP,3));g.setAttribute('paintNormal',new THREE.Float32BufferAttribute(paintN,3));
  g.setAttribute('region',new THREE.Float32BufferAttribute(new Float32Array(p.length/3).fill(region),1));
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndex,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeight,4));g.setIndex(index);const m=new THREE.SkinnedMesh(g,material);m.name=source.name;m.frustumCulled=false;root.add(m);m.bind(skeleton);parts.push(m);
 }
 // Clothes on the neck follow what they lie on (docs/tactics/CLOTHING-SKINNING.md: the idle study's v5 corrections, made
 // part of the character so that every motion has them). The weights above come from each part's name and height alone:
 // every layer round the neck is the chest's while the neck skin blends into the head, and hair is wholly the head's while
 // the neck it grows from is not, so as the head turns to aim or throw the skin slides through the collar and the mane
 // comes away from the neck. Measured on the rest surfaces (the geometry, as drawn). The idle's corrections at the arms
 // (the forearm's weight stripped from a shirt's sides, a sleeve's end glued to the forearm in it) are not made here:
 // through the game's throws they tore the sleeves at the elbow and the armpit, and the sleeve masks above were made for
 // those motions (the same doc).
 function fitLayers(){
  const skull=parts.find(m=>/unified/.test(m.name)&&/skull/.test(m.name));if(!skull)return;
  const at=(m,i)=>new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position,i),tri=new THREE.Triangle(),near=new THREE.Vector3(),bary=new THREE.Vector3();
  // a vertex's weights as {bone: weight}, and back into the four slots (the largest four, renormalised)
  const weightsOf=(a,i)=>{const w={};for(let k=0;k<4;k++){const x=a.skinWeight.getComponent(i,k);if(x>0){const b=a.skinIndex.getComponent(i,k);w[b]=(w[b]||0)+x;}}return w;};
  const setWeights=(a,i,w)=>{const top=Object.entries(w).filter(([,x])=>x>1e-6).sort((p,q)=>q[1]-p[1]).slice(0,4),sum=top.reduce((s,[,x])=>s+x,0)||1;while(top.length<4)top.push([0,0]);a.skinIndex.setXYZW(i,...top.map(([b])=>+b));a.skinWeight.setXYZW(i,...top.map(([,x])=>x/sum));};
  const mix=(own,target,f)=>{const w={};for(const [b,x] of Object.entries(own))w[b]=(w[b]||0)+(1-f)*x;for(const [b,x] of Object.entries(target))w[b]=(w[b]||0)+f*x;return w;};
  // A part's surface, for what lies on it: its triangles in 4 cm cells, searched in growing shells for the point nearest
  // v (only one no higher than `top` by height(), when that is given, and only within `far`); it gives that point's
  // weights (its corners', in proportion) and squared distance.
  const surfaceOf=(m,height)=>{const a=m.geometry.attributes,ix=m.geometry.index.array,faces=ix.length/3,P=Array.from({length:a.position.count},(_,i)=>at(m,i)),H=height?P.map(height):null,SIDE=.04,cells=new Map(),key=(x,y,z)=>((x+2048)*4096+y+2048)*4096+z+2048,stamp=new Int32Array(faces).fill(-1);let query=0;
   for(let t=0;t<faces;t++){const c=[0,1,2].map(k=>P[ix[3*t+k]]),lo=[0,1,2].map(k=>Math.floor(Math.min(...c.map(q=>q.getComponent(k)))/SIDE)),up=[0,1,2].map(k=>Math.floor(Math.max(...c.map(q=>q.getComponent(k)))/SIDE));
    for(let x=lo[0];x<=up[0];x++)for(let y=lo[1];y<=up[1];y++)for(let z=lo[2];z<=up[2];z++){const k=key(x,y,z);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(t);}}
   return (v,top=Infinity,far=Infinity)=>{const c=[v.x,v.y,v.z].map(x=>Math.floor(x/SIDE));let best=null;query++;
    for(let r=0;r<=8&&(r-1)*SIDE<=far&&!(best&&Math.sqrt(best.d2)<=(r-1)*SIDE);r++)for(let x=-r;x<=r;x++)for(let y=-r;y<=r;y++)for(let z=-r;z<=r;z++){if(Math.max(Math.abs(x),Math.abs(y),Math.abs(z))<r)continue;
     for(const t of cells.get(key(c[0]+x,c[1]+y,c[2]+z))||[]){if(stamp[t]===query)continue;stamp[t]=query;const k=[ix[3*t],ix[3*t+1],ix[3*t+2]];tri.set(P[k[0]],P[k[1]],P[k[2]]);tri.closestPointToPoint(v,near);if(tri.getBarycoord(near,bary)===null)continue;
      const b=[bary.x,bary.y,bary.z];if(H&&b[0]*H[k[0]]+b[1]*H[k[1]]+b[2]*H[k[2]]>top)continue;const d2=near.distanceToSquared(v);if(!best||d2<best.d2)best={d2,k,b};}}
    if(!best||best.d2>far*far)return null;const w={};best.k.forEach((i,j)=>{for(const [bone,x] of Object.entries(weightsOf(a,i)))w[bone]=(w[bone]||0)+best.b[j]*x;});return {w,d2:best.d2};};};
  // The neck as a branch rising to the head joint along the rest neck, three quarters as long as the spine-to-head span
  // (the idle's), and the skull's median radius round it. Every layer on the neck (a collar, a neckerchief with its knot
  // and ends, the tops of a shirt, waistcoat, jacket, bib or braces) takes the weights of what it lies on: of the layer
  // under it, within 1.5 cm, or else of the skin under it, in full within 3 cm of the neck's radius and easing to its own
  // weights 13 cm out, from the neck's base up (fading in from a tenth of the branch below it to a tenth above). The skin
  // under a layer is the skull's nearest point no higher up the neck than the layer (1 cm, about a triangle, to spare):
  // the nearest point outright would put a collar's top edge on the jaw above it. Cloth with no skin that low under it
  // keeps its own weights. Hair (a mane, a beard) takes in full the weights of the skin it grows from, at the nearest point.
  const offset=rest[head].clone().sub(rest[spine]),NECK=clamp(.75*offset.length(),.15,.22),AXIS=offset.clone().normalize(),B=rest[head].clone().addScaledVector(AXIS,-NECK);
  const heightOf=v=>v.clone().sub(B).dot(AXIS),radiusOf=v=>{const d=v.clone().sub(B);return d.addScaledVector(AXIS,-d.dot(AXIS)).length();};
  const radii=[];for(let i=0;i<skull.geometry.attributes.position.count;i++){const v=at(skull,i),u=heightOf(v)/NECK;if(u>.2&&u<.8)radii.push(radiusOf(v));}radii.sort((x,y)=>x-y);const R=radii[radii.length>>1]||.06;
  const field=v=>(1-smooth(R+.03,R+.13,radiusOf(v)))*smooth(-.1,.1,heightOf(v)/NECK),skin=surfaceOf(skull,heightOf);
  const rank=m=>/mane|beard/.test(m.name)?0:/shirt/.test(m.name)?1:/trousers|overalls/.test(m.name)?2:/waistcoat|jacket/.test(m.name)?3:/collar|belt|pouch|cap/.test(m.name)?4:/neckerchief wrap/.test(m.name)?5:/neckerchief knot/.test(m.name)?6:/neckerchief/.test(m.name)?7:8;
  const layers=parts.filter(m=>m!==skull&&!/forearm and hand|hoof|boot|foot|tail/.test(m.name)).sort((x,y)=>rank(x)-rank(y)),under=[];
  // Each changed vertex's name-rule weights are kept on its geometry (userData.layerFit: vertices, and their four bone
  // indices and weights), for a motion that fits the neck its own way (the idle study's neck bone).
  for(const mesh of layers){const a=mesh.geometry.attributes,hair=/mane|beard/.test(mesh.name),plain=[];
   const fit=(i,w)=>{plain.push(i,[0,1,2,3].map(k=>a.skinIndex.getComponent(i,k)),[0,1,2,3].map(k=>a.skinWeight.getComponent(i,k)));setWeights(a,i,w);};
   for(let i=0;i<a.position.count;i++){const v=at(mesh,i),f=hair?1:field(v);if(f<=0)continue;
    if(!hair){let best=null;for(const lies of under){const r=lies(v,Infinity,.015);if(r&&(!best||r.d2<best.d2))best=r;}if(best){fit(i,best.w);continue;}}
    const r=hair?skin(v):skin(v,heightOf(v)+.01);if(r)fit(i,mix(weightsOf(a,i),r.w,f));}
   if(plain.length)mesh.geometry.userData.layerFit={vertices:Int32Array.from(plain.filter((_,k)=>k%3===0)),index:Uint16Array.from(plain.filter((_,k)=>k%3===1).flat()),weight:Float32Array.from(plain.filter((_,k)=>k%3===2).flat())};
   a.skinIndex.needsUpdate=a.skinWeight.needsUpdate=true;if(!hair)under.push(surfaceOf(mesh));}
 }
 if(!data.preparedParts)fitLayers();
 // HMG-only grasp corrective; neutral/other equipment restore the approved mesh.
 const gripHand=createGripHand(),supportLimb=limbs.find(l=>l.side===-1),supportArm=parts.find(p=>p.name==='forearm and hand -1');bones[supportLimb.wr].add(gripHand);const supportIndex=supportArm.geometry.index.clone(),trimmedIndex=[];for(let k=0;k<supportIndex.count;k+=3){const ids=[supportIndex.getX(k),supportIndex.getX(k+1),supportIndex.getX(k+2)];if(ids.every(i=>supportArm.geometry.attributes.position.getY(i)>.77))trimmedIndex.push(...ids);}const trimmedAttribute=new THREE.Uint16BufferAttribute(trimmedIndex,1),gripCuff=createGripCuff(supportArm,trimmedIndex,gripHand);
 const supportPosition=supportArm.geometry.attributes.position,gripPosition=supportPosition.clone();for(let i=0;i<gripPosition.count;i++){const y=gripPosition.getY(i),t=clamp((y-.77)/.13,0,1),factor=.64+.36*t*t*(3-2*t),cx=.061-(y-.79)*.19,cz=-.355+(y-.79)*.055;gripPosition.setXYZ(i,cx+(gripPosition.getX(i)-cx)*factor,y,cz+(gripPosition.getZ(i)-cz)*factor);}
 const supportSkinIndex=supportArm.geometry.attributes.skinIndex,supportSkinWeight=supportArm.geometry.attributes.skinWeight,gripSkinIndex=supportSkinIndex.clone(),gripSkinWeight=supportSkinWeight.clone();for(let i=0;i<gripSkinIndex.count;i++)if(supportArm.geometry.attributes.position.getY(i)<.86){gripSkinIndex.setXYZW(i,supportLimb.el,0,0,0);gripSkinWeight.setXYZW(i,1,0,0,0);}
 const rifle=createWorkerRifle(texture);let equipped=rifle,activeGrip=false;root.add(rifle.root);const palmLocal=new THREE.Vector3(.052,-.010,0),contacts=[];
 function reset(){for(let i=0;i<bones.length;i++){bones[i].quaternion.identity();const parent=bones[i].parent,pi=bones.indexOf(parent);bones[i].position.copy(rest[i]);if(pi>=0)bones[i].position.sub(rest[pi]);}root.updateMatrixWorld(true);}
 function setWorldRotation(i,q){const parent=bones[i].parent.getWorldQuaternion(new THREE.Quaternion());bones[i].quaternion.copy(parent.invert().multiply(q));root.updateMatrixWorld(true);}
 function solveArm(l,target,handQ,fingerCurl=-.9,contactPalm=palmLocal,elbowPole=null){const wrist=target.clone().sub(contactPalm.clone().applyQuaternion(handQ)),start=rest[l.sh],a=rest[l.el].distanceTo(start),b=rest[l.wr].distanceTo(rest[l.el]),axis=wrist.clone().sub(start),dist=axis.length();if(dist>a+b||dist<Math.abs(a-b))throw Error('Carry grip outside arm reach');axis.normalize();const along=(a*a-b*b+dist*dist)/(2*dist),bend=V(elbowPole||[-.12,-1,l.side*.55]);bend.addScaledVector(axis,-bend.dot(axis)).normalize();const elbow=start.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,a*a-along*along)));
  setWorldRotation(l.sh,new THREE.Quaternion().setFromUnitVectors(rest[l.el].clone().sub(start).normalize(),elbow.clone().sub(start).normalize()));
  setWorldRotation(l.el,new THREE.Quaternion().setFromUnitVectors(rest[l.wr].clone().sub(rest[l.el]).normalize(),wrist.clone().sub(elbow).normalize()));setWorldRotation(l.wr,handQ);bones[l.finger].rotation.z=fingerCurl;root.updateMatrixWorld(true);contacts.push({side:l.side,grip:target.toArray(),localPalm:contactPalm.toArray(),palm:bones[l.wr].localToWorld(contactPalm.clone()).toArray()});
 }
 function equipWeapon(asset=rifle){root.remove(equipped.root);equipped.mount?.removeFromParent();equipped.hose?.removeFromParent();equipped=asset;root.add(equipped.root);if(equipped.mount){bones[spine].add(equipped.mount);equipped.mount.position.set(-.19,-.02,0);}if(equipped.hose)root.add(equipped.hose);contacts.length=0;}
 function pose(mode='carry',heading=0){activeGrip=false;gripHand.visible=false;supportArm.geometry.setIndex(supportIndex);supportArm.geometry.setAttribute('position',supportPosition);supportArm.geometry.setAttribute('skinIndex',supportSkinIndex);supportArm.geometry.setAttribute('skinWeight',supportSkinWeight);root.rotation.y=0;reset();contacts.length=0;const carry=equipped.carry||{position:[.24,1.005,.035],axis:[.20,.38,-.90],hands:[1,-1]};equipped.root.visible=mode==='carry';if(equipped.mount)equipped.mount.visible=mode==='carry';if(equipped.hose)equipped.hose.visible=mode==='carry';if(mode==='carry'){const axis=V(carry.axis).normalize();equipped.root.quaternion.setFromUnitVectors(V([1,0,0]),axis);equipped.root.position.fromArray(carry.position);root.updateMatrixWorld(true);const handQ=new THREE.Quaternion().setFromUnitVectors(V([0,-1,0]),axis);for(const l of limbs){if(!carry.hands.includes(l.side))continue;const contactName=l.side===1?'grip':'support',anchor=equipped.anchors[contactName],contactPose=carry.handPoses?.[contactName],contactQ=contactPose?.quaternion?equipped.root.quaternion.clone().multiply(new THREE.Quaternion().fromArray(contactPose.quaternion)):handQ;solveArm(l,anchor.getWorldPosition(new THREE.Vector3()),contactQ,contactPose?.fingerCurl,contactPose?.palm?V(contactPose.palm):palmLocal,contactPose?.elbowPole);if(contactPose?.gripMesh&&l.side===-1){supportArm.geometry.setIndex(trimmedAttribute);supportArm.geometry.setAttribute('position',gripPosition);supportArm.geometry.setAttribute('skinIndex',gripSkinIndex);supportArm.geometry.setAttribute('skinWeight',gripSkinWeight);activeGrip=true;gripHand.visible=true;gripHand.position.fromArray(contactPose.palm);gripHand.quaternion.copy(new THREE.Quaternion().fromArray(contactPose.quaternion).invert());}}equipped.updateHose?.(root);}
  root.rotation.y=heading*Math.PI/180;root.updateMatrixWorld(true);skeleton.update();if(gripHand.visible)gripCuff.update();return contacts;
 }
 function diagnostics(){root.updateMatrixWorld(true);skeleton.update();const box=new THREE.Box3(),v=new THREE.Vector3();for(const m of [...parts,...(activeGrip?[gripHand,gripCuff]:[])]){const p=m.geometry.attributes.position,indices=m.geometry.index;for(const i of new Set(indices?indices.array:Array.from({length:p.count},(_,i)=>i))){v.fromBufferAttribute(p,i);if(m.isSkinnedMesh)m.applyBoneTransform(i,v);box.expandByPoint(v.applyMatrix4(m.matrixWorld));}}return {triangles:data.triangles+(activeGrip?(gripHand.geometry.index.count+gripCuff.geometry.index.count+trimmedIndex.length-supportIndex.count)/3:0),rifleTriangles:rifle.triangles,weapon:equipped.id||'rifle',weaponTriangles:equipped.triangles,bones:bones.length,skinnedMeshes:parts.length,min:box.min.toArray(),max:box.max.toArray(),contacts:contacts.map(c=>{const l=limbs.find(l=>l.side===c.side),grip=(c.side===1?equipped.anchors.grip:equipped.anchors.support).getWorldPosition(new THREE.Vector3()),palm=bones[l.wr].localToWorld(V(c.localPalm));return {side:c.side,grip:grip.toArray(),palm:palm.toArray(),error:grip.distanceTo(palm)};}),sourceTriangles:data.sourceTriangles};}
 pose('neutral');return {root,parts,bones,skeleton,rifle,gripHands:[gripHand],get weapon(){return equipped;},equipWeapon,material,grey,pose,diagnostics,setGraphic(value){graphicUniform.value=value?1:0;},setGrey(value){for(const p of parts)p.material=value?grey:material;},dispose(){for(const p of parts)p.geometry.dispose();material.dispose();grey.dispose();rifle.dispose();gripHand.geometry.dispose();gripHand.material.dispose();gripCuff.geometry.dispose();gripCuff.material.dispose();}};
}
