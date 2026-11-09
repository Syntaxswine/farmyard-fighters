import * as T from '../../aft/tactics/vendor/three.module.js';
import {environmentModel} from '../../aft/tactics/environment-models.js';
import {environmentGeometries} from '../../aft/tactics/environment-geometry.js';
import {surfacePixels} from '../../aft/tactics/hybrid-materials.js';
import {PLACEMENTS,GROUND_MARKINGS,acceptsBinding} from './manifest.js';

// Lazy, mission-local ownership. No texture fetching or animation loop here.
// The optional paper texture belongs to the caller and is never disposed here.
export function createShortMeasureKit({paperTexture=null}={}) {
  const geometry=environmentGeometries(), used=new Set(['box','cylinder','crown']);
  for(const [key,value] of Object.entries(geometry)) if(!used.has(key)){value.dispose();delete geometry[key];}
  const materials={}, textures=[], roots=new Set();
  let disposed=false;
  for(const kind of ['wood','sand','linen','steel','olive','dark-metal','rust','red']) {
    const pixels=surfacePixels(kind,64), map=new T.DataTexture(pixels.data,pixels.width,pixels.height);
    map.colorSpace=T.SRGBColorSpace; map.wrapS=map.wrapT=T.RepeatWrapping; map.needsUpdate=true;
    textures.push(map);
    materials[kind]=new T.MeshStandardMaterial({map,roughness:.91,metalness:kind==='steel'?.35:.08});
  }
  materials.ivory=new T.MeshStandardMaterial({color:0xe3d5ad,roughness:.84});
  materials.ink=new T.MeshStandardMaterial({color:0xa63f29,roughness:1,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2});
  materials.paper=new T.MeshStandardMaterial({color:0xffffff,map:paperTexture,roughness:1,side:T.DoubleSide});
  materials.paint=new T.MeshStandardMaterial({color:0xdfc580,roughness:1});
  if(!paperTexture) materials.paper.color.set(0xddd3af);

  const frame=new T.Shape(); frame.moveTo(0,0); frame.lineTo(1,0); frame.lineTo(1,1); frame.lineTo(0,1); frame.closePath();
  const hole=new T.Path(); hole.moveTo(.09,.09); hole.lineTo(.09,.91); hole.lineTo(.91,.91); hole.lineTo(.91,.09); hole.closePath(); frame.holes.push(hole);
  const seven=new T.Shape();
  // SVG y points down; the same seven is converted into an upright XY shape.
  [[.25,.77],[.78,.77],[.78,.65],[.50,.21],[.33,.21],[.62,.64],[.25,.64]].forEach(([x,y],i)=>i?seven.lineTo(x,y):seven.moveTo(x,y)); seven.closePath();
  geometry.seal=new T.ShapeGeometry([frame,seven]); geometry.seal.translate(-.5,-.5,0);
  geometry.paper=new T.PlaneGeometry(.68,.82);
  const arrow=new T.Shape();arrow.moveTo(-.15,-.55);arrow.lineTo(.15,-.55);arrow.lineTo(.15,.12);arrow.lineTo(.42,.12);arrow.lineTo(0,.65);arrow.lineTo(-.42,.12);arrow.lineTo(-.15,.12);arrow.closePath();
  geometry.arrow=new T.ShapeGeometry(arrow);geometry.arrow.translate(0,-.05,0);

  function piece(root,shape,material,center,size,rotation=[0,0,0]) {
    const mesh=new T.Mesh(geometry[shape],materials[material]);
    mesh.userData.solid=true;mesh.userData.shape=shape;
    mesh.position.set(...center); mesh.scale.set(...size); mesh.rotation.set(...rotation);
    mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);return mesh;
  }
  const box=(r,m,x,y,z,w,h,d,rot)=>piece(r,'box',m,[x,y,z],[w,h,d],rot);
  const cylinder=(r,m,x,y,z,w,h,d=w,rot)=>piece(r,'cylinder',m,[x,y,z],[w,h,d],rot);
  function inherited(root,parts,{scale=[1,1,1],at=[0,0,0]}={}) {
    const group=new T.Group(); root.add(group); group.position.set(...at);group.scale.set(...scale);
    for(const p of parts)piece(group,p.shape,p.material,p.center,p.size,p.rotation);return group;
  }
  function seal(root,at,size=.32,face='top') {
    const mesh=new T.Mesh(geometry.seal,materials.ink);mesh.position.set(...at);mesh.scale.setScalar(size);
    if(face==='top')mesh.rotation.x=-Math.PI/2;
    root.add(mesh);return mesh;
  }
  function sack(root,x,y,z,w,h,d,{stamp=false,collapsed=false}={}) {
    // The first inherited sandbag is one normalized sack and its seam.
    const source=environmentModel('sandbags',1,1,.8).slice(0,2);
    const origin=source[0].center;
    inherited(root,source.map(p=>({...p,material:collapsed&&p.material==='sand'?'linen':p.material,center:p.center.map((n,i)=>n-origin[i])})),{scale:[w/.5,h/(.8/3+.03),d/.68],at:[x,y,z]});
    if(stamp) seal(root,[x,y+h/2+.002,z],Math.min(w,d)*.55);
  }
  function scale(root,broken) {
    box(root,'dark-metal',0,.07,0,1.7,.14,1.1);
    for(const x of [-.68,.68])box(root,'rust',x,.15,0,.16,.16,.86);
    box(root,'steel',0,.22,.13,1.32,.12,.78);
    for(let i=-2;i<=2;i++)box(root,'wood',i*.24,.29,.14,.215,.025,.72);
    box(root,'olive',0,.86,-.35,.21,1.28,.22);
    for(const x of [-.19,.19])box(root,'steel',x,1.35,-.35,.11,.30,.32);
    cylinder(root,'rust',0,1.43,-.35,.11,.40,.11,[Math.PI/2,0,0]);
    // Straight right half is shared; worker's left half has a conspicuous kink.
    box(root,'ivory',.36,1.43,-.35,.76,.10,.12);
    box(root,'ivory',-.36,broken?1.37:1.43,-.35,.76,.10,.12,broken?[0,0,.19]:[0,0,0]);
    box(root,broken?'red':'olive',broken?-.47:.47,broken?1.27:1.43,-.35,.22,.23,.26);
    if(broken){
      box(root,'red',-.45,1.12,-.35,.14,.35,.20);
      box(root,'steel',-.45,.975,-.35,.27,.05,.29);
      for(const x of [-.54,-.46,-.38])box(root,'ivory',x,.999,-.19,.035,.025,.028);
    }
    box(root,'steel',0,1.64,-.35,.52,.16,.13);
    box(root,'ivory',0,1.64,-.278,.42,.10,.012);
    box(root,'dark-metal',0,1.65,-.269,.025,.08,.006);
    box(root,'ivory',0,.68,.065,.48,.30,.025);
    seal(root,[0,.68,.080],.235,'front');
    if(!broken) sack(root,0,.48,.13,.86,.35,.57,{stamp:true});
  }
  function fullLoad(root,w,h,d) {
    // Reuse the AFT pallet; extend its rails to the exact declared reservation.
    inherited(root,environmentModel('pallet'),{scale:[w/.98,.65,d/.94]});
    box(root,'wood',0,.19,0,w,.12,d);
    // A solid timber cargo bin visibly explains the conservative box collider.
    box(root,'wood',0,.40,0,w,.30,d);
    // Corner posts stop at the lower of .935 m and the declared load height; a
    // fixed .75 m post stood above the sealed load sized to the .92 m crate collider.
    const post=Math.min(.75,h-.185);
    for(const x of [-w/2+.045,w/2-.045])box(root,'dark-metal',x,.185+post/2,0,.09,post,d);
    for(const z of [-d/2+.04,d/2-.04])box(root,'wood',0,.58,z,w,.26,.08);
    const sh=h-.57;
    for(const x of [-w*.25,w*.25])for(const z of [-d*.25,d*.25])sack(root,x,.56+sh/2,z,w*.48,sh,d*.47,{stamp:true});
    // Top frame finishes at exactly the collision height, including the stencil.
    box(root,'olive',0,h-.035,-d/2+.04,w,.07,.08);
    box(root,'ivory',0,.43,d/2+.002,.42,.38,.004);
    seal(root,[0,.43,d/2+.005],.30,'front');
  }
  function empties(root) {
    for(let i=0;i<3;i++) {
      const group=new T.Group(); root.add(group);group.position.set((i-1)*.57,0,(i%2)*.18-.09);
      sack(group,0,.026,0,.63,.038,.37,{collapsed:true});
      box(group,'wood',.04,.046,0,.36,.01,.025,[0,.13,0]);
    }
  }
  function desk(root) {
    inherited(root,environmentModel('table-wood',2,1,1));
    // Table recipe tops at .98 m. Keep every detail inside 1.05 m height.
    const paper=new T.Mesh(geometry.paper,materials.paper);paper.name='collectible-paper';
    paper.rotation.x=-Math.PI/2;paper.position.set(0,.997,.08);root.add(paper);
    // Keep the seal as native geometry above the paper, readable at phone size.
    seal(paper,[.08,-.205,.004],.39,'front').rotation.z=Math.PI/30;
    box(root,'red',.37,1.00,.08,.075,.012,.31).name='collectible-tab';
    box(root,'dark-metal',-.62,1.015,-.10,.30,.06,.32);
    box(root,'ivory',-.62,1.049,-.10,.25,.002,.26);
    seal(root,[-.62,1.051,-.10],.18);
    seal(root,[.61,.986,-.16],.25);
  }
  function createProp(kind,{size=null}={}) {
    if(disposed)throw Error('Short Measure kit is disposed');
    const root=new T.Group();root.name=kind;roots.add(root);
    if(kind==='scale-worker'||kind==='scale-freight')scale(root,kind==='scale-worker');
    else if(kind==='sacks-full'){const [w,h,d]=size||[2,1,2];fullLoad(root,w,h,d);}
    else if(kind==='sacks-empty')empties(root);
    else if(kind==='dispatch-desk')desk(root);
    else throw Error('Unknown Short Measure prop: '+kind);
    return root;
  }
  function place(id,{binding=null,collected=false}={}) {
    const placement=PLACEMENTS.find(p=>p.id===id);
    if(!placement)throw Error('Unknown Short Measure placement: '+id);
    if(!acceptsBinding(placement,binding))return null;
    const root=createProp(placement.kind,{size:placement.size});root.name=id;
    root.position.set(placement.anchor[0]+placement.offset[0],0,placement.anchor[1]+placement.offset[1]);root.rotation.y=placement.yaw;
    root.userData={placementId:id,collisionOwner:placement.owner,decorative:placement.status==='decorative'};
    if(id==='shipping-manifest') setCollected(root,collected);
    return root;
  }
  function createGroundPaint() {
    if(disposed)throw Error('Short Measure kit is disposed');
    const root=new T.Group();root.name='ground-markings';roots.add(root);
    for(const p of GROUND_MARKINGS){
      let item;
      if(p.kind==='bar')item=box(root,'paint',p.at[0],.026,p.at[1],p.size[0],.008,p.size[1]);
      else {item=new T.Mesh(geometry.arrow,materials.paint);item.rotation.set(-Math.PI/2,0,Math.PI+p.yaw);item.position.set(p.at[0],.032,p.at[1]);root.add(item);}
      item.name=p.id;item.castShadow=false;
    }
    return root;
  }
  function solidParts(root) {
    if(disposed)throw Error('Short Measure kit is disposed');
    if(!roots.has(root))throw Error('Occlusion source must belong to this kit');
    if(root.userData.decorative||root.name==='sacks-empty'||root.name==='ground-markings')return [];
    // Borrowed geometry; the adapter owns its registrations, this kit owns
    // their source buffers. Copy transforms and unregister before disposing.
    root.updateWorldMatrix(true,true);const result=[];
    root.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.solid&&mesh.name!=='collectible-tab')result.push({geometry:mesh.geometry,matrixWorld:mesh.matrixWorld.clone(),shape:mesh.userData.shape});});
    return result;
  }
  function setCollected(root,collected) {
    for(const name of ['collectible-paper','collectible-tab']){const item=root.getObjectByName(name);if(item)item.visible=!collected;}
  }
  function dispose() {
    if(disposed)return;disposed=true;
    for(const root of roots)root.removeFromParent();roots.clear();
    for(const g of Object.values(geometry))g.dispose();
    for(const m of Object.values(materials))m.dispose();for(const t of textures)t.dispose();
  }
  return {createProp,place,createGroundPaint,solidParts,setCollected,seal,dispose,resources:{geometry,materials,textures},get disposed(){return disposed;}};
}

// Call only after selecting this mission. Missing collision bindings skip solid
// art; the existing cargo and mission markers stay usable as the first slice.
export function createShortMeasureArt({missionId,bindings={},collected=false,paperTexture=null}={}) {
  if(missionId!=='short-measure')return null;
  const kit=createShortMeasureKit({paperTexture}),root=new T.Group(),skipped=[];
  root.name='short-measure-art';
  for(const p of PLACEMENTS){const model=kit.place(p.id,{binding:bindings[p.id],collected});if(model)root.add(model);else skipped.push(p.id);}
  root.add(kit.createGroundPaint());
  return {root,skipped,solidParts(id){const model=root.getObjectByName(id);return model?kit.solidParts(model):[];},setCollected(value){const desk=root.getObjectByName('shipping-manifest');if(desk)kit.setCollected(desk,value);},dispose(){root.removeFromParent();kit.dispose();}};
}
