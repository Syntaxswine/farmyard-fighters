import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
test('the reused CC0 recording and license retain their recorded source bytes',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../window-shatter-provenance.json',import.meta.url),'utf8'));
  assert.equal(manifest.sourceRevision,'ebf51393909040b61a7c40649d9d5f0ac3678735');
  for(const file of manifest.files){const bytes=fs.readFileSync(new URL('../dist/'+file.path,import.meta.url));assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
});
