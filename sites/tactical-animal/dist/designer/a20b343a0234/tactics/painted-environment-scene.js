import * as THREE from './vendor/three.module.js';
export const PAINTED_ATLAS='../assets/environment/painted-study/material-atlas-v2.png';
export const STUDY_LAYOUT={wallHeight:2,doorHeight:1.65,doorWidth:1,crate:[1,0,2],barrel:[3,0,2],horse:[2,0,2.45]};
// Closed rounded box: coherent rounded corners, with real bevels on every face.
export function softBox(w,h,d,r=.012,detail=2){
 r=Math.min(r,w/4,h/4,d/4);const shape=new THREE.Shape(),x=-w/2,y=-h/2;
 shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
 const g=new THREE.ExtrudeGeometry(shape,{depth:d-2*r,bevelEnabled:true,bevelSize:r*.48,bevelThickness:r,bevelSegments:detail,steps:1,curveSegments:detail+1});g.translate(0,0,-d/2+r);g.computeVertexNormals();
 // Local triplanar-style UVs follow boards rather than stretching an atlas over caps.
 const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
 for(let i=0;i<p.count;i++){const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));let u,v;if(ny>nx&&ny>nz){u=p.getX(i)/w+.5;v=p.getZ(i)/d+.5;}else if(nx>nz){u=p.getZ(i)/d+.5;v=p.getY(i)/h+.5;}else{u=p.getX(i)/w+.5;v=p.getY(i)/h+.5;}uv.setXY(i,u,v);}return g;
}
export function createPaintedEnvironment(atlas){
 const root=new THREE.Group(),geometries=[],materials=[],textures=[],rand=n=>{const x=Math.sin(n*127.1+31.7)*43758.5453;return x-Math.floor(x);};
 function paint(quadrant,index=0,color=0xffffff){const t=atlas.clone(),origin=[[0,.5],[.5,.5],[0,0],[.5,0]][quadrant],crop=quadrant===2?.475:quadrant===0?.14:quadrant===1?.16:.30;const vertical=quadrant===0?crop*.6:quadrant===1?.32:crop;t.offset.set(origin[0]+.012+rand(index+1)*(.475-crop),origin[1]+.012+rand(index+22)*(.475-vertical));t.repeat.set(crop,vertical);t.needsUpdate=true;textures.push(t);const m=new THREE.MeshStandardMaterial({map:t,color,roughness:quadrant===2?.8:.96});if(quadrant===0||quadrant===1){const strength=quadrant===0?(index%5===0?.72:.18+rand(index+7)*.14):.58,tone=quadrant===0?[.20,.105,.07]:[.22,.13,.055],value=.86+rand(index+51)*.27;m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb=mix(vec3('+tone.map(n=>(n*value).toFixed(5)).join(',')+'),diffuseColor.rgb,'+strength.toFixed(4)+');');};m.customProgramCacheKey=()=> 'painted-quiet-v3-'+quadrant+'-'+index;}materials.push(m);return m;}
 function plain(color){const m=new THREE.MeshStandardMaterial({color,roughness:.9});materials.push(m);return m;}
 const mortar=paint(3,3,0x9d8c78),wood=Array.from({length:8},(_,i)=>paint(1,i,new THREE.Color().setHSL(.085,.19,.66+rand(i)*.13))),brick=Array.from({length:16},(_,i)=>paint(0,i,new THREE.Color().setHSL(.035+rand(i)*.025,.12,.65+rand(i+4)*.2))),steel=paint(2,0,0xc2d7da),iron=plain(0x45413b),rub=plain(0xc7a477);
 const stone=Array.from({length:6},(_,i)=>{
  const m=paint(3,12+i,[0xb8ae97,0xa99f89,0xc2b59b,0xaca593,0xb4a48b,0xc0b59e][i]);
  // Broad, placed runoff and foot-level dirt, not an all-over noise/damage layer.
  m.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStudyStone;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvStudyStone=(modelMatrix*vec4(transformed,1.0)).xyz;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vStudyStone;').replace('#include <map_fragment>',`#include <map_fragment>
    float foot=(1.-smoothstep(.04,.50,vStudyStone.y))*.65;
    float runoff=(1.-smoothstep(.015,.095,abs(vStudyStone.x-.31)))*.5+(1.-smoothstep(.018,.085,abs(vStudyStone.x-3.22)))*.4;
    float lip=(1.-smoothstep(2.005,2.07,vStudyStone.y))*step(1.95,vStudyStone.y);
    float jamb=(1.-smoothstep(.05,.20,abs(vStudyStone.y-.93)))*.20;
    float stain=clamp(foot+runoff*.7+lip*.23+jamb,0.,.8);
    diffuseColor.rgb*=mix(vec3(1.),vec3(.48,.51,.48),stain);
   `);
  };m.customProgramCacheKey=()=> 'weathered-study-stone-v1';return m;
 });
 function mesh(g,m,c,r=[0,0,0]){geometries.push(g);const o=new THREE.Mesh(g,m);o.position.set(...c);o.rotation.set(...r);o.castShadow=o.receiveShadow=true;root.add(o);return o;}
 const box=(m,c,s,r,bevel=.012)=>mesh(softBox(...s,bevel),m,c,r);
 // Recessed mortar volumes preserve exactly the one-tile doorway and lintel.
 box(mortar,[.5,1,.5],[2,2,.19]);box(mortar,[3.5,1,.5],[2,2,.19]);box(mortar,[2,1.825,.5],[1,.35,.19]);
 function wornPart(material,center,size,seed,r=.009){
  const g=softBox(...size,r,1),p=g.attributes.position,side=rand(seed)>.5?1:-1,front=rand(seed+3)>.5?1:-1,chip=seed%4===0?.027:.012;
  // Displace coincident vertices identically to nick one exposed corner without holes.
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),distance=Math.abs(x-side*size[0]/2)+Math.abs(y-size[1]/2)+Math.abs(z-front*size[2]/2),f=Math.max(0,1-distance/(chip*2));p.setXYZ(i,x-side*chip*.45*f,y-chip*.48*f,z-front*chip*.32*f);}
  g.computeVertexNormals();return mesh(g,material,center);
 }
 const courseWeights=Array.from({length:12},(_,i)=>.16+rand(i+301)*.014),courseSum=courseWeights.reduce((a,b)=>a+b,0);let bottom=0;
 for(let row=0;row<12;row++){
  const height=courseWeights[row]/courseSum*2;let left=-.5-(row%2)*.17;
  for(let col=0;left<4.5;col++){
   const seed=row*31+col,width=.325+rand(seed+57)*.06,right=left+width,a=Math.max(-.5,left),b=Math.min(4.5,right);
   for(const [lo,hi]of bottom<1.66?[[-.5,1.5],[2.5,4.5]]:[[-.5,4.5]]){
    const l=Math.max(a,lo),u=Math.min(b,hi);if(u-l<.045)continue;
    const o=wornPart(brick[Math.floor(rand(seed+91)*16)],[(l+u)/2,bottom+height/2,.5+(rand(seed)-.5)*.019],[u-l-.018,height-.018,.264+(rand(seed+19)-.5)*.023],seed,.007);
    o.rotation.z=(rand(seed+12)-.5)*.018;o.name='painted-brick';
   }
   left=right;
  }
  bottom+=height;
 }
 // Age the existing trim locally: varied stone, nicked corners and placed dirt.
 wornPart(stone[2],[2,1.704,.5],[1.07,.105,.29],48,.014);
 for(const [side,x]of [1.47,2.53].entries())for(let i=0;i<6;i++)wornPart(stone[(i+side*2)%6],[x,(i+.5)*.275,.5],[.06,.265,.28],i+side*8,.008);
 for(let i=0;i<10;i++)wornPart(stone[(i*5)%6],[-.25+i*.5,2.019+(rand(i+77)-.5)*.01,.5],[.482,.082+(rand(i+88)-.5)*.008,.31],i+20,.012);
 // Crate: individual boards and cross-bracing. Grain follows each board's axis.
 const [cx,,cz]=STUDY_LAYOUT.crate;
 box(plain(0x372921),[cx,.39,cz],[.75,.76,.75],undefined,.018);
 for(let i=0;i<4;i++)for(const side of [-1,1]){
  const t=(i-1.5)*.202;box(wood[(i+(side+1)*2)%8],[cx+t,.405,cz+side*.407],[.197,.77,.055],undefined,.008);
  box(wood[(i+3)%8],[cx+side*.407,.405,cz+t],[.197,.77,.055],[0,Math.PI/2,0],.008);
 }
 for(let i=0;i<4;i++)box(wood[i],[cx+(i-1.5)*.202,.802,cz],[.197,.83,.045],[Math.PI/2,0,0],.008);
 for(const side of [-1,1])for(const y of [.105,.70])box(wood[side+3],[cx,y,cz+side*.453],[.125,.9,.05],[0,0,Math.PI/2],.009);
 for(const side of [-1,1])box(wood[7],[cx,.405,cz+side*.49],[.105,.84,.045],[0,0,-.72],.009);
 // Localized nail heads and rubbed edge accents, rather than uniform outlines.
 for(const x of [-.32,.32])for(const y of [.11,.7])for(const side of [-1,1])mesh(new THREE.CylinderGeometry(.017,.017,.012,8),iron,[cx+x,y,cz+side*.485],[Math.PI/2,0,0]);
 for(const [x,y,length]of [[-.18,.759,.22],[.27,.058,.12]])box(rub,[cx+x,y,cz+.482],[length,.008,.008],undefined,.002);
 // Drum shell has rolled shoulders, a slight belly, a shallow dent and separate lid.
 const [bx,,bz]=STUDY_LAYOUT.barrel,profile=[[.285,.025],[.309,.05],[.317,.13],[.325,.34],[.321,.61],[.308,.755],[.29,.78]],g=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),32);
 const pos=g.attributes.position;for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),angle=Math.atan2(x,z),dent=.022*Math.exp(-Math.pow((angle-.9)/.25,2)-Math.pow((y-.46)/.14,2));pos.setXYZ(i,x*(1-dent/.325),y,z*(1-dent/.325));}g.computeVertexNormals();mesh(g,steel,[bx,0,bz]);
 const lid=mesh(new THREE.CylinderGeometry(.292,.292,.018,32),steel,[bx,.779,bz]);lid.name='drum-lid';
 for(const y of [.055,.20,.61,.765])mesh(new THREE.TorusGeometry(y===.055||y===.765?.308:.326,.014,6,32),iron,[bx,y,bz],[Math.PI/2,0,0]);
 mesh(new THREE.CylinderGeometry(.037,.037,.014,12),iron,[bx+.12,.796,bz+.085]);mesh(new THREE.TorusGeometry(.039,.006,5,16),rub,[bx+.12,.804,bz+.085],[Math.PI/2,0,0]);
 const floor=paint(3,9,0xc1b4a0);floor.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb=mix(vec3(.27,.235,.195),diffuseColor.rgb,.25);');};floor.customProgramCacheKey=()=> 'quiet-painted-floor-v1';box(floor,[2,-.075,1.5],[5,.13,4],undefined,.025);
 return {root,materials,dispose(){for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();},diagnostics(){return {meshes:root.children.length,triangles:root.children.reduce((n,o)=>n+(o.geometry.index?.count||o.geometry.attributes.position.count)/3,0)};}};
}
