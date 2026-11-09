import * as T from './vendor/three.module.js';
export const HEN_FRAME={width:1.16,height:2.32,centerY:.825,distance:4,near:.1,far:10};
export const HEN_PAINT='../assets/characters/lowpoly-proof/hen-model-paint-v1.png';
// Bird-specific articulation. Wings retain feathered tips; weapon grips are a
// separate design problem and are deliberately absent from this neutral study.
export function createHen(data){
 const root=new T.Group(),rig=new T.Group();root.add(rig);const bones=[],rest=[],lookup={};
 function bone(name,parent,p){const b=new T.Bone(),id=bones.length;b.name=name;bones.push(b);rest.push(new T.Vector3(...p));lookup[name]=id;if(parent===null){rig.add(b);b.position.copy(rest[id]);}else{bones[parent].add(b);b.position.copy(rest[id]).sub(rest[parent]);}return id;}
 const hips=bone('pelvis',null,[0,.77,0]),spine=bone('breast',hips,[0,1.05,0]),head=bone('head',spine,[0,1.26,0]),wing={},tip={},leg={},foot={};
 for(const s of [-1,1]){wing[s]=bone('wing '+s,spine,[0,1.13,s*.302]);tip[s]=bone('wing tip '+s,wing[s],[-.10,.83,s*.355]);leg[s]=bone('shank '+s,hips,[-.02,.29,s*.157]);foot[s]=bone('foot '+s,leg[s],[0,.06,s*.157]);}
 root.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones);skeleton.calculateInverses();
 const grey=new T.MeshStandardMaterial({color:0x999999,roughness:.88}),material=new T.MeshStandardMaterial({color:0xffffff,roughness:.92}),parts=[],materials=[];
 function weights(name,[x,y,z]){const s=z<0?-1:1;if(name==='head and feathered neck'){const t=T.MathUtils.smoothstep(y,1.16,1.30);return [[spine,1-t],[head,t]];}if(/head|comb|beak|wattles/.test(name))return [[head,1]];if(name.includes('wing')){const t=(1-T.MathUtils.smoothstep(y,.66,.95))*.45;return [[wing[s],1-t],[tip[s],t]];}if(name.includes('toes')){const t=1-T.MathUtils.smoothstep(y,.08,.19);return [[leg[s],1-t],[foot[s],t]];}if(name.includes('tail')||name.includes('apron'))return [[hips,1]];const t=T.MathUtils.smoothstep(y,.80,1.06);return [[hips,1-t],[spine,t]];}
 for(const p of data.parts){const g=new T.BufferGeometry(),si=[],sw=[];for(let i=0;i<p.position.length;i+=3){const w=weights(p.name,p.position.slice(i,i+3));while(w.length<4)w.push([0,0]);si.push(...w.map(v=>v[0]));sw.push(...w.map(v=>v[1]));}
  g.setAttribute('position',new T.Float32BufferAttribute(p.position,3));g.setAttribute('normal',new T.Float32BufferAttribute(p.normal,3));g.setAttribute('paintPosition',new T.Float32BufferAttribute(p.paintPosition||p.position,3));g.setAttribute('paintNormal',new T.Float32BufferAttribute(p.paintNormal||p.normal,3));g.setAttribute('skinIndex',new T.Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(sw,4));g.setIndex(p.index);
  const color=/comb|wattles/.test(p.name)?0xbc3525:/beak|toes/.test(p.name)?0xe1a632:p.name.includes('waistcoat')?0x666934:p.name.includes('apron')?0xe9d7ae:0xa8572b;
  const m=new T.MeshStandardMaterial({color,roughness:.9});materials.push(m);const mesh=new T.SkinnedMesh(g,m);mesh.name=p.name;mesh.frustumCulled=false;root.add(mesh);mesh.bind(skeleton);parts.push(mesh);
 }
 function pose(mode='neutral',heading=0){for(const b of bones)b.quaternion.identity();root.rotation.y=heading*Math.PI/180;if(mode==='spread')for(const s of [-1,1]){bones[wing[s]].rotation.x=-s*.25;bones[tip[s]].rotation.x=-s*.10;}root.updateMatrixWorld(true);skeleton.update();}
 function diagnostics(){const box=new T.Box3();for(const m of parts){const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++)box.expandByPoint(m.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(a,i)).applyMatrix4(m.matrixWorld));}return {triangles:data.triangles,bones:bones.length,skinnedMeshes:parts.length,min:box.min.toArray(),max:box.max.toArray(),contacts:[],rifleTriangles:0};}
 pose();return {root,rig,bones,parts,skeleton,grey,material,pose,diagnostics,setGrey:v=>parts.forEach((p,i)=>p.material=v?grey:materials[i]),dispose(){parts.forEach(p=>p.geometry.dispose());materials.forEach(m=>m.dispose());grey.dispose();material.dispose();skeleton.dispose();}};
}
