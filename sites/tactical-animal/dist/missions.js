// Runtime definitions for the first playable slice of The First Shift.
// Spatial source: design commit 5524d91, docs/missions/first-shift.maps.json.
import {checkpointSource,checkpointMap} from './aft-sector.js';
import {checkpointApproachMap} from './checkpoint-approaches.js';
import {WINDOW_REVIEW_ID,WINDOW_REVIEW_MISSION,windowReviewSource} from './window-review-map.js';
import {adaptAftSector,aftPropObstacle} from './aft-sector.js';
import {TOUR_ID,TOUR_ACTIVITY} from './mount-dora-activity.js';
export const DEFAULT_MISSION_ID='night-ledger';
const checkpoint=checkpointSource(),checkpointDoors=checkpointMap().doors;
const bounds={x:1,y:1,w:38,h:28};
const door=(id,name,axis,x,y,swing=1,interactive=true)=>({id,kind:'door',name,x,y,edge:`${axis}:${Math.floor(x)}:${Math.floor(y)}`,swing,range:1.65,open:false,inventory:[],interactive});
const chest=(x,y)=>({id:'supply-chest',kind:'chest',name:'Supply chest',x,y,range:1.7,open:false,searched:false,inventory:[
  {id:'assault-rounds',type:'ammo',kind:'assault',quantity:30},
  {id:'field-dressing',type:'dressing',quantity:1},
  {id:'frag-grenade',type:'grenade',quantity:1},
]});
const guard=(name,weapon,x,y,heading)=>({name,weapon,x,y,heading,species:'pig-foreman'});
const cover=(id,rect)=>({id,rect});
// Version 1 remains resolvable for operations already saved on the old layout.
const legacyCheckpoint={
  id:'road-checkpoint',layoutVersion:1,title:'Road Checkpoint',name:'Road Checkpoint',location:'VALLEY ROAD / EAST RALLY POINT',
  bounds:{x:0,y:0,w:240,h:240},sector:'aft-road-checkpoint',
  briefing:'The checkpoint decides who leaves the valley. Take its travel orders from the office, then cross the open ground to the east rally point.',
  spawn:{x:checkpoint.starts[0].x,y:checkpoint.starts[0].y,heading:0},
  objective:{id:'travel-orders',kind:'objective',name:'Travel orders',x:21,y:112,range:.85,cost:2,
    instruction:'Reach the checkpoint office and secure the travel orders.',after:'Cross the field to the east rally point with the orders.',
    collected:'Every outbound wagon is diverted to Reserve 7. The roadblocks are keeping the workers in.'},
  extraction:{x:64,y:120,name:'East rally point',label:'Extract with the travel orders',range:.85},
  steps:['Pass the road checkpoint.','Take the travel orders from the office.','Cross to the east rally point.'],
  rooms:[{id:'checkpoint-office',name:'Checkpoint office',rect:[17,109,8,7],doors:checkpointDoors}],
  cover:[],guards:checkpoint.guards.map(g=>({...g,name:g.character.displayName,heading:g.heading??0})),
  containers:[{...chest(4,125),name:'Abandoned road supplies'}],
  clues:[{id:'checkpoint-road-sign',kind:'clue',name:'Outbound diversion sign',x:34,y:120,range:1.7,anchorHeight:.8,inventory:[],text:'The public road stops here. A fresh arrow sends all freight toward Reserve 7.'}],
  result:{title:'The road is open.',summary:'carried the travel orders beyond the checkpoint.',epilogue:'The convoy route crosses open country. Now you know where the wagons are going.'},
};
const definitions=[
  {
    id:'night-ledger',title:'The Night Ledger',name:'The night ledger',location:'MILL 04 / RECORDS OFFICE',bounds,
    briefing:'The pay window has been closed for three weeks. The books are still inside Mill 04. Bring back the ledger.',
    spawn:{x:5,y:24,heading:270},
    objective:{id:'ledger',kind:'ledger',name:'Wage ledger',x:31,y:6,range:.85,cost:2,
      instruction:'Reach the records office and secure the wage ledger.',after:'Return to extraction with the wage ledger.',
      collected:'Every worker owes money. Every missing payment has the same destination: RESERVE 7.'},
    extraction:{x:5,y:24,name:'Extraction point',label:'Extract with the ledger',range:.85},
    steps:['Reach the records office.','Secure the wage ledger.','Return to extraction.'],
    rooms:[
      {id:'warehouse',name:'Warehouse',rect:[8,14,10,8],doors:[door('warehouse-door','Warehouse door','e',7.5,18),door('warehouse-south','Warehouse passage','s',13,21.5,-1,false)]},
      {id:'records',name:'Records office',rect:[24,2,12,11],doors:[door('records-west','Records passage','e',23.5,7,1,false),door('records-south','Records passage','s',30,12.5,-1,false)]},
    ],
    divider:true,
    cover:[cover('warehouse-west',[6,17,1,2]),cover('warehouse-stack',[11,17,2,1]),cover('warehouse-east',[15,19,1,1]),cover('divider-stack',[22,15,1,2]),cover('records-stack',[28,8,2,1]),cover('records-north',[33,4,1,1]),cover('north-yard',[17,6,1,2]),cover('west-yard',[11,9,2,1]),cover('east-yard',[32,17,1,2])],
    guards:[guard('Boris','pistol',16,12,0),guard('Lev','rifle',29,19,90),guard('Oleg','pistol',30,5,0)],
    fallen:{name:'Ilya',species:'pig-foreman',weapon:'pistol',x:6.9,y:23.7,heading:160},
    containers:[chest(5.5,22.5)],clues:[],
    result:{title:'The books are open.',summary:'returned with the wage ledger.',epilogue:'The totals do not balance. The delivery references point to the east feed mill.'},
  },
  {
    id:'short-measure',title:'Short Measure',name:'Short Measure',location:'EAST FEED MILL',bounds,
    briefing:'The ledger calls the grain a loss. Check the mill\'s dispatch records. The east loading gate is your way out.',
    spawn:{x:4,y:25,heading:270},
    objective:{id:'shipping-manifest',kind:'objective',name:'Shipping manifest',x:32,y:7,range:.85,cost:2,
      instruction:'Cross the mill and secure the shipping manifest in the dispatch office.',after:'Take the manifest to the east loading gate.',
      collected:'The grain was never missing. These loads went to Reserve 7. Their release was signed at Pump Station 3.'},
    extraction:{x:35,y:25,name:'East loading gate',label:'Extract with the manifest',range:.85},
    steps:['Cross the feed mill.','Collect the shipping manifest.','Leave by the east loading gate.'],
    rooms:[
      {id:'ration-shed',name:'Ration shed',rect:[6,17,6,6],doors:[door('ration-west','Ration shed west door','e',5.5,20),door('ration-south','Ration shed south door','s',9,22.5,-1),door('ration-east','Ration shed east door','e',11.5,20,-1)]},
      {id:'packing-hall',name:'Packing hall',rect:[14,8,11,10],doors:[door('packing-west','Packing hall west door','e',13.5,13),door('packing-south','Packing hall south door','s',19,17.5,-1),door('packing-east','Packing hall east door','e',24.5,13,-1),door('packing-north','Packing hall north door','s',19,7.5)]},
      {id:'dispatch-office',name:'Dispatch office',rect:[28,4,8,8],doors:[door('dispatch-west','Dispatch office west door','e',27.5,8),door('dispatch-south','Dispatch office south door','s',32,11.5,-1)]},
    ],
    cover:[cover('west-sack-bay',[8,10,2,2]),cover('north-sack-bay',[11,5,3,1]),cover('hall-sack-bay',[16,10,2,2]),cover('hall-packing-stack',[21,14,2,1]),cover('sealed-load',[27,19,2,2]),cover('loading-stack',[31,17,2,1]),cover('east-gate-stack',[34,21,2,1])],
    guards:[guard('Yuri','pistol',13,20,270),guard('Grigor','pistol',21,12,180),guard('Anton','rifle',30,14,0)],
    containers:[chest(4,22)],
    clues:[
      {id:'worker-scale',kind:'clue',name:'Ration scale',x:8,y:20,range:1.7,anchorHeight:.8,inventory:[],text:'The worker\'s scale has a stop welded under its beam. The official weight cannot be reached.'},
      {id:'sealed-load',kind:'clue',name:'Sealed Reserve 7 sacks',x:28,y:20,range:1.7,anchorHeight:1.2,inventory:[],text:'Full sacks. Today\'s date. The seven-in-a-square seal is unbroken.'},
    ],
    result:{title:'The manifest is out.',summary:'left the feed mill with the shipping manifest.',epilogue:'The same office approves the district\'s water. Follow the service main to Pump Station 3.'},
  },
  {
    id:'road-checkpoint',layoutVersion:2,title:'Road Checkpoint',name:'Road Checkpoint',location:'VALLEY ROAD / WEST APPROACH',
    bounds:{x:0,y:0,w:240,h:240},briefingBounds:{x:40,y:76,w:161,h:88},sector:'aft-road-checkpoint-approaches',
    briefing:'You arrive west of the roadblock, unseen. Take the travel orders from the office and reach the northeast rally point. The road is short and watched. The north service lane is screened by a brick wall; the longer southern freight yard has cover and abandoned supplies. You choose when to make contact.',
    spawn:{x:48,y:120,heading:0},
    objective:{id:'travel-orders',kind:'objective',name:'Travel orders',x:117,y:112,range:.85,cost:2,
      instruction:'Scout the road, north service lane or south freight yard. Secure the travel orders in the office.',after:'Reach the northeast rally point with the orders. You do not need to clear the checkpoint.',
      collected:'Every outbound wagon is diverted to Reserve 7. The roadblocks are keeping the workers in.'},
    extraction:{x:192,y:90,name:'Northeast rally point',label:'Extract with the travel orders',range:.85},
    steps:['Scout and choose an approach.','Secure the travel orders; clearing the guards is optional.','Reach the northeast rally point.'],
    rooms:[{id:'checkpoint-office',name:'Checkpoint office',rect:[113,109,8,7],doors:[
      door('checkpoint-front-door','Checkpoint office front door','s',117,115.5),
      door('checkpoint-service-door','Office service door','s',117,108.5),
    ]}],
    cover:[cover('west-verge',[57,125,3,2]),cover('road-west-barricade',[80,124,4,1]),cover('road-east-barricade',[97,125,3,1]),
      cover('north-tools',[82,100,3,1]),cover('north-office-stack',[109,100,2,1]),cover('north-picket',[135,88,3,1]),
      cover('freight-west-stack',[97,145,3,3]),cover('freight-middle-stack',[109,139,3,3]),cover('freight-east-stack',[126,141,3,3]),cover('freight-far-stack',[142,147,3,3]),
      cover('east-road-stack',[162,124,3,2]),cover('rally-stones',[190,94,3,1])],
    guards:[
      {name:'Road sentry',species:'horse',weapon:'rifle',x:88,y:120,heading:180},
      {name:'Barrier guard',species:'goat',weapon:'pistol',x:103,y:121,heading:180},
      {name:'Orders courier',species:'pig-foreman',weapon:'pistol',x:141,y:110,heading:0},
      {name:'North picket',species:'goat',weapon:'rifle',x:128,y:84,heading:0},
      {name:'Freight sentry',species:'pig-foreman',weapon:'pistol',x:136,y:155,heading:270},
      {name:'East road sentry',species:'horse',weapon:'rifle',x:174,y:120,heading:180},
    ],
    containers:[{...chest(53,125),name:'West approach cache'},{...chest(105,144),id:'freight-supplies',name:'Confiscated field supplies'}],
    clues:[
      {id:'approach-marker',kind:'clue',name:'Worker route marker',x:51,y:118,range:1.7,anchorHeight:.8,inventory:[],text:'Three chalk arrows: ROAD — shortest, watched. NORTH SERVICE LANE — brick wall, rear office door. SOUTH FREIGHT YARD — longer, confiscated supplies and firing cover. The rally point is northeast. The orders matter; the guard count does not.'},
      {id:'checkpoint-road-sign',kind:'clue',name:'Outbound diversion sign',x:154,y:121,range:1.7,anchorHeight:.8,inventory:[],text:'The public road stops here. A fresh arrow sends all freight toward Reserve 7.'},
      {id:'confiscation-list',kind:'clue',name:'Confiscation tally',x:123,y:149,range:1.7,anchorHeight:.8,inventory:[],text:'Boots, food, medicine. Every item taken from a departing worker is signed into the checkpoint stock. The extra field supplies were never issued to the road guards.'},
    ],
    result:{title:'The orders are out.',summary:'carried the travel orders beyond the checkpoint.',epilogue:'The convoy route crosses open country. Now you know where the wagons are going.'},
  },
];

