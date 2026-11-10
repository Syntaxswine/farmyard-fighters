import {groundHash} from './aft/tactics/biome-ground-composition.js';

export const MATURE_PINE_STYLES=Object.freeze([
  {radius:.31,trunkHeight:12.2,crownWidth:10.7,turn:.18},
  {radius:.34,trunkHeight:13.5,crownWidth:11.7,turn:1.29},
  {radius:.37,trunkHeight:14.7,crownWidth:12.6,turn:2.38}
].map(Object.freeze));

// The 30 m cells divide a 240 m sector. The inset leaves 17 m between
// winners even across a sector edge, without consulting resident neighbours.
const CELL=30,INSET=8;
export function maturePinesForSector(props,origin){
  const winners=new Map();
  for(const prop of props){
    const metadata=prop?.mountDora;
    if(prop?.kind!=='tree-pine'&&prop?.kind!=='tree-pine-large')continue;
    if(metadata?.placement!=='declared-seeded-greenery'||metadata.sourceId!==null||
       !['park','wood'].includes(metadata.habitat))continue;
    if(!Number.isInteger(prop.x)||!Number.isInteger(prop.y))continue;
    const x=origin.x+prop.x,y=origin.y+prop.y,dx=x%CELL,dy=y%CELL;
    if(dx<INSET||dy<INSET||dx>=CELL-INSET||dy>=CELL-INSET)continue;
    const key=(x-dx)+','+(y-dy);
    const rank=(prop.kind==='tree-pine-large'?1:0)+groundHash(x,y,2117);
    const prior=winners.get(key);
    if(!prior||rank>prior.rank||(rank===prior.rank&&(y<prior.y||y===prior.y&&x<prior.x)))winners.set(key,{prop,x,y,rank});
  }
  return new Map([...winners.values()].map(({prop,x,y})=>
    [prop,Math.floor(groundHash(x,y,2143)*MATURE_PINE_STYLES.length)]));
}

// Direction, reach, attachment and tip heights, radial width, cross width.
// Lower limbs alternate in height and leave gaps beneath the upper sprays.
const BOUGHS=[
  [.10,.74,.55,.72,.56,.44],
  [.97,.70,.59,.76,.60,.48],
  [1.90,.76,.54,.69,.53,.42],
  [2.75,.72,.58,.75,.58,.43],
  [3.66,.73,.53,.70,.56,.44],
  [4.49,.70,.59,.76,.61,.46],
  [5.38,.76,.56,.73,.57,.47],
  [.57,.45,.70,.88,.54,.45],
  [2.15,.43,.72,.91,.49,.42],
  [3.84,.47,.71,.86,.54,.45],
  [5.25,.39,.76,.94,.47,.41]
];

function needleSpray(geometries,shape){
  const key='mount-dora-needles:'+shape;
  if(geometries[key])return geometries[key];
  const geometry=geometries[shape].clone(),{position,uv}=geometry.attributes;
  // Project across the bough so the AFT needle paint has no spherical pole.
  // Its material multiplies U by four before sampling one atlas panel.
  const projected=[];
  let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    const u=.94*x+.34*z,v=-.34*x+.94*z+.38*y;
    projected.push([u,v]);
    u0=Math.min(u,u0);u1=Math.max(u,u1);v0=Math.min(v,v0);v1=Math.max(v,v1);
  }
  for(const [i,[u,v]] of projected.entries())uv.setXY(i,.01+.23*(u-u0)/(u1-u0),.06+.88*(v-v0)/(v1-v0));
  geometries[key]=geometry;
  return geometry;
}

export function createMountDoraPine(T,geometries,materials,variant){
  const style=MATURE_PINE_STYLES[variant];
  const {radius,trunkHeight,crownWidth,turn}=style,root=new T.Group();
  root.name='Mount Dora mature pine';
  // A shared faceted shaft puts the base on the seed centre at exactly the
  // radius used by the town's existing cylindrical trunk collider.
  const shaft=geometries['mount-dora-pine-shaft']??=new T.LatheGeometry(
    [[0,0],[1,0],[1,.018],[.93,.09],[.80,.39],[.62,.68],[.37,.86],[.12,1],[0,1]]
      .map(([r,h])=>new T.Vector2(r,h)),16);
  function part(name,geometry,material,at,size){
    const mesh=new T.Mesh(geometry,material);
    mesh.name=name;mesh.position.fromArray(at);mesh.scale.fromArray(size);root.add(mesh);
    return mesh;
  }
  part('Pine trunk',shaft,materials.bark,[0,0,0],[radius,trunkHeight,radius]);
  const vertical=new T.Vector3(0,1,0),reach=crownWidth/2;
  function limb(a,b,diameter){
    const axis=new T.Vector3(...b).sub(new T.Vector3(...a));
    const mesh=part('Pine limb',geometries.taper,materials.bark,a.map((n,i)=>(n+b[i])/2),[diameter,axis.length(),diameter]);
    mesh.quaternion.setFromUnitVectors(vertical,axis.normalize());
  }
  function spray(at,size,angle,tilt,shape='foliage-crown'){
    const mesh=part('Pine needles',needleSpray(geometries,shape),materials.pine,at,size);
    mesh.rotation.set(tilt,angle,tilt*.28);
  }
  for(const [i,[azimuth,length,attach,tip,width,depth]] of BOUGHS.entries()){
    const angle=azimuth+turn+.08*Math.sin(i*2.7+variant);
    const dx=Math.cos(angle),dz=Math.sin(angle),r=reach*length;
    const y=trunkHeight*(tip+.021*Math.sin(i*1.8+variant));
    const join=[dx*r*.54,trunkHeight*(attach*.48+tip*.52)-.11,dz*r*.54];
    const end=[dx*r,y,dz*r];
    limb([0,trunkHeight*attach,0],join,radius*(i<7?.74:.53));
    limb(join,end,radius*(i<7?.44:.31));
    spray([end[0],y+.28,end[2]],[reach*width,trunkHeight*.105,reach*depth],-angle,.12*Math.sin(i+variant));
    if(i<7){
      const offset=angle+.38*(i%2?1:-1),r2=r*.93;
      const fork=[Math.cos(offset)*r2,y+.36,Math.sin(offset)*r2];
      limb(join,fork,radius*.31);
      spray([fork[0],fork[1]+.19,fork[2]],[reach*width*.73,trunkHeight*.106,reach*depth*.77],-offset,.12,'pine-tier');
    }
  }
  spray([reach*.045,trunkHeight*.974,-reach*.028],
    [reach*.53,trunkHeight*.124,reach*.50],turn,.09);
  root.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(root,true);
  root.userData={category:'tree',bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};
  return root;
}
