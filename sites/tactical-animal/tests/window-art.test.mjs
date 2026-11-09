import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {BORDERLESS_WINDOW_ID,WINDOW_IDS,WINDOW_DEFINITIONS,WINDOW_METRICS,describeWindow} from '../dist/art/windows/catalog.js';
import {createWindowLibrary} from '../dist/art/windows/geometry.js';
import {WALL_DIMENSIONS} from '../dist/world-dimensions.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('39 presets preserve framed wall scale and add full-storey borderless glass',()=>{
 assert.equal(WINDOW_IDS.length,39);assert.equal(new Set(WINDOW_IDS).size,39);
 assert.equal(WINDOW_METRICS.wallHeight,WALL_DIMENSIONS.height);assert.equal(WINDOW_METRICS.wallThickness,WALL_DIMENSIONS.thickness);
 for(const def of WINDOW_DEFINITIONS){
  const s=describeWindow(def.id);assert.ok(Object.isFrozen(s.panes[0].bounds.min));
  assert.equal(s.wallHeight,2);assert.equal(s.wallThickness,.16);assert.equal(s.frameDepth,def.borderless?0:.20);assert.equal(s.depth,def.borderless?.008:.20);
  assert.equal(s.panes.length,def.columns*def.rows);assert.equal(s.panes[0].id,'r0c0');
  for(const p of s.panes){assert.ok(p.width>0&&p.height>0);assert.deepEqual(p.normal,[0,0,1]);assert.deepEqual(p.bounds.min.slice(2),[-.004]);}
  if(def.patternId==='clear'){
   assert.equal(s.panes.length,1);assert.equal(s.solids.filter(p=>p.role==='mullion').length,0);close(s.panes[0].width,def.span-.11);
  }
  const lower=s.solids.find(p=>p.role==='lower-wall');assert.equal(!!lower,def.heightId==='waist');if(lower)close(lower.bounds.max[1],.845);
 }
});

test('borderless sheets fill each storey edge-to-edge and have no rendered caps or trim',()=>{
 const lib=createWindowLibrary();
 try{for(const span of [1,2,3])for(const left of [false,true])for(const right of [false,true]){
  const a=lib.build('window.full.borderless.'+span+'m',{joins:{left,right}}),s=a.spec,p=s.panes[0];
  assert.deepEqual(s.solids,[]);assert.equal(s.panes.length,1);assert.equal(p.id,'r0c0');
  close(p.width,span);close(p.height,2.12);assert.deepEqual(p.bounds.min,[-span/2,0,-.004]);assert.deepEqual(p.bounds.max,[span/2,2.12,.004]);
  assert.equal(a.solidParts().length,0);assert.equal(a.panes.get('r0c0').shine,null);
  const meshes=[];a.root.traverse(o=>{if(o.isMesh||o.isLineSegments)meshes.push(o);});assert.equal(meshes.length,1);
  const g=meshes[0].geometry;assert.equal(g.index.count,12);
  for(let i=0;i<g.index.count;i++){const n=g.index.getX(i);assert.equal(g.attributes.normal.getX(n),0);assert.equal(g.attributes.normal.getY(n),0);assert.equal(Math.abs(g.attributes.normal.getZ(n)),1);}
  a.dispose();
 }}finally{lib.dispose();}
});

test('one resizable pane spans metres, tile boundaries and storeys with exact logical bounds',()=>{
 const lib=createWindowLibrary();
 try{
  assert.equal(WINDOW_METRICS.tile,1);assert.equal(WINDOW_METRICS.storeyHeight,2.12);
  for(const [width,height] of [[20,5],[20,5*WINDOW_METRICS.storeyHeight],[.75,2.12],[40.5,17.3]])for(const rotation of [0,90,180,270]){
   const a=lib.build(BORDERLESS_WINDOW_ID,{dimensions:{width,height},rotation}),s=a.spec,p=s.panes[0],b=new T.Box3().setFromObject(a.root),n=b.getSize(new T.Vector3());
   assert.equal(s.id,BORDERLESS_WINDOW_ID);assert.equal(s.borderless,true);assert.deepEqual(s.dimensions,{width,height});assert.equal(s.span,width);assert.equal(s.height,height);
   assert.deepEqual(p.bounds.min,[-width/2,0,-.004]);assert.deepEqual(p.bounds.max,[width/2,height,.004]);assert.equal(s.panes.length,1);assert.equal(s.solids.length,0);
   close(n.y,height);close(n.x,rotation%180?.008:width);close(n.z,rotation%180?width:.008);
   a.setPaneVisible('r0c0',false);assert.equal(a.paneParts().length,0);assert.equal(a.paneParts({includeHidden:true}).length,1);assert.equal(a.root.children.filter(c=>c.visible).length,0);a.dispose();
  }
  const small=describeWindow(BORDERLESS_WINDOW_ID,{}, {width:1,height:2.12}),large=describeWindow(BORDERLESS_WINDOW_ID,{}, {width:20,height:5});assert.notEqual(small.cacheKey,large.cacheKey);
  for(const dimensions of [null,{},[],{width:20,height:0},{width:-1,height:5},{width:20,height:Infinity},{width:20,height:5,extra:1}])assert.throws(()=>describeWindow(BORDERLESS_WINDOW_ID,{},dimensions),/dimensions/);
  assert.throws(()=>describeWindow('window.full.clear.1m',{}, {width:20,height:5}),/dimensions/);
 }finally{lib.dispose();}
});