function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export function validateMission(definition){
  const errors=[],b=definition?.bounds,validBounds=b&&[b.x,b.y,b.w,b.h].every(Number.isInteger)&&b.x>=0&&b.y>=0&&b.w>1&&b.h>1&&b.x+b.w<=240&&b.y+b.h<=240;
  const inside=p=>validBounds&&p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=b.x&&p.x<=b.x+b.w-1&&p.y>=b.y&&p.y<=b.y+b.h-1;
  if(!definition||!/^[-a-z]+$/.test(definition.id)||!definition.title||!definition.briefing||!inside(definition.spawn)||!inside(definition.objective)||!inside(definition.extraction))errors.push('Invalid operation identity or required position.');
  if(!definition?.objective?.id||!definition?.result?.title||!Array.isArray(definition?.rooms)||!Array.isArray(definition?.guards))return [...errors,'Incomplete operation definition.'];
  const ids=new Set();
  for(const room of definition.rooms){
    const [x,y,w,h]=room.rect;
    if(![x,y,w,h].every(Number.isInteger)||w<2||h<2||!inside({x,y})||!inside({x:x+w-1,y:y+h-1}))errors.push('Invalid room: '+room.id);
    for(const d of room.doors){
      if(ids.has(d.id)||!['e','s'].includes(d.edge[0])||![-1,1].includes(d.swing))errors.push('Invalid door: '+d.id);
      ids.add(d.id);
      const onWall=d.edge[0]==='e'?(d.x===x-.5||d.x===x+w-.5)&&d.y>=y&&d.y<y+h:(d.y===y-.5||d.y===y+h-.5)&&d.x>=x&&d.x<x+w;
      if(!onWall)errors.push('Door is outside its room: '+d.id);
    }
  }
  for(const placement of definition.cover){const [x,y,w,h]=placement.rect;if(![x,y,w,h].every(Number.isInteger)||w<1||h<1||!inside({x,y})||!inside({x:x+w-1,y:y+h-1}))errors.push('Invalid cargo: '+placement.id);}
  for(const object of [...definition.containers,...definition.clues]){if(ids.has(object.id)||!inside(object)||!Array.isArray(object.inventory))errors.push('Invalid object: '+object.id);ids.add(object.id);}
  for(const post of definition.guards)if(!inside(post))errors.push('Invalid guard post.');
  return errors;
}
for(const definition of definitions){const errors=validateMission(definition);if(errors.length)throw Error(definition.id+': '+errors.join(' '));}
freeze(legacyCheckpoint);
export const MISSIONS=freeze(definitions);
// An additional encounter; the complete inherited operation roster is retained.
export const FIRST_REALTIME_MISSION=freeze({
  ...structuredClone(MISSIONS[0]),id:'quiet-shift',title:'Quiet Shift',name:'Quiet Shift',location:'MILL 04 / LOADING YARD',
  briefing:'The loading yard is quiet. Two guards remain between you and the shift orders. Approach through the warehouse or around its eastern wall. Fire at Will begins off: find your position, choose your aim, and decide when to commit. Reload behind cover, take the orders, then return to the arrival point.',
  objective:{...structuredClone(MISSIONS[0].objective),id:'shift-orders',kind:'objective',name:'Shift orders',instruction:'Scout the loading yard and recover the shift orders in the records office.',after:'Return to the arrival point with the orders.',collected:'The night shift has been diverted to Reserve 7. Bring these orders home.'},
  guards:[guard('Loading-bay sentry','pistol',16,12,0),guard('Records keeper','rifle',30,5,270)],
  props:[{kind:'barrel-explosive',x:11,y:27,z:0},{kind:'barrel-explosive',x:13,y:27,z:0}],
  steps:['Scout with Hold Fire. Choose a clear shot and enable Fire at Will.','Use cover and movement while your weapon reloads. Recover the shift orders.','Return to the arrival point; clearing both guards is optional.'],
  result:{title:'The shift orders are out.',summary:'returned with the shift orders.',epilogue:'Your animal keeps the skills earned during this operation. The other operations and Mount Dora remain available.'},
});
export function getMission(id=DEFAULT_MISSION_ID,layoutVersion){
  const definition=id===FIRST_REALTIME_MISSION.id?FIRST_REALTIME_MISSION:id===TOUR_ID?TOUR_ACTIVITY:id===WINDOW_REVIEW_ID?WINDOW_REVIEW_MISSION:id==='road-checkpoint'&&layoutVersion===1?legacyCheckpoint:MISSIONS.find(m=>m.id===id);
  if(!definition)throw Error('Unknown operation: '+String(id)+'.');
  if(layoutVersion!==undefined&&layoutVersion!==(definition.layoutVersion??1))throw Error('Unsupported operation layout.');
  return definition;
}
export const missionForState=state=>getMission(state.solo.missionId??DEFAULT_MISSION_ID,state.solo.layoutVersion??1);
export const objectiveSecured=state=>!missionForState(state).exploration&&!!(state.solo.objectives?.[missionForState(state).objective.id]??(missionForState(state).id===DEFAULT_MISSION_ID&&state.solo.ledger));
export const missionDestination=state=>missionForState(state).exploration?null:objectiveSecured(state)?missionForState(state).extraction:missionForState(state).objective;

