import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {LIBRARY_VERSION,TILE_METRES,FORMS,SKINS,CONTENTS,ASSETS,PROVENANCE} from '../dist/art/library/catalog.js';
const sourceRoot='sites/tactical-animal/dist';
const sources=[...PROVENANCE.reused,...PROVENANCE.authored].map(source=>({...source,sha256:createHash('sha256').update(fs.readFileSync(`${sourceRoot}/${source.path}`)).digest('hex')}));
const manifest={version:LIBRARY_VERSION,tileMetres:TILE_METRES,assetCount:ASSETS.length,axes:'X east, Y up, Z south; front defined by each asset origin; rotation in quarter-turn degrees about +Y',forms:FORMS,skins:SKINS.map(({books,...skin})=>({...skin,bookColors:books})),contents:CONTENTS,provenance:{...PROVENANCE,sources},assets:ASSETS};
fs.writeFileSync(`${sourceRoot}/art/library/catalog.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(`Wrote ${ASSETS.length} library assets: ${FORMS.length} forms × ${SKINS.length} finishes × ${CONTENTS.length} contents.`);