test('software review blends actual glass and removes all of its tint with the selected pane',async()=>{
 const {createWindowPreview}=await import('../dist/art/windows/preview-renderer.js'),savedDocument=globalThis.document,surfaces=[];
 globalThis.document={createElement(){const canvas={width:0,height:0,pixels:null,toDataURL:()=> 'data:image/png;base64,'};const ctx={createImageData:()=>({data:new Uint8ClampedArray(canvas.width*canvas.height*4)}),putImageData(image){canvas.pixels=image.data;}};canvas.getContext=type=>type==='webgl2'?null:ctx;surfaces.push(canvas);return canvas;}};
 const lib=createWindowLibrary();let renderer;
 try{
  renderer=createWindowPreview(32,32);assert.equal(renderer.mode,'software');const asset=lib.build('window.full.clear.2m'),scene=new T.Scene();scene.background=new T.Color(0xff0000);scene.add(asset.root);
  const camera=new T.OrthographicCamera(-1.2,1.2,1.1,-1.1,.1,10);camera.position.set(0,1,5);camera.lookAt(0,1,0);const sample=()=>Array.from(surfaces[1].pixels.slice((16*32+16)*4,(16*32+16)*4+3));
  renderer.render(scene,camera);const glazed=sample();assert.ok(glazed[0]>0&&glazed[1]>0&&glazed[2]>0,'Glass blends tint with the red backdrop');
  asset.setPaneVisible('r0c0',false);renderer.render(scene,camera);assert.deepEqual(sample(),[255,0,0],'Removed glass leaves only the original backdrop');
 }finally{lib.dispose();renderer?.dispose();if(savedDocument===undefined)delete globalThis.document;else globalThis.document=savedDocument;}
});

test('touching borderless sheets render like one sheet without alpha seams from either face',async()=>{
 const {createWindowPreview}=await import('../dist/art/windows/preview-renderer.js'),savedDocument=globalThis.document,surfaces=[];
 globalThis.document={createElement(){const canvas={width:0,height:0,pixels:null,toDataURL:()=> 'data:image/png;base64,'};const ctx={createImageData:()=>({data:new Uint8ClampedArray(canvas.width*canvas.height*4)}),putImageData(image){canvas.pixels=image.data;}};canvas.getContext=type=>type==='webgl2'?null:ctx;surfaces.push(canvas);return canvas;}};
 const lib=createWindowLibrary();let renderer;
 try{
  renderer=createWindowPreview(33,41);const whole=lib.build(BORDERLESS_WINDOW_ID,{dimensions:{width:2,height:4.24}}),parts=[];
  for(const x of [-.5,.5])for(const y of [0,2.12]){const a=lib.build('window.full.borderless.1m');a.root.position.set(x,y,0);parts.push(a);}
  const scene=new T.Scene();scene.background=new T.Color(0xff3020);const camera=new T.OrthographicCamera(-3,3,3.4,-3.4,.1,50);
  for(const offset of [[0,0,9],[5,2,8],[-5,2,-8]]){
   camera.position.set(offset[0],2.12+offset[1],offset[2]);camera.lookAt(0,2.12,0);
   scene.add(whole.root);renderer.render(scene,camera);const expected=surfaces[1].pixels.slice();whole.root.removeFromParent();
   for(const a of parts)scene.add(a.root);renderer.render(scene,camera);assert.deepEqual(surfaces[1].pixels,expected,'Joined tile/storey edges match one continuous sheet at '+offset.join(','));for(const a of parts)a.root.removeFromParent();
  }
 }finally{lib.dispose();renderer?.dispose();if(savedDocument===undefined)delete globalThis.document;else globalThis.document=savedDocument;}
});

test('each divided pane occupies its own disjoint aperture cell',()=>{
 for(const id of WINDOW_IDS){const s=describeWindow(id),panes=s.panes;
  for(const p of panes){
   assert.ok(p.bounds.min[0]>=s.aperture.min[0]-1e-8&&p.bounds.max[0]<=s.aperture.max[0]+1e-8);
   assert.ok(p.bounds.min[1]>=s.sill-1e-8&&p.bounds.max[1]<=s.head+1e-8);
   for(const q of panes)if(q!==p){const dx=Math.min(p.bounds.max[0],q.bounds.max[0])-Math.max(p.bounds.min[0],q.bounds.min[0]),dy=Math.min(p.bounds.max[1],q.bounds.max[1])-Math.max(p.bounds.min[1],q.bounds.min[1]);assert.ok(dx<=0||dy<=0);}
  }
  close(panes.at(-1).bounds.max[0],s.aperture.max[0]);close(panes.at(-1).bounds.max[1],s.head);
 }
});

