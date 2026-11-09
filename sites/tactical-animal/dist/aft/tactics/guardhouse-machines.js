import * as T from './vendor/three.module.js';

export const GUARDHOUSE_MACHINE_PAINT='../assets/environment/guardhouse-consoles/paint-atlas-v1.png';
export const GUARDHOUSE_MACHINE_FORMS=[
 {id:'computer',name:'Computer terminal',tiles:[1,1]},
 {id:'telephone',name:'Telephone & radio console',tiles:[1,1]}
];
export const GUARDHOUSE_MACHINE_SIZE={width:.94,depth:.58,height:.80,back:-.40,front:.18};
// The authored atlas has deliberately measured row boundaries. UVs follow the
// actual painted panels, rather than assuming generation produced equal rows.
const columns=[0,314,629,943,1254],rows=[0,288,580,883,1254],inset=5;
export const GUARDHOUSE_PAINT_CELLS={
 olive:[0,0],ivory:[1,0],black:[2,0],worktop:[3,0],
 greenScreen:[0,1],amberScreen:[1,1],keyboard:[2,1],phoneDial:[3,1],
 doors:[0,2],side:[1,2],radio:[2,2],drawers:[3,2],
 monitorBack:[0,3],handset:[1,3],keypad:[2,3],service:[3,3]
};
export function guardhousePaintRect(cell){
 const [col,row]=GUARDHOUSE_PAINT_CELLS[cell]||[];if(col===undefined)throw Error('Unknown guardhouse paint panel: '+cell);
 return [(columns[col]+inset)/1254,1-(rows[row+1]-inset)/1254,(columns[col+1]-columns[col]-2*inset)/1254,(rows[row+1]-rows[row]-2*inset)/1254];
}

