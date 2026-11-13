import {aftPropObstacle} from './aft-sector.js';
import {MATURE_PINE_STYLES} from './mount-dora-pines.js';

// Declared fictional encounter, assembled from the inherited AFT assets.
export const PRISON_ID='pinewire-prison';
export const PRISON_SIZE=72;
export const PRISON_FENCE={min:17.5,max:53.5,clearing:4};
const door=(id,name,axis,x,y,swing=1,barrier)=>({id,kind:'door',name,x,y,edge:`${axis}:${Math.floor(x)}:${Math.floor(y)}`,swing,range:1.65,open:false,inventory:[],interactive:true,...(barrier?{barrier,seeThrough:true}:{finish:'steel'})});
const cells=Array.from({length:4},(_,i)=>[
  {id:`west-cell-${i+1}`,name:`West cell ${i+1}`,rect:[22,27+i*4,7,4],cell:true,doors:[door(`west-cell-door-${i+1}`,`West cell ${i+1} bars`,'e',28.5,29+i*4,1,'jail-bars')]},
  {id:`east-cell-${i+1}`,name:`East cell ${i+1}`,rect:[43,27+i*4,7,4],cell:true,doors:[door(`east-cell-door-${i+1}`,`East cell ${i+1} bars`,'e',42.5,29+i*4,-1,'jail-bars')]}
]).flat();
export const PRISON_MISSION={
  id:PRISON_ID,layoutVersion:1,title:'Pinewire Prison',name:'Pinewire Prison',location:'RESERVE 7 / WOODLAND PRISON',bounds:{x:0,y:0,w:72,h:72},woodland:true,
  briefing:'The prison stands inside a ring of woods. A four-metre clearing exposes anyone approaching its chain-link fence. Two guards cover the south gate; patrols watch the yard and perimeter. Circle through the trees, find the damaged east fence, recover the prisoner register from the administration block, and return to the woodland cache.',
  spawn:{x:8,y:62,heading:270},
  objective:{id:'prisoner-register',kind:'objective',name:'Prisoner register',x:36,y:22,range:.85,cost:2,instruction:'Recover the prisoner register from the north administration block.',after:'Return to the woodland cache with the register.',collected:'The register records the workers transferred through Reserve 7. Take it back through the woods.'},
  extraction:{x:8,y:62,name:'Woodland cache',label:'Leave with the prisoner register',range:.85},
  steps:['Scout from the wooded ring; the clearing is exposed.','Enter through the south gate or damaged east fence and recover the register.','Return to the woodland cache.'],
  rooms:[
    {id:'prison-perimeter',name:'Prison perimeter',rect:[18,18,36,36],perimeter:true,doors:[door('prison-south-gate','South perimeter gate','s',36,53.5,-1,'fence-chainlink')]},
    {id:'west-cell-block',name:'West cell block',rect:[22,27,10,18],doors:[door('west-block-entry','West block entrance','e',31.5,35,-1)]},
    {id:'east-cell-block',name:'East cell block',rect:[40,27,10,18],doors:[door('east-block-entry','East block entrance','e',39.5,35,1)]},
    {id:'prison-administration',name:'Administration',rect:[29,20,14,5],doors:[door('admin-front','Administration front door','s',36,24.5,-1),door('admin-service','Administration rear door','s',36,19.5,1)]},
    {id:'prison-gatehouse',name:'Gatehouse',rect:[22,48,7,5],doors:[door('gatehouse-entry','Gatehouse entrance','e',28.5,50,-1)]},
    {id:'prison-store',name:'Stores',rect:[43,48,7,5],doors:[door('store-entry','Store entrance','e',42.5,50,1)]},
    ...cells,
  ],
  cover:[],
  guards:[
    {name:'Gate gunner',species:'pig-foreman',weapon:'hmg',x:34,y:49,heading:90},
    {name:'Gate rifleman',species:'goat',weapon:'rifle',x:38,y:49,heading:90},
    {name:'West fence sentry',species:'dog',weapon:'rifle',x:20,y:35,heading:180},
    {name:'East fence sentry',species:'goat',weapon:'rifle',x:51,y:35,heading:0},
    {name:'North yard guard',species:'pig-foreman',weapon:'smg',x:34,y:26,heading:90},
    {name:'Records guard',species:'pig-foreman',weapon:'pistol',x:38,y:26,heading:90},
    {name:'Exercise-yard patrol',species:'dog',weapon:'smg',x:35,y:39,heading:90,patrol:[{x:35,y:39},{x:37,y:39},{x:37,y:45},{x:35,y:45}]},
    {name:'East perimeter patrol',species:'horse',weapon:'assault',x:52,y:46,heading:270,patrol:[{x:52,y:46},{x:52,y:38},{x:51,y:38},{x:51,y:46}]},
  ],
  containers:[{id:'prison-woodland-cache',kind:'chest',name:'Woodland field supplies',x:11,y:60,range:1.7,open:false,searched:false,inventory:[{id:'assault-ammo',type:'ammo',kind:'assault',quantity:60},{id:'dressing',type:'dressing',quantity:2},{id:'grenade',type:'grenade',quantity:2}]}],
  clues:[{id:'prison-fence-note',kind:'clue',name:'Scout markings',x:10,y:62,range:1.7,inventory:[],text:'The south gate is covered by two weapons. An old break in the northeast section of the east fence leads behind the administration building. The woods screen a low approach; the strip beside the fence is bare.'}],
  result:{title:'The register is out.',summary:'escaped through the woods with the prisoner register.',epilogue:'The names are no longer hidden behind the prison fence.'},
};

