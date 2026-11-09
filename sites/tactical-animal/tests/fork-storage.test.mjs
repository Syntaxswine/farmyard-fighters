import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../dist/fork-storage.js',import.meta.url),'utf8');
function storage(entries=[]){const data=new Map(entries);return {get length(){return data.size;},getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i]??null,clear:()=>data.clear()};}
test('retained editor/tool storage isolates Fighters from both Commando editions',()=>{
 const turnBasedKey='farmyard-designer-map',realtimeKey='farmyard-realtime:tools:farmyard-designer-map';
 const raw=storage([[turnBasedKey,'turn-based'],[realtimeKey,'real-time']]);
 const window={localStorage:raw,sessionStorage:storage()};vm.runInNewContext(code,{window});const s=window.localStorage;
 assert.equal(s.getItem(turnBasedKey),null);s.setItem(turnBasedKey,'fighters');s.example='property';assert.equal(s.example,'property');assert.equal(s.length,2);assert.equal(s.key(0),turnBasedKey);assert.equal(Object.keys(s).length,2);
 assert.equal(raw.getItem('farmyard-fighters:tools:farmyard-designer-map'),'fighters');
 s.clear();assert.equal(s.length,0);assert.equal(raw.getItem(turnBasedKey),'turn-based');assert.equal(raw.getItem(realtimeKey),'real-time');
});
test('retained folder/library IndexedDB names are isolated too',async()=>{
 const calls=[],databases=[{name:'library',version:1},{name:'farmyard-realtime:tools:library',version:2},{name:'farmyard-fighters:tools:library',version:3}];
 const window={localStorage:storage(),sessionStorage:storage(),indexedDB:{open:(...args)=>calls.push(['open',...args]),deleteDatabase:(...args)=>calls.push(['delete',...args]),databases:async()=>databases}};
 vm.runInNewContext(code,{window});window.indexedDB.open('library',2);window.indexedDB.deleteDatabase('library');
 assert.equal(calls[0][1],'farmyard-fighters:tools:library');assert.equal(calls[1][1],'farmyard-fighters:tools:library');
 const visible=await window.indexedDB.databases();
 assert.equal(visible.length,1);assert.equal(visible[0].name,'library');assert.equal(visible[0].version,3);
});