// All models use native tile units, Y up, with their origin at the floor in a
// 1x1 placement tile. +Z is the operator side; the rear plane is Z=-.40.
// The library owns geometry/materials. Models and the input texture are borrowed.
export function createGuardhouseMachineLibrary(atlas){
 const geometries=new Map(),roots=new Set(),material=new T.MeshStandardMaterial({map:atlas,roughness:1,metalness:0});
 material.name='Guardhouse hand-painted skin';const grey=new T.MeshStandardMaterial({color:0xaaa79c,roughness:1});let disposed=false,greyMode=false;
 function remap(g,cellForVertex){
  const uv=g.attributes.uv;for(let i=0;i<uv.count;i++){const [u,v,w,h]=guardhousePaintRect(cellForVertex(i));uv.setXY(i,u+uv.getX(i)*w,v+uv.getY(i)*h);}return g;
 }
 function geometry(key,make){if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);}
 function add(root,name,g,p=[0,0,0]){const mesh=new T.Mesh(g,greyMode?grey:material);mesh.name=name;mesh.position.set(...p);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.guardhousePart=true;root.add(mesh);return mesh;}
 function box(root,name,size,p,faces){
  if(typeof faces==='string')faces=Array(6).fill(faces);
  const g=geometry('box:'+size+':'+faces,()=>remap(new T.BoxGeometry(...size),i=>faces[Math.floor(i/4)]));return add(root,name,g,p);
 }
 function hood(root,name,width,profile,faces,x=0){
  const key='hood:'+width+':'+JSON.stringify(profile)+':'+faces;
  const g=geometry(key,()=>{
   // Profile: front-bottom, front-top, rear-top, rear-bottom. Closed volume;
   // only the silhouette is geometry, including the sloping painted screen.
   const positions=[],uv=[],indices=[];
   const point=(side,index)=>[side*width/2,...profile[index]];
   const quad=(a,b,c,d,cell)=>{const start=positions.length/3;positions.push(...a,...b,...c,...d);const [u,v,w,h]=guardhousePaintRect(cell);uv.push(u,v,u+w,v,u+w,v+h,u,v+h);indices.push(start,start+1,start+2,start,start+2,start+3);};
   quad(point(-1,0),point(1,0),point(1,1),point(-1,1),faces[0]);
   quad(point(-1,1),point(1,1),point(1,2),point(-1,2),faces[1]);
   quad(point(1,3),point(-1,3),point(-1,2),point(1,2),faces[2]);
   quad(point(-1,3),point(1,3),point(1,0),point(-1,0),faces[3]);
   quad(point(1,0),point(1,3),point(1,2),point(1,1),faces[4]);
   quad(point(-1,3),point(-1,0),point(-1,1),point(-1,2),faces[4]);
   const result=new T.BufferGeometry();result.setAttribute('position',new T.Float32BufferAttribute(positions,3));result.setAttribute('uv',new T.Float32BufferAttribute(uv,2));result.setIndex(indices);result.computeVertexNormals();return result;
  });return add(root,name,g,[x,0,0]);
 }
 function receiver(root){
  const g=geometry('handset',()=>{
   const s=new T.Shape(),outline=[[-.20,0],[-.12,0],[-.09,.044],[.09,.044],[.12,0],[.20,0],[.20,.055],[.14,.098],[.10,.105],[-.10,.105],[-.14,.098],[-.20,.055]];
   s.moveTo(...outline[0]);for(const p of outline.slice(1))s.lineTo(...p);s.closePath();
   const geometry=new T.ExtrudeGeometry(s,{depth:.07,steps:1,bevelEnabled:false,curveSegments:1});geometry.translate(0,0,-.035);
   const uv=geometry.attributes.uv,p=geometry.attributes.position,n=geometry.attributes.normal;
   for(let i=0;i<uv.count;i++){const side=Math.abs(n.getZ(i))<.5;uv.setXY(i,(p.getX(i)+.20)/.40,side?(p.getZ(i)+.035)/.07:p.getY(i)/.105);}
   geometry.scale(1,.60,1);return remap(geometry,()=> 'handset');
  });return add(root,'Telephone handset',g,[.16,.733,-.12]);
 }
 function build(id,{screen='green'}={}){
  if(disposed)throw Error('Guardhouse machine library disposed');const form=GUARDHOUSE_MACHINE_FORMS.find(f=>f.id===id);if(!form)throw Error('Unknown guardhouse machine: '+id);if(!['green','amber'].includes(screen))throw Error('Unknown screen');
  const root=new T.Group();root.name=form.name;roots.add(root);
  box(root,'Recessed plinth',[.90,.05,.54],[0,.025,-.11],'black');
  box(root,'Console cabinet',[.94,.55,.58],[0,.325,-.11],['side','side','olive','black',id==='computer'?'doors':'drawers','service']);
  box(root,'Worktop',[.94,.025,.58],[0,.6125,-.11],['olive','olive','worktop','olive','olive','olive']);
  if(id==='computer'){
   hood(root,'Recessed CRT monitor',.48,[[.625,-.025],[.800,-.26],[.800,-.385],[.625,-.385]],[screen==='green'?'greenScreen':'amberScreen','ivory','monitorBack','ivory','ivory'],-.09);
   box(root,'Painted keyboard',[.47,.012,.15],[-.09,.631,.084],['black','black','keyboard','black','black','black']);
   box(root,'Computer control pad',[.16,.012,.20],[.302,.631,-.08],['olive','olive','keypad','olive','olive','olive']);
  }else{
   hood(root,'Radio control panel',.34,[[.625,-.18],[.800,-.345],[.800,-.39],[.625,-.39]],['radio','olive','service','olive','olive'],-.245);
   hood(root,'Telephone base',.37,[[.625,.155],[.683,.155],[.725,-.17],[.625,-.17]],['black','phoneDial','black','black','black'],.16);
   for(const x of [.015,.305])box(root,'Handset cradle',[.07,.014,.07],[x,.726,-.12],'black');
   receiver(root);
  }
  const rear=new T.Object3D();rear.name='back-wall';rear.position.set(0,0,-.4);root.add(rear);
  const operator=new T.Object3D();operator.name='operator';operator.position.set(0,0,.72);root.add(operator);
  root.userData.guardhouseMachine={id,tiles:[1,1],backPlane:-.40,operatorSide:'+Z',height:.80,footprint:{minX:-.5,maxX:.5,minZ:-.5,maxZ:.5},gameplayIntegrated:false};
  return {root,form,anchors:{rear,operator},dispose(){root.removeFromParent();roots.delete(root);}};
 }
 function setGrey(value){greyMode=!!value;for(const root of roots)root.traverse(p=>{if(p.isMesh)p.material=greyMode?grey:material;});}
 function stats(){return {geometries:geometries.size,materials:2,models:roots.size};}
 return {build,setGrey,stats,material,dispose(){if(disposed)return;disposed=true;for(const root of roots)root.removeFromParent();roots.clear();for(const g of geometries.values())g.dispose();geometries.clear();material.dispose();grey.dispose();}};
}
