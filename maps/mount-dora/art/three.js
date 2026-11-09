// Static authoring studies. Real source geometry/materials; no map/editor/game implementation.
import {createBuildingModel} from './source/nautilus/packages/building-catalog/three.js';
import {MATERIALS} from './source/nautilus/packages/building-catalog/index.js';
import {createRoofGroup} from './source/nautilus/packages/roof-core/three.js';
const tileIds=new Map(MATERIALS.map(m=>[m.id,m.tile]));
export function createLandmarkStudy({THREE:T,id,atlas=null,prototypes,plantTextures={},geography}){
 if(!T?.Group||!prototypes?.models)throw Error('Supply host Three and the fixed source prototypes.');
 const root=new T.Group(),resources=new Set(),children=[],materials=new Map(),geometryCache=new Map();let disposed=false;
 root.name=id;root.userData={authoringStudy:true,geographicalPlacement:false,metresPerUnit:1,engineRevision:'2502646482218524fd5129641da769bb82462e4d'};
 function material(name,color=0xffffff){const key=name+':'+color;if(materials.has(key))return materials.get(key);const m=new T.MeshStandardMaterial({color,map:tileIds.has(name)?atlas:null,roughness:.95});m.name='study:'+name;materials.set(key,m);resources.add(m);return m;}
 function paintUV(g,name){const tile=tileIds.get(name),uv=g.attributes.uv;if(tile!==undefined&&uv)for(let i=0;i<uv.count;i++)uv.setXY(i,(tile%4+.012+uv.getX(i)*.976)/4,(3-Math.floor(tile/4)+.012+uv.getY(i)*.976)/4);return g;}
 function mesh(g,m,pos=[0,0,0],rotation=[0,0,0]){resources.add(g);const o=new T.Mesh(g,m);o.position.fromArray(pos);o.rotation.set(...rotation);o.castShadow=o.receiveShadow=true;root.add(o);return o;}
 const box=(pos,size,name='wood',rotation)=>mesh(paintUV(new T.BoxGeometry(...size),name),material(name),pos,rotation);
 function building(asset,pos=[0,0,0]){const model=createBuildingModel(T,asset,{atlas,lod:'game'});children.push(model);model.root.position.fromArray(pos);root.add(model.root);return model;}
 function prop(name,pos=[0,0,0]){
  const source=prototypes.models[name];if(!source)throw Error('Unknown existing model '+name);const group=new T.Group();group.name='source:'+name;group.userData.publicAssetId=source.publicAssetId;
  for(const [batchIndex,b]of source.batches.entries()){let m;
   if(b.color){const key='native-prop:'+b.material;if(!materials.has(key)){const value=new T.MeshStandardMaterial({color:new T.Color(...b.color),roughness:b.roughness});materials.set(key,value);resources.add(value);}m=materials.get(key);}
   else if(b.paint){const spec=prototypes.paints[b.paint],key='plant:'+b.paint;if(!materials.has(key)){const sourceTexture=plantTextures[spec.atlas];if(!sourceTexture)throw Error('Missing source plant atlas '+spec.atlas);const t=sourceTexture.clone(),[x,y,w,h]=spec.panel;t.offset.set((x+.04)/w,1-(y+.96)/h);t.repeat.set(.92/w,.92/h);t.needsUpdate=true;resources.add(t);m=new T.MeshStandardMaterial({map:t,roughness:1,side:T.DoubleSide});m.name=key;materials.set(key,m);resources.add(m);}m=materials.get(key);
   }else{const name=/wood/.test(b.material)?'wood':/leaf|grass|reed|pine/.test(b.material)?null:/glass/.test(b.material)?'plaster':'dark-wood';m=name?material(name):material('reed-solid',0x6d8251);}
   const geometryKey=name+':'+batchIndex;let g=geometryCache.get(geometryKey);if(!g){g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(b.positions,3)).setAttribute('normal',new T.Float32BufferAttribute(b.normals,3)).setAttribute('uv',new T.Float32BufferAttribute(b.uvs,2));if(!b.paint&&/wood/.test(b.material))paintUV(g,'wood');resources.add(g);geometryCache.set(geometryKey,g);}const o=new T.Mesh(g,m);o.castShadow=o.receiveShadow=true;group.add(o);
  }group.position.fromArray(pos);root.add(group);return group;
 }
 function pavilion(x,z,w=6,d=6){
  const roof=createRoofGroup(T,{id:'study-pavilion-'+children.length,x:24,y:24,width:w,depth:d,z:1,style:'hip',axis:'x',pitch:28,overhang:.3,material:'metal',seed:19},{materialMap:{metal:material('green-roof-solid',0x4b6654),fascia:material('fascia-solid',0x65533f),soffit:material('soffit-solid',0x958267)}});roof.position.set(x-24,0,z-24);children.push({dispose:()=>roof.dispose()});root.add(roof);
  box([x+w/2,-.06,z+d/2],[w,.12,d]);
  for(const xx of [x+.15,x+w-.15])for(const zz of [z+.15,z+d-.15])box([xx,1,zz],[.18,2,.18],'cream-siding');
  for(const zz of [z+.15,z+d-.15])box([x+w/2,2.06,zz],[w,.12,.16],'cream-siding');
  for(const xx of [x+.15,x+w-.15])box([xx,2.06,z+d/2],[.16,.12,d],'cream-siding');
 }
 function rail(x,z,length,axis='x'){const along=axis==='x';box([x,.91,z],along?[length,.08,.08]:[.08,.08,length]);for(let i=0;i<=Math.ceil(length);i++){const t=-length/2+i*length/Math.ceil(length);box([x+(along?t:0),.45,z+(along?0:t)],[.065,.9,.065]);}}
 try{
  if(id==='md:donnelly-park'){
   building('branchline-depot',[-16,0,9]);box([-8,-.06,4.5],[16,.12,4]);prop('shade-tree',[-27,0,15]);prop('streetlight',[18,0,8]);
   for(const f of (geography?.features||[]).filter(f=>f.tags.sport&&f.townBounds[0]<530&&f.townBounds[1]<510)){
    const points=f.townPoints.map(p=>[p[0]-480,p[1]-480]),shape=new T.Shape();points.forEach((p,i)=>i?shape.lineTo(p[0],-p[1]):shape.moveTo(p[0],-p[1]));const g=new T.ShapeGeometry(shape);g.rotateX(-Math.PI/2);const m=material('court-'+f.sourceId,f.tags.sport==='tennis'?0x849b90:0x577d87);m.side=T.DoubleSide;const o=mesh(g,m,[0,.006,0]);o.userData.ground=true;o.userData.sourceFeatureId=f.id;
    const outline=new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(p[0],.016,p[1]))),lineMat=new T.LineBasicMaterial({color:0xe1e1c4});resources.add(outline);resources.add(lineMat);root.add(new T.Line(outline,lineMat));
   }
  }
  else if(id==='md:lakeside-inn'){building('estuary-cottage');building('branchline-depot',[15,0,0]);prop('shade-tree',[-5,0,7]);}
  else if(id==='md:historic-shopfronts'){building('pepper-corner-shop');building('batten-general-store',[16,0,0]);prop('streetlight',[13,0,-2]);}
  else if(id==='md:elizabeth-evans'){pavilion(0,0,6,6);box([3,-.06,-3],[2,.12,6]);for(const x of [2,4])rail(x,-3,6,'y');for(let i=0;i<6;i++)prop('reeds',[-2+i*.4,0,6+i*.2]);}
  else if(id==='md:gilbert-park'){pavilion(0,0,10,8);prop('table-wood',[3,0,3]);prop('table-wood',[7,0,5]);prop('shade-tree',[-5,0,4]);}
  else if(id==='md:palm-island'){box([0,-.06,0],[2,.12,12]);for(const x of [-1,1])rail(x,0,12,'y');pavilion(-3,6,6,6);prop('wetland-tree',[-5,0,-2]);prop('wetland-tree-2',[5,0,3]);for(let i=0;i<6;i++)prop('reeds',[-2-i*.35,0,2+i*.7]);}
  else if(id==='md:grantham-lighthouse'){
   // No native lighthouse preset exists. Static map-owned proxy, not a new engine asset ID.
   const sides=16;for(let i=0;i<4;i++){const bottom=1.45-i*.14,top=bottom-.14,name=i%2?'red-timber':'plaster';mesh(paintUV(new T.CylinderGeometry(top,bottom,2.12,sides,1,false),name),material(name),[0,(i+.5)*2.12,0]);}
   mesh(paintUV(new T.CylinderGeometry(1.45,1.45,.12,16),'plaster'),material('plaster'),[0,8.48,0]);
   const glass=new T.MeshStandardMaterial({color:0x77918a,transparent:true,opacity:.72,roughness:.35});resources.add(glass);mesh(new T.CylinderGeometry(.86,.86,1.1,6),glass,[0,9.03,0]);
   for(let i=0;i<6;i++){const a=i*Math.PI/3;box([Math.cos(a)*.86,9.03,Math.sin(a)*.86],[.09,1.1,.09],'plaster');}
   mesh(paintUV(new T.ConeGeometry(1.45,1.02,6),'red-timber'),material('red-timber'),[0,10.09,0]);
   for(let i=0;i<16;i++){const a=i*Math.PI/8;box([Math.cos(a)*1.28,8.85,Math.sin(a)*1.28],[.055,.72,.055],'plaster');}
  }else throw Error('Unknown Mount Dora study '+id);
 }catch(error){dispose();throw error;}
 root.updateMatrixWorld(true);
 function metrics(){const gs=new Set(),ms=new Set(),ts=new Set();let draws=0,triangles=0;root.traverse(o=>{if(!o.isMesh)return;draws++;gs.add(o.geometry);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);if(m.map)ts.add(m.map);}});const bounds=new T.Box3().setFromObject(root,true);return {drawObjects:draws,triangles,geometries:gs.size,materials:ms.size,textures:ts.size,geometryBytes:[...gs].reduce((n,g)=>n+Object.values(g.attributes).reduce((v,a)=>v+a.array.byteLength,0)+(g.index?.array.byteLength||0),0),bounds:bounds.isEmpty()?null:{min:bounds.min.toArray(),max:bounds.max.toArray()},actualThreeGeometry:true,sourceRendererReused:id!=='md:grantham-lighthouse',registeredWholePreset:false,geographicallyPlaced:false};}
 function dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const c of children)c.dispose();children.length=0;for(const r of resources)r.dispose();resources.clear();materials.clear();geometryCache.clear();root.clear();}
 return {root,metrics,dispose,notes:['Authoring typology and material study, not a surveyed site reconstruction.','Pavilion posts/railings/lighthouse are map-owned static studies using existing roof geometry, kit dimensions and painted materials.','Foliage uses original source mesh with atlas-panel UV paint; the workshop retains its richer native foliage shader.']};
}
