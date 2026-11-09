import * as T from './vendor/three.module.js';
import {softBox} from './painted-environment-scene.js';
import {conveyorVariant,CONVEYOR_PORTS} from './conveyor-connections.js';
export const CONVEYOR_HEIGHT=.66;
// Each tile owns its undercarriage; shared ports terminate exactly at half-tile boundaries.
export function createConveyorLibrary(cargo,steel){
 const geometries=[],textures=[],materials=[],cache=new Map();let disposed=false;
 function mat(color,source,rect){const t=source.clone();t.offset.set(rect[0],rect[1]);t.repeat.set(rect[2],rect[3]);t.needsUpdate=true;textures.push(t);const m=new T.MeshStandardMaterial({color,map:t,roughness:.88});materials.push(m);return m;}
 const frame=mat(0xd6bf93,cargo,[1/3,0,1/3,.5]),iron=mat(0x8c8c83,steel,[1240/1536,149/1024,75/1536,100/1024]),belt=mat(0x484b48,steel,[1240/1536,149/1024,75/1536,100/1024]),edge=mat(0xb0a993,steel,[1240/1536,149/1024,75/1536,100/1024]);
 function mesh(root,name,g,m,p,r=[0,0,0]){geometries.push(g);const o=new T.Mesh(g,m);o.name=name;o.position.set(...p);o.rotation.set(...r);o.castShadow=o.receiveShadow=true;root.add(o);return o;}
 function box(root,name,m,p,size,ry=0){return mesh(root,name,softBox(...size,.006,1),m,p,[0,ry,0]);}
 // Shared cross-section for straight and bent runs: width, height and paint coordinates agree at ports.
 function sweep(root,name,material,width,height,y,path,length,segments=1,offset=0){
 const profile=[[-width/2,-height/2],[width/2,-height/2],[width/2,height/2],[-width/2,height/2]],positions=[],uv=[],indices=[];
 for(let face=0;face<4;face++){const first=positions.length/3;for(let i=0;i<=segments;i++){const t=i/segments,{x,z,nx,nz}=path(t);for(const j of [face,(face+1)%4]){const [u,v]=profile[j];positions.push(x+(u+offset)*nx,y+v,z+(u+offset)*nz);uv.push(t*length,(face%2?v/height:u/width)+.5);}}for(let i=0;i<segments;i++){const a=first+i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}
 // End caps share the same profile; no longitudinal bevel creates a dip at a tile seam.
 for(const t of [0,1]){const start=positions.length/3,{x,z,nx,nz}=path(t);for(const [u,v]of profile){positions.push(x+(u+offset)*nx,y+v,z+(u+offset)*nz);uv.push(u/width+.5,v/height+.5);}if(t===0)indices.push(start,start+2,start+1,start,start+3,start+2);else indices.push(start,start+1,start+2,start,start+2,start+3);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return mesh(root,name,g,material,[0,0,0]);
 }
 function roller(root,x,z,length=.64,ry=0){mesh(root,'end roller',new T.CylinderGeometry(.048,.048,length,16),iron,[x,.611,z],[0,ry,Math.PI/2]);}
 function build(mask){if(disposed)throw Error('Conveyor library disposed');if(cache.has(mask))return cache.get(mask).clone(true);const variant=conveyorVariant(mask),root=new T.Group();root.name='conveyor-'+variant.kind;root.userData={...variant,tiles:[1,1],ports:variant.ports};
 // Curved tiles put their legs under the curved deck, not outside its cutout.
 const corner=variant.kind==='corner',turn=corner?[3,6,12,9].indexOf(mask)*-Math.PI/2:0;
 const footPoints=corner?[.35,1.22].flatMap(a=>[.25,.75].map(r=>{const x=.5-r*Math.cos(a),z=-.5+r*Math.sin(a);return [x*Math.cos(turn)+z*Math.sin(turn),-x*Math.sin(turn)+z*Math.cos(turn)];})):[[-.26,-.26],[-.26,.26],[.26,-.26],[.26,.26]];
 for(const [x,z] of footPoints){box(root,'foot',iron,[x,.025,z],[.14,.05,.14]);box(root,'square leg',frame,[x,.29,z],[.06,.53,.06]);mesh(root,'foot bolt',new T.CylinderGeometry(.014,.014,.014,8),edge,[x+.04,.057,z]);}
 if(!corner){for(const x of [-.26,.26])box(root,'lower stretcher',iron,[x,.19,0],[.035,.035,.54]);box(root,'cross brace',frame,[0,.43,0],[.58,.065,.075]);}
 const straight=(angle,end=false,isolated=false)=>{const section=new T.Group();root.add(section);section.rotation.y=angle;const min=isolated?-.34:-.5,max=end||isolated?.34:.5,length=max-min;
 const path=t=>({x:0,z:min+t*length,nx:1,nz:0});
 sweep(section,'belt bed',iron,.72,.10,.567,path,length);sweep(section,'rubber belt',belt,.65,.04,.631,path,length);
 for(let z=min+.035;z<max-.02;z+=.08333)box(section,'belt transverse seam',iron,[0,.655,z],[.638,.006,.009]);
 for(const x of [-.366,.366]){sweep(section,'painted side rail',frame,.058,.14,.615,path,length,1,x);for(const z of [min+.1,max-.1])mesh(section,'bearing bolt',new T.CylinderGeometry(.022,.022,.017,8),edge,[x+Math.sign(x)*.032,.605,z],[0,0,Math.PI/2]);}
 if(end||isolated){roller(section,0,max-.025);box(section,'terminal guard',frame,[0,.55,max+.025],[.76,.09,.035]);}if(isolated)roller(section,0,min+.025);
 };
 if(variant.kind==='isolated')straight(0,false,true);
 else if(variant.kind==='end'){const i=CONVEYOR_PORTS.findIndex(p=>mask&p.bit);straight(-i*Math.PI/2,true);}
 else if(variant.kind==='straight')straight(mask===5?0:Math.PI/2);
 else if(variant.kind==='corner'){
 const index=[3,6,12,9].indexOf(mask),section=new T.Group();section.rotation.y=-index*Math.PI/2;root.add(section);
 const length=Math.PI/4,path=t=>{const a=t*Math.PI/2;return {x:.5-.5*Math.cos(a),z:-.5+.5*Math.sin(a),nx:Math.cos(a),nz:-Math.sin(a)};};
 sweep(section,'curved belt bed',iron,.72,.10,.567,path,length,48);
 sweep(section,'curved belt deck',belt,.65,.04,.631,path,length,48);
 for(const offset of [-.366,.366])sweep(section,'curved painted guard',frame,.058,.14,.615,path,length,48,offset);
 for(let distance=.035;distance<length-.02;distance+=.08333){const seamPath=t=>path((distance+(t-.5)*.009)/length);sweep(section,'radial belt seam',iron,.638,.006,.655,seamPath,.009,2);}
 for(const a of [.35,1.22])box(section,'curved deck cross brace',frame,[.5-.5*Math.cos(a),.43,-.5+.5*Math.sin(a)],[.64,.065,.075],a);

 }else{
 box(root,'transfer table frame',frame,[0,.56,0],[.76,.12,.76]);box(root,'transfer table inset',belt,[0,.628,0],[.67,.035,.67]);
 // Omnidirectional ball-transfer table makes branches distinct from belt crossings.
 for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)mesh(root,'transfer ball',new T.SphereGeometry(.029,10,6),edge,[x*.12,.638,z*.12]);
 for(const p of CONVEYOR_PORTS){const section=new T.Group();section.rotation.y=-CONVEYOR_PORTS.indexOf(p)*Math.PI/2;root.add(section);if(mask&p.bit){box(section,'junction approach',belt,[0,.628,-.423],[.65,.042,.154]);for(const z of [-.48,-.40])box(section,'approach seam',iron,[0,.654,z],[.64,.006,.008]);for(const x of [-.366,.366])box(section,'approach rail',frame,[x,.615,-.427],[.058,.14,.146]);}else box(section,'closed junction guard',frame,[0,.64,-.366],[.76,.14,.055]);}
 }
 root.updateMatrixWorld(true);cache.set(mask,root);return root.clone(true);}
 return {build,setWireframe(value){materials.forEach(m=>m.wireframe=!!value);},stats:()=>({variants:cache.size,geometries:geometries.length}),dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());cache.clear();}};
}
