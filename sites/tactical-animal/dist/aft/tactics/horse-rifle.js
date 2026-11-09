import * as THREE from './vendor/three.module.js';
// Independent rifle asset; local +X follows the bore. Contacts are in asset space.
export function createWorkerRifle(texture=null){
 const root=new THREE.Group();root.name='worker rifle';const parts=[];
 const wood=new THREE.MeshStandardMaterial({map:texture,color:0xd6b090,roughness:.86}),steel=new THREE.MeshStandardMaterial({color:0x43484b,roughness:.55,metalness:.55});
 function add(g,mat,name){if(mat===wood){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(.03+uv.getX(i)*.94)/4,1-(2.03+uv.getY(i)*.94)/4);}const m=new THREE.Mesh(g,mat);m.name=name;root.add(m);parts.push(m);return m;}
 const outline=new THREE.Shape();outline.moveTo(-.30,-.082);outline.lineTo(-.30,.023);outline.lineTo(-.22,.018);outline.lineTo(-.12,-.006);outline.lineTo(-.055,-.015);outline.lineTo(-.012,-.036);outline.lineTo(-.044,-.063);outline.lineTo(-.14,-.042);outline.closePath();
 const stock=new THREE.ExtrudeGeometry(outline,{depth:.047,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.006,bevelThickness:.004});stock.translate(0,0,-.0235);add(stock,wood,'wooden shoulder stock');
 const receiver=add(new THREE.BoxGeometry(.18,.038,.042),steel,'receiver');receiver.position.set(.065,.003,0);
 const fore=add(new THREE.CapsuleGeometry(.022,.21,3,8),wood,'wooden fore-end');fore.rotation.z=-Math.PI/2;fore.position.set(.205,-.018,0);
 const barrelG=new THREE.CylinderGeometry(.010,.013,.39,12);barrelG.rotateZ(-Math.PI/2);barrelG.translate(.315,.020,0);const barrel=add(barrelG,steel,'barrel');
 const bore=add(new THREE.CircleGeometry(.007,12),new THREE.MeshBasicMaterial({color:0x080908}),'muzzle opening');bore.rotation.y=Math.PI/2;bore.position.set(.5101,.020,0);
 const sight=add(new THREE.BoxGeometry(.012,.019,.009),steel,'front sight');sight.position.set(.480,.036,0);
 const guard=add(new THREE.TorusGeometry(.027,.004,5,12),steel,'trigger guard');guard.scale.x=1.25;guard.position.set(.004,-.044,0);
 const bolt=add(new THREE.CylinderGeometry(.004,.004,.042,6),steel,'bolt handle');bolt.rotation.x=Math.PI/2;bolt.position.set(.055,.005,.035);
 const knob=add(new THREE.SphereGeometry(.010,8,6),steel,'bolt knob');knob.position.set(.055,.005,.058);
 const anchors={};for(const [name,p] of Object.entries({stock:[-.30,-.025,0],grip:[-.025,-.050,0],support:[.225,-.044,0],muzzle:[.510,.020,0]})){const a=new THREE.Object3D();a.name=name;a.position.fromArray(p);root.add(a);anchors[name]=a;}
 return {root,parts,anchors,barrel,triangles:parts.reduce((n,p)=>n+(p.geometry.index?.count||p.geometry.attributes.position.count)/3,0),dispose(){for(const p of parts)p.geometry.dispose();for(const m of new Set(parts.map(p=>p.material)))m.dispose();}};
}
