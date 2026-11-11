import {buildingById,compileBuilding} from './mission-art/mount-dora/source/packages/building-catalog/index.js';
import {WORLD_BLOCK_SIZE,WORLD_SECTOR_SIZE} from './world-grid.js';

export const BLOCK_METRES=WORLD_BLOCK_SIZE;
export const SECTOR_METRES=WORLD_SECTOR_SIZE;
export const ENCOUNTER_METRES=BLOCK_METRES*2;
export const CATALOG_VERSION='fighters-elements-1';
export const NAUTILUS_REVISION='2502646482218524fd5129641da769bb82462e4d';

export const GUARD_KITS=[
  {id:'watch',name:'Rifle and pistol',weapons:['rifle','pistol']},
  {id:'close',name:'SMG and shotgun',weapons:['smg','shotgun']},
  {id:'infantry',name:'Assault rifle and rifle',weapons:['assault','rifle']},
  {id:'heavy',name:'HMG and assault rifle',weapons:['hmg','assault']}
];
export const GUARD_BEHAVIORS=[
  {id:'sentries',name:'Two fixed sentries',description:'Both guards hold their authored positions.'},
  {id:'patrol',name:'Sentry and patrol',description:'One guard holds the defended front while the other follows a local circuit.'}
];
export const GUARD_TYPES=[
  {id:'pig-foreman',name:'Pig guards'},
  {id:'dog',name:'Dog guards'},
  {id:'goat',name:'Goat guards'}
];

// These are tactical blueprints. The building references retain the pinned
// Nautilus dimensions, parts and ground-floor openings. Each playable variation
// gets its production-game review and combat benchmark through the field adapter.
export const ELEMENTS=[
  {id:'post.sandbags',revision:1,kind:'fortification',name:'Sandbag pair',footprint:[2,2],
    kit:'heavy',behavior:'sentries',building:null,
    guards:[[11,7.7],[16,8.1]],cover:[[9,9,10,.9]],obstacles:[],
    patrol:[[21,7],[24,7],[24,15],[21,15]],
    approach:[[30,47],[30,8],[25,8],[30,8],[30,0]],
    weakPoint:[25,8],weakSide:'east',
    trick:'Approach through the brush on the flank. The defenders overlap from this angle.',
    tags:['checkpoint','farm','woodland']},
  {id:'post.cargo',revision:1,kind:'fortification',name:'Cargo checkpoint',footprint:[2,2],
    kit:'infantry',behavior:'patrol',building:null,
    guards:[[10,10],[18,12]],cover:[[7,13,5,1],[16,15,5,1]],
    obstacles:[[2,3,5,8],[18,2,5,5]],
    patrol:[[24,11],[26,11],[26,20],[24,20]],
    approach:[[30,47],[30,7],[25,7],[30,7],[30,0]],
    weakPoint:[25,7],weakSide:'northeast',
    trick:'Use the gap behind the cargo while the second guard is away from its watch point.',
    tags:['checkpoint','depot']},
  {id:'house.courtyard',revision:1,kind:'fortification',name:'Courtyard villa',footprint:[2,2],
    kit:'close',behavior:'sentries',building:{design:'ochre-patio',at:[4,2]},
    guards:[[10,11],[10,17]],cover:[[6,19,9,.9]],obstacles:[],
    patrol:[[18,16],[22,16],[22,22],[18,22]],
    approach:[[30,47],[30,16],[20,16],[30,16],[30,0]],
    weakPoint:[20,16],weakSide:'east',
    trick:'The side wing screens the courtyard guard. Approach the mouth around the wing and separate the two defenders.',
    tags:['settlement','farm']},
  {id:'house.breezeway',revision:1,kind:'fortification',name:'Breezeway cottage',footprint:[2,2],
    kit:'watch',behavior:'patrol',building:{design:'dogwood-breezeway',at:[4,2]},
    guards:[[10,7],[14,14]],cover:[[12,17,8,.9]],obstacles:[],
    patrol:[[21,13],[23,13],[23,20],[21,20]],
    approach:[[30,47],[30,1],[10,1],[10,3.5],[10,1],[30,1],[30,0]],
    weakPoint:[10,3.5],weakSide:'north',
    trick:'Circle around the rear end. The open breezeway gives an approach between the two wings.',
    tags:['settlement','woodland']},
  {id:'house.narrow',revision:1,kind:'fortification',name:'Narrow house',footprint:[2,2],
    kit:'infantry',behavior:'patrol',building:{design:'cypress-shotgun',at:[4,2]},
    guards:[[6.5,18],[12,17]],cover:[[3,20,12,.9]],obstacles:[],
    patrol:[[18,16],[22,16],[22,23],[18,23]],
    approach:[[30,47],[30,3],[12,3],[30,3],[30,0]],
    weakPoint:[12,3],weakSide:'northeast',
    trick:'Follow the long side wall to the rear yard. Clear the exposed guard before rounding the front corner.',
    tags:['settlement','checkpoint']},
  {id:'warehouse.loading',revision:1,kind:'fortification',name:'Warehouse loading apron',footprint:[2,2],
    kit:'heavy',behavior:'sentries',building:{design:'dockside-warehouse',at:[2,2]},
    guards:[[6,23.2],[16,23.2]],cover:[[3,25,16,.9]],obstacles:[],
    patrol:[[22,24],[25,24],[25,30],[22,30]],
    approach:[[30,47],[30,20],[25,20],[30,20],[30,0]],
    weakPoint:[25,20],weakSide:'east',
    trick:'The warehouse blocks the long view. Work down the loading flank and expose one defender at a time.',
    tags:['depot']},
  {id:'cover.brush',revision:1,kind:'connection',name:'Brush connection',footprint:[1,1],
    concealment:'woodland',density:60,trick:'Continuous low cover with open walking connections on every edge.'},
  {id:'cover.fence',revision:1,kind:'connection',name:'Fence-side brush',footprint:[1,1],
    concealment:'fence',density:70,obstacles:[[18,6,.12,12]],
    trick:'Dense vegetation beside a garden fence. Work around the ends of its panels.'},
  {id:'cover.gap',revision:1,kind:'connection',name:'Broken fence crossing',footprint:[1,1],
    concealment:'gap',density:55,obstacles:[[18,6,.12,4],[18,14,.12,4]],
    trick:'A four-metre damaged section connects the covered areas on either side.'},
  {id:'ground.grass',revision:1,kind:'ground',name:'Open grass',footprint:[1,1]},
  {id:'ground.yard',revision:1,kind:'ground',name:'Working yard',footprint:[1,1]}
];

