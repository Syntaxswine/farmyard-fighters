import * as T from '../../aft/tactics/vendor/three.module.js';
import {surfacePixels,surfaceUV} from '../../aft/tactics/hybrid-materials.js';
import {describeWindow,WINDOW_FINISHES,WINDOW_WALLS} from './catalog.js';

// Presentation handles only. The caller owns hit decisions, saved break state,
// effect timing and sound. Importing this module creates no network requests.
export function createWindowLibrary(){
 const cube=new T.BoxGeometry(1,1,1),sheet=cube.clone(),materials=new Map(),textures=new Set(),assets=new Set();let disposed=false;
 // Keep only the two broad faces. Side/cap faces at touching sheets would draw
 // darker seams along tile and storey boundaries in otherwise continuous glass.
 sheet.setIndex(Array.from(cube.index.array).slice(24,36));sheet.clearGroups();
 function paint(key,options){if(materials.has(key))return materials.get(key);const m=new T.MeshStandardMaterial(options);m.name='window:'+key;materials.set(key,m);return m;}
 const glassPaint=()=>paint('glass',{color:0x8eafb0,roughness:.3,metalness:.25,transparent:true,opacity:.56,depthWrite:false});
 function wallPaint(kind){
  if(materials.has('wall:'+kind))return materials.get('wall:'+kind);
  const p=surfacePixels(kind==='corrugated'?'metal':kind,128),map=new T.DataTexture(p.data,p.width,p.height);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.needsUpdate=true;textures.add(map);
  return paint('wall:'+kind,{map,roughness:.94,color:0xffffff});
 }
 function build(definitionId,{joins={},finish='steel',wall='brick',rotation=0,dimensions}={}){
  if(disposed)throw Error('Window library is disposed');
  const f=WINDOW_FINISHES.find(f=>f.id===finish);if(!f||!WINDOW_WALLS.includes(wall)||![0,90,180,270].includes(rotation))throw Error('Invalid window finish, wall or quarter-turn');
  const spec=describeWindow(definitionId,joins,dimensions),root=new T.Group(),panes=new Map(),solidMeshes=[],ownedGeometry=[];
  root.name=definitionId;root.rotation.y=rotation*Math.PI/180;root.userData={windowDefinitionId:definitionId,windowContractVersion:spec.version,joins:spec.joins};
  const body=paint(finish+':frame',{color:f.color,roughness:.82,metalness:.32}),edge=paint(finish+':edge',{color:f.edge,roughness:.7,metalness:.35,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  function box(parent,name,b,material,geometry=cube){
   const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.position.set(...b.min.map((v,i)=>(v+b.max[i])/2));mesh.scale.set(...b.min.map((v,i)=>b.max[i]-v));mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  for(const part of spec.solids){
   let geometry=cube;
   if(part.material==='wall'){
    geometry=cube.clone();ownedGeometry.push(geometry);const pos=geometry.attributes.position,norm=geometry.attributes.normal,uv=geometry.attributes.uv;
    for(let i=0;i<pos.count;i++){
     const point=[pos.getX(i),pos.getY(i),pos.getZ(i)].map((n,j)=>n*(part.bounds.max[j]-part.bounds.min[j])+(part.bounds.max[j]+part.bounds.min[j])/2);
     const [u,v]=surfaceUV(point,[norm.getX(i),norm.getY(i),norm.getZ(i)]);uv.setXY(i,u,v);
    }
   }
   const mesh=box(root,part.id,part.bounds,part.material==='wall'?wallPaint(wall):body,geometry);solidMeshes.push({part,mesh});
   // A broad enamel highlight is embedded in each metal face, inside its solid
   // bounds. It adds a physical edge without changing collision dimensions.
   if(part.material==='frame'){
    const b=part.bounds,w=b.max[0]-b.min[0],h=b.max[1]-b.min[1];
    for(const side of [-1,1]){
     const stripe={min:[b.min[0]+.005,b.min[1]+.005,side*.099-.001],max:[b.max[0]-.005,b.max[1]-.005,side*.099+.001]};
     if(w<h)stripe.max[0]=stripe.min[0]+.006;else stripe.min[1]=stripe.max[1]-.006;
     box(root,part.id+':enamel-edge',stripe,edge);
    }
   }
  }
  for(const pane of spec.panes){
   const group=new T.Group();group.name='pane:'+pane.id;group.userData={windowPaneId:pane.id};root.add(group);
   const glass=box(group,'glass:'+pane.id,pane.bounds,glassPaint(),spec.borderless?sheet:cube);glass.castShadow=false;glass.userData={windowPaneId:pane.id};
   let shine=null;
   if(!spec.borderless){
   const points=[],[x0,y0]=pane.bounds.min,[x1,y1]=pane.bounds.max,w=x1-x0,h=y1-y0;
   for(const side of [-1,1])for(const [ax,ay,bx,by] of [[.16,.12,.40,.85],[.62,.18,.79,.70]])points.push(new T.Vector3(x0+w*ax,y0+h*ay,side*.003),new T.Vector3(x0+w*bx,y0+h*by,side*.003));
   const shineGeometry=new T.BufferGeometry().setFromPoints(points);ownedGeometry.push(shineGeometry);
   let shineMaterial=materials.get('shine');if(!shineMaterial){shineMaterial=new T.LineBasicMaterial({color:0xe2ebe0,transparent:true,opacity:.7,depthWrite:false});materials.set('shine',shineMaterial);}
   shine=new T.LineSegments(shineGeometry,shineMaterial);shine.name='shine:'+pane.id;group.add(shine);
   }
   panes.set(pane.id,{id:pane.id,root:group,glass,shine,bounds:pane.bounds,center:pane.center,width:pane.width,height:pane.height});
  }
  let assetDisposed=false;
  function live(){if(assetDisposed||disposed)throw Error('Window asset is disposed');root.updateWorldMatrix(true,true);}
  function paneFor(id){const p=panes.get(id);if(!p)throw Error('Unknown window pane: '+id);return p;}
  const result={root,spec,panes,
   setPaneVisible(id,visible){live();if(typeof visible!=='boolean')throw Error('Pane visibility must be boolean');paneFor(id).root.visible=visible;},
   isPaneVisible(id){live();return paneFor(id).root.visible;},
   paneWorldBounds(id){live();const p=paneFor(id),b=new T.Box3(new T.Vector3(...p.bounds.min),new T.Vector3(...p.bounds.max)).applyMatrix4(root.matrixWorld);return {min:b.min.toArray(),max:b.max.toArray()};},
   solidParts(){live();return solidMeshes.map(({part,mesh})=>({id:part.id,role:part.role,bounds:part.bounds,geometry:mesh.geometry,matrixWorld:mesh.matrixWorld.clone()}));},
   paneParts({includeHidden=false}={}){live();return [...panes.values()].filter(p=>includeHidden||p.root.visible).map(p=>({id:p.id,bounds:p.bounds,geometry:p.glass.geometry,matrixWorld:p.glass.matrixWorld.clone()}));},
   dispose(){if(assetDisposed)return;assetDisposed=true;root.removeFromParent();root.clear();for(const geometry of ownedGeometry)geometry.dispose();assets.delete(result);},
   get disposed(){return assetDisposed;},
  };assets.add(result);return result;
 }
 function dispose(){if(disposed)return;for(const asset of [...assets])asset.dispose();disposed=true;cube.dispose();sheet.dispose();for(const material of materials.values())material.dispose();for(const texture of textures)texture.dispose();materials.clear();textures.clear();}
 return {build,dispose,stats:()=>({assets:assets.size,materials:materials.size,textures:textures.size}),get disposed(){return disposed;}};
}
