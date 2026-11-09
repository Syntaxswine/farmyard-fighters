import * as T from '../../aft/tactics/vendor/three.module.js';
import {softBox} from '../../aft/tactics/painted-environment-scene.js';
import {FORMS,SKINS,TEXTURE_PATHS,BOOK_SKIN_ATLAS,specification} from './catalog.js';

// Importing the module loads no images. Caller owns all three source textures.
export async function loadLibraryTextures(loader=new T.TextureLoader()){
 const results=await Promise.allSettled(TEXTURE_PATHS.map(p=>loader.loadAsync(new URL(p,import.meta.url).href)));
 if(results.some(r=>r.status==='rejected')){for(const r of results)if(r.status==='fulfilled')r.value.dispose();throw Error('Library material atlases could not be loaded');}
 const [atlas,cargo,bookSkins]=results.map(r=>r.value);for(const texture of [atlas,cargo,bookSkins]){texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;}
 let disposed=false;return {atlas,cargo,bookSkins,dispose(){if(disposed)return;disposed=true;atlas.dispose();cargo.dispose();bookSkins.dispose();}};
}

// Shared cache, independent asset lifetimes, no Light objects or animation loop.
export function createLibraryFurniture({atlas,cargo,bookSkins}={}){
 if(!atlas||!cargo||!bookSkins)throw Error('Pass all three borrowed library material atlases');
 const materials=new Map(),textures=[],assets=new Set();let disposed=false;
 const unit=softBox(1,1,1,.016,1);unit.computeBoundingBox();const size=new T.Vector3(),center=new T.Vector3();unit.boundingBox.getSize(size);unit.boundingBox.getCenter(center);unit.translate(-center.x,-center.y,-center.z);unit.scale(1/size.x,1/size.y,1/size.z);
 const rowGeometry=new T.BoxGeometry(1,1,1),uv=rowGeometry.attributes.uv;
 // Box front/back use the spine picture, the four other faces use page edges.
 for(let face=0;face<6;face++)for(let i=0;i<4;i++){const n=face*4+i,v=uv.getY(n);uv.setY(n,face>=4?.25+v*.75:v*.25);}
 const geometries={frame:unit,book:new T.BoxGeometry(1,1,1),bookRow:rowGeometry};
 const cells={wood:[atlas,[.52,.525,.30,.43]],sage:[cargo,[.678,.53,.30,.44]],ivory:[cargo,[.345,.53,.30,.44]],oxide:[cargo,[.012,.012,.30,.475]],steel:[cargo,[.69,.04,.28,.42]]};
 function material(key,color,source=null,metalness=0){
  if(materials.has(key))return materials.get(key);
  const m=new T.MeshStandardMaterial({color,roughness:.88,metalness});m.name='library:'+key;
  if(source){const [base,cell]=cells[source],map=base.clone();map.offset.set(cell[0],cell[1]);map.repeat.set(cell[2],cell[3]);map.needsUpdate=true;textures.push(map);m.map=map;}
  materials.set(key,m);return m;
 }
 function bookRowMaterial(skin,row){
  const variant=row%BOOK_SKIN_ATLAS.columns,key=skin.id+':book-row:'+variant;
  if(materials.has(key))return materials.get(key);
  const m=material(key,0xffffff),map=bookSkins.clone(),a=BOOK_SKIN_ATLAS,index=SKINS.indexOf(skin);
  map.offset.set((variant*a.cellWidth+a.gutter)/a.width,1-((index+1)*a.cellHeight-a.gutter)/a.height);
  map.repeat.set((a.cellWidth-2*a.gutter)/a.width,(a.cellHeight-2*a.gutter)/a.height);map.needsUpdate=true;
  textures.push(map);m.map=map;return m;
 }
 const pages=()=>material('pages',0xd8d0ad),ink=()=>material('page-ink',0x6b7061),brass=()=>material('aged-brass',0xb7a06b,null,.38),iron=()=>material('iron',0x353e3d,null,.40);
 function finish(skin){return {
  body:material(skin.id+':body',skin.body,skin.source,skin.id==='graphite'?.35:0),
  edge:material(skin.id+':edge',skin.edge),
  shelf:material(skin.id+':shelf',skin.shelf,skin.id==='graphite'?'steel':'wood',skin.id==='graphite'?.25:0),
  books:skin.books.map((color,i)=>material(skin.id+':book:'+i,color)),
 };}
 function compose(position,scale=[1,1,1],rotation=[0,0,0]){return new T.Matrix4().compose(new T.Vector3(...position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale));}
 function build(formId,skinId='oak',contents='books',{rotation=0}={}){
  if(disposed)throw Error('Library furniture is disposed');
  const spec=specification(formId,skinId,contents,rotation),form=FORMS.find(f=>f.id===formId),skin=SKINS.find(s=>s.id===skinId),m=finish(skin),parts=[];
  const construction=form.constructionRotation?new T.Matrix4().makeRotationY(form.constructionRotation*Math.PI/180):null;
  function add(role,mat,at,extent,angles=[0,0,0],{parent=null,solid=true,geometry=formId.startsWith('bookcase')?'book':'frame'}={}){
   const matrix=compose(at,extent,angles);if(parent)matrix.premultiply(parent);if(construction)matrix.premultiply(construction);
   parts.push({role,material:mat,geometry:geometries[geometry],matrix,solid});
  }
  function book(at,w,h,d,index,{yaw=0,lean=0}={}){
   const parent=compose(at,[1,1,1],[0,yaw,lean]),cloth=m.books[index%m.books.length];
   const put=(role,mat,p,s,solid=true)=>add(role,mat,p,s,[0,0,0],{parent,solid,geometry:'book'});
   put('book-pages',pages(),[0,0,-.006],[w-.018,h-.02,d-.024]);
   for(const side of [-1,1])put('book-cover',cloth,[side*(w/2-.005),0,0],[.01,h,d]);
   put('book-spine',cloth,[0,0,d/2-.006],[w,h,.012]);
   for(const y of [-h*.31,h*.31])put('spine-band',brass(),[0,y,d/2+.001],[w*.82,.008,.003],false);
   put('spine-label',pages(),[0,h*.05,d/2+.002],[w*.64,.035,.004],false);
  }
  function populateBay(cx,cy,cz,width,row,back=false){
   const h=form.rows===2?.265:.315,d=form.fullTile?.345:form.doubleSided?.295:.285;
   add('book-row',bookRowMaterial(skin,row),[cx,cy+h/2+.002,cz],[width-.11,h,d],[0,back?Math.PI:0,0],{geometry:'bookRow'});
  }
  if(formId.startsWith('bookcase')){
   const w=construction?form.depth:form.width,d=construction?form.width:form.depth,h=form.height,carcassHeight=form.ornate?1.77:h,side=.065,low=form.rows===2;
   add('plinth',m.body,[0,.065,0],[w,.13,d]);
   if(form.fullTile){
    // Two joined carcasses keep a visible roof seam and separate back panels.
    for(const face of [-1,1]){
     add('top-cap',m.body,[0,form.ornate?1.90:h-.04,face*d/4],[form.ornate?w-.08:w,form.ornate?.04:.08,d/2-(form.ornate?.048:.008)]);
     add('back-panel',m.shelf,[0,(carcassHeight+.13)/2,face*.024],[w-.08,carcassHeight-.18,.044]);
    }
   }else{
    add('top-cap',m.body,[0,h-.04,0],[w,.08,d]);
    add('back-panel',m.shelf,[0,(h+.13)/2,form.doubleSided?0:-d/2+.026],[w-.08,h-.18,.045]);
   }
   for(const x of [-w/2+side/2,w/2-side/2])add('side-panel',m.body,[x,(carcassHeight+.13)/2,0],[side,carcassHeight-.13,d-.025]);
   const bayWidth=(w-.13-(form.bays-1)*.05)/form.bays;
   if(form.bays===2)add('center-divider',m.body,[0,(carcassHeight+.13)/2,0],[.05,carcassHeight-.18,d-.06]);
   const levels=low?[.205,.57]:[.205,.605,1.005,1.405];
   for(const [row,y] of levels.entries()){
    const sides=form.doubleSided?[1,-1]:[1];
    for(const face of sides){
     const shelfDepth=form.doubleSided?(d-.10)/2:d-.06,cz=form.doubleSided?face*(d/4+.005):.008;
     add('shelf',m.shelf,[0,y,cz],[w-.10,.045,shelfDepth]);
     add('shelf-lip',m.edge,[0,y,face*(d/2-.016)],[w-.12,.044,.022],[0,0,0],{solid:false});
     for(let bay=0;bay<form.bays;bay++)if(contents==='books'){
      const cx=(bay-(form.bays-1)/2)*(bayWidth+.05),bookZ=form.fullTile?face*.245:form.doubleSided?face*.19:.035;
      populateBay(cx,y+.0225,bookZ,bayWidth,row+bay*3,face<0);
     }
    }
   }
   for(const face of form.doubleSided?[1,-1]:[1]){
    add('label-holder',brass(),[0,.085,face*(d/2+.002)],[.19,.058,.006],[0,0,0],{solid:false});
    add('blank-label',pages(),[0,.085,face*(d/2+.006)],[.145,.027,.003],[0,0,0],{solid:false});
   }
   // Broad sacrificial edge strips communicate paint wear without speckle.
   for(const face of form.fullTile?[-1,1]:[1])for(const x of [-w/2+.010,w/2-.010])add('front-edge',m.edge,[x,carcassHeight/2+.03,face*(d/2-.012)],[.018,carcassHeight-.22,.018],[0,0,0],{solid:false});
   if(form.fullTile)for(const x of [-w/2+.004,w/2-.004])add('join-seam',m.edge,[x,carcassHeight/2,0],[.008,carcassHeight-.19,.012],[0,0,0],{solid:false});
   if(form.ornate){
    // Broad relief stays readable at phone size; shelf books remain skinned.
    add('cornice-lower',m.edge,[0,1.7725,0],[w-.025,.045,d-.025]);
    add('frieze-body',m.body,[0,1.845,0],[w-.08,.12,d-.08]);
    add('cornice-step',m.edge,[0,1.9275,0],[w-.04,.045,d-.04]);
    add('cornice-crown',m.body,[0,1.965,0],[w,.03,d]);
    for(const face of [-1,1]){
     add('frieze-panel',m.body,[0,1.845,face*(d/2-.04)],[w-.10,.12,.04]);
     for(const x of [-w/2+.065,w/2-.065]){
      add('pilaster',m.edge,[x,.955,face*(d/2-.026)],[.065,1.57,.032]);
      add('pilaster-capital',m.edge,[x,1.735,face*(d/2-.031)],[.11,.065,.046]);
     }
     for(let i=0;i<6;i++){
      const x=(i-2.5)*.275,z=face*(d/2-.013);
      for(const [dx,dy,angle] of [[-.024,.024,1],[.024,.024,-1],[-.024,-.024,-1],[.024,-.024,1]])add('frieze-relief',m.edge,[x+dx,1.845+dy,z],[.068,.012,.014],[0,0,angle*Math.PI/4],{solid:false});
     }
     for(let i=0;i<9;i++)add('dentil',m.edge,[(i-4)*.195,1.795,face*(d/2-.028)],[.065,.045,.036],[0,0,0],{solid:false});
    }
   }
  }else{
   // Extend the inherited plank-top, apron and leg language for both footprints.
   const large=formId==='library-table-large',w=form.width,d=form.depth,boards=large?8:4,gap=.002,boardWidth=(w-gap*(boards-1))/boards;
   const legX=w/2-.13,legZ=d/2-.17,legRows=large?[-legZ,0,legZ]:[-legZ,legZ];
   for(let i=0;i<boards;i++)add('table-plank',m.shelf,[(i-(boards-1)/2)*(boardWidth+gap),.8025,0],[boardWidth,.075,d]);
   for(const x of [-legX,legX])for(const z of legRows){
    add('table-leg',m.body,[x,.365,z],[.095,.73,.095]);add('foot-shoe',iron(),[x,.03,z],[.104,.06,.104]);
   }
   for(const x of [-w/2+.11,w/2-.11])add('long-apron',m.body,[x,.725,0],[.065,.14,d-.24]);
   for(const z of [-d/2+.16,d/2-.16])add('end-apron',m.body,[0,.725,z],[w-.19,.14,.065]);
   for(const x of [-legX,legX])add('low-stretcher',m.body,[x,.24,0],[.045,.065,d-.34]);
   for(const z of large?legRows:[0])add('center-brace',iron(),[0,.24,z],[w-.26,.048,.055]);
   if(contents==='books'){
    for(const z of large?[-1.58,1.58]:[-.62]){
     for(let i=0;i<3;i++)book([-.05+i*.007,.84+.0275+i*.055,z],.055,.37-i*.022,.29,i,{lean:Math.PI/2,yaw:(i-1)*.07});
    }
    for(const z of large?[-.34,.34]:[-.12]){
     for(let i=0;i<3;i++)book([-.26+i*.09,.84+(.27+i*.018)/2,z],.078,.27+i*.018,.23,i+3);
     add('bookend',iron(),[-.32,1.00,z+.01],[.022,.32,.27]);
     add('bookend-foot',iron(),[-.27,.85,z+.01],[.12,.02,.27]);
    }
    const readingPlaces=large?[[-.48,-.95,-Math.PI/2],[.48,-.95,Math.PI/2],[-.48,.95,-Math.PI/2],[.48,.95,Math.PI/2]]:[[0,.52,0]];
    for(const [x,z,yaw] of readingPlaces){
     const place=compose([x,0,z],[1,1,1],[0,yaw,0]);
     for(const sign of [-1,1]){
      const parent=place.clone().multiply(compose([sign*.123,.878,0],[1,1,1],[0,0,sign*.095]));
      add('open-cover',m.books[1],[0,-.012,0],[.25,.017,.375],[0,0,0],{parent,geometry:'book'});
      add('open-pages',pages(),[0,.006,0],[.234,.025,.355],[0,0,0],{parent,geometry:'book'});
      for(let line=0;line<3;line++)add('page-line',ink(),[0,.019,-.09+line*.07],[.16,.0015,.008],[0,0,0],{parent,solid:false,geometry:'book'});
     }
     add('open-spine',m.books[1],[0,.859,0],[.018,.026,.375],[0,0,0],{parent:place,geometry:'book'});
    }
   }
  }
  const root=new T.Group();root.name=spec.id;root.rotation.y=rotation*Math.PI/180;root.userData={libraryAsset:spec.id,tiles:spec.tiles};
  // Batch by shared geometry/material; a full bookcase stays under 20 draws.
  const batches=[];for(const p of parts){let b=batches.find(b=>b.geometry===p.geometry&&b.material===p.material);if(!b){b={geometry:p.geometry,material:p.material,parts:[]};batches.push(b);}b.parts.push(p);}
  for(const batch of batches){
   const mesh=new T.InstancedMesh(batch.geometry,batch.material,batch.parts.length);mesh.name=batch.material.name;
   batch.parts.forEach((p,i)=>mesh.setMatrixAt(i,p.matrix));mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh);
  }
  let assetDisposed=false;
  const result={root,spec,parts,bounds:new T.Box3().setFromObject(root),
   solidParts(){if(assetDisposed||disposed)throw Error('Library asset is disposed');root.updateWorldMatrix(true,true);return parts.filter(p=>p.solid).map(p=>({role:p.role,geometry:p.geometry,matrixWorld:root.matrixWorld.clone().multiply(p.matrix)}));},
   dispose(){if(assetDisposed)return;assetDisposed=true;root.removeFromParent();for(const mesh of root.children)mesh.dispose();assets.delete(result);},
   get disposed(){return assetDisposed;},
  };
  assets.add(result);return result;
 }
 function dispose(){if(disposed)return;for(const asset of [...assets])asset.dispose();disposed=true;for(const g of Object.values(geometries))g.dispose();for(const m of materials.values())m.dispose();for(const t of textures)t.dispose();materials.clear();textures.length=0;}
 return {build,dispose,stats:()=>({assets:assets.size,geometries:disposed?0:3,materials:materials.size,textures:textures.length}),get disposed(){return disposed;},resources:{geometries,materials,textures}};
}