test('all definitions and join combinations fit their declared geometry at every rotation',()=>{
 const lib=createWindowLibrary();
 try{for(const id of WINDOW_IDS)for(const left of [false,true])for(const right of [false,true])for(const rotation of [0,90,180,270]){
  const a=lib.build(id,{joins:{left,right},rotation}),s=a.spec,b=new T.Box3().setFromObject(a.root),dimensions=b.getSize(new T.Vector3());
  close(dimensions.y,s.height);close(dimensions.x,rotation%180?s.depth:s.span);close(dimensions.z,rotation%180?s.span:s.depth);close(b.min.y,0);
  assert.equal(a.solidParts().length,s.solids.length);assert.equal(a.paneParts().length,s.panes.length);
  for(const p of a.paneParts()){
   const physical=new T.Box3().setFromBufferAttribute(p.geometry.attributes.position).applyMatrix4(p.matrixWorld),declared=a.paneWorldBounds(p.id);
   physical.min.toArray().forEach((n,i)=>close(n,declared.min[i]));physical.max.toArray().forEach((n,i)=>close(n,declared.max[i]));
  }
  a.dispose();
 }}finally{lib.dispose();}
});

test('a selected cell hides its glass and reflection while all solid structure survives',()=>{
 const lib=createWindowLibrary();
 try{for(const id of WINDOW_IDS){const a=lib.build(id),last=a.spec.panes.at(-1).id;
  const before=a.solidParts().map(p=>({id:p.id,m:p.matrixWorld.toArray()}));
  a.setPaneVisible(last,false);assert.equal(a.paneParts().length,a.spec.panes.length-1);assert.equal(a.panes.get(last).root.visible,false);
  assert.ok([...a.panes.values()].filter(p=>p.id!==last).every(p=>p.root.visible));assert.deepEqual(a.solidParts().map(p=>({id:p.id,m:p.matrixWorld.toArray()})),before);
  assert.equal(a.paneParts({includeHidden:true}).length,a.spec.panes.length);a.setPaneVisible(last,true);assert.equal(a.paneParts().length,a.spec.panes.length);a.dispose();
 }}finally{lib.dispose();}
});

test('joined placements share one normal-width post and retain stable pane IDs',()=>{
 const a=describeWindow('window.waist.grid-3x2.1m',{right:true}),b=describeWindow('window.waist.grid-3x2.1m',{left:true});
 const right=a.solids.find(p=>p.id==='frame.right').bounds,left=b.solids.find(p=>p.id==='frame.left').bounds;
 close(right.max[0],left.min[0]+1);close(right.max[0]-right.min[0]+left.max[0]-left.min[0],WINDOW_METRICS.post);
 assert.deepEqual(a.panes.map(p=>p.id),describeWindow(a.id).panes.map(p=>p.id));assert.notEqual(a.cacheKey,describeWindow(a.id).cacheKey);
});

test('world transforms, validation and ownership remain explicit',()=>{
 const lib=createWindowLibrary(),a=lib.build('window.waist.grid-3x2.3m',{rotation:90,finish:'ivory',wall:'concrete'});
 a.root.position.set(10,4,20);const b=a.paneWorldBounds('r0c0');assert.ok(b.min[1]>=4.9&&b.min[0]>9.99&&b.max[0]<10.01);
 const resources=new Set();a.root.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material){resources.add(o.material);if(o.material.map)resources.add(o.material.map);}});
 const counts=new Map([...resources].map(r=>[r,0]));for(const r of resources)r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));
 assert.throws(()=>a.setPaneVisible('missing',false),/Unknown/);assert.throws(()=>a.setPaneVisible('r0c0',0),/boolean/);
 for(const joins of [{left:1},{other:true},null])assert.throws(()=>describeWindow(a.spec.id,joins),/joins/);
 assert.throws(()=>lib.build('missing'),/Unknown/);assert.throws(()=>lib.build(a.spec.id,{rotation:45}),/Invalid/);
 a.dispose();a.dispose();lib.dispose();lib.dispose();assert.ok([...counts.values()].every(n=>n===1));assert.equal(lib.stats().assets,0);assert.throws(()=>a.paneParts(),/disposed/);assert.throws(()=>lib.build(a.spec.id),/disposed/);
});

test('published window manifest and review entry resolve the real source modules',()=>{
 const root=path.resolve('sites/tactical-animal/dist'),file=path.join(root,'art/windows/catalog.json'),manifest=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.deepEqual(manifest.definitions,WINDOW_IDS.map(id=>describeWindow(id)));
 for(const source of [...manifest.provenance.inherited,...manifest.provenance.authored]){
  const bytes=source.encoding?fs.readFileSync(path.join(root,source.path),'utf8').replace(/\r\n/g,'\n'):fs.readFileSync(path.join(root,source.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256,source.path);
 }
 const html=fs.readFileSync(path.join(root,'art/windows/index.html'),'utf8');
 for(const match of html.matchAll(/(?:src|href)="([^"#?]+)"/g))assert.ok(fs.existsSync(path.resolve(root,'art/windows',match[1])),match[1]);
});