export function missionMap(id=DEFAULT_MISSION_ID,layoutVersion){
  const mission=getMission(id,layoutVersion);
  if(mission.exploration)throw Error('Load town sources before starting the walking tour.');
  if(mission.id===WINDOW_REVIEW_ID)return adaptAftSector(windowReviewSource());
  if(mission.sector==='aft-road-checkpoint')return checkpointMap();
  const map=mission.sector==='aft-road-checkpoint-approaches'?checkpointApproachMap():{name:mission.name,terrain:Array.from({length:30},()=>Array(40).fill('void')),edges:{}};
  if(!map.worldBounds)for(let y=1;y<=28;y++)for(let x=1;x<=38;x++)map.terrain[y][x]='yard';
  for(const room of mission.rooms){
    const [x,y,w,h]=room.rect;
    for(let cy=y;cy<y+h;cy++)for(let cx=x;cx<x+w;cx++)map.terrain[cy][cx]='floor';
    for(let cy=y;cy<y+h;cy++){map.edges[`e:${x-1}:${cy}`]='wall';map.edges[`e:${x+w-1}:${cy}`]='wall';}
    for(let cx=x;cx<x+w;cx++){map.edges[`s:${cx}:${y-1}`]='wall';map.edges[`s:${cx}:${y+h-1}`]='wall';}
    for(const d of room.doors)map.edges[d.edge]='door';
  }
  if(mission.divider){for(let y=5;y<=20;y++)map.edges[`e:20:${y}`]='wall';delete map.edges['e:20:13'];delete map.edges['e:20:14'];}
  for(const {rect:[x,y,w,h]}of mission.cover)for(let cy=y;cy<y+h;cy++)for(let cx=x;cx<x+w;cx++)map.terrain[cy][cx]='crate';
  if(mission.props){map.props=structuredClone(mission.props);map.obstacles=map.props.map(aftPropObstacle);}
  if(map.doors)map.doors=structuredClone(mission.rooms.flatMap(room=>room.doors));
  return map;
}
export function missionInteractables({missionId=DEFAULT_MISSION_ID,layoutVersion,legacy=false}={}){
  const mission=getMission(missionId,layoutVersion);
  return structuredClone([
    ...mission.rooms.flatMap(room=>room.doors.filter(d=>d.interactive).map(({interactive,...d})=>({...d,open:legacy}))),
    ...mission.containers,...mission.clues,
  ]);
}
