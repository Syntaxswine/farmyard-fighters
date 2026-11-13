import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('a nested mission-art change versions its kit, manifest and game together while pinned imports stay stable',()=>{
  const parent=path.resolve(os.tmpdir()),fixture=fs.mkdtempSync(path.join(parent,'farmyard-module-cache-'));
  const source=path.join(fixture,'sites/tactical-animal/dist'),out=path.join(fixture,'dist');
  const write=(name,value)=>{const file=path.join(source,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
  const read=name=>fs.readFileSync(path.join(out,name),'utf8');
  const build=()=>{execFileSync(process.execPath,[path.resolve('sites/tactical-animal/tools/build.mjs')],{cwd:fixture});return /src="app.js\?v=([a-f0-9]+)"/.exec(read('game.html'))[1];};
  try{
    write('game.html','<link rel="stylesheet" href="game-start.css"><script src="game-start.js"></script><script type="module" src="app.js"></script>');
    write('game-start.js','// independent startup controller');
    write('app.js',"import {art} from './mission-art/test/kit.js'; import './aft/pinned.js';");
    write('mission-art/test/kit.js',"import {version} from './manifest.js'; import '../../app.js'; export const art=version;");
    write('mission-art/test/manifest.js',"export const version=1;");
    write('mission-art/test/review.html',"<script type=module>import './kit.js';</script>");
    write('art/windows/catalog.js',"export const paneVersion=1;");
    write('window-yard.js',"import {paneVersion} from './art/windows/catalog.js';");
    write('window-yard.html','<script type="module" src="window-yard.js"></script>');
    write('aft/pinned.js',"export const pinned=true;");
    for(const asset of ['style.css','touch-controls.css','original-art.css','title-screen.css','map-frame.css','industrial-switches.css','field-hardware.css','realtime.css','game-start.css','icon.svg'])write(asset,'fixture');
    const before=build();
    assert.ok(read('game.html').includes(`src="game-start.js?v=${before}"`));
    assert.match(read('game.html'),/href="game-start.css\?v=[a-f0-9]+"/);
    assert.ok(read('app.js').includes(`'./mission-art/test/kit.js?v=${before}'`));
    assert.ok(read('mission-art/test/kit.js').includes(`'./manifest.js?v=${before}'`));
    assert.ok(read('mission-art/test/kit.js').includes(`'../../app.js?v=${before}'`),'nested import resolves to the shared application instance');
    assert.ok(read('mission-art/test/review.html').includes(`'./kit.js?v=${before}'`));
    assert.ok(read('app.js').includes("'./aft/pinned.js'"));assert.equal(read('aft/pinned.js'),"export const pinned=true;");
    write('mission-art/test/manifest.js',"export const version=2;");
    const after=build();assert.notEqual(after,before,'changing only the nested manifest invalidates the release');
    assert.ok(read('app.js').includes(`'./mission-art/test/kit.js?v=${after}'`));
    assert.ok(read('mission-art/test/kit.js').includes(`'./manifest.js?v=${after}'`));
    assert.ok(!read('mission-art/test/kit.js').includes(`?v=${before}`));
    assert.ok(read('window-yard.js').includes(`'./art/windows/catalog.js?v=${after}'`));
    assert.ok(read('window-yard.html').includes(`src="window-yard.js?v=${after}"`));
    write('art/windows/catalog.js',"export const paneVersion=2;");
    const withWindows=build();assert.notEqual(withWindows,after,'an independent artist catalogue change also invalidates combat and editor imports');
    assert.ok(read('window-yard.js').includes(`'./art/windows/catalog.js?v=${withWindows}'`));
  }finally{
    if(path.dirname(path.resolve(fixture))!==parent||!path.basename(fixture).startsWith('farmyard-module-cache-'))throw Error('Unsafe cache-test cleanup path');
    fs.rmSync(fixture,{recursive:true,force:true});
  }
});
