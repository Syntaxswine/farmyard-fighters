import * as THREE from './vendor/three.module.js';
export function createCanvasTruck(data){
 const root=new THREE.Group();root.name='canvas factory truck';
 const palette={body:0x647765,canvas:0xc0ad83,tire:0x373532,metal:0x615b50,glass:0x53636c,lamps:0xead8ad,wood:0x7c6043};
 const materials=Object.fromEntries(Object.entries(palette).map(([k,color])=>[k,new THREE.MeshStandardMaterial({color,roughness:k==='glass'?.35:.86})]));
 const grey=new THREE.MeshStandardMaterial({color:0xb4afa5,roughness:.9});
 const parts=data.parts.map(p=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p.position,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(p.normal,3));g.setIndex(p.index);g.computeBoundingSphere();const m=new THREE.Mesh(g,materials[p.material]);m.name=p.name;m.userData.material=p.material;m.castShadow=m.receiveShadow=true;root.add(m);return m;});
 return {root,parts,materials,grey,setGrey(value){parts.forEach((p,i)=>p.material=value?grey:materials[data.parts[i].material]);},dispose(){parts.forEach(p=>p.geometry.dispose());Object.values(materials).forEach(m=>m.dispose());grey.dispose();}};
}
