import * as T from './aft/tactics/vendor/three.module.js';
import {createSoloGame,DEFAULT_BUILD,hero,Core,encodeSave,decodeSave} from './solo-game.js?v=__VERSION__';
import {WindowScenery,WindowEffects} from './window-view.js?v=__VERSION__';
import {createWindowPreview} from './art/windows/preview-renderer.js?v=__VERSION__';
const $=id=>document.getElementById(id),rect={x:0,y:0,w:48,h:48},scene=new T.Scene(),renderer=createWindowPreview(1000,650),camera=new T.OrthographicCamera(-9,9,5.85,-5.85,.1,100);
scene.background=new T.Color(0x9ca48f);scene.add(new T.HemisphereLight(0xfff0d0,0x59695e,2.4));const sun=new T.DirectionalLight(0xffe6ba,2.6);sun.position.set(-3,8,5);scene.add(sun);camera.position.set(33,8,37);camera.lookAt(23,1,24.5);
let state,art,fx,time=0,saved,large=false,action='Ready';
function start(s){art?.dispose();fx?.dispose();state=s||createSoloGame({...DEFAULT_BUILD,utility:'grenade'},1,'window-yard');art=new WindowScenery(state);scene.add(art.root);fx=new WindowEffects(scene,state,{reduced:()=>false});time=0;draw();}
function draw(){fx.observe(state,time,rect);art.update(state,rect,(id,pane)=>fx.holds(id,pane));
  if(large){for(const [id,asset]of art.assets)asset.root.visible=id==='borderless-five-storeys';Object.assign(camera,{left:-12,right:12,top:7.8,bottom:-7.8});camera.position.set(24.5,5.3,44);camera.lookAt(24.5,5.3,12.5);}else{Object.assign(camera,{left:-9,right:9,top:5.85,bottom:-5.85});camera.position.set(33,8,37);camera.lookAt(23,1,24.5);}camera.updateProjectionMatrix();
  $('proof').src=renderer.render(scene,camera);$('status').textContent=action+' · '+renderer.mode;const a=hero(state);$('report').textContent=JSON.stringify({ammo:a.ammo.assault,AP:a.ap,dimensions:large?state.windows.find(p=>p.id==='borderless-five-storeys').dimensions:undefined,broken:state.windowBreaks||{},acceptedBreaks:state.windowSequence||0,transientReceipts:state.windowEvents?.length||0,effects:fx.stats(),visibleMeshes:Object.fromEntries([...art.assets].map(([id,asset])=>[id,[...asset.panes.keys()].filter(pane=>asset.isPaneVisible(pane))])),shots:state.effect?.sequence.map(e=>({shot:e.shot,glass:!!e.glass,unit:e.impact?.unitId,windowSequences:e.windowSequences}))},null,2);}
$('reset').onclick=()=>{large=false;action='Ready';start();};
$('large').onclick=()=>{large=true;action='One authored 20 m × 10.6 m sheet, isolated for geometry inspection';draw();};
$('high').onclick=()=>{large=true;fx.unlock();const ok=Core.attack(state,hero(state),{ground:true,windowId:'borderless-five-storeys',x:20,y:12.5,h:9});action=ok?'Accepted shot at 9 m; one whole-sheet break':'Shot unavailable';draw();};
$('burst').onclick=()=>{fx.unlock();Core.attack(state,hero(state),state.units[1],true);action='Committed burst';draw();};
$('cell').onclick=()=>{fx.unlock();Core.attack(state,hero(state),{ground:true,x:25,y:21.5,h:.4,name:'Lower centre pane'});action='Committed divided-cell shot';draw();};
$('frame').onclick=()=>{fx.unlock();Core.attack(state,hero(state),{ground:true,x:25,y:21.5,h:1,name:'Mullion'});action='Committed mullion shot';draw();};
$('blast').onclick=()=>{fx.unlock();Core.throwGrenade(state,hero(state),{x:20,y:23});action='Committed grenade';draw();};
$('step').onclick=()=>{time+=400;action='Sampled actual source shatter at '+time+' ms';draw();};
$('save').onclick=()=>{saved=encodeSave(state);action='Saved and restored; no transient effect replay';start(decodeSave(saved));};
$('revisit').onclick=()=>{art.update(state,{x:96,y:96,w:48,h:48});fx.observe(state,time,{x:96,y:96,w:48,h:48});action='Left and returned; no transient effect replay';draw();};
addEventListener('pagehide',()=>{art.dispose();fx.dispose();renderer.dispose();});start();
