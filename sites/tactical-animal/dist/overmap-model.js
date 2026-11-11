import {BLOCK_METRES,SECTOR_METRES,CATALOG_VERSION,ELEMENTS,elementById,guardKit,guardBehavior,GUARD_TYPES,guardsForInstance,
  instanceRoute,footprintRectangles,rotatePoint,buildingForElement} from './overmap-elements.js';
import {bearingOffset,sightOf,identifyRange} from './aft/tactics/core/perception.js';
import {woodlandDepth} from './designer/a20b343a0234/tactics/core/woodland.js';

export const OVERMAP_KIND='farmyard-fighters-overmap';
export const OVERMAP_SCHEMA=1;
export const REGION_TYPES=['farm','woodland','checkpoint','settlement','depot'];
export const SIDES=['north','east','south','west'];
export const OPPOSITE={north:'south',east:'west',south:'north',west:'east'};
export const STEP={north:[0,-1],east:[1,0],south:[0,1],west:[-1,0]};
export function direction(a,b){
  const dx=b.x-a.x,dy=b.y-a.y;
  return SIDES.find(side=>STEP[side][0]===dx&&STEP[side][1]===dy);
}
export const regionPort=side=>({
  north:[120,1],east:[238,120],south:[120,238],west:[1,120]
})[side];

function join(points,extra){
  for(const point of extra)if(!points.length||Math.hypot(point[0]-points.at(-1)[0],point[1]-points.at(-1)[1])>1e-7)
    points.push([...point]);
}
export function regionRoute(region){
  const points=[regionPort(region.entry)];
  for(const cell of region.path){
    const encounter=region.elements.find(item=>item.x===cell.x*2&&item.y===cell.y*2&&elementById(item.element,item.revision).kind==='fortification');
    if(encounter)join(points,instanceRoute(encounter));
    else join(points,[[cell.x*48+24,cell.y*48+24]]);
  }
  join(points,[regionPort(region.exit)]);
  return points;
}
function regionDensity(region){
  const density=new Uint8Array(240*240);
  for(const item of region.elements){
    const element=elementById(item.element,item.revision);
    if(element.kind==='connection'){
      for(let y=0;y<24;y++){
        const start=(item.y*24+y)*240+item.x*24;
        density.fill(element.density,start,start+24);
      }
    }else if(element.kind==='fortification'){
      for(let y=0;y<48;y++)for(let x=28;x<36;x++){
        const point=rotatePoint([x,y],item.rotation);
        density[(item.y*24+point[1])*240+item.x*24+point[0]]=60;
      }
    }
  }
  return density;
}
export function regionFoliage(region){
  const density=regionDensity(region),foliage={};
  for(let i=0;i<density.length;i++)if(density[i])foliage[(i%240)+','+Math.floor(i/240)+',0']=[density[i],false,'woodland-v1'];
  return foliage;
}
function vegetationField(region){
  const density=regionDensity(region),values=new Map();
  const foliage=new Proxy({},{get(_target,key){
    if(typeof key!=='string')return undefined;
    const [x,y,z]=key.split(',').map(Number);
    if(z!==0||x<0||y<0||x>=240||y>=240)return undefined;
    const value=density[y*240+x];
    if(!value)return undefined;
    if(!values.has(value))values.set(value,[value,false,'woodland-v1']);
    return values.get(value);
  }});
  const row=Array(240).fill('ground-grass');
  return {terrain:Array(240).fill(row),foliage};
}

