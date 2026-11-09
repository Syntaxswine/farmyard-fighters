import * as THREE from './vendor/three.module.js';
import {softBox} from './painted-environment-scene.js';
export const CARGO_ATLAS='../assets/environment/painted-study/cargo-materials-v1.png';
export const CARGO_SKINS={
 timber:{name:'Honey timber',family:'crate',atlas:'original',cell:[.5,.5,.5,.5],tint:0xe1c49a},
 weathered:{name:'Weathered wood',family:'crate',atlas:'cargo',cell:[0,.5,1/3,.5],tint:0xdbd0bd},
 creamWood:{name:'Chipped cream',family:'crate',atlas:'cargo',cell:[1/3,.5,1/3,.5],tint:0xe1d7bd},
 oliveWood:{name:'Olive paint',family:'crate',atlas:'cargo',cell:[2/3,.5,1/3,.5],tint:0xd8d2b9},
 blue:{name:'Worn blue',family:'barrel',atlas:'original',cell:[0,0,.5,.5],tint:0xc2d7da},
 oxide:{name:'Oxide red',family:'barrel',atlas:'cargo',cell:[0,0,1/3,.5],tint:0xd3b6a8},
 explosiveRed:{name:'Flammable red',family:'barrel',atlas:'cargo',cell:[0,0,1/3,.5],tint:0xffffff},
 ochre:{name:'Ochre steel',family:'barrel',atlas:'cargo',cell:[1/3,0,1/3,.5],tint:0xd2bf96},
 creamSteel:{name:'Cream steel',family:'barrel',atlas:'cargo',cell:[2/3,0,1/3,.5],tint:0xe0d4bb}
};
export const CARGO_FORMS=[
 {id:'crate-square',name:'Braced crate',family:'crate',tiles:[1,1]},
 {id:'crate-long',name:'Long supply crate',family:'crate',tiles:[1,2]},
 {id:'crate-tall',name:'Tall shipping crate',family:'crate',tiles:[1,2]},
 {id:'crate-strapped',name:'Banded freight crate',family:'crate',tiles:[1,2]},
 {id:'crate-stack',name:'Two-crate stack',family:'crate',tiles:[1,1]},
 {id:'crate-pallet',name:'Pallet of four crates',family:'crate',tiles:[2,2]},
 {id:'barrel-single',name:'Single drum',family:'barrel',tiles:[1,1]},
 {id:'barrel-stack',name:'Two-drum stack',family:'barrel',tiles:[1,1]},
 {id:'barrel-row',name:'Three-drum row',family:'barrel',tiles:[1,2]},
 {id:'barrel-pyramid',name:'Six-drum pyramid',family:'barrel',tiles:[2,1]},
 {id:'barrel-pile',name:'Mixed drum pile',family:'barrel',tiles:[2,2]},
 {id:'barrel-block',name:'Eighteen-drum block',family:'barrel',tiles:[2,2]}
];
export const DRUM_RADIUS=.328,DRUM_HEIGHT=.8;
export const CARGO_LABELS={none:'No labels',shipping:'Freight ticket',fragile:'Fragile glass',hazard:'Hazard diamond',flammable:'Flammable fuel',stores:'Factory stores'};
// Small, deliberately distressed print artwork. Canvas keeps the icons and type
// editable and independent of the underlying painted material atlas.
function labelTexture(style){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=384;
 const c=canvas.getContext('2d'),ink=style==='fragile'?'#813b29':'#353c36';
 let seed=47;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 c.fillStyle=style==='flammable'?'#efe4bd':style==='hazard'?'#c7a14e':'#cdbd94';
 c.beginPath();c.moveTo(17,13);c.lineTo(493,19);c.lineTo(500,363);c.lineTo(28,374);c.lineTo(12,218);c.closePath();c.fill();
 for(let i=0;i<160;i++){c.fillStyle=random()>.5?'rgba(255,237,183,.11)':'rgba(85,62,34,.08)';c.fillRect(random()*512,random()*384,18+random()*85,2+random()*8);}
 c.strokeStyle=ink;c.fillStyle=ink;c.lineWidth=7;c.strokeRect(38,37,434,308);
 c.textAlign='center';c.font='bold 36px Georgia';
 if(style==='shipping'){
  c.fillText('NORTH DOCK',256,91);c.fillRect(66,111,380,5);
  c.textAlign='left';c.font='bold 67px monospace';c.fillText('AF / 07',64,196);
  c.font='23px monospace';c.fillText('FREIGHT • 24',66,240);
  for(let i=0;i<37;i++)c.fillRect(66+i*10,270,2+(i%3)*2,43);
 }else if(style==='fragile'){
  c.fillText('HANDLE WITH CARE',256,88);
  c.beginPath();c.moveTo(204,119);c.lineTo(308,119);c.lineTo(300,172);c.quadraticCurveTo(256,221,212,172);c.closePath();c.stroke();
  c.beginPath();c.moveTo(256,196);c.lineTo(256,251);c.moveTo(224,254);c.lineTo(288,254);c.stroke();
  for(const x of [112,400]){c.beginPath();c.moveTo(x,237);c.lineTo(x,143);c.moveTo(x-19,165);c.lineTo(x,143);c.lineTo(x+19,165);c.stroke();}
  c.font='bold 38px Georgia';c.fillText('FRAGILE',256,315);
 }else if(style==='flammable'){
  c.save();c.translate(256,173);c.rotate(Math.PI/4);c.strokeStyle='#a72c1f';c.lineWidth=14;c.strokeRect(-78,-78,156,156);c.restore();
  c.beginPath();c.moveTo(250,91);c.bezierCurveTo(276,137,315,146,298,195);c.bezierCurveTo(307,214,278,236,252,236);c.bezierCurveTo(203,236,194,205,212,177);c.quadraticCurveTo(216,192,226,193);c.bezierCurveTo(216,155,255,152,250,91);c.fill();
  c.fillStyle='#efe4bd';c.beginPath();c.moveTo(255,172);c.bezierCurveTo(266,191,283,202,267,218);c.quadraticCurveTo(240,231,239,207);c.quadraticCurveTo(244,193,255,172);c.fill();
  c.fillStyle=ink;c.font='bold 40px sans-serif';c.fillText('FLAMMABLE',256,317);
 }else if(style==='hazard'){
  c.save();c.translate(256,172);c.rotate(Math.PI/4);c.lineWidth=12;c.strokeRect(-77,-77,154,154);c.restore();
  c.font='bold 125px Georgia';c.fillText('!',256,213);c.font='bold 32px Georgia';c.fillText('CAUTION',256,315);
 }else{
  c.fillText('FACTORY STORES',256,88);c.fillRect(66,111,380,5);
  c.beginPath();c.arc(256,201,65,0,Math.PI*2);c.stroke();c.font='bold 77px Georgia';c.fillText('AF',256,228);
  c.font='bold 29px monospace';c.fillText('SUPPLY / No. 24',256,315);
 }
 // Abraded ink, ragged paper edges, and exposed substrate, with no noisy gloss.
 c.globalCompositeOperation='destination-out';
 for(let i=0;i<170;i++){c.globalAlpha=.15+random()*.5;c.fillRect(random()*512,random()*384,2+random()*13,1+random()*3);}
 c.globalAlpha=1;for(let i=0;i<65;i++){const x=random()*512,y=i%2?12+random()*15:358+random()*22;c.fillRect(x,y,3+random()*12,4+random()*12);}
 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
// A gallery/library owns cached geometry and materials. Individual arrangements
// borrow them; removing an arrangement never disposes another one's resources.
export function createCargoLibrary(originalAtlas,cargoAtlas){
 const geometries=new Map(),materials=new Map(),textures=[],rand=n=>{const v=Math.sin(n*127.1+31.7)*43758.5453;return v-Math.floor(v);};let disposed=false;
 const geo=(key,create)=>{if(!geometries.has(key))geometries.set(key,create());return geometries.get(key);};
 const rounded=s=>geo('box:'+s.join(','),()=>softBox(...s,.007,1));
 function solid(name,color){if(!materials.has(name))materials.set(name,new THREE.MeshStandardMaterial({color,roughness:.94}));return materials.get(name);}
 function finish(id,index=0){const key=id+':'+index;if(materials.has(key))return materials.get(key);const def=CARGO_SKINS[id],[u,v,w,h]=def.cell,t=(def.atlas==='cargo'?cargoAtlas:originalAtlas).clone(),wood=def.family==='crate';
  const sw=wood?w*.5:w*.94,sh=h*(wood?.72:.94);t.offset.set(u+w*.025+rand(index+9)*(w*.95-sw),v+h*.025+rand(index+17)*(h*.95-sh));t.repeat.set(sw,sh);t.needsUpdate=true;textures.push(t);
  const m=new THREE.MeshStandardMaterial({map:t,color:def.tint,roughness:wood?.98:.85});
  if(wood){const quiet=id==='timber'?[.22,.13,.055]:id==='weathered'?[.21,.18,.14]:id==='creamWood'?[.46,.40,.30]:[.105,.115,.065];m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb=mix(vec3('+quiet.join(',')+'),diffuseColor.rgb,.72);');};m.customProgramCacheKey=()=> 'cargo-wood-'+id;}
  if(id==='explosiveRed'){m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n float wear=clamp(dot(diffuseColor.rgb,vec3(.3,.59,.11))*2.6,0.0,1.0); diffuseColor.rgb=mix(vec3(.20,.008,.004),vec3(.85,.085,.04),wear);');};m.customProgramCacheKey=()=> 'cargo-flammable-red';}
  materials.set(key,m);return m;
 }
 const iron=solid('iron',0x45413b),inside=solid('inside',0x3b2d24),rub=solid('rub',0xa58c64);
 function add(parent,g,m,pos,rotation=[0,0,0]){const o=new THREE.Mesh(g,m);o.position.set(...pos);o.rotation.set(...rotation);o.castShadow=o.receiveShadow=true;parent.add(o);return o;}
 const box=(parent,m,pos,size,r)=>add(parent,rounded(size),m,pos,r);
 const cylinder=(r,h,segments=12)=>geo(`cylinder:${r}:${h}:${segments}`,()=>new THREE.CylinderGeometry(r,r,h,segments));
 const ring=(r,t)=>geo(`ring:${r}:${t}`,()=>new THREE.TorusGeometry(r,t,6,32));
 function sticker(parent,style,geometry,position,rotation=[0,0,0]){
  if(style==='none')return;
  const key='label:'+style;if(!materials.has(key)){const t=labelTexture(style);textures.push(t);materials.set(key,new THREE.MeshStandardMaterial({map:t,transparent:true,alphaTest:.12,roughness:1,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));}
  const mesh=add(parent,geometry,materials.get(key),position,rotation);mesh.castShadow=false;mesh.userData.cargoLabel=style;
 }
 function crate(skin,w,d,h,banded=false){
  const root=new THREE.Group();box(root,inside,[0,h/2,0],[w-.14,h-.07,d-.14]);
  box(root,finish(skin,3),[0,.025,0],[w-.06,.05,d-.06]);
  const faces=[[0,d/2-.063,0,w-.06],[0,-d/2+.063,Math.PI,w-.06],[w/2-.063,0,Math.PI/2,d-.06],[-w/2+.063,0,-Math.PI/2,d-.06]];
  for(const [f,[x,z,yaw,width]]of faces.entries()){
   const face=new THREE.Group();face.position.set(x,0,z);face.rotation.y=yaw;root.add(face);const n=Math.ceil(width/.22),step=width/n;
   for(let i=0;i<n;i++)box(face,finish(skin,(i+f*2)%8),[-width/2+(i+.5)*step,h/2,0],[step-.009,h-.05,.042]);
   for(const y of [.11,h-.11])box(face,finish(skin,(f+2)%8),[0,y,.033],[.095,width+.025,.045],[0,0,Math.PI/2]);
   const sections=width>1.2?2:1,section=width/sections;
   for(let j=0;j<sections;j++){const x=-width/2+(j+.5)*section,a=section-.12,b=h-.22;box(face,finish(skin,(f+5)%8),[x,h/2,.058],[.085,Math.hypot(a,b),.04],[0,0,-Math.atan2(a,b)]);}
   for(const x of [-width*.38,width*.38])for(const y of [.11,h-.11])add(face,cylinder(.014,.008,8),iron,[x,y,.06],[Math.PI/2,0,0]);
  }
  const n=Math.ceil(w/.22),step=(w-.045)/n;for(let i=0;i<n;i++)box(root,finish(skin,i%8),[-(w-.045)/2+(i+.5)*step,h-.025,0],[step-.008,d-.045,.05],[Math.PI/2,0,0]);
  if(banded)for(const z of [-d*.28,d*.28]){
   for(const x of [-w/2-.003,w/2+.003])box(root,iron,[x,h/2+.005,z],[.024,h+.005,.065]);
   for(const y of [.012,h+.006])box(root,iron,[0,y,z],[w+.022,.023,.065]);
   box(root,rub,[w/2+.018,h*.55,z],[.025,.12,.095]);
  }
  root.userData={kind:'crate',size:[w,h,d]};return root;
 }
 const drumShell=geo('drum-shell',()=>{
  const profile=[[.285,.015],[.308,.05],[.315,.16],[.316,.35],[.314,.62],[.305,.76],[.285,.79]],g=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),32),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),dent=.014*Math.exp(-Math.pow((Math.atan2(x,z)-.9)/.3,2)-Math.pow((y-.47)/.14,2));p.setXYZ(i,x*(1-dent/.316),y,z*(1-dent/.316));}g.computeVertexNormals();return g;
 });
 function drum(skin,index){const root=new THREE.Group(),m=finish(skin,index%3);add(root,drumShell,m,[0,0,0]);
  for(const [y,r]of [[.0125,.302],[.78,.292]])add(root,cylinder(r,.025,32),m,[0,y,0]);
  for(const [y,r]of [[.032,.307],[.2,.317],[.61,.317],[.789,.307]])add(root,ring(r,.011),iron,[0,y,0],[Math.PI/2,0,0]);
  add(root,cylinder(.034,.01),iron,[.12,.791,.085]);add(root,ring(.037,.005),rub,[.12,.795,.085],[Math.PI/2,0,0]);return root;
 }
 function build(id,skin,label='none'){if(disposed)throw Error('Cargo library disposed');const form=CARGO_FORMS.find(f=>f.id===id);if(!form||CARGO_SKINS[skin]?.family!==form.family)throw Error('Invalid cargo form/skin');if(!Object.hasOwn(CARGO_LABELS,label))throw Error('Invalid cargo label');const root=new THREE.Group(),items=[];
  function placeCrate(x,y,z,w=.88,d=.88,h=.8,banded=false){const g=crate(skin,w,d,h,banded);
   if(label!=='none'){
    // Tickets sit in the clear upper-left plank panel, between framing and brace.
    const panel=geo('label-plane',()=>new THREE.PlaneGeometry(.24,.18));
    sticker(g,label,panel,[-w*.23,h*.61,d/2-.0405],[0,0,-.035]);
    const sideWidth=d-.06,sectionWidth=sideWidth>1.2?sideWidth/2:sideWidth;
    sticker(g,label,panel,[w/2-.0405,h*.61,sideWidth/2-sectionWidth*.23],[0,Math.PI/2,.025]);
   }
   g.position.set(x,y,z);root.add(g);items.push({kind:'crate',base:[x,y,z],size:[w,h,d]});}
  function placeDrum(x,y,z,horizontal=false){const pivot=new THREE.Group(),g=drum(skin,items.length);
   if(label!=='none'){
    // Follow the slightly dented shell, rather than a flat card floating off it.
    const large=label==='flammable',curved=geo('label-drum'+(large?'-large':''),()=>{const shape=new THREE.CylinderGeometry(.3165,.3165,large?.36:.235,24,8,true,large?-.7:-.48,large?1.4:.96),p=shape.attributes.position;for(let i=0;i<p.count;i++){const a=Math.atan2(p.getX(i),p.getZ(i)),y=p.getY(i)+.415,r=.316-(y-.35)*(.002/.27)-.014*Math.exp(-Math.pow((a-.9)/.3,2)-Math.pow((y-.47)/.14,2))+.0008;p.setX(i,Math.sin(a)*r);p.setZ(i,Math.cos(a)*r);}shape.computeVertexNormals();return shape;});
    sticker(g,label,curved,[0,.415,0]);
    if(large)sticker(g,label,curved,[0,.415,0],[0,Math.PI/2,0]);
    if(horizontal)sticker(g,label,geo('label-cap',()=>new THREE.PlaneGeometry(.26,.195)),[-.045,.794,-.04],[-Math.PI/2,0,0]);
   }
   g.position.y=-DRUM_HEIGHT/2;g.rotation.y=items.length*2.399963;pivot.add(g);pivot.position.set(x,y,z);if(horizontal)pivot.rotation.x=Math.PI/2;root.add(pivot);items.push({kind:'drum',center:[x,y,z],horizontal,radius:DRUM_RADIUS,height:DRUM_HEIGHT});}
  if(id==='crate-square')placeCrate(0,0,0);
  if(id==='crate-long')placeCrate(0,0,0,.88,1.88,.68);
  if(id==='crate-tall')placeCrate(0,0,0,.88,1.88,1.28);
  if(id==='crate-strapped')placeCrate(0,0,0,.86,1.84,.86,true);
  if(id==='crate-stack'){placeCrate(0,0,0);placeCrate(0,.8,0);}
  if(id==='crate-pallet'){
   for(const x of [-.76,0,.76])box(root,finish(skin,2),[x,.04,0],[.13,.08,1.92]);
   for(let i=0;i<9;i++)box(root,finish(skin,i%8),[0,.11,(i-4)*.215],[1.92,.06,.18]);
   for(const x of [-.46,.46])for(const z of [-.46,.46])placeCrate(x,.14,z,.84,.84,.8);
  }
  if(id==='barrel-single')placeDrum(0,.4,0);
  if(id==='barrel-stack'){placeDrum(0,.4,0);placeDrum(0,1.2,0);}
  if(id==='barrel-row')for(const z of [-.656,0,.656])placeDrum(0,.4,z);
  if(id==='barrel-pyramid')for(let row=0;row<3;row++)for(let i=0;i<3-row;i++)placeDrum((i-(2-row)/2)*.656,.328+row*.656*Math.sqrt(3)/2,0,true);
  if(id==='barrel-pile'){for(const x of [-.328,.328])placeDrum(x,.328,-.37,true);placeDrum(0,.328+.656*Math.sqrt(3)/2,-.37,true);placeDrum(.6,.4,.54);}
  if(id==='barrel-block')for(let level=0;level<2;level++)for(const x of [-.656,0,.656])for(const z of [-.656,0,.656])placeDrum(x,.4+level*.8,z);
  root.updateMatrixWorld(true);return {root,form,skin,label,items,bounds:new THREE.Box3().setFromObject(root,true)};
 }
 return {build,stats:()=>({geometries:geometries.size,materials:materials.size,textures:textures.length}),dispose(){if(disposed)return;disposed=true;for(const g of geometries.values())g.dispose();for(const m of materials.values())m.dispose();for(const t of textures)t.dispose();geometries.clear();materials.clear();textures.length=0;}};
}
