import {CANOPY_LEVEL,MAP_LEVELS} from './map-layers.js';
import {embedMapDialogues,resolveDialogue} from './dialogue-data.js';
import {validateDialogue,mergeDialogueDefinitions} from './dialogue-schema.js';
import {INTRO_DIALOGUE,TUTORIAL_ROLES} from './tutorial-mission.js';
import {isHedge} from './hedge-data.js';
import {spotlightPathError} from './spotlight-path.js';
import {shiftPatrol,patrolError} from './character-patrol.js';
import {paintFoliage} from './editor-foliage-brush.js';
import {cleanFoliage} from './foliage-data.js';
import {paintLand} from './editor-land-brush.js';
import {breakStructure,finishBreachEdit} from './editor-breaches.js';
import {cleanBreaches} from './breach-data.js';
import {diagonalRoad,ROAD_CORNERS} from './diagonal-roads.js';
import {STRUCTURE_PRESETS} from './editor-structure-presets.js';
import {rampStroke} from './editor-ramp-stroke.js';
import {previewCanopy,canopyCells} from './editor-canopies.js';
import {bankSet} from './ramp-banks.js';
import {isRamp,rampInfo} from './cliff-ramps.js';
import {rampSupportAt} from './cliff-ramps.js';
import {characters,characterName,characterDiagnostics,copyCharacters,ensureCharacterIdentities} from './character-properties.js';
import {isCliff,CLIFF_LIMIT} from './cliff-map.js';
import {TOWERS,towerSlots,towerPost} from './tower-geometry.js';
import {LIGHT_FORMS} from './light-sources.js';
import {mapStartMinutes} from './game-clock.js';
import {InspectionDocument} from './editor-3d-model.js';
import {createEditor,applyBrush,brushShape,brushPoints,replaceMap,undo,redo} from './core/editor-model.js';
import {validateMap,edgeKey,terrainAt,roofEndpoint} from './core/maps.js';
import {openBlock,extractBlock,validateBlock,placeBlock} from './core/blocks.js';
import {connectionSet} from './core/connections.js';
import {EDGES,PROPS,propCells} from './core/environment.js';
import {isScenery,sceneryOrientation,sceneryFacing} from './scenery-catalog.js';
import {sceneryPlacementErrors} from './scenery-placement.js';
export function brushPoint(p){const x=Math.floor(p.x+.5),y=Math.floor(p.y+.5),dx=p.x-x,dy=p.y-y,axis=Math.abs(dx)>Math.abs(dy)?'e':'s';return {x,y,z:p.z,edge:edgeKey(axis,x-(axis==='e'&&dx<0?1:0),y-(axis==='s'&&dy<0?1:0),p.z)};}
import {helicopterStart} from './helicopter-start.js';
import {isStrategicSite} from './strategic-site-rules.js';
export class EditingDocument extends InspectionDocument {
 tutorialObject(selection,role){
  const map=structuredClone(this.editor.map),a=selection?.data,p=selection?.type==='prop'&&map.props.find(p=>p.x===a.x&&p.y===a.y&&(p.z||0)===(a.z||0)&&p.kind===a.kind);
  if(!p)throw Error('Select the tutorial object first.');
  if(role&&(!Object.hasOwn(TUTORIAL_ROLES,role)||!TUTORIAL_ROLES[role].kinds.includes(p.kind)))throw Error('This tutorial role does not match the selected object.');
  if(role)p.tutorialRole=role;else delete p.tutorialRole;
  this.replace(map);
 }
 tutorialGuide(id,definition){
  if(definition?.id!==INTRO_DIALOGUE)throw Error('Load the plateau intro dialogue first.');
  validateDialogue(definition);const map=structuredClone(this.editor.map),p=map.guards.find(p=>p.character.id===id);
  if(!p)throw Error('Select a placed NPC or guard.');
  p.character.canTalk=true;p.character.dialogueRef=INTRO_DIALOGUE;
  mergeDialogueDefinitions(map,{dialogueDefinitions:{[INTRO_DIALOGUE]:definition}});
  map.characterResources??={};map.characterResources.dialogues=[...new Set([...(map.characterResources.dialogues||[]),INTRO_DIALOGUE])];
  this.replace(map);
 }
 crashStart(selection){if(selection?.type!=='prop')throw Error('Select the crashed helicopter.');this.replace(helicopterStart(this.editor.map,selection.data));}
 siteSabotage(selection,enabled){
  const p=selection?.data;if(selection?.type!=='prop'||!isStrategicSite(p))throw Error('Select a radio tower, radar tower or SAM site.');
  if(typeof enabled!=='boolean')throw Error('Choose whether sabotage is allowed.');
  this.replace({...this.editor.map,props:this.editor.map.props.map(q=>q.x===p.x&&q.y===p.y&&(q.z||0)===(p.z||0)&&q.kind===p.kind?{...q,sabotage:enabled}:q)});
 }
 open(text){super.open(text);if(!this.block)mapStartMinutes(this.map);this.editor=createEditor(this.block?openBlock(this.original):this.map);this.refresh();this.changed=false;this.revision=0;return this;}
 refresh(){if(this.block){const original={...this.original,...extractBlock(this.editor.map)};if(!this.editor.map.foliage)delete original.foliage;if(!this.editor.map.blockConnections?.['0,0'])delete original.connections;const display=new InspectionDocument().open(JSON.stringify(original));this.map=display.map;this.original=original;}else{this.map=this.editor.map;this.original=this.map;}this.units=[...this.map.starts.map((p,i)=>({...p,id:'start-'+i,species:p.species||['horse','goat','donkey','sheep'][i],weapon:p.weapon||'rifle',heading:p.heading??0,role:characterName(p,'Squad start '+(i+1))})),...this.map.guards.map((p,i)=>({...p,id:'guard-'+i,role:characterName(p,(p.character?.category==='npc'?'NPC ':'Guard ')+(i+1))}))];for(const u of this.units){const support=rampSupportAt(this.map,u);if(support)u.cliffSupport=support;}this.changed=true;this.revision++;}
 preview(command){
  let {tool,start,end=start,options={}}=command;const prefab=tool==='prefab'?STRUCTURE_PRESETS[options.preset]:null;if(tool==='prefab'&&!prefab)return {ok:false,error:'Choose a preset structure.'};if(prefab){tool='room';options={...options,width:prefab.width,height:prefab.height};}if((start?.z===CANOPY_LEVEL&&['roof-tile','prop'].includes(tool)&&options.propKind?.startsWith('roof-'))||(['erase-prop','erase-tile','erase-roof'].includes(tool)&&this.editor.map.canopies?.some(p=>canopyCells(p).some(q=>q.x===start.x&&q.y===start.y&&q.z===start.z)))){const result=previewCanopy(this.editor.map,command,this.size),error=result.ok&&sceneryPlacementErrors(result.map,null,PROPS,EDGES)[0];return error?{...result,ok:false,error}:result;}
  if(!start||![start.x,start.y,start.z??0].every(Number.isInteger))return {ok:false,error:'Choose a map cell.'};
  if(this.block&&(['squad','exit'].includes(tool)||[start,end].some(p=>p.x<0||p.y<0||p.x>=24||p.y>=24)))return {ok:false,error:'Keep block edits inside 24 × 24 tiles; squad and travel markers belong to full maps.'};
  const hedge=tool==='prop'&&isHedge({kind:options.propKind}),breaking=['break-wall','break-floor'].includes(tool),foliage=['foliage-cover','clear-foliage'].includes(tool),shapeTool=hedge||tool==='erase-prop'?'woodland':breaking?(tool==='break-wall'?'wall':'floor'):foliage||['cliff','erase-cliff'].includes(tool)?'woodland':tool;
  const candidate=createEditor(this.editor.map),points=brushShape(shapeTool)?brushPoints(shapeTool,start,end):[start],cells=[],edges=[];
  if(tool==='cliff'&&points.length>CLIFF_LIMIT)return {ok:false,error:'Paint at most '+CLIFF_LIMIT+' cliff tiles at a time.'};
  if(!points.length)return {ok:false,error:'Choose a cell inside the map.'};
  try{
   if(tool==='land'||foliage){
    const result=foliage?paintFoliage(candidate.map,command,this.size):paintLand(candidate.map,command,this.size);cleanBreaches(candidate.map);cleanFoliage(candidate.map);
    if(this.block)validateBlock(extractBlock(candidate.map));
    const errors=validateMap(candidate.map,{connectivity:false});
    return {...result,ok:!errors.length,error:errors[0]||'',map:candidate.map};
   }
   if(tool==='ramp'){
    const plan=rampStroke(candidate.map,start,end,options.rampSurface||'grass');
    for(const p of plan.landings){if(terrainAt(candidate.map,p.x,p.y,p.z)==='void'){const error=applyBrush(candidate,'floor',p.x,p.y,'',{level:p.z});if(error)throw Error(error);}}
    for(const p of plan.lanes){cells.push(...propCells(p));const error=applyBrush(candidate,'prop',p.x,p.y,'',{level:p.z,propKind:p.kind,rotated:false});if(error)throw Error(error);}
    cleanBreaches(candidate.map);if(cells.some(p=>p.x<0||p.y<0||p.x>=this.size||p.y>=this.size))throw Error('The whole ramp must fit inside the map or block.');
    if(this.block)validateBlock(extractBlock(candidate.map));
    const errors=validateMap(candidate.map,{connectivity:false});
    return {ok:!errors.length,error:errors[0]||'',cells,edges,map:candidate.map,orientation:plan.orientation};
   }
   for(const p of points){
    if(breaking){if(breakStructure(candidate.map,tool,{...p,z:start.z||0})){cells.push({...p,z:start.z||0});if(tool==='break-wall')edges.push(p.edge);}continue;}
    if(tool==='erase-tile'&&candidate.map.landPaint?.[`${p.x},${p.y}`]||['erase-cliff','erase-prop'].includes(tool)&&candidate.map.props.some(q=>q.landAuto&&q.x===p.x&&q.y===p.y&&(q.z||0)===(start.z||0)))throw Error('Use Land and choose Ground to lower painted terrain and rebuild its cliff edge.');
    let actualTool=tool==='npc'?'guard':tool,actualOptions=tool==='npc'?{...options,category:'npc'}:options;
    if(hedge){
     const existing=candidate.map.props.find(q=>q.x===p.x&&q.y===p.y&&(q.z||0)===(start.z||0));
     if(isHedge(existing)){applyBrush(candidate,'erase-prop',p.x,p.y,'',{level:start.z||0});actualOptions={...options,hedgeSeed:options.hedgeSeed??existing.hedgeSeed};}
    }
    if(['cliff','erase-cliff'].includes(tool)){
     const existing=candidate.map.props.find(q=>q.x===p.x&&q.y===p.y&&(q.z||0)===(start.z||0));
     if(isCliff(existing))applyBrush(candidate,'erase-prop',p.x,p.y,'',{level:start.z||0});
     if(tool==='erase-cliff'){cells.push({...p,z:start.z||0});continue;}
     actualTool='prop';actualOptions={propKind:options.cliffKind||'cliff-ledge',rotated:false};
    }
    const error=applyBrush(candidate,actualTool,p.x,p.y,p.edge,{...actualOptions,level:start.z||0});if(error)return {ok:false,error,cells:points,edges};
    if(tool==='cliff')Object.assign(candidate.map.props.at(-1),{cliffMask:options.cliffMask??15,cliffVariant:options.cliffVariant??0,cliffSand:options.cliffSand??0});
    if(tool==='prop'&&LIGHT_FORMS[options.propKind])candidate.map.props.at(-1).lightMode=['on','off'].includes(options.lightMode)?options.lightMode:'auto';
    if(['wall','door','erase-edge'].includes(tool))edges.push(p.edge);
    if(tool==='prop'||tool==='roof-tile')cells.push(...propCells({x:p.x,y:p.y,z:start.z||0,kind:options.propKind,rotated:options.rotated,rotation:options.rotation}));
    else if(tool==='room'){const w=options.rotated?options.height:options.width,h=options.rotated?options.width:options.height;for(let y=0;y<h;y++)for(let x=0;x<w;x++)cells.push({x:p.x+x,y:p.y+y,z:start.z||0});}
    else cells.push({...p,z:start.z||0});
   }
   if(prefab)for(const object of prefab.objects){const pos=options.rotated?{x:start.x+prefab.height-1-object.y,y:start.y+object.x}:{x:start.x+object.x,y:start.y+object.y};const error=applyBrush(candidate,'prop',pos.x,pos.y,'',{level:start.z||0,propKind:object.kind,rotated:!!options.rotated});if(error)return {ok:false,error,cells,edges};}
   if(breaking&&!cells.length)throw Error(tool==='break-wall'?'Drag along an existing brick, concrete or corrugated wall.':'Paint a structural upper floor first. Roof modules, cliff tops and empty cells are skipped.');
   finishBreachEdit(candidate.map,tool,points,start.z||0);cleanFoliage(candidate.map);
   // Connectivity is allowed to be temporarily broken while designing a room.
   if(this.block){if(cells.some(p=>p.x<0||p.y<0||p.x>=24||p.y>=24))return {ok:false,error:'The whole footprint must fit inside the block.',cells,edges};validateBlock(extractBlock(candidate.map));}
   if(candidate.map.edgeLocks)for(const key of Object.keys(candidate.map.edgeLocks))if(!EDGES[candidate.map.edges[key]]?.opensTo)delete candidate.map.edgeLocks[key];
   const errors=validateMap(candidate.map,{connectivity:false});
   const named=(options.propKind||'').match(/north|east|south|west/)?.[0],scenery=tool==='prop'&&isScenery({kind:options.propKind}),orientation=scenery?sceneryFacing({kind:options.propKind,...sceneryOrientation(options)}):named?({north:[0,-1],east:[1,0],south:[0,1],west:[-1,0]})[named]:['prop','roof-tile','room'].includes(tool)?options.rotated?[0,1]:[1,0]:null;return {ok:!errors.length,error:errors[0]||'',cells,edges,map:candidate.map,sceneryPreview:scenery?{x:start.x,y:start.y,z:start.z||0,kind:options.propKind,...sceneryOrientation(options)}:null,hedgePreview:hedge||tool==='erase-prop',orientation:hedge?null:orientation};
  }catch(e){return {ok:false,error:e.message,cells:points,edges};}
 }
 apply(command){const result=this.preview(command);if(result.ok){replaceMap(this.editor,result.map);this.refresh();}return result;}
 character(id){return characters(this.editor.map).find(r=>r.p.character?.id===id);}
 characterSelection(id){const u=this.units.find(p=>p.character?.id===id);return u?{x:u.x,y:u.y,z:u.z||0,type:'unit',label:characterName(u,u.role),data:u,cells:[{x:u.x,y:u.y,z:u.z||0}]}:null;}
 updateCharacter(id,patch){
  const row=this.character(id);if(!row)throw Error('This character no longer exists.');
  const map=structuredClone(this.editor.map),p=map[row.field][row.index];
  for(const key of ['species','outfit','weapon','heading'])if(Object.hasOwn(patch,key))p[key]=patch[key];
  if(patch.stats&&Object.hasOwn(patch.stats,'climbing'))p.stats={...p.stats,climbing:patch.stats.climbing};
  const allowed=['displayName','scriptId','faction','attitude','combatBehavior','canTalk','dialogueRef','canSell','shopInventoryRef','shopPricingRef','references','model','visualVariant'];
  for(const key of allowed)if(Object.hasOwn(patch.character||{},key))p.character[key]=structuredClone(patch.character[key]);
  p.character.id=id;if(this.dialogueCatalog)mergeDialogueDefinitions(map,embedMapDialogues(map,this.dialogueCatalog,{strict:false}));this.replace(map);return this.characterSelection(id);
 }
 setPatrol(id,points){
  const row=this.character(id);if(!row||row.field!=='guards')throw Error('Select a placed guard or NPC.');
  const error=patrolError(points,this.size);if(error)throw Error(error);
  const map=structuredClone(this.editor.map);if(points.length)map.guards[row.index].patrol=structuredClone(points);else delete map.guards[row.index].patrol;
  this.replace(map);return this.characterSelection(id);
 }
 duplicateCharacter(id,point){
  const row=this.character(id);if(!row)throw Error('This character no longer exists.');
  if(row.field==='starts')throw Error('Squad slots are fixed. Duplicate a placed guard or NPC.');
  if(!point||![point.x,point.y,point.z??0].every(Number.isInteger))throw Error('Choose a destination tile.');
  if(point.x<0||point.y<0||point.x>=this.size||point.y>=this.size||(point.z||0)<0||(point.z||0)>=MAP_LEVELS)throw Error('Keep the duplicate inside the current map or block.');
  const [copy]=copyCharacters([row.p],this.editor.map);if(copy.patrol)copy.patrol=shiftPatrol(copy.patrol,point.x-copy.x,point.y-copy.y,(point.z||0)-(copy.z||0));Object.assign(copy,{x:point.x,y:point.y,z:point.z||0});delete copy.towerPost;
  this.replace({...this.editor.map,guards:[...this.editor.map.guards,copy]});return copy.character.id;
 }
 export(){return JSON.stringify(embedMapDialogues(this.original,this.dialogueCatalog,{strict:false}),null,2);}
 dialogueDefinition(definition,{replace=false}={}){validateDialogue(definition);const map=structuredClone(this.editor.map);if(replace&&map.dialogueDefinitions)delete map.dialogueDefinitions[definition.id];mergeDialogueDefinitions(map,{dialogueDefinitions:{[definition.id]:definition}});map.characterResources??={};map.characterResources.dialogues=[...new Set([...(map.characterResources.dialogues||[]),definition.id])];this.replace(map);}
 characterResources(resources){this.replace({...this.editor.map,characterResources:structuredClone(resources)});}
 characterWarnings(){const map=this.editor.map,out=characterDiagnostics(map);for(const {p}of characters(map))if(p.character?.canTalk){try{resolveDialogue(map,null,p.character.dialogueRef,this.dialogueCatalog);}catch(e){out.push(characterName(p)+': '+e.message);}}return [...new Set(out)];}
 undo(){if(!this.editor||!undo(this.editor))return false;this.refresh();return true;}
 redo(){if(!this.editor||!redo(this.editor))return false;this.refresh();return true;}
 doorLock(selection,difficulty){
  if(selection?.type!=='edge'||!EDGES[this.map.edges[selection.edge]]?.opensTo)throw Error('Select a closed door.');
  if(!Number.isInteger(difficulty)||difficulty<0||difficulty>100)throw Error('Use 0 for unlocked, or a difficulty from 1 to 100.');
  const edgeLocks={...this.map.edgeLocks};if(difficulty)edgeLocks[selection.edge]=difficulty;else delete edgeLocks[selection.edge];this.replace({...this.editor.map,edgeLocks});
 }
 fixtureCondition(selection,condition){
  const p=selection?.data;if(selection?.type!=='prop'||!LIGHT_FORMS[p.kind]||LIGHT_FORMS[p.kind].fire)throw Error('Select an electrical light fixture.');
  if(!Number.isInteger(condition)||condition<0||condition>100)throw Error('Condition must be 0-100.');
  this.replace({...this.editor.map,props:this.editor.map.props.map(q=>q.x===p.x&&q.y===p.y&&(q.z||0)===(p.z||0)?{...q,condition}:q)});
 }
 rename(name){name=name.trim();if(!name||name.length>60)return {ok:false,error:'Use a name from 1 to 60 characters.'};replaceMap(this.editor,{...this.editor.map,name});this.refresh();return {ok:true};}
 rotate(selection){
  if(selection?.data?.broken)return {ok:false,error:'This opening follows neighboring structure. Use Break wall or Break floor to reshape it.'};
  if(selection?.type==='edge'){const map=structuredClone(this.editor.map),[axis,x,y,z]=selection.edge.split(':'),next=edgeKey(axis==='e'?'s':'e',+x,+y,+(z||0));if(map.edges[next])return {ok:false,error:'The rotated boundary is occupied.'};map.edges[next]=map.edges[selection.edge];delete map.edges[selection.edge];if(map.edgeLocks?.[selection.edge]){map.edgeLocks[next]=map.edgeLocks[selection.edge];delete map.edgeLocks[selection.edge];}try{this.replace(map);return {ok:true};}catch(e){return {ok:false,error:e.message};}}if(selection?.type==='tile'){const info=diagonalRoad(selection.data.terrain);if(!info)return {ok:false,error:'This terrain has no directional variant.'};return this.apply({tool:'texture',start:selection,options:{groundKind:selection.data.terrain.replace('-'+info.corner,'-'+ROAD_CORNERS[(ROAD_CORNERS.indexOf(info.corner)+1)%4])}});}if(selection?.type==='unit'){const map=structuredClone(this.editor.map),all=[...map.starts,...map.guards],p=all.find(p=>p.character?.id===selection.data.character?.id&&p.x===selection.x&&p.y===selection.y);if(!p)return {ok:false,error:'Character no longer exists.'};p.heading=((p.heading||0)+90)%360;this.replace(map);return {ok:true};}if(selection?.type==='prop'&&this.editor.map.canopies?.some(p=>p.x===selection.data.x&&p.y===selection.data.y&&p.z===selection.data.z)){const map=structuredClone(this.editor.map),p=map.canopies.find(p=>p.x===selection.data.x&&p.y===selection.data.y&&p.z===selection.data.z);if(!p)return {ok:false,error:'Roof no longer exists.'};p.rotated=!p.rotated;this.replace(map);return {ok:true};}if(selection?.type!=='prop')return {ok:false,error:'Select an object to rotate.'};
  if(isCliff(selection.data)){const map=structuredClone(this.editor.map),p=map.props.find(p=>p.x===selection.data.x&&p.y===selection.data.y&&(p.z||0)===(selection.data.z||0)),mask=p.cliffMask??15;p.cliffMask=((mask<<1)&15)|(mask>>3);try{this.replace(map);return {ok:true};}catch(e){return {ok:false,error:e.message};}}if(isRamp(selection.data)||selection.data.kind.startsWith('rampbank-')){const map=structuredClone(this.editor.map),p=map.props.find(p=>p.x===selection.data.x&&p.y===selection.data.y&&(p.z||0)===(selection.data.z||0));p.kind=p.kind.replace(/north|east|south|west/,d=>({north:'east',east:'south',south:'west',west:'north'})[d]);try{this.replace(map);return {ok:true};}catch(e){return {ok:false,error:e.message};}}
  const p=selection.data,candidate=createEditor(this.editor.map);applyBrush(candidate,'erase-prop',p.x,p.y,'',{level:p.z||0});
  const orientation=isScenery(p)?sceneryOrientation(p,1):{rotated:!p.rotated},error=applyBrush(candidate,'prop',p.x,p.y,'',{level:p.z||0,propKind:p.kind,...orientation});
  if(error)return {ok:false,error};Object.assign(candidate.map.props.at(-1),structuredClone(p),orientation);if(p.condition!==undefined)candidate.map.props.at(-1).condition=p.condition;if(p.lightMode)candidate.map.props.at(-1).lightMode=p.lightMode;if(p.lightTargets)candidate.map.props.at(-1).lightTargets=structuredClone(p.lightTargets);const errors=validateMap(candidate.map,{connectivity:false});if(errors.length)return {ok:false,error:errors[0]};
  if(this.block){try{validateBlock(extractBlock(candidate.map));}catch(e){return {ok:false,error:e.message};}}
  replaceMap(this.editor,candidate.map);this.refresh();return {ok:true};
 }
 addLookout(selection,options={}){
  if(selection?.type!=='prop'||!TOWERS[selection.data.kind])throw Error('Select a searchlight tower first.');
  const p=selection.data,point=towerSlots(p).find(q=>![...this.map.guards,...this.map.starts].some(u=>u.x===q.x&&u.y===q.y&&(u.z||0)===q.z));if(!point)throw Error('All four tower posts are occupied.');
  this.replace({...this.editor.map,guards:[...this.editor.map.guards,{...point,towerPost:towerPost(p,point),species:options.species||'pig-foreman',weapon:options.weapon||'rifle',heading:options.heading??90,outfit:options.outfit||'normal'}]});
 }
 lightTargets(selection,points){
  if(selection?.type!=='prop'||!LIGHT_FORMS[selection.data.kind]?.spot)throw Error('Select a spotlight first.');
  const normalized=Array.isArray(points)?points.map(p=>p&&({...p,waitSeconds:p.waitSeconds===undefined?0:p.waitSeconds})):points,error=spotlightPathError(normalized,this.size);if(error)throw Error(error);
  const p=selection.data,same=q=>q.x===p.x&&q.y===p.y&&(q.z||0)===(p.z||0)&&q.kind===p.kind;
  if(!this.editor.map.props.some(same))throw Error('This spotlight no longer exists.');
  const targets=normalized.map(q=>({x:q.x-p.x,y:q.y-p.y,z:(q.z||0)-(p.z||0),...q.waitSeconds?{waitSeconds:q.waitSeconds}:{}}));
  this.replace({...this.editor.map,props:this.editor.map.props.map(q=>{if(!same(q))return q;const next={...q};if(targets.length)next.lightTargets=targets;else delete next.lightTargets;return next;})});
 }
 addRampBanks(selection,surface='dirt'){if(selection?.type!=='prop'||!isRamp(selection.data))throw Error('Select a ramp first.');if(!['dirt','grass','sand'].includes(surface))throw Error('Choose a bank surface.');const candidate=createEditor(this.editor.map);for(const p of bankSet(selection.data,surface)){if(this.block&&(p.x<0||p.y<0||p.x>=24||p.y>=24))throw Error('Banks must fit inside the block.');const error=applyBrush(candidate,'prop',p.x,p.y,'',{level:p.z,propKind:p.kind,rotated:false});if(error)throw Error(error);}this.replace(candidate.map);}
 lightMode(selection,mode){if(selection?.type!=='prop'||!LIGHT_FORMS[selection.data.kind])throw Error('Select a lamp or fire first.');if(!['auto','on','off'].includes(mode))throw Error('Choose a light schedule.');const p=selection.data;this.replace({...this.editor.map,props:this.editor.map.props.map(q=>q.x===p.x&&q.y===p.y&&(q.z||0)===(p.z||0)&&q.kind===p.kind?{...q,lightMode:mode}:q)});}
 startTime(minutes){if(this.block)throw Error("Start time belongs to a full map.");const time={...this.map.time,startMinutes:minutes};mapStartMinutes({time});this.replace({...this.editor.map,time});}
 replace(map){map=ensureCharacterIdentities(structuredClone(map));cleanBreaches(map);if(!this.block)mapStartMinutes(map);if(this.block)validateBlock(extractBlock(map));const errors=validateMap(map,{connectivity:false});if(errors.length)throw Error(errors[0]);replaceMap(this.editor,map);this.refresh();}
 capture(sx,sy){if(this.block)throw Error('Capture a sector from a full map.');return validateBlock(extractBlock(this.editor.map,sx,sy));}
 place(block,sx,sy){if(this.block)throw Error('Place blocks in a full map.');this.replace(placeBlock(this.editor.map,block,sx,sy));}
 connections(types){if(!this.block)throw Error('Open a block to assign its connections.');connectionSet(this.editor.map,0,0,types);this.replace({...this.editor.map,blockConnections:{'0,0':types}});}
 validate(){if(!this.block)return validateMap(this.map);try{validateBlock(JSON.parse(this.export()));return [];}catch(e){return [e.message];}}
}
