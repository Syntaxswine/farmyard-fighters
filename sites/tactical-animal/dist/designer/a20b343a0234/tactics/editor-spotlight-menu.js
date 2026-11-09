import {EditorWaypointPath} from './editor-waypoint-path.js';
import {LIGHT_FORMS} from './light-sources.js';
import {spotlightAimPoints,clickSpotlightPoint} from './spotlight-path.js';

const $=id=>document.getElementById(id);
const sameLight=(a,b)=>a&&b&&a.kind===b.kind&&a.x===b.x&&a.y===b.y&&(a.z||0)===(b.z||0);
const lightName=p=>p.kind==='spotlight'?'Spotlight':p.kind.startsWith('wooden')?'Wooden searchlight tower':'Iron searchlight tower';

export class EditorSpotlightMenu extends EditorWaypointPath {
 constructor(options){super({...options,prefix:'spotlight',menuLabel:'Spotlight editor actions',pointNoun:'aim point',
  help:'Click a tile to add a red flag. Click an existing flag again to add 15 seconds of wait.',
  detail:'Choose up to 3 aim points. One holds steady; several loop with one game minute per sweep plus the waits on each flag. Edits support Undo and Redo.',
  emptyMessage:'No aim points. The light uses its default forward direction.'});}
 getPoints(prop){return prop&&LIGHT_FORMS[prop.kind]?.spot?spotlightAimPoints(prop):[];}
 clickPoint(points,point){return clickSpotlightPoint(points,point);}
 routeTitle(row){return lightName(row.p)+' · aiming';}
 row(){
  const d=this.getDocument();if(!this.editing||!d||this.editing.document!==d)return null;
  const p=d.map.props.find(p=>sameLight(p,this.editing.prop));return p?{p}:null;
 }
 selectionFor(p){return {type:'prop',x:p.x,y:p.y,z:p.z||0,label:lightName(p),data:p};}
 show(selection,x,y){
  if(this.isBusy()||selection?.type!=='prop'||!LIGHT_FORMS[selection.data.kind]?.spot)return;
  const p=selection.data;this.menu.close();this.menu.element.setAttribute('aria-label',this.menuLabel);$('edit-tool').value='inspect';$('edit-tool').dispatchEvent(new Event('change',{bubbles:true}));this.select(this.selectionFor(p));
  this.menu.show({title:lightName(p),location:`Column ${p.x+1} · Row ${p.y+1} · Level ${(p.z||0)+1}`,detail:'Aiming and light schedule',entries:[
   {id:'aiming',icon:'⚑',label:'Set aim points',note:p.lightTargets?.length?`${p.lightTargets.length} flags · click a flag for +15 seconds`:'Click tiles to aim the light',action:()=>this.start(p)},
   ...[['auto','Automatic'],['on','Always on'],['off','Off']].map(([mode,label])=>({id:'light-'+mode,icon:(p.lightMode||'auto')===mode?'☑':'☐',label,checked:(p.lightMode||'auto')===mode,action:()=>this.onLightEdit(()=>this.getDocument().lightMode(this.selectionFor(p),mode),'Light schedule updated.')}))
  ]},x,y);
 }
 start(prop){
  if(this.isBusy()||!LIGHT_FORMS[prop?.kind]?.spot)return this.status('Select a spotlight or searchlight tower first.');
  $('edit-tool').value='inspect';$('edit-tool').dispatchEvent(new Event('change',{bubbles:true}));this.select(this.selectionFor(prop));
  this.startEditing({document:this.getDocument(),prop:{x:prop.x,y:prop.y,z:prop.z||0,kind:prop.kind}});
 }
 selectionChanged(){const s=this.getSelection();if(this.editing&&s&&(s.type!=='prop'||!sameLight(s.data,this.editing.prop)))this.finish(false);this.sync();}
 write(points){
  const row=this.row();if(!row||this.isBusy())return;
  try{
   const d=this.getDocument();d.lightTargets(this.selectionFor(row.p),points);
   this.select(d.inspect(row.p.x,row.p.y,row.p.z||0,{mode:'prop'}));
   // Lighting reads the current document each frame; route edits need no terrain rebuild.
   this.scene.changed();this.onEdit();this.sync();
   this.status(`Spotlight path saved in this design · ${points.length} flag${points.length===1?'':'s'}. Click a flag for +15 seconds.`);
  }catch(error){this.status(error.message);}
 }
}
