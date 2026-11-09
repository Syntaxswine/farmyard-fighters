import {EditorWaypointPath} from './editor-waypoint-path.js';
import {characterName} from './character-properties.js';
import {clickPatrolPoint} from './character-patrol.js';
const $=id=>document.getElementById(id);
export class EditorCharacterMenu extends EditorWaypointPath {
 constructor(options){super({...options,prefix:'patrol',menuLabel:'Character editor actions',pointNoun:'waypoint',
  help:'Click a walkable tile to add a red flag. Click an existing flag again to add 15 seconds of wait.',
  detail:'The path loops. Waits use game time; alarms and combat take priority. Edits support Undo and Redo.',
  emptyMessage:'No waypoints yet. This character stays at its post.'});}
 getPoints(unit){return unit?.patrol||[];}
 clickPoint(points,point){return clickPatrolPoint(points,point);}
 routeTitle(row){return characterName(row.p,'Character')+' · pathing';}
 row(){const document=this.getDocument();return this.editing&&document&&this.editing.document===document?document.character(this.editing.id):null;}
 show(unit,x,y){
  if(this.isBusy()||!unit?.character?.id)return;
  const d=this.getDocument(),id=unit.character.id,row=d.character(id);if(!row)return;
  this.menu.close();this.menu.element.setAttribute('aria-label',this.menuLabel);$('edit-tool').value='inspect';$('edit-tool').dispatchEvent(new Event('change',{bubbles:true}));this.select(d.characterSelection(id));
  const c=row.p.character,placed=row.field==='guards';
  this.menu.show({title:characterName(row.p,placed?'Guard / NPC':'Squad start'),location:`Column ${row.p.x+1} · Row ${row.p.y+1} · Level ${(row.p.z||0)+1}`,detail:`${c.faction} · ${c.attitude} · ${c.combatBehavior}`,
   entries:[...placed?[{id:'pathing',icon:'⚑',label:'Set pathing',note:row.p.patrol?.length?`${row.p.patrol.length} waypoints · looping patrol`:'Click tiles to add a looping patrol',disabled:!!row.p.towerPost,reason:row.p.towerPost?'Fixed tower lookout; patrols require a walkable floor.':'',action:()=>this.start(id)}]:[],
    {id:'talk',icon:c.canTalk?'☑':'☐',label:'Can talk',checked:c.canTalk,note:c.canTalk?(c.dialogueRef||'Choose a dialogue reference in settings'):'Enable dialogue for this character',action:()=>this.onPropertyEdit(id,{character:{canTalk:!c.canTalk}})},
    {id:'dialogue',icon:'…',label:'Dialogue settings',note:'Dialogue reference and capabilities',action:()=>this.properties('dialogue')},
    {id:'properties',icon:'☷',label:'Character properties',note:'Name, appearance, faction, attitude and behavior',action:()=>this.properties('name')}]
  },x,y);
 }
 properties(section){this.finish(false);const host=$('character-properties');if(!host)return;if(section==='dialogue')$('char-extra').open=true;host.scrollIntoView({block:'start'});$(section==='dialogue'?($('char-talk').checked?'char-dialogue':'char-talk'):'char-name')?.focus({preventScroll:true});}
 start(id){if(this.isBusy())return;this.startEditing({document:this.getDocument(),id});}
 selectionChanged(){const s=this.getSelection();if(this.editing&&s&&s.data?.character?.id!==this.editing.id)this.finish(false);this.sync();}
 write(points){
  const row=this.row();if(!row||this.isBusy())return;
  try{const selection=this.getDocument().setPatrol(row.p.character.id,points);this.select(selection);this.onEdit();this.sync();this.status(`Patrol saved in this design · ${points.length} flags. Click a flag for +15 seconds.`);}catch(error){this.status(error.message);}
 }
}
