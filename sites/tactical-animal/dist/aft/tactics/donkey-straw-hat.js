import * as T from './vendor/three.module.js';
// Authored in donkey bind coordinates, then attached in head-bone space.
export function createDonkeyStrawHat(worker){
 const head=worker.bones.find(b=>b.name==='head');if(!head)throw Error('Donkey hat requires the head bone');
 worker.root.updateMatrixWorld(true);const root=new T.Group();root.name='Town guide straw hat';
 const straw=new T.MeshStandardMaterial({color:0xd9b46b,roughness:.95,side:T.DoubleSide});
 straw.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStraw;').replace('#include <begin_vertex>','#include <begin_vertex>\nvStraw=position;');s.fragmentShader='varying vec3 vStraw;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float braid=sin((vStraw.x+vStraw.z)*700.)*sin((vStraw.x-vStraw.z)*640.+vStraw.y*900.);
 diffuseColor.rgb*=.89+.11*braid;`);};straw.customProgramCacheKey=()=> 'donkey-woven-straw-v1';
 const ribbon=new T.MeshStandardMaterial({color:0x214760,roughness:.85}),thread=new T.MeshStandardMaterial({color:0xa0783d,roughness:1});
 const ellipse=(x,z,rx,rz,hole=false)=>{const p=hole?new T.Path():new T.Shape();p.absellipse(x,z,rx,rz,0,Math.PI*2,hole,0);return p;};
 const inverse=worker.skeleton.boneInverses[worker.bones.indexOf(head)].clone(),geometries=[];
 function add(g,material,name){g.translate(0,.025,0);g.applyMatrix4(inverse);geometries.push(g);const m=new T.Mesh(g,material);m.name=name;m.castShadow=m.receiveShadow=true;root.add(m);return m;}
 function flat(shape,y,curl=false){const g=new T.ShapeGeometry(shape,64),a=g.attributes.position;for(let i=0;i<a.count;i++){const x=a.getX(i),z=a.getY(i),r=Math.hypot((x+.035)/.30,z/.25);a.setXYZ(i,x,y+(curl?.025*Math.pow(r,3):0),z);}g.computeVertexNormals();return g;}
 const brim=ellipse(-.035,0,.295,.25);brim.holes.push(ellipse(-.035,0,.14,.116,true));add(flat(brim,1.505,true),straw,'Broad woven brim');
 const wall=new T.CylinderGeometry(1,1.05,.092,64,1,true);wall.scale(.14,1,.127);wall.translate(-.035,1.551,0);add(wall,straw,'Open straw crown');
 const top=ellipse(-.035,0,.14,.127);for(const side of [-1,1])top.holes.push(ellipse(-.063,side*.078,.029,.043,true));add(flat(top,1.597),straw,'Crown with two ear openings');
 const band=new T.CylinderGeometry(1,1.03,.022,64,1,true);band.scale(.145,1,.132);band.translate(-.035,1.527,0);add(band,ribbon,'Blue hat band');
 for(const side of [-1,1]){const points=Array.from({length:65},(_,i)=>{const a=i/64*Math.PI*2;return new T.Vector3(-.063+.029*Math.cos(a),1.599,side*.078+.043*Math.sin(a));});add(new T.TubeGeometry(new T.CatmullRomCurve3(points),64,.0018,5,false),thread,'Bound ear opening '+side);}
 head.add(root);let disposed=false;return {root,dispose(){if(disposed)return;disposed=true;root.removeFromParent();geometries.forEach(g=>g.dispose());straw.dispose();ribbon.dispose();thread.dispose();}};
}