function segmentHitsBox(a,b,box,margin=.5){
  const [x,y,w,h]=box;
  let lo=0,hi=1;
  for(const [axis,min,max]of [[0,x-margin,x+w+margin],[1,y-margin,y+h+margin]]){
    const delta=b[axis]-a[axis];
    if(Math.abs(delta)<1e-9){if(a[axis]<min||a[axis]>max)return false;continue;}
    const from=(min-a[axis])/delta,to=(max-a[axis])/delta;
    lo=Math.max(lo,Math.min(from,to));hi=Math.min(hi,Math.max(from,to));
    if(lo>hi)return false;
  }
  return hi>1e-7&&lo<1-1e-7;
}
function placedFootprints(instance){
  const element=elementById(instance.element,instance.revision);
  return footprintRectangles(element).map(box=>{
    const size=element.footprint[0]*BLOCK_METRES;
    const corners=[[box[0],box[1]],[box[0]+box[2],box[1]+box[3]]].map(p=>rotatePoint(p,instance.rotation,size));
    return [Math.min(corners[0][0],corners[1][0])+instance.x*BLOCK_METRES,
      Math.min(corners[0][1],corners[1][1])+instance.y*BLOCK_METRES,
      Math.abs(corners[1][0]-corners[0][0]),Math.abs(corners[1][1]-corners[0][1])];
  });
}
export function routeClearForElement(instance,route){
  return !placedFootprints(instance).some(box=>route.some((point,index)=>
    index>0&&segmentHitsBox(route[index-1],point,box)));
}
export function validateRegion(region){
  const errors=[],occupied=new Set();
  if(!region||typeof region.name!=='string'||region.name.length>100||!REGION_TYPES.includes(region.type)||
    !SIDES.includes(region.entry)||!SIDES.includes(region.exit)||region.entry===region.exit||
    !Array.isArray(region.path)||region.path.length<2||region.path.length>25||
    !Array.isArray(region.elements)||region.elements.length>100)return ['Invalid sector blueprint.'];
  const pathCells=new Set();
  for(const [index,cell]of region.path.entries()){
    if(!cell||typeof cell!=='object'){errors.push('Invalid route cell.');continue;}
    if(!Number.isInteger(cell.x)||!Number.isInteger(cell.y)||cell.x<0||cell.x>4||cell.y<0||cell.y>4||
      pathCells.has(cell.x+','+cell.y))errors.push('The weak-point route must use distinct cells inside the sector.');
    if(index&&region.path[index-1]&&!direction(region.path[index-1],cell))errors.push('The weak-point route has a disconnected step.');
    pathCells.add(cell.x+','+cell.y);
  }
  const edgeCell=side=>({north:{x:2,y:0},east:{x:4,y:2},south:{x:2,y:4},west:{x:0,y:2}})[side];
  const start=edgeCell(region.entry),end=edgeCell(region.exit);
  if(region.path[0]?.x!==start.x||region.path[0]?.y!==start.y||
    region.path.at(-1)?.x!==end.x||region.path.at(-1)?.y!==end.y)errors.push('Sector route endpoints do not meet their declared edges.');
  const ids=new Set();
  for(const item of region.elements){
    if(!item||typeof item!=='object'){errors.push('Invalid element instance.');continue;}
    try{
      const element=elementById(item.element,item.revision);
      if(typeof item.id!=='string'||!item.id||ids.has(item.id))throw Error('Element instance IDs must be unique.');
      ids.add(item.id);
      if(!Number.isInteger(item.x)||!Number.isInteger(item.y)||![0,90,180,270].includes(item.rotation))throw Error('Invalid element placement.');
      const [w,h]=element.footprint;
      for(let y=item.y;y<item.y+h;y++)for(let x=item.x;x<item.x+w;x++){
        if(x<0||y<0||x>=10||y>=10)throw Error('An element leaves the sector.');
        if(occupied.has(x+','+y))throw Error('Element footprints overlap.');
        occupied.add(x+','+y);
      }
      if(element.kind==='fortification'){
        guardKit(item.kit);guardBehavior(item.behavior);
        if(!GUARD_TYPES.some(type=>type.id===item.guardType))throw Error('Unknown guard type.');
        const index=region.path.findIndex(cell=>cell.x*2===item.x&&cell.y*2===item.y);
        if(index<=0||index===region.path.length-1)throw Error('Every guard post needs a route before and after it.');
        const entry=direction(region.path[index],region.path[index-1]),exit=direction(region.path[index],region.path[index+1]);
        const expected=[0,90,180,270][['south','west','north','east'].indexOf(entry)];
        if(OPPOSITE[entry]!==exit||item.rotation!==expected)throw Error('A guard post faces incompatible route connections.');
        const local=element.approach;
        if(!local.some(p=>p[0]===element.weakPoint[0]&&p[1]===element.weakPoint[1]))throw Error('The route does not visit this post’s weak approach.');
        for(const box of footprintRectangles(element))for(let i=1;i<local.length;i++)
          if(segmentHitsBox(local[i-1],local[i],box))throw Error('The weak approach runs through a building or solid cover.');
        for(const guard of element.guards)for(const box of footprintRectangles(element))
          if(segmentHitsBox(guard,guard,box,.23))throw Error('A guard starts inside a building footprint.');
        if(item.behavior==='patrol'){
          const patrol=[element.guards[1],...element.patrol,element.patrol[0]];
          for(let i=1;i<patrol.length;i++)for(const box of [...footprintRectangles(element),...element.cover])
            if(segmentHitsBox(patrol[i-1],patrol[i],box,.23))throw Error('A patrol crosses a building or barricade.');
        }
      }
    }catch(error){errors.push(item.id+': '+error.message);}
  }
  if(occupied.size!==100)errors.push('Every 24-metre block needs an assigned element.');
  if(!errors.length){
    const route=regionRoute(region);
    const opaqueFootprints=[];
    const vegetation=vegetationField(region);
    // Validate the assembled polyline against every placed footprint, including
    // neighbouring posts that could obstruct an otherwise valid local approach.
    for(const item of region.elements){
      const element=elementById(item.element,item.revision);
      if(element.kind==='fortification')opaqueFootprints.push(...placedFootprints(item));
      if(!routeClearForElement(item,route))errors.push(item.id+': the connected route intersects an occupied footprint.');
    }
    // Check the complete route against every initial watch position, including
    // posts outside the current element. Patrol timing remains a combat review.
    for(const guard of region.elements.flatMap(guardsForInstance)){
      const profile=sightOf(guard);
      let exposed=false;
      for(let i=1;i<route.length&&!exposed;i++){
        const a=route[i-1],b=route[i],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])));
        for(let n=0;n<=steps;n++){
          const point={x:a[0]+(b[0]-a[0])*n/steps,y:a[1]+(b[1]-a[1])*n/steps};
          if(bearingOffset(guard,point)>profile.bino/2||Math.hypot(point.x-guard.x,point.y-guard.y)>identifyRange(guard,point,26)*.7)continue;
          if(opaqueFootprints.some(box=>segmentHitsBox([guard.x,guard.y],[point.x,point.y],box,0)))continue;
          const distance=Math.hypot(point.x-guard.x,point.y-guard.y);
          if(distance>3&&distance+9*.55*woodlandDepth(vegetation,guard,point)>identifyRange(guard,point,26)*.7)continue;
          exposed=true;break;
        }
      }
      if(exposed)errors.push(guard.id+': a weak-route segment crosses an initial guard front.');
    }
  }
  return [...new Set(errors)];
}

