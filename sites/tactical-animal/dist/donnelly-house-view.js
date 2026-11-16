import {createRoofGroup} from './mission-art/mount-dora/source/packages/roof-core/three.js';

// Only the closed attic/roof is decorative. Playable walls, windows, floor
// apertures and every door remain the ordinary TownInteriorScenery geometry.
export function createDonnellyRoof(T,roof){
 const root=new T.Group(),surfaces=[],geometries=new Set(),materials=new Set();
 root.name='Pinned Nautilus Donnelly roof';
 const material=(color,extra={})=>{const m=new T.MeshStandardMaterial({color,roughness:.87,...extra});materials.add(m);return m;};
 const metal=material(0xb2c5d0,{metalness:.08,vertexColors:true}),siding=material(0xe7c467),trim=material(0xf4ecd9);
 const origin=[Math.min(...roof.surfaces.map(s=>s.x))-2,Math.min(...roof.surfaces.map(s=>s.y))-2];
 for(const spec of roof.surfaces){const view=createRoofGroup(T,{...spec,x:spec.x-origin[0],y:spec.y-origin[1]},{materialMap:{metal,fascia:trim,soffit:trim}});view.position.set(origin[0],0,origin[1]);root.add(view);surfaces.push(view);
  if(spec.style==='gable'){
   const rise=Math.tan(spec.pitch*Math.PI/180)*spec.depth/2,base=4.24;
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([spec.x+spec.width,base,spec.y,spec.x+spec.width,base+rise,spec.y+spec.depth/2,spec.x+spec.width,base,spec.y+spec.depth],3));g.computeVertexNormals();geometries.add(g);
   const m=material(0xe7c467,{side:T.DoubleSide}),mesh=new T.Mesh(g,m);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
  }
 }
 const turret=roof.turret,add=(geometry,mat,y)=>{geometries.add(geometry);const mesh=new T.Mesh(geometry,mat);mesh.position.set(turret.centre[0],y,turret.centre[1]);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);};
 add(new T.CylinderGeometry(turret.radius,turret.radius,turret.drumTop-turret.base,turret.sides),siding,(turret.base+turret.drumTop)/2);
 for(const y of [turret.base,turret.drumTop])add(new T.CylinderGeometry(turret.radius+.1,turret.radius+.1,.12,turret.sides),trim,y);
 add(new T.LatheGeometry(turret.rings.map(([h,r])=>new T.Vector2(r,h)),turret.sides),material(0xb2c5d0,{metalness:.08}),turret.drumTop);
 root.userData={profile:'donnelly-v1',turretSides:turret.sides,roofStyles:roof.surfaces.map(s=>s.style),attic:roof.attic};
 return {root,dispose(){root.removeFromParent();for(const s of surfaces)s.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();root.clear();}};
}
