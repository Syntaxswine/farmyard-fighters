import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// build.mjs itself, run on a five-file stand-in project (the real game would copy 540 MB).
// tests/module-cache.test.mjs covers nested HTML and cache invalidation; this adds the
// dynamic import of the art view, which must share the application version too.
test('build.mjs versions mission art and dynamic imports with the application, and leaves aft/ alone',()=>{
  const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'fc-build-')),source=path.join(workspace,'sites/tactical-animal/dist');
  const write=(file,text)=>{fs.mkdirSync(path.dirname(path.join(source,file)),{recursive:true});fs.writeFileSync(path.join(source,file),text);};
  write('app.js',"import {table} from './mission-art/kit/solids.js';import * as T from './aft/three.js';export const later=()=>import('./view.js');");
  write('view.js','export const view=1;');
  write('mission-art/kit/solids.js',"import * as T from '../../aft/three.js';import {m} from './manifest.js';export const table=[];");
  write('mission-art/kit/manifest.js','export const m=1;');
  write('aft/three.js','export const three=1;');
  try{
    execFileSync(process.execPath,[path.resolve('sites/tactical-animal/tools/build.mjs')],{cwd:workspace,stdio:'pipe'});
    const built=file=>fs.readFileSync(path.join(workspace,'dist',file),'utf8');
    const version=/solids\.js\?v=([0-9a-f]{12})'/.exec(built('app.js'))?.[1];
    assert.ok(version,'app.js imports the versioned solid table');
    assert.ok(built('app.js').includes(`import('./view.js?v=${version}')`)&&built('app.js').includes("from './aft/three.js'"));
    assert.ok(built('mission-art/kit/solids.js').includes(`from './manifest.js?v=${version}'`)&&built('mission-art/kit/solids.js').includes("from '../../aft/three.js'"));
  }finally{fs.rmSync(workspace,{recursive:true,force:true});}
});