const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7+1947)*43758.5453;return n-Math.floor(n);};
export const prisonWoodland=(x,y)=>x<=13||y<=13||x>=58||y>=58;
export const PRISON_PLANTS=[];
for(let side=0;side<4;side++)for(let i=0;i<9;i++){
  const along=5+i*7.7,variant=(side+i)%3;
  const [x,y]=side===0?[5,along]:side===1?[66,along]:side===2?[along,5]:[along,66];
  if(PRISON_PLANTS.some(p=>Math.hypot(x-p.x,y-p.y)<3))continue;
  PRISON_PLANTS.push({id:`pine-${side}-${i}`,kind:'pine',variant,x,y});
}
for(let y=1;y<71;y+=2)for(let x=1;x<71;x+=2){
  if(!prisonWoodland(x,y)||x>12&&x<59&&y>12&&y<59||hash(x,y)<.13)continue;
  PRISON_PLANTS.push({id:`brush-${x}-${y}`,kind:'brush',variant:(x+y)%3,x:x+(hash(y,x)-.5)*.3,y:y+(hash(x,y)-.5)*.3});
}
export const PRISON_BARRIERS=[];
for(let n=18;n<=53;n++){
  PRISON_BARRIERS.push({edge:`s:${n}:17`,kind:'fence-chainlink'},{edge:`e:17:${n}`,kind:'fence-chainlink'});
  if(n!==36)PRISON_BARRIERS.push({edge:`s:${n}:53`,kind:'fence-chainlink'});
  // Two missing panels are an authored breach, not an invisible gate.
  if(n!==22&&n!==23)PRISON_BARRIERS.push({edge:`e:53:${n}`,kind:'fence-chainlink'});
}
for(const cell of cells)for(let y=cell.rect[1];y<cell.rect[1]+cell.rect[3];y++){
  const edge=`e:${cell.id.startsWith('west')?28:42}:${y}`;
  if(edge!==cell.doors[0].edge)PRISON_BARRIERS.push({edge,kind:'jail-bars'});
}
export const PRISON_FURNITURE=cells.map(cell=>({id:cell.id+'-bed',form:'single-bed',x:cell.rect[0]+2,y:cell.rect[1]+1}));
PRISON_FURNITURE.push({id:'admin-table',form:'dining-table',x:32,y:22},{id:'stores-cabinet',form:'cabinet',x:47,y:51});
for(const list of [PRISON_PLANTS,PRISON_BARRIERS,PRISON_FURNITURE]){list.forEach(Object.freeze);Object.freeze(list);}

export function prisonMap(){
  const terrain=Array.from({length:72},(_,y)=>Array.from({length:72},(_,x)=>prisonWoodland(x,y)?'woodland':'ground-grass')),edges={},wallMaterials={};
  const paint=(kind,[x,y,w,h])=>{for(let cy=y;cy<y+h;cy++)for(let cx=x;cx<x+w;cx++)terrain[cy][cx]=kind;};
  paint('ground-gravel',[18,18,36,36]);paint('ground-concrete',[32,27,8,20]);paint('ground-gravel',[34,54,5,4]);
  for(const room of PRISON_MISSION.rooms){
    if(room.perimeter)continue;
    const [x,y,w,h]=room.rect;paint('floor',room.rect);
    for(let cy=y;cy<y+h;cy++)for(const cx of [x-1,x+w-1])edges[`e:${cx}:${cy}`]='wall';
    for(let cx=x;cx<x+w;cx++)for(const cy of [y-1,y+h-1])edges[`s:${cx}:${cy}`]='wall';
  }
  for(const {edge}of PRISON_BARRIERS)delete edges[edge];
  for(const room of PRISON_MISSION.rooms)for(const d of room.doors)edges[d.edge]='door';
  for(const edge of Object.keys(edges))if(edges[edge]==='wall')wallMaterials[edge]='wall-concrete';
  const props=[...[32,33,34,38,39,40].map(x=>({kind:'sandbags',x,y:50,z:0})),{kind:'crate-wood',x:45,y:50,z:0},{kind:'barrel-single',x:48,y:49,z:0}];
  const obstacles=props.map(aftPropObstacle);
  for(const {edge,kind}of PRISON_BARRIERS){const [axis,x,y]=edge.split(':'),cx=+x+(axis==='e'?.5:0),cy=+y+(axis==='s'?.5:0);obstacles.push({x0:cx-(axis==='e'?.06:.5),x1:cx+(axis==='e'?.06:.5),y0:cy-(axis==='s'?.06:.5),y1:cy+(axis==='s'?.06:.5),height:2,kind:'prop',sourceKind:kind});}
  for(const p of PRISON_PLANTS.filter(p=>p.kind==='pine')){const {radius,trunkHeight}=MATURE_PINE_STYLES[p.variant];obstacles.push({x0:p.x-radius,x1:p.x+radius,y0:p.y-radius,y1:p.y+radius,height:trunkHeight,kind:'wall',sourceKind:'prison-pine',trunk:{centre:[p.x,p.y],radius,trunkHeight}});}
  for(const p of PRISON_FURNITURE)obstacles.push({x0:p.x-.45,x1:p.x+.45,y0:p.y-.9,y1:p.y+.9,height:p.form==='cabinet'?1.4:.65,kind:'crate',sourceKind:p.form});
  return {name:PRISON_MISSION.name,terrain,edges,wallMaterials,props,obstacles,worldBounds:{x:0,y:0,w:72,h:72},groundPalette:'aft-sector',doors:structuredClone(PRISON_MISSION.rooms.flatMap(r=>r.doors))};
}
