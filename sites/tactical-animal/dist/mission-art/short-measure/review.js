import * as T from '../../aft/tactics/vendor/three.module.js';
import {surfacePixels,surfaceUV} from '../../aft/tactics/hybrid-materials.js';
import {PLACEMENTS,CAMERAS,bindingFor} from './manifest.js';
import {createShortMeasureKit} from './kit.js';

const host=document.querySelector('#viewer');
const renderer=new T.WebGLRenderer({antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=T.SRGBColorSpace;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
host.prepend(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color(0xb6b9a3);
scene.add(new T.HemisphereLight(0xf9edcd,0x4d665c,2.4));
const sun=new T.DirectionalLight(0xffedc5,3.2);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:1,far:85});sun.shadow.bias=-.0004;sun.shadow.normalBias=.025;scene.add(sun);scene.add(sun.target);
const camera=new T.OrthographicCamera(-1,1,1,-1,.1,120);
const ownedTextures=[],ownedMaterials=[],ownedGeometries=[],walls=[];
const meshGeometry=new T.BoxGeometry(1,1,1);ownedGeometries.push(meshGeometry);
let disposed=false;

function material(kind,color=null) {
 const pixels=surfacePixels(kind,128),map=new T.DataTexture(pixels.data,pixels.width,pixels.height);
 map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.magFilter=map.minFilter=T.LinearFilter;map.needsUpdate=true;ownedTextures.push(map);
 const result=new T.MeshStandardMaterial({map,roughness:.94,color:color||0xffffff});ownedMaterials.push(result);return result;
}
const yardMaterial=material('concrete',0xe9e7d6),floorMaterial=material('concrete',0xd2c8a5),woodMaterial=material('wood');
yardMaterial.map.repeat.set(40,30);floorMaterial.map.repeat.set(8,8);
const brick=material('brick'),metal=material('steel');
function box(parent,mat,x,y,z,w,h,d){const item=new T.Mesh(meshGeometry,mat);item.position.set(x,y,z);item.scale.set(w,h,d);item.castShadow=item.receiveShadow=true;parent.add(item);return item;}
const world=new T.Group();scene.add(world);
const blockout=await fetch('./blockout.json').then(r=>{if(!r.ok)throw Error('Blockout unavailable');return r.json();});
const paper=await new T.TextureLoader().loadAsync('./shipping-manifest.svg');paper.colorSpace=T.SRGBColorSpace;paper.anisotropy=4;ownedTextures.push(paper);
const kit=createShortMeasureKit({paperTexture:paper});

// These are candidate art reservations, not inferred gameplay geometry.
const reviewBindings=Object.fromEntries(PLACEMENTS.filter(p=>p.owner).map(p=>[p.id,bindingFor(p)]));
box(world,yardMaterial,19.5,-.09,14.5,40,.18,30);
for(const room of blockout.rooms) {
 const [x,z,w,d]=room.rect,west=x-.5,east=x+w-.5,north=z-.5,south=z+d-.5;
 box(world,floorMaterial,(west+east)/2,.012,(north+south)/2,w,.024,d);
 const edges=[['north',west,east,north,true],['south',west,east,south,true],['west',north,south,west,false],['east',north,south,east,false]];
 for(const [side,start,end,fixed,horizontal] of edges) {
  const holes=room.doors.filter(([dx,dz])=>Math.abs((horizontal?dz:dx)-fixed)<.001).map(([dx,dz])=>horizontal?dx:dz).sort((a,b)=>a-b);
  const spans=[];let cursor=start;
  for(const center of holes){spans.push([cursor,center-.5]);cursor=center+.5;}spans.push([cursor,end]);
  for(const [a,b] of spans)if(b>a){
   const mat=brick.clone();ownedMaterials.push(mat);
   const wall=box(world,mat,horizontal?(a+b)/2:fixed,1,horizontal?fixed:(a+b)/2,horizontal?b-a:.16,2,horizontal?.16:b-a);
   // Keep the inherited brick density in metres on differently sized walls.
   const wallGeometry=meshGeometry.clone(),uv=wallGeometry.attributes.uv,position=wallGeometry.attributes.position,normal=wallGeometry.attributes.normal;
   for(let i=0;i<position.count;i++){const coords=surfaceUV([position.getX(i)*wall.scale.x,position.getY(i)*2,position.getZ(i)*wall.scale.z],[normal.getX(i),normal.getY(i),normal.getZ(i)]);uv.setXY(i,...coords);}
   wall.geometry=wallGeometry;ownedGeometries.push(wallGeometry);
   wall.userData.side=room.id+':'+side;walls.push(wall);
   box(wall,metal,0,.46,0,1,.06,1); // Coping stays inside the wall's two-metre envelope.
  }
 }
}
for(const [x,z,w,d] of blockout.cover) {
 if(x===27&&z===19)continue;
 for(let i=0;i<w;i++)for(let j=0;j<d;j++){
  const group=new T.Group();world.add(group);group.position.set(x+i,0,z+j);
  box(group,woodMaterial,0,.50,0,1,1,1);
  for(const side of [-1,1]){box(group,woodMaterial,side*.40,.5,.502,.10,.98,.015);box(group,woodMaterial,0,.5,side*.502,.98,.10,.015);}
 }
}
for(const p of PLACEMENTS){const model=kit.place(p.id,{binding:reviewBindings[p.id]});if(model)world.add(model);}
world.add(kit.createGroundPaint());
// A single inherited crate explains the existing supply-chest anchor.
box(world,woodMaterial,4,.35,22,.65,.7,.55);

const props=new T.Group();scene.add(props);props.visible=false;
box(props,floorMaterial,0,-.05,0,14,.10,14);
for(const [kind,x,z] of [['scale-worker',-1.25,1.5],['scale-freight',1.25,1.5],['sacks-empty',-1.25,-1.4],['sacks-full',1.25,-1.4]]){
 const prop=kit.createProp(kind,{size:[1.5,.95,1.25]});prop.position.set(x,0,z);props.add(prop);
}
let view='arrival';
const descriptions={
 arrival:'Bent ration scale and collapsed sacks beside sealed full freight. New solids require the listed collision bindings.',
 office:'Both office exits stay open. The stamped paper sits on a desk behind the objective use point (32,7).',
 props:'Shared chassis and seven-in-a-square seal. Left: bent beam and welded stop. Right: intact beam and full pan.',
};
function render() {
 if(disposed)return;
 const {width,height}=host.getBoundingClientRect(),aspect=width/height;
 renderer.setSize(width,height,false);
 const def=CAMERAS[view],span=view==='props'&&aspect<.8?13:def.span;
 Object.assign(camera,{left:-span*aspect/2,right:span*aspect/2,top:span/2,bottom:-span/2});camera.updateProjectionMatrix();
 const [x,z]=def.target;camera.position.set(x+10,14,z+12);camera.lookAt(x,0,z);
 sun.position.set(x-9,24,z-7);sun.target.position.set(x,0,z);sun.target.updateMatrixWorld();
 renderer.render(scene,camera);
 document.querySelector('.view-caption').style.top=`${document.querySelector('nav').getBoundingClientRect().bottom+14}px`;
 document.querySelector('#render-status').textContent=`${Math.round(width)} × ${Math.round(height)} · ready`;
}
function select(next) {
 view=next;const def=CAMERAS[view];world.visible=view!=='props';props.visible=view==='props';
 for(const wall of walls){const fade=def.cutaway.includes(wall.userData.side);wall.material.transparent=fade;wall.material.opacity=fade?.13:1;wall.material.depthWrite=!fade;wall.castShadow=!fade;}
 document.querySelector('#view-title').textContent=def.title;document.querySelector('#view-subtitle').textContent=def.subtitle;
 document.querySelector('#view-note').textContent=descriptions[view];
 for(const button of document.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===view));
 render();
}
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>select(button.dataset.view));
const observer=new ResizeObserver(()=>render());observer.observe(host);
select('arrival');document.querySelector('#loading').hidden=true;
function dispose(){if(disposed)return;disposed=true;observer.disconnect();kit.dispose();for(const g of ownedGeometries)g.dispose();for(const m of ownedMaterials)m.dispose();for(const t of ownedTextures)t.dispose();sun.shadow.map?.dispose();renderer.dispose();}
addEventListener('pagehide',dispose,{once:true});
// A cached page has released its WebGL buffers; rebuild on browser Back.
addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
