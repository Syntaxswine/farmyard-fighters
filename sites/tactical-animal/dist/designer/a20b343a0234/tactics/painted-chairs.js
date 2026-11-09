import * as T from './vendor/three.module.js';

export const CHAIR_PAINT='../assets/environment/painted-chairs/paint-atlas-v1.png';
export const CHAIR_FORMS=Object.freeze([
 {id:'wingback',name:'Wingback',finishes:['russet','teal']},
 {id:'wood',name:'Wooden chair',finishes:['honey','walnut']},
 {id:'metal',name:'Metal chair',finishes:['sage','iron']},
 {id:'desk',name:'Desk chair',finishes:['teal','russet']}
]);
// Native scene coordinates: Y up, +Z forward. All chairs share this contact
// contract. It defines furniture targets, not species-specific bone positions.
// Match the seat-height reduction (.48 → .42), preserving its proportions.
export const CHAIR_PLAN_SCALE=.42/.48;
const S=CHAIR_PLAN_SCALE;
export const CHAIR_CONTACT=Object.freeze({
 seatHeight:.42,seatWidth:.84*S,seatDepth:.62*S,seatCenter:Object.freeze([0,.42,-.01*S]),
 pelvis:Object.freeze([0,.56,-.03*S]),feet:Object.freeze([Object.freeze([-.23,0,.43]),Object.freeze([.23,0,.43])]),
 approach:Object.freeze([0,0,.80]),back:Object.freeze([0,.91,-.36*S]),
 armInside:.44*S,armTop:.66,bodyWidth:.80*S,bodyFront:.32*S,bodyRear:-.30*S,
 needsSpeciesAdapter:true
});
const cells={redBack:[0,0],redSeat:[1,0],redSide:[2,0],walnut:[3,0],
 woodSeat:[0,1],woodBack:[1,1],wood:[2,1],end:[3,1],
 metalSeat:[0,2],metalBack:[1,2],metal:[2,2],iron:[3,2],
 tealBack:[0,3],tealSeat:[1,3],tealSide:[2,3],rubber:[3,3]};
// Measured painted boundaries, 1254px atlas. Insets prevent neighboring panels
// from bleeding into a surface when the chair is viewed at gameplay size.
const columns=[0,315,629,941,1254],rows=[0,312,628,924,1254],inset=5;
export function chairPaintRect(cell){const [c,r]=cells[cell]||[];if(c===undefined)throw Error('Unknown chair paint: '+cell);return [(columns[c]+inset)/1254,1-(rows[r+1]-inset)/1254,(columns[c+1]-columns[c]-2*inset)/1254,(rows[r+1]-rows[r]-2*inset)/1254];}