const freeze=value=>{
  if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  return value;
};
freeze(ELEMENTS);freeze(GUARD_KITS);freeze(GUARD_BEHAVIORS);freeze(GUARD_TYPES);

export function elementById(id,revision=1){
  const element=ELEMENTS.find(item=>item.id===id&&item.revision===revision);
  if(!element)throw Error('Unavailable element '+id+' revision '+revision+'.');
  return element;
}
export function guardKit(id){
  const kit=GUARD_KITS.find(item=>item.id===id);
  if(!kit)throw Error('Unknown guard equipment '+id+'.');
  return kit;
}
export function guardBehavior(id){
  const behavior=GUARD_BEHAVIORS.find(item=>item.id===id);
  if(!behavior)throw Error('Unknown guard behavior '+id+'.');
  return behavior;
}
const buildings=new Map();
export function buildingForElement(element){
  if(!element.building)return null;
  const source=buildingById(element.building.design);
  if(!buildings.has(source.id))buildings.set(source.id,compileBuilding(source));
  return {source,compiled:buildings.get(source.id),at:element.building.at};
}
export function footprintRectangles(element){
  const result=(element.obstacles||[]).map(box=>[...box]);
  if(element.building){
    const building=buildingById(element.building.design),[x,y]=element.building.at;
    result.push(...building.parts.map(part=>[x+part.x,y+part.z,part.w,part.d]));
  }
  return result;
}
export function rotatePoint(point,rotation=0,size=ENCOUNTER_METRES){
  let [x,y]=point;
  for(let turn=0;turn<rotation;turn+=90)[x,y]=[size-1-y,x];
  return [x,y];
}
export function instanceRoute(instance){
  const element=elementById(instance.element,instance.revision);
  return (element.approach||[]).map(point=>{
    const [x,y]=rotatePoint(point,instance.rotation);
    return [instance.x*BLOCK_METRES+x,instance.y*BLOCK_METRES+y];
  });
}
export function guardsForInstance(instance){
  const element=elementById(instance.element,instance.revision);
  if(element.kind!=='fortification')return [];
  const kit=guardKit(instance.kit);
  guardBehavior(instance.behavior);
  if(!GUARD_TYPES.some(type=>type.id===instance.guardType))throw Error('Unknown guard type.');
  const position=point=>{
    const [x,y]=rotatePoint(point,instance.rotation);
    return {x:instance.x*BLOCK_METRES+x,y:instance.y*BLOCK_METRES+y,z:0};
  };
  return element.guards.map((point,index)=>({
    id:instance.id+'-guard-'+index,name:element.name+' guard '+(index+1),
    species:instance.guardType,weapon:kit.weapons[index],heading:(90+instance.rotation)%360,
    ...position(point),
    ...(index===1&&instance.behavior==='patrol'?{patrol:element.patrol.map(p=>({...position(p),waitSeconds:15}))}:{})
  }));
}
export function weakApproachDirection(instance){
  const directions=['north','northeast','east','southeast','south','southwest','west','northwest'];
  const element=elementById(instance.element,instance.revision);
  const index=directions.indexOf(element.weakSide);
  return index<0?'':directions[(index+instance.rotation/45)%8];
}
