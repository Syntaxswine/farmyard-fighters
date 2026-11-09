import {WINDOW_DEFINITIONS,BORDERLESS_WINDOW_ID,describeWindow} from './art/windows/catalog.js';
import {createWindowLibrary} from './art/windows/geometry.js';
import {placedWindows,placeWindow,removeWindow,selectedWindow,authoredWindowDimensions} from './window-authoring.js';
import {windowSystem} from './window-catalogue.js';
import {clipLegacyWindowBox} from './window-system.js';
import {windowReviewSource} from './window-review-map.js';
import {adaptAftSector} from './aft-sector.js';
import {bindWindowEditorControls} from './window-editor-controls.js';
import {adoptWindowBuffers} from './window-editor-buffers.js';
const $=id=>document.getElementById(id),frame=$('designer');let api,library,releaseControls,assets=[];
for(const d of WINDOW_DEFINITIONS){if(d.id===BORDERLESS_WINDOW_ID)continue;const option=document.createElement('option');option.value=d.id;option.textContent=`${d.heightId==='waist'?'Waist':'Full'} · ${d.patternId} · ${d.span} m`;$('definition').append(option);}
const custom=document.createElement('option');custom.value=BORDERLESS_WINDOW_ID;custom.textContent='Borderless · custom width / height';$('definition').append(custom);
const status=text=>$('status').textContent=text;
const dimensions=()=>$('definition').value===BORDERLESS_WINDOW_ID?authoredWindowDimensions($('sheet-width').value,$('sheet-height').value,$('sheet-height-unit').value):undefined;
function dimensionControls(){const resize=$('definition').value===BORDERLESS_WINDOW_ID;$('sheet-dimensions').hidden=!resize;try{const spec=describeWindow($('definition').value,{},dimensions());$('finish').disabled=!!spec.borderless;$('sheet-metric-size').textContent=`${spec.span} × ${spec.height??spec.bounds.max[1]} m`;}catch(e){$('sheet-metric-size').textContent=e.message;}}
$('definition').addEventListener('change',dimensionControls);for(const id of ['sheet-width','sheet-height','sheet-height-unit'])$(id).addEventListener('input',dimensionControls);dimensionControls();
function clear(){for(const asset of assets)asset.dispose();assets=[];}
function controls(){if(!api?.document)return;const selected=selectedWindow(api.document.map,api.selection);$('place').disabled=api.loading||api.document.block||!api.selection||api.selection.type!=='edge'||!!api.selection.z;$('remove').disabled=api.loading||!selected;$('playtest').disabled=api.loading||api.document.block;for(const name of ['undo','redo']){const button=frame.contentDocument?.getElementById(name);if(button)button.disabled=api.loading||!api.document.editor?.[name]?.length;}}
async function edit(fn){try{if(api.loading)throw Error('Wait for the designer to finish loading.');api.document.replace(fn(api.document.map));await api.changed();controls();status('Window placement updated. Export, undo and redo use the designer’s existing controls.');}catch(e){status(e.message);}}
$('place').onclick=()=>edit(map=>placeWindow(map,api.selection,$('definition').value,{finish:$('finish').value,dimensions:dimensions()}));
$('remove').onclick=()=>edit(map=>removeWindow(map,selectedWindow(map,api.selection)?.id));
$('playtest').onclick=()=>{try{const source=JSON.parse(api.export());adaptAftSector(source);localStorage.setItem('farmyard-window-authored-map',JSON.stringify(source));window.open('window-yard.html?authored=1'+(new URLSearchParams(globalThis.location?.search||'').get('rules')==='turn-based'?'&rules=turn-based':''),'_blank','noopener');}catch(e){status('Playtest: '+e.message);}};
$('review').onclick=async()=>{try{if(!api)throw Error('The 3D designer needs WebGL before it can open the proving yard.');await api.open(JSON.stringify(windowReviewSource()));controls();status('Proving yard loaded in the designer. Select a wall to place a window, or Playtest map.');}catch(e){status(e.message);}};
function connect(){
  releaseControls?.();clear();library?.dispose();api=null;
  const current=frame.contentWindow?.editor3d;if(!current){status('The designer could not initialize. WebGL must be available to use its 3D view.');return;}
  api=current;library=createWindowLibrary();const scene=api.scene,base=scene.rebuild.bind(scene);
  releaseControls=bindWindowEditorControls(scene,controls);
  scene.rebuild=()=>{
    clear();const map=api.document?.map,records=map?windowSystem.compile({map:map.terrain,windows:placedWindows(map)}):[],covered=new Set(records.flatMap(r=>r.edges)),prior=scene.world;
    // Adjust the borrowed legacy boxes for presentation only. The saved map
    // and pinned designer bytes remain untouched.
    if(prior)scene.world={...prior,boxes:prior.boxes.map(box=>clipLegacyWindowBox(box,covered)).filter(Boolean)};
    try{base();}finally{scene.world=prior;}
    if(scene.options.walls)for(const {placement:p}of records){const asset=library.build(p.definitionId,{joins:p.joins,dimensions:p.dimensions,finish:p.finish,wall:p.wall,rotation:p.rotation||0});adoptWindowBuffers(asset.root,frame.contentWindow);asset.root.position.set(p.x,0,p.y);scene.scene.add(asset.root);assets.push(asset);}
  };
  scene.rebuild();controls();status('Select a ground-floor wall. A wide window starts at that wall cell and replaces its complete span. Playtest accepts flat ground maps.');
}
frame.addEventListener('load',connect);
// The iframe already owns and disposes its native scene on pagehide.
window.addEventListener('pagehide',()=>{releaseControls?.();clear();library?.dispose();});