export function createChairLibrary(atlas){
 const geometries=new Map(),roots=new Set();let disposed=false,greyMode=false;
 const material=new T.MeshStandardMaterial({map:atlas,roughness:1,metalness:0}),grey=new T.MeshStandardMaterial({color:0xa4a79b,roughness:1});
 material.name='Painted chair skin';
 const cache=(key,make)=>{if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);};
 function painted(g,faces){
  g.computeVertexNormals();const p=g.attributes.position,n=g.attributes.normal,uv=new Float32Array(p.count*2);g.computeBoundingBox();const b=g.boundingBox,s=b.getSize(new T.Vector3());
  for(let i=0;i<p.count;i++){
   const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));let u,v,cell;
   if(ay>=ax&&ay>=az){u=(p.getX(i)-b.min.x)/s.x;v=(p.getZ(i)-b.min.z)/s.z;cell=n.getY(i)>0?faces.top:faces.side;}
   else if(az>=ax){u=(p.getX(i)-b.min.x)/s.x;v=(p.getY(i)-b.min.y)/s.y;cell=n.getZ(i)>0?faces.front:faces.side;}
   else {u=(p.getZ(i)-b.min.z)/s.z;v=(p.getY(i)-b.min.y)/s.y;cell=faces.side;}
   const [x,y,w,h]=chairPaintRect(cell);uv[i*2]=x+u*w;uv[i*2+1]=y+v*h;
  }g.setAttribute('uv',new T.BufferAttribute(uv,2));return g;
 }
 function add(root,name,g,position,rotation=[0,0,0]){const m=new T.Mesh(g,greyMode?grey:material);m.name=name;m.position.set(...position);m.rotation.set(...rotation);m.castShadow=m.receiveShadow=true;root.add(m);return m;}
 function box(root,name,size,position,cell,rotation){const faces=typeof cell==='string'?{front:cell,top:cell,side:cell}:cell;return add(root,name,cache('box:'+size+JSON.stringify(faces),()=>painted(new T.BoxGeometry(...size),faces)),position,rotation);}
 function panel(root,name,size,position,faces,rotation){
  // An eight-sided extrusion: softened silhouette, 28 triangles, no modeled
  // buttons, seams, leather channels or stamped metal ribs.
  const [w,h,d]=size,r=Math.min(w,h)*.08,key='panel:'+size+JSON.stringify(faces);
  const g=cache(key,()=>{const s=new T.Shape();const pts=[[-w/2+r,-h/2],[w/2-r,-h/2],[w/2,-h/2+r],[w/2,h/2-r],[w/2-r,h/2],[-w/2+r,h/2],[-w/2,h/2-r],[-w/2,-h/2+r]];s.moveTo(...pts[0]);for(const p of pts.slice(1))s.lineTo(...p);s.closePath();const g=new T.ExtrudeGeometry(s,{depth:d,steps:1,bevelEnabled:false,curveSegments:1});g.translate(0,0,-d/2);return painted(g,faces);});
  return add(root,name,g,position,rotation);
 }
 function bar(root,name,a,b,width,cell,tube=false){
  const start=new T.Vector3(...a),end=new T.Vector3(...b),length=start.distanceTo(end),faces={front:cell,top:cell,side:cell};
  const g=cache('bar:'+length.toFixed(8)+':'+width+':'+cell+':'+tube,()=>painted(tube?new T.CylinderGeometry(width/2,width/2,length,6,1):new T.BoxGeometry(width,length,width),faces));
  const mesh=add(root,name,g,start.clone().add(end).multiplyScalar(.5).toArray());mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.sub(start).normalize());return mesh;
 }
 function carvedLeg(root,side,front){
  // Six-sided, connected cabriole profile. A broad knee, slim ankle and small
  // pad foot give the ornate silhouette; grain and highlights stay in paint.
  const profile=front?[[0,.360,.285,.039,.043],[.035,.363,.285,.044,.050],[.10,.358,.262,.024,.026],[.23,.343,.240,.023,.030],[.32,.368,.252,.047,.045],[.405,.355,.235,.033,.030]]:
   [[0,.370,-.300,.032,.035],[.085,.351,-.279,.024,.026],[.27,.347,-.277,.026,.030],[.405,.355,-.275,.030,.030]];
  const g=cache('cabriole:'+side+':'+front,()=>{
   const p=[],index=[],segments=6;for(const [y,x,z,rx,rz]of profile)for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2;p.push(side*x+Math.cos(a)*rx,y*(CHAIR_CONTACT.seatHeight-.075)/.405,z+Math.sin(a)*rz);}
   for(let j=0;j<profile.length-1;j++)for(let i=0;i<segments;i++){const a=j*segments+i,b=j*segments+(i+1)%segments,c=(j+1)*segments+i,d=(j+1)*segments+(i+1)%segments;index.push(a,c,b,b,c,d);}
   const top=(profile.length-1)*segments;for(let i=1;i<segments-1;i++){index.push(0,i,i+1);index.push(top,top+i+1,top+i);}
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(index);return painted(g.toNonIndexed(),{front:'walnut',top:'walnut',side:'walnut'});
  });add(root,front?'Cabriole front leg':'Shaped rear leg',g,[0,0,0]);
 }
 function build(id,{finish}={}){
  if(disposed)throw Error('Chair library disposed');const form=CHAIR_FORMS.find(f=>f.id===id);if(!form)throw Error('Unknown chair '+id);finish??=form.finishes[0];if(!form.finishes.includes(finish))throw Error('Unknown chair finish '+finish);
  const root=new T.Group();root.name=form.name;roots.add(root);
  const upholstered=id==='wingback'||id==='desk',red=finish==='russet',base=finish==='walnut'?'walnut':id==='wood'?'wood':id==='wingback'?'walnut':id==='metal'&&finish==='sage'?'metal':'iron';
  const side=upholstered?(red?'redSide':'tealSide'):base,seat=upholstered?(red?'redSeat':'tealSeat'):id==='metal'&&finish==='sage'?'metalSeat':id==='wood'&&finish==='honey'?'woodSeat':base,back=upholstered?(red?'redBack':'tealBack'):id==='metal'&&finish==='sage'?'metalBack':id==='wood'&&finish==='honey'?'woodBack':base;
  // The wingback's padding fills the shell beneath both arms and overlaps the
  // lower back. Its usable sitting area and top height stay on the shared targets.
  const seatSize=id==='wingback'?[.96,.76,.12]:[.84,.62,.08],seatPosition=[0,CHAIR_CONTACT.seatHeight-seatSize[2]/2,id==='wingback'?-.08:-.01];
  panel(root,'Shared seat',seatSize,seatPosition,{front:seat,top:side,side},[-Math.PI/2,0,0]);
  if(id==='desk'){
   bar(root,'Swivel column',[0,.12,-.01],[0,CHAIR_CONTACT.seatHeight-.08,-.01],.085,'iron',true);
   // Five spokes avoid the forward heel channel. Wheels are deliberately
   // simple hexagonal cylinders; rubber, axles and wear are painted.
   for(let i=0;i<5;i++){
    const a=(i/5)*Math.PI*2,x=Math.sin(a)*.34,z=-.01+Math.cos(a)*.34;
    bar(root,'Caster spoke',[0,.105,-.01],[x,.065,z],.035,'iron');
    const g=cache('caster',()=>painted(new T.CylinderGeometry(.055,.055,.055,6,1).rotateY(Math.PI/6),{front:'rubber',top:'rubber',side:'rubber'}));add(root,'Caster',g,[x,.055,z],[0,0,Math.PI/2]);
   }
  }else{
   if(id==='wingback')for(const s of [-1,1]){carvedLeg(root,s,true);carvedLeg(root,s,false);}
   else for(const s of [-1,1])for(const z of [-.275,.235])bar(root,'Leg',[s*.355,0,z],[s*.355,CHAIR_CONTACT.seatHeight-.075,z],id==='metal'?.044:.054,base,id==='metal');
   // Side stretchers remain outside the shared foot/heel space. No front rail.
   for(const s of [-1,1])bar(root,'Side stretcher',[s*.35,.18,-.275],[s*.35,.18,.235],.035,base,id==='metal');
  }
  for(const s of [-1,1])bar(root,'Back support',[s*.355,CHAIR_CONTACT.seatHeight-.08,-.343],[s*.355,id==='wingback'?1.35:.982,-.45],id==='metal'?.04:.05,base,id==='metal');
  if(id==='wood'){
   for(const y of [.75,.92])panel(root,'Wooden back slat',[.79,.13,.045],[0,y,-.405-(y-.75)*.08],{front:back,top:base,side:base},[-.08,0,0]);
  }else{
   const drop=.48-CHAIR_CONTACT.seatHeight,height=id==='wingback'?.965+drop:.32,y=id==='wingback'?.8775-drop/2:.825,z=id==='wingback'?-.398:-.424;
   panel(root,'Back cushion',[id==='wingback'?.90:.85,height,id==='metal'?.034:.075],[0,y,z],{front:back,top:side,side},[-.10,0,0]);
  }
  if(id==='wingback')for(const s of [-1,1]){
   // A continuous upholstered side runs from the base through the arm into
   // the wing. At the authored size, rolls leave .88 clear across and extend
   // .04 past each side of the tile; the final X/Z reduction below includes them.
   const shell=cache('wingback-side:'+side,()=>{
    const shape=new T.Shape(),outline=[[.22,.36],[.22,.49],[.15,.57],[.15,.655],[.17,.676],[-.19,.70],[-.18,.83],[-.115,1.25],[-.15,1.32],[-.23,1.36],[-.465,1.34],[-.455,.36]];
    const drop=.48-CHAIR_CONTACT.seatHeight,lower=y=>y<1?y-drop:y;
    shape.moveTo(-outline[0][0],lower(outline[0][1]));for(const [z,y]of outline.slice(1))shape.lineTo(-z,lower(y));shape.closePath();
    const g=new T.ExtrudeGeometry(shape,{depth:.06,steps:1,bevelEnabled:false,curveSegments:1});g.translate(0,0,-.03);g.rotateY(Math.PI/2);return painted(g,{front:side,top:side,side});
   });add(root,'Upholstered side',shell,[s*.47,0,0]);
   const roll=cache('wingback-arm-roll:'+side,()=>painted(new T.CylinderGeometry(.05,.05,.55,8,1).rotateX(Math.PI/2),{front:side,top:side,side}));
   add(root,'Rolled arm',roll,[s*.49,CHAIR_CONTACT.armTop-.05,-.085]);
  }
  // Apply the requested plan-size reduction to furniture only. The contact
  // anchors below are already in final dimensions; animals keep native scale.
  const furniture=new T.Group();furniture.name='Furniture forms';furniture.scale.set(S,1,S);
  for(const mesh of [...root.children])furniture.add(mesh);root.add(furniture);
  const anchors={};for(const [name,point]of Object.entries({seat:CHAIR_CONTACT.seatCenter,pelvis:CHAIR_CONTACT.pelvis,back:CHAIR_CONTACT.back,approach:CHAIR_CONTACT.approach,leftFoot:CHAIR_CONTACT.feet[0],rightFoot:CHAIR_CONTACT.feet[1]})){const a=new T.Object3D();a.name='chair-'+name;a.position.fromArray(point);root.add(a);anchors[name]=a;}
  root.userData.chair={id,finish,footprint:[1,1],paddingOverhang:Math.max(0,((id==='wingback'?1.08:1)*S-1)/2),contact:CHAIR_CONTACT,backClosed:id==='wingback',tailOutlet:id==='wingback'?null:{width:.62*S,bottom:CHAIR_CONTACT.seatHeight,top:id==='wood'?.68:.65},gameplayIntegrated:false};
  return {root,anchors,form,finish,dispose(){root.removeFromParent();roots.delete(root);}};
 }
 function setGrey(value){greyMode=!!value;for(const root of roots)root.traverse(p=>{if(p.isMesh)p.material=greyMode?grey:material;});}
 return {build,setGrey,material,stats:()=>({geometries:geometries.size,materials:2,models:roots.size}),dispose(){if(disposed)return;disposed=true;for(const r of roots)r.removeFromParent();roots.clear();for(const g of geometries.values())g.dispose();geometries.clear();material.dispose();grey.dispose();}};
}
