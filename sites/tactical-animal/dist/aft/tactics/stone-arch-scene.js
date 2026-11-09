import * as T from './vendor/three.module.js';
import {stoneArchData} from './stone-arch-geometry.js';

// Painted strata and chipped highlights share a small skin across both sizes.
function rockTexture(){
 const size=256,pixels=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const broad=Math.sin(x*.09+Math.sin(y*.044)*2)*5+Math.cos(x*.023-y*.038)*7,grain=Math.sin(x*12.9898+y*78.233)*43758.5453%1;
  const seam=(y+4*Math.sin(x*.035)+2*Math.sin(x*.13))%39,strata=seam<1.5?-23:seam<3?13:0,light=broad+grain*5+strata;
  const i=(y*size+x)*4;pixels[i]=145+light;pixels[i+1]=133+light;pixels[i+2]=105+light;pixels[i+3]=255;
 }
 const texture=new T.DataTexture(pixels,size,size);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.needsUpdate=true;return texture;
}
export function createStoneArchLibrary(){
 const texture=rockTexture(),materials=[new T.MeshStandardMaterial({map:texture,roughness:1,side:T.DoubleSide}),new T.MeshStandardMaterial({map:texture,color:0xc0c49c,roughness:1,side:T.DoubleSide})],geometries=new Map();
 return {build(kind){let geometry=geometries.get(kind);if(!geometry){const data=stoneArchData(kind),positions=[[],[]],uv=[[],[]];
   // Group by the two materials once; a group per triangle made this tiny
   // mesh submit 88 draws in every scene/light pass.
   for(let i=0;i<data.triangles.length;i+=9){const face=data.surfaces[i/9],material=face==='top'?1:0;for(let j=0;j<9;j+=3){const [x,y,h]=data.triangles.slice(i+j,i+j+3);positions[material].push(x,h,y);uv[material].push(x/3,(face==='top'?y:h)/2);} }
   geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions.flat(),3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv.flat(),2));geometry.computeVertexNormals();let start=0;for(let material=0;material<positions.length;material++){const count=positions[material].length/3;if(count)geometry.addGroup(start,count,material);start+=count;}geometry.computeBoundingSphere();geometries.set(kind,geometry);
  }
  const root=new T.Group(),mesh=new T.Mesh(geometry,materials);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);root.name=kind;return {root,dispose(){root.clear();}};
 },dispose(){for(const g of geometries.values())g.dispose();for(const m of materials)m.dispose();texture.dispose();}};
}
