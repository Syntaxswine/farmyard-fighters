import {groundHash} from './aft/tactics/biome-ground-composition.js';
import {MATURE_PINE_STYLES} from './mount-dora-pines.js';

// Width and height shape the mesh. Reach includes a setback around its
// largest horizontal extent so the crown has air beside roofs.
export const MATURE_BROADLEAF_STYLES=Object.freeze([
  {form:'oak',radius:.39,trunkHeight:5.9,width:14.6,height:8.5,reach:8.1,turn:.17},
  {form:'oak',radius:.396,trunkHeight:6.5,width:17.0,height:9.4,reach:9.5,turn:1.16},
  {form:'upright',radius:.33,trunkHeight:8.8,width:8.3,height:10.0,reach:5.1,turn:.58},
  {form:'upright',radius:.36,trunkHeight:10.2,width:9.7,height:11.7,reach:5.95,turn:1.87}
].map(Object.freeze));

export function matureBroadleavesForSector(props,origin,pines,hasBuilding){
  const candidates=[];
  for(const prop of props){
    const metadata=prop?.mountDora;
    // The legacy large footprint is an upper bound. Existing routes,
    // saves and guard posts keep at least the same clearance at ground level.
    if(prop?.kind!=='tree-broadleaf-large'||metadata?.placement!=='declared-seeded-greenery'||
       metadata.sourceId!==null||!['park','wood'].includes(metadata.habitat))continue;
    if(!Number.isInteger(prop.x)||!Number.isInteger(prop.y))continue;
    // Two insets give at least 21 m between broadleaves across a sector seam
    // and 19 m to the nearest possible mature pine in the next sector.
    if(prop.x<10||prop.y<10||prop.x>=230||prop.y>=230)continue;
    const x=origin.x+prop.x,y=origin.y+prop.y;
    candidates.push({prop,x,y,rank:groundHash(x,y,2207)});
  }
  candidates.sort((a,b)=>b.rank-a.rank||a.y-b.y||a.x-b.x);
  const selected=[],result=new Map();
  for(const {prop,x,y} of candidates){
    if(selected.some(p=>Math.hypot(x-p.x,y-p.y)<21))continue;
    const preferred=Math.floor(groundHash(x,y,2221)*MATURE_BROADLEAF_STYLES.length);
    const style=MATURE_BROADLEAF_STYLES[preferred];
    const order=[preferred,...[1,0,3,2].filter(i=>MATURE_BROADLEAF_STYLES[i].reach<style.reach)];
    const variant=order.find(i=>{
      const {reach}=MATURE_BROADLEAF_STYLES[i];
      for(const [pine,pineVariant] of pines){
        const pineRadius=MATURE_PINE_STYLES[pineVariant].crownWidth/2+.6;
        if(Math.hypot(prop.x-pine.x,prop.y-pine.y)<Math.max(14.5,reach+pineRadius+.9))return false;
      }
      return !hasBuilding(x,y,reach);
    });
    if(variant===undefined)continue;
    selected.push({x,y});
    result.set(prop,variant);
  }
  return result;
}

// Slightly unequal, mostly horizontal arms. Each row specifies direction,
// reach, end height and the two horizontal crown-lobe scales.
const OAK_ARMS=[
  [.09,.59,.57,.91,.73],[1.03,.57,.57,.84,.75],[2.08,.61,.56,.83,.71],
  [3.20,.58,.53,.89,.71],[4.26,.55,.60,.83,.78],[5.31,.57,.55,.87,.73]
];

export function createMountDoraBroadleaf(T,geometries,materials,variant){
  const {form,radius,trunkHeight,width,height,turn}=MATURE_BROADLEAF_STYLES[variant];
  const oak=form==='oak',root=new T.Group(),reach=width/2;
  root.name=oak?'Mount Dora spreading oak':'Mount Dora upright hardwood';
  // The base has a circular envelope and the first course stays close to
  // that envelope at eye level. Only this central shaft has collision.
  const trunk=geometries['mount-dora-broadleaf-shaft:'+form]??=new T.LatheGeometry(
    (oak?[[0,0],[1,0],[1,.035],[.95,.13],[.90,.39],[.78,.56],[.52,.78],[.16,1],[0,1]]:
      [[0,0],[1,0],[1,.02],[.94,.085],[.84,.30],[.65,.59],[.35,.84],[.1,1],[0,1]])
      .map(([r,h])=>new T.Vector2(r,h)),16);
  function part(name,geometry,material,at,size){
    const mesh=new T.Mesh(geometry,material);
    mesh.name=name;mesh.position.fromArray(at);mesh.scale.fromArray(size);root.add(mesh);
    return mesh;
  }
  part('Broadleaf trunk',trunk,materials.bark,[0,0,0],[radius,trunkHeight,radius]);
  const up=new T.Vector3(0,1,0);
  function limb(from,to,diameter){
    const axis=new T.Vector3(...to).sub(new T.Vector3(...from));
    const mesh=part('Broadleaf limb',geometries.taper,materials.bark,from.map((n,i)=>(n+to[i])/2),[diameter,axis.length(),diameter]);
    mesh.quaternion.setFromUnitVectors(up,axis.normalize());
  }
  function foliage(at,size,yaw,roll=0){
    const mesh=part('Broadleaf crown',geometries['broadleaf-crown'],materials.leaves,at,size);
    mesh.rotation.set(0,yaw,roll);
  }
  if(oak){
    for(const [i,[azimuth,length,tip,wide,deep]] of OAK_ARMS.entries()){
      const angle=azimuth+turn,dx=Math.cos(angle),dz=Math.sin(angle),r=length*reach;
      const bend=[dx*r*.44,height*(.46+(i%3)*.022),dz*r*.44];
      const end=[dx*r,height*tip,dz*r];
      limb([0,height*(.28+(i%3)*.029),0],bend,radius*(i%2?1.21:1.54));
      limb(bend,end,radius*.88);
      const fork=[dx*r*.80-dz*reach*.15,height*(tip+.062),dz*r*.80+dx*reach*.15];
      limb(bend,fork,radius*.53);
      foliage([end[0],end[1]+height*.09,end[2]],[reach*wide,height*.30,reach*deep],-angle,.12*Math.sin(i+variant));
      foliage(fork,[reach*.64,height*.29,reach*.53],-angle+.65);
    }
    foliage([reach*.052,height*.773,-reach*.064],[reach*1.13,height*.43,reach*.96],turn+.3,-.07);
  }else{
    // A straight leader with shorter ascending branches and a tapered oval.
    const tiers=[[.48,.44,.75,.265],[.65,.46,.79,.29],[.80,.30,.64,.30]];
    for(const [layer,[level,r,wide,depth]] of tiers.entries())for(let i=0;i<3;i++){
      const a=turn+i*2.094+layer*.76,d=r*reach,h=height*(level+.027*Math.sin(i*2.4+layer));
      const tip=[Math.cos(a)*d,h,Math.sin(a)*d];
      limb([0,h-height*.13,0],tip,radius*(.79-layer*.14));
      foliage([tip[0],tip[1]+.15,tip[2]],[reach*wide,height*depth,reach*wide*.87],-a,.10);
    }
    foliage([-reach*.04,height*.66,reach*.03],[reach*1.34,height*.63,reach*1.22],turn,-.045);
  }
  root.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(root,true);
  root.userData={category:'tree',bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};
  return root;
}
