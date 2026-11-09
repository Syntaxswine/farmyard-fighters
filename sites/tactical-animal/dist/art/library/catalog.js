export const LIBRARY_VERSION='library-furniture/3';
export const TILE_METRES=1;
export const CONTENTS=['empty','books'];
export const FORMS=[
 {id:'bookcase-tall',name:'Tall bookcase',tiles:[1,1],width:.94,depth:.46,height:1.90,rows:4,bays:1},
 {id:'bookcase-wide',name:'Wide bookcase',tiles:[2,1],width:1.94,depth:.46,height:1.90,rows:4,bays:2},
 {id:'bookcase-low',name:'Low bookcase',tiles:[2,1],width:1.94,depth:.46,height:.98,rows:2,bays:2},
 {id:'bookcase-double',name:'Double-sided bookcase',tiles:[2,1],width:1.94,depth:.88,height:1.90,rows:4,bays:2,doubleSided:true},
 {id:'bookcase-double-thick',name:'Full-tile double bookcase',tiles:[1,2],width:.98,depth:1.98,height:1.90,rows:4,bays:2,doubleSided:true,fullTile:true,constructionRotation:90,frontAxis:'+X'},
 {id:'bookcase-double-ornate',name:'Frieze double bookcase',tiles:[1,2],width:.98,depth:1.98,height:1.98,rows:4,bays:2,doubleSided:true,fullTile:true,constructionRotation:90,frontAxis:'+X',ornate:true},
 {id:'library-table',name:'Library table · 1 × 2 tiles',tiles:[1,2],width:.94,depth:1.94,height:.84,booksHeight:1.18},
 {id:'library-table-large',name:'Library table · 2 × 4 tiles',tiles:[2,4],width:1.94,depth:3.94,height:.84,booksHeight:1.18},
];
export const SKINS=[
 {id:'oak',name:'Honey oak',swatch:'#b88a50',body:0xd6b58b,edge:0xc59b64,shelf:0xd3b38a,source:'wood',books:[0x963c32,0x48625c,0xb7974c,0x475e75,0x6b5343,0xa6aa8c]},
 {id:'walnut',name:'Dark walnut',swatch:'#59402e',body:0x82634b,edge:0x9f7b51,shelf:0x98785a,source:'wood',books:[0x632e34,0x3c615e,0xb39355,0x44485c,0x777545,0xbeb49b]},
 {id:'sage',name:'Institutional sage',swatch:'#768b68',body:0xb0c09e,edge:0x7c916c,shelf:0xc9ad85,source:'sage',books:[0x81463b,0x3c6670,0xb89b5d,0x575348,0x979976,0xc9b997]},
 {id:'ivory',name:'Aged ivory',swatch:'#dfd3b2',body:0xe9ddbf,edge:0xd0bf98,shelf:0xc7aa83,source:'ivory',books:[0x985a4b,0x457878,0xbda15c,0x777b64,0x53637c,0xa8967c]},
 {id:'oxblood',name:'Oxblood lacquer',swatch:'#833e37',body:0x9b5349,edge:0xb16b52,shelf:0x997d5a,source:'oxide',books:[0xa6946c,0x3b6261,0x505b73,0xb08840,0x53463a,0xbab69d]},
 {id:'graphite',name:'Graphite steel',swatch:'#485961',body:0x687880,edge:0x87918c,shelf:0x81918f,source:'steel',books:[0xa15841,0x647b68,0xb39856,0x4a667c,0xbcb49b,0x746050]},
];
export const TEXTURE_PATHS=[
 '../../aft/assets/environment/painted-study/material-atlas-v2.png',
 '../../aft/assets/environment/painted-study/cargo-materials-v1.png',
 './book-spines.svg',
];
export const BOOK_SKIN_ATLAS={width:1024,height:768,columns:4,rows:6,cellWidth:256,cellHeight:128,gutter:2};
export const PROVENANCE={
 inheritedCommit:'a20b343a0234b5d8b365a4e1668961ca1bf37653',
 reused:[
  {path:'aft/tactics/painted-environment-scene.js',use:'softBox bevel geometry and painted wood UV recipe'},
  {path:'aft/tactics/painted-furniture.js',use:'1 × 2 dining-table dimensions, planked top, four legs and apron construction reference'},
  {path:'aft/assets/environment/painted-study/material-atlas-v2.png',use:'inherited painted wood'},
  {path:'aft/assets/environment/painted-study/cargo-materials-v1.png',use:'inherited cream/sage painted wood and oxide/steel surfaces'},
 ],
 authored:[{path:'art/library/book-spines.svg',use:'Original vector atlas: six book palettes, four painted shelf arrangements per palette'}],
 inheritedRights:'User-supplied AFT snapshot; upstream art license is not declared in the repository. Reuse follows the user’s direction.',
 newWork:'Original bookcase and reading-table geometry/layouts, finish recipes and vector book-spine skins; no project-wide art license is declared.',
 rendererLicense:'Three.js: MIT; aft/tactics/vendor/THREE-LICENSE.txt',
};
export function assetId(form,skin,contents){return `library.${form}.${skin}.${contents}`;}
export function specification(formId,skinId,contents='books',rotation=0){
 const form=FORMS.find(f=>f.id===formId),skin=SKINS.find(s=>s.id===skinId);
 if(!form||!skin||!CONTENTS.includes(contents)||![0,90,180,270].includes(rotation))throw Error('Invalid library form, skin, contents or quarter-turn');
 const odd=rotation%180===90,w=odd?form.depth:form.width,d=odd?form.width:form.depth;
 return {id:assetId(form.id,skin.id,contents),version:LIBRARY_VERSION,form:form.id,skin:skin.id,contents,rotation,
  tiles:odd?[form.tiles[1],form.tiles[0]]:[...form.tiles],origin:`footprint center, ground Y=0; front ${form.frontAxis||'+Z'} at 0 degrees`,
  size:[w,contents==='books'?(form.booksHeight||form.height):form.height,d],
  navigationFootprint:[-w/2,-d/2,w/2,d/2],
  placementOffset:odd?[(form.tiles[1]-1)/2,(form.tiles[0]-1)/2]:[(form.tiles[0]-1)/2,(form.tiles[1]-1)/2],
  collision:'Physical body footprint for navigation; exact solid parts for sight/projectiles. Tile reservation is not an invisible wall.',
  occlusion:'solidParts(): borrowed geometry + copied world matrices; stocked bookcases use simple book-row boxes; paper labels and trim decoration are excluded.',
 };
}
export const ASSETS=FORMS.flatMap(f=>SKINS.flatMap(s=>CONTENTS.map(c=>specification(f.id,s.id,c))));
