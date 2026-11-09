import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const manifest=JSON.parse(fs.readFileSync(new URL('../designer-provenance.json',import.meta.url),'utf8'));
const entry=new URL('../dist/'+manifest.entry,import.meta.url),paintFile=new URL('animal-motion-paint.js',entry);
const {ANIMAL_MOTION_CATALOG}=await import(new URL('animal-motion-catalog.js',entry));

test('real paint-loader requests for sheep, hen layers, and tailored uniforms resolve in the designer snapshot',async()=>{
  const loaded=new Set(),layer=()=>({dispose(){}});
  const context={sheepPaintLayers:layer,henPaintLayers:layer,animalMotionRepairPaint:(_profile,paint)=>paint,createModelPaint:()=>({material:{},dispose(){}}),applyTailoredRedHat:()=>()=>{}};
  const source=fs.readFileSync(paintFile,'utf8').replace(/^import .*;\r?\n/gm,'').replace('export async function createAnimalPaint','async function createAnimalPaint');
  vm.runInNewContext(source+'\nthis.loadPaint=createAnimalPaint;',context);
  for(const [species,outfit] of [['sheep','normal'],['hen','normal'],['hen','red-hats'],['pig-director','red-hats']]){
    const profile=ANIMAL_MOTION_CATALOG.find(profile=>profile.id===species);
    const loader={async loadAsync(url){assert.equal(fs.existsSync(fileURLToPath(new URL(url,paintFile))),true,'Missing runtime texture: '+url);loaded.add(url);return {dispose(){}};}};
    const paint=await context.loadPaint({}, {},profile,loader,outfit,true);paint.dispose();
  }
  for(const name of ['sheep-underlay','hen-underlay','hen-tail','hen-red-hat','pig-director-red-hat'])assert.ok([...loaded].some(url=>url.endsWith('/'+name+'-paint-v1.png')),'Paint path was not exercised: '+name);
});
