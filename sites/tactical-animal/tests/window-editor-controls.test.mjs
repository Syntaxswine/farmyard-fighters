import test from 'node:test';
import assert from 'node:assert/strict';
import {bindWindowEditorControls} from '../dist/window-editor-controls.js';
import {EditingDocument} from '../dist/designer/a20b343a0234/tactics/editor-3d-controller.js';
import {blankMap} from '../dist/designer/a20b343a0234/tactics/core/maps.js';
import {placeWindow,selectedWindow} from '../dist/window-authoring.js';
const settled=()=>new Promise(resolve=>setTimeout(resolve,0));
test('native-style undo/redo releases the window toolbar after the editor clears its busy flag',async()=>{
  const doc=new EditingDocument().open(JSON.stringify(blankMap('Toolbar history'))),selection={type:'edge',edge:'s:20:21',x:20,y:21,z:0};doc.replace(placeWindow(doc.map,selection,'window.full.clear.3m',{id:'toolbar-pane'}));
  const api={loading:false,document:doc,selection},buttons={};let renders=0;
  const scene={select(value){api.selection=value;},changed(){renders++;}},release=bindWindowEditorControls(scene,()=>{buttons.playtestDisabled=api.loading;buttons.removeDisabled=api.loading||!selectedWindow(doc.map,api.selection);});
  const change=async operation=>{api.loading=true;try{operation();await Promise.resolve();scene.changed();scene.select(selection);}finally{api.loading=false;}};
  await change(()=>doc.undo());assert.equal(buttons.playtestDisabled,true);await settled();assert.equal(buttons.playtestDisabled,false);assert.equal(buttons.removeDisabled,true);
  await change(()=>doc.redo());await settled();assert.equal(buttons.playtestDisabled,false);assert.equal(buttons.removeDisabled,false);assert.equal(renders,2);release();
});
test('import completion refreshes controls even when the scene finishes before the caller continues',async()=>{
  const api={loading:true,selection:null};let disabled=true;
  const scene={select(){},changed(){}},release=bindWindowEditorControls(scene,()=>{disabled=api.loading;});
  async function openScene(){await Promise.resolve();scene.changed();}
  await openScene();api.loading=false;assert.equal(disabled,true);await settled();assert.equal(disabled,false);release();
});
test('teardown cancels deferred toolbar work and restores the borrowed scene callbacks',()=>{
  const timers=new Map();let next=0,updates=0;const scene={select(value){assert.equal(this,scene);return value;},changed(){}},select=scene.select,changed=scene.changed;
  const release=bindWindowEditorControls(scene,()=>updates++,{schedule:fn=>{timers.set(++next,fn);return next;},cancel:id=>timers.delete(id)});
  assert.equal(scene.select('pane'),'pane');scene.changed();assert.equal(timers.size,1);release();release();assert.equal(timers.size,0);assert.equal(scene.select,select);assert.equal(scene.changed,changed);assert.equal(updates,2);
});
