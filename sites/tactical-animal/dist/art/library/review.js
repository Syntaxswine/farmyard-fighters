import * as T from '../../aft/tactics/vendor/three.module.js';
import {FORMS,SKINS} from './catalog.js';
import {loadLibraryTextures,createLibraryFurniture} from './furniture.js';
import {createThumbnailRenderer} from './thumbnail-renderer.js';

const catalog=document.querySelector('#catalog'),status=document.querySelector('#status');
const renderer=createThumbnailRenderer();
const scene=new T.Scene();scene.background=new T.Color(0xa5a792);
scene.add(new T.HemisphereLight(0xfff0d0,0x59695e,2.4));
const sun=new T.DirectionalLight(0xffe6ba,2.6);sun.position.set(-3,8,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-6,right:6,top:5,bottom:-5,near:1,far:25});sun.shadow.normalBias=.02;scene.add(sun);
const camera=new T.OrthographicCamera(-4,4,2.5,-2.5,.1,40);
const stage=new T.Group();scene.add(stage);
const groundGeometry=new T.BoxGeometry(1,1,1),floorMaterial=new T.MeshStandardMaterial({color:0xa2a38e,roughness:1}),tileMaterials=[0xb1b29c,0xa9ab96].map(color=>new T.MeshStandardMaterial({color,roughness:1}));
const floor=new T.Mesh(groundGeometry,floorMaterial);floor.scale.set(100,.06,100);floor.position.y=-.05;floor.receiveShadow=true;scene.add(floor);
floor.userData.ground=true;
const guideMaterial=new T.LineBasicMaterial({color:0x6c7b6f,transparent:true,opacity:.7});
let sources,library,disposed=false,generation=0;
function thumbnail(form,skin,view){
 const empty=library.build(form.id,skin.id,'empty'),books=library.build(form.id,skin.id,'books');
 const group=new T.Group();stage.add(group);const guideGeometries=[];
 try{
  const sideways=!!form.constructionRotation&&view!=='top',spacing=(sideways?form.depth:form.width)/2+.24;
  for(const [i,asset] of [empty,books].entries()){
   const offset=(i?1:-1)*spacing*(view==='back'?-1:1);
   if(sideways)asset.root.position.z=-offset;else asset.root.position.x=offset;group.add(asset.root);
   const [w,d]=form.tiles;
   for(let x=0;x<w;x++)for(let z=0;z<d;z++){
    const tile=new T.Mesh(groundGeometry,tileMaterials[(x+z)%2]);tile.scale.set(.986,.012,.986);tile.position.set(asset.root.position.x+x-(w-1)/2,-.009,asset.root.position.z+z-(d-1)/2);tile.receiveShadow=true;tile.userData.ground=true;group.add(tile);
   }
   const sx=asset.root.position.x,sz=asset.root.position.z,points=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2],[-w/2,-d/2]].map(([x,z])=>new T.Vector3(x+sx,.002,z+sz));
   const geometry=new T.BufferGeometry().setFromPoints(points);guideGeometries.push(geometry);group.add(new T.Line(geometry,guideMaterial));
  }
  const bounds=new T.Box3().setFromObject(group),center=bounds.getCenter(new T.Vector3());
  const facing=sideways?new T.Vector3(8,4.5,5):new T.Vector3(5,4.5,8);
  if(view==='back'){facing.x*=-1;facing.z*=-1;}
  camera.up.set(0,1,0);camera.position.copy(center).add(view==='top'?new T.Vector3(0,10,.001):facing);
  if(view==='top')camera.up.set(0,0,-1);camera.lookAt(center);camera.updateMatrixWorld(true);
  const projected=new T.Box3();
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])projected.expandByPoint(new T.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  const size=projected.getSize(new T.Vector3()),halfWidth=Math.max(size.x/2,size.y/2*768/500)*1.14;
  Object.assign(camera,{left:-halfWidth,right:halfWidth,top:halfWidth*500/768,bottom:-halfWidth*500/768});camera.updateProjectionMatrix();
  return renderer.render(scene,camera);
 }finally{empty.dispose();books.dispose();group.removeFromParent();for(const geometry of guideGeometries)geometry.dispose();}
}
async function renderCatalog(){
 const current=++generation,formId=document.querySelector('#form').value,skinId=document.querySelector('#skin').value,view=document.querySelector('#view').value;
 const forms=FORMS.filter(f=>formId==='all'||(formId==='full-tile-pair'?f.fullTile:f.id===formId)),skins=SKINS.filter(s=>skinId==='all'||s.id===skinId);
 catalog.replaceChildren();status.textContent='Rendering furniture…';
 for(const form of forms)for(const skin of skins){
  if(disposed||current!==generation)return;
  const card=document.createElement('article');card.className='asset-card';
  const picture=document.createElement('div');picture.className='asset-picture';const image=document.createElement('img');image.alt=`${form.name}, ${skin.name}: empty and with books`;image.width=768;image.height=500;
  image.src=thumbnail(form,skin,view);picture.append(image);
  const labels=document.createElement('div');labels.className='state-labels';labels.innerHTML='<span>EMPTY</span><span>WITH BOOKS</span>';picture.append(labels);card.append(picture);
  const info=document.createElement('div');info.className='asset-info';
  const heading=document.createElement('div');heading.className='asset-heading';const swatch=document.createElement('span');swatch.className='swatch';swatch.style.background=skin.swatch;const title=document.createElement('h2');title.textContent=form.name;heading.append(swatch,title);info.append(heading);
  const finish=document.createElement('p');finish.className='asset-skin';finish.textContent=skin.name;info.append(finish);
  const download=document.createElement('a');download.href=image.src;download.download=`library-${form.id}-${skin.id}-${view}.png`;download.textContent='PNG ↓';download.setAttribute('aria-label',`Save ${form.name} in ${skin.name} preview`);info.append(download);
  const dimensions=document.createElement('div');dimensions.className='dimensions';dimensions.textContent=`${form.tiles.join(' × ')} tiles · ${form.width} × ${form.depth} m · H ${form.height} m`;info.append(dimensions);card.append(info);catalog.append(card);
  await new Promise(requestAnimationFrame);
 }
 if(current===generation)status.textContent=`${forms.length*skins.length*2} models shown · ${skins.length} ${skins.length===1?'finish':'finishes'} · ${renderer.mode} preview · ready`;
}
function dispose(){if(disposed)return;disposed=true;generation++;library?.dispose();sources?.dispose();groundGeometry.dispose();floorMaterial.dispose();tileMaterials.forEach(m=>m.dispose());guideMaterial.dispose();sun.shadow.map?.dispose();renderer.dispose();}
addEventListener('pagehide',dispose,{once:true});addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
document.querySelector('#filters').addEventListener('submit',e=>e.preventDefault());
try{sources=await loadLibraryTextures();if(disposed){sources.dispose();}else{library=createLibraryFurniture(sources);for(const input of document.querySelectorAll('select'))input.addEventListener('change',()=>renderCatalog().catch(error=>{status.textContent=error.message;}));await renderCatalog();}}
catch(error){status.textContent=error.message;dispose();}
