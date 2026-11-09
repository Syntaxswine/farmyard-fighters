import * as T from '../../aft/tactics/vendor/three.module.js';
import {BORDERLESS_WINDOW_ID,WINDOW_DEFINITIONS,WINDOW_METRICS,describeWindow} from './catalog.js';
import {createWindowLibrary} from './geometry.js';
import {createWindowPreview} from './preview-renderer.js';

const catalog=document.querySelector('#catalog'),status=document.querySelector('#status'),library=createWindowLibrary(),renderer=createWindowPreview();
const scene=new T.Scene();scene.background=new T.Color(0x9ca48f);scene.add(new T.HemisphereLight(0xfff0d0,0x59695e,2.4));const sun=new T.DirectionalLight(0xffe6ba,2.6);sun.position.set(-3,8,5);scene.add(sun);
const camera=new T.OrthographicCamera(-4,4,2.5,-2.5,.1,10000),cube=new T.BoxGeometry(1,1,1),surfaces=[0x8c927f,0x617460,0xd6c79d,0xaeb39c,0xd7ae68,0x90bec1].map(color=>new T.MeshStandardMaterial({color,roughness:1}));
let generation=0,disposed=false;
const fmt=n=>Number(n.toFixed(3)).toString(),box=(parent,mat,at,size,angle=0)=>{const mesh=new T.Mesh(cube,mat);mesh.position.set(...at);mesh.scale.set(...size);mesh.rotation.z=angle;parent.add(mesh);return mesh;};
const cameraOffset=view=>view==='front'?new T.Vector3(0,0,9):view==='back'?new T.Vector3(-5,3.1,-8):new T.Vector3(5,3.1,8);
function backdrop(group,spec,x,sign,drawBoard=true){
 if(!spec.borderless){
  box(group,surfaces[0],[x,-.035,0],[spec.span+.14,.06,.75]);
  box(group,surfaces[1],[x,.99,-sign*.34],[spec.span-.025,1.96,.025]);
  box(group,surfaces[2],[x,1.06,-sign*.31],[spec.span*.76,.10,.02],sign*.21);return;
 }
 // Small presets use the open scene background; a board outline would read
 // like an unwanted frame. Large sheets keep a reference board beyond the crop.
 if(spec.span<=3&&spec.height===WINDOW_METRICS.storeyHeight)return;
 const padding=Math.max(6,spec.span+spec.height+2);
 if(drawBoard)box(group,surfaces[1],[x,spec.height/2,-sign*.34],[spec.span+2*padding,spec.height+2*padding,.025]);
 const step=Math.max(1,Math.ceil(Math.max(spec.span,spec.height)/64)),front=-sign*.31;
 for(let n=step;n<spec.span;n+=step)box(group,surfaces[3],[x-spec.span/2+n,spec.height/2,front],[.008,spec.height+.12,.005]);
 for(let n=step;n<spec.height;n+=step)box(group,surfaces[3],[x,n,front],[spec.span+.12,.008,.005]);
 const chunkStep=8*Math.max(1,Math.ceil(spec.span/512)),storeyStep=WINDOW_METRICS.storeyHeight*Math.max(1,Math.ceil(spec.height/(64*WINDOW_METRICS.storeyHeight)));
 for(let n=chunkStep;n<spec.span;n+=chunkStep)box(group,surfaces[4],[x-spec.span/2+n,spec.height/2,front+sign*.01],[.018,spec.height+.12,.005]);
 for(let n=storeyStep;n<spec.height-1e-8;n+=storeyStep)box(group,surfaces[5],[x,n,front+sign*.02],[spec.span+.12,.018,.005]);
}
function fitCamera(group,view){
 const bounds=new T.Box3();for(const child of group.children)if(child.userData.windowDefinitionId)bounds.union(new T.Box3().setFromObject(child));const center=bounds.getCenter(new T.Vector3()),distance=Math.max(9,bounds.getSize(new T.Vector3()).length()*2);camera.up.set(0,1,0);camera.far=distance*3;camera.position.copy(center).add(cameraOffset(view).normalize().multiplyScalar(distance));camera.lookAt(center);camera.updateMatrixWorld(true);
 const projected=new T.Box3();for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])projected.expandByPoint(new T.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
 const size=projected.getSize(new T.Vector3()),half=Math.max(size.x/2,size.y/2*768/480)*1.12;Object.assign(camera,{left:-half,right:half,top:half*480/768,bottom:-half*480/768});camera.updateProjectionMatrix();
}
function thumbnail(spec,finish,wall,view,requestedPane){
 const intact=library.build(spec.id,{finish,wall,dimensions:spec.dimensions}),missing=library.build(spec.id,{finish,wall,dimensions:spec.dimensions}),id=missing.panes.has(requestedPane)?requestedPane:missing.spec.panes.at(-1).id;missing.setPaneVisible(id,false);
 const group=new T.Group();scene.add(group);
 try{
  const offset=spec.span/2+.24,sign=view==='back'?-1:1;
  for(const [i,asset] of [intact,missing].entries()){asset.root.position.x=(i?1:-1)*offset*sign;group.add(asset.root);backdrop(group,spec,asset.root.position.x,sign,i===0);}
  fitCamera(group,view);return {src:renderer.render(scene,camera),pane:id};
 }finally{intact.dispose();missing.dispose();group.removeFromParent();}
}
function detailThumbnail(spec,view,removed){
 const asset=library.build(spec.id,{dimensions:spec.dimensions}),group=new T.Group();scene.add(group);group.add(asset.root);
 try{
  if(removed)asset.setPaneVisible('r0c0',false);backdrop(group,spec,0,view==='back'?-1:1);
  const focus=new T.Vector3(-spec.span/2+Math.min(8,spec.span/2),Math.min(WINDOW_METRICS.storeyHeight,spec.height/2),0),half=1.8;
  const distance=Math.max(9,Math.hypot(spec.span,spec.height)*2);camera.far=distance*3;camera.position.copy(focus).add(cameraOffset(view).normalize().multiplyScalar(distance));camera.lookAt(focus);Object.assign(camera,{left:-half,right:half,top:half*480/768,bottom:-half*480/768});camera.updateProjectionMatrix();
  return renderer.render(scene,camera);
 }finally{asset.dispose();group.removeFromParent();}
}
function card(spec,src,labels,title=spec.name,detail=false){
 const article=document.createElement('article');article.className='card';const picture=document.createElement('div');picture.className='picture';
 const img=document.createElement('img');img.src=src;img.width=768;img.height=480;img.alt=`${title}, ${fmt(spec.span)} by ${fmt(spec.height)} metres: ${labels.join(', ')}`;picture.append(img);
 const captions=document.createElement('div');captions.className='labels';for(const label of labels){const span=document.createElement('span');span.textContent=label;captions.append(span);}picture.append(captions);article.append(picture);
 const info=document.createElement('div');info.className='info';const heading=document.createElement('h2');heading.textContent=title;info.append(heading);
 const dims=document.createElement('div');dims.className='dimensions';dims.textContent=spec.borderless?`${fmt(spec.span)} × ${fmt(spec.height)} m · one pane · no frame${detail?' · same whole mesh':''}`:`${fmt(spec.span)} m span · 2 m wall · ${spec.panes.length} ${spec.panes.length===1?'pane':'panes'} · sill ${spec.sill} m`;info.append(dims);
 const id=document.createElement('p');id.className='id';id.textContent=spec.id;info.append(id);article.append(info);catalog.append(article);
}
function controls(){
 const custom=document.querySelector('#span').value==='custom',height=document.querySelector('#height'),pattern=document.querySelector('#pattern');
 if(custom){height.value='full';pattern.value='borderless';}else if(pattern.value==='borderless'&&height.value==='waist')height.value='full';
 height.disabled=pattern.disabled=custom;for(const id of ['width','sheet-height','height-unit'])document.querySelector('#'+id).disabled=!custom;
 const borderless=pattern.value==='borderless';for(const id of ['finish','wall','pane'])document.querySelector('#'+id).disabled=borderless;
}
async function render(){
 controls();const current=++generation,values=Object.fromEntries([...document.querySelectorAll('select,input')].map(s=>[s.id,s.value]));catalog.replaceChildren();status.textContent='Rendering windows…';
 const custom=values.span==='custom',dimensions=custom?{width:+values.width,height:+values['sheet-height']*(values['height-unit']==='storeys'?WINDOW_METRICS.storeyHeight:WINDOW_METRICS.tile)}:undefined;
 const defs=custom?[describeWindow(BORDERLESS_WINDOW_ID,{},dimensions)]:WINDOW_DEFINITIONS.filter(d=>(values.height==='all'||d.heightId===values.height)&&(values.span==='all'||d.span===+values.span)&&(values.pattern==='all'||d.patternId===values.pattern)).map(d=>describeWindow(d.id));
 for(const spec of defs){
  if(disposed||current!==generation)return;
  const preview=thumbnail(spec,values.finish,values.wall,values.view,values.pane);card(spec,preview.src,['INTACT',preview.pane.toUpperCase()+' REMOVED']);
  if(custom){card(spec,detailThumbnail(spec,values.view,false),['INTACT · DETAIL'],'Continuity at tile / chunk / storey lines',true);card(spec,detailThumbnail(spec,values.view,true),['R0C0 REMOVED · DETAIL'],'Same reference lines after removal',true);}
  await new Promise(requestAnimationFrame);
 }
 if(current===generation)status.textContent=custom?`1 resizable design · one logical pane · ${renderer.mode} preview · ready`:`${defs.length} ${defs.length===1?'design':'designs'} · ${defs.length*2} window states · ${renderer.mode} preview · ready`;
}
function dispose(){if(disposed)return;disposed=true;generation++;library.dispose();cube.dispose();surfaces.forEach(m=>m.dispose());renderer.dispose();}
function update(){render().catch(e=>{status.textContent=e.message;});}
document.querySelector('#filters').addEventListener('submit',e=>e.preventDefault());for(const control of document.querySelectorAll('select,input'))control.addEventListener('change',update);
addEventListener('pagehide',dispose,{once:true});addEventListener('pageshow',e=>{if(e.persisted)location.reload();});update();