export function validateOvermap(map){
  const errors=[];
  if(!map||map.kind!==OVERMAP_KIND||map.version!==OVERMAP_SCHEMA||map.catalog!==CATALOG_VERSION||
    !Number.isInteger(map.seed)||map.seed<0||map.seed>0xffffffff||
    !Number.isInteger(map.width)||!Number.isInteger(map.height)||map.width<2||map.width>30||map.height<2||map.height>15||
    map.blockMetres!==BLOCK_METRES||map.sectorMetres!==SECTOR_METRES||
    !Array.isArray(map.regions)||map.regions.length!==map.width*map.height||!Array.isArray(map.route)||
    map.route.length!==map.regions.length)return {valid:false,errors:['Unsupported Fighters overmap document.']};
  const ids=new Set(),cells=new Set(),byId=new Map();
  for(const region of map.regions){
    if(!region||typeof region!=='object'){errors.push('Invalid sector blueprint.');continue;}
    if(typeof region.id!=='string'||!region.id||ids.has(region.id)||!Number.isInteger(region.x)||!Number.isInteger(region.y)||
      region.x<0||region.y<0||region.x>=map.width||region.y>=map.height||cells.has(region.x+','+region.y))
      errors.push('Sector IDs and positions must be unique and inside the overmap.');
    ids.add(region.id);cells.add(region.x+','+region.y);byId.set(region.id,region);
    errors.push(...validateRegion(region).map(message=>region.id+': '+message));
  }
  const routeIds=new Set(map.route);
  if(routeIds.size!==map.regions.length||map.route.some(id=>!byId.has(id)))errors.push('The world route must reach every sector exactly once.');
  for(let i=1;i<map.route.length;i++){
    const before=byId.get(map.route[i-1]),after=byId.get(map.route[i]);
    if(!before||!after)continue;
    const side=direction(before,after);
    if(!side||before.exit!==side||after.entry!==OPPOSITE[side])errors.push('Adjacent sectors have mismatched route connections.');
  }
  const first=byId.get(map.route[0]),last=byId.get(map.route.at(-1));
  const outside=(region,side)=>{
    const step=STEP[side];if(!step)return false;
    return region.x+step[0]<0||region.y+step[1]<0||region.x+step[0]>=map.width||region.y+step[1]>=map.height;
  };
  if(first&&last&&(!outside(first,first.entry)||!outside(last,last.exit)))errors.push('The world entrance and exit must reach its boundary.');
  return {valid:errors.length===0,errors:[...new Set(errors)]};
}
export function assertOvermap(map){
  const result=validateOvermap(map);
  if(!result.valid)throw Error(result.errors.slice(0,6).join('\n'));
  return map;
}
export function replaceElement(map,regionId,instanceId,replacement,changes={}){
  const next=structuredClone(assertOvermap(map));
  const region=next.regions.find(item=>item.id===regionId),instance=region?.elements.find(item=>item.id===instanceId);
  if(!instance)throw Error('Select an existing element.');
  const old=elementById(instance.element,instance.revision),element=elementById(replacement);
  if(old.kind!==element.kind||old.footprint.join(',')!==element.footprint.join(','))
    throw Error('Choose a variation with the same role and footprint.');
  if(Object.keys(changes).some(key=>!['kit','behavior','guardType'].includes(key)))throw Error('Unsupported variation property.');
  instance.element=element.id;instance.revision=element.revision;
  Object.assign(instance,changes);
  next.revision=(next.revision||0)+1;
  return assertOvermap(next);
}
export const compatibleElements=instance=>{
  const current=elementById(instance.element,instance.revision);
  return ELEMENTS.filter(item=>item.kind===current.kind&&item.footprint.join(',')===current.footprint.join(','));
};
export function sectorBlueprint(map,regionId){
  assertOvermap(map);
  const region=map.regions.find(item=>item.id===regionId);
  if(!region)throw Error('Select an existing sector.');
  return {kind:'farmyard-fighters-sector-blueprint',version:1,catalog:map.catalog,
    sources:structuredClone(map.sources),
    worldSeed:map.seed,blockMetres:BLOCK_METRES,sectorMetres:SECTOR_METRES,
    region:structuredClone(region),weakRoute:regionRoute(region),
    foliage:regionFoliage(region),
    elementDefinitions:[...new Set(region.elements.map(item=>item.element))].map(id=>structuredClone(elementById(id))),
    buildings:region.elements.flatMap(item=>{
      const element=elementById(item.element,item.revision),building=buildingForElement(element);
      return building?[{instance:item.id,source:structuredClone(building.source),at:[...building.at],
        groundFloor:structuredClone(building.compiled.floors[0]),rotation:item.rotation}]:[];
    }),
    guards:region.elements.flatMap(guardsForInstance)};
}
