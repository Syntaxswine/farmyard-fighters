import {ELEMENTS,CATALOG_VERSION,BLOCK_METRES,SECTOR_METRES,elementById,GUARD_TYPES} from './overmap-elements.js';
import {OVERMAP_KIND,OVERMAP_SCHEMA,REGION_TYPES,OPPOSITE,STEP,direction,assertOvermap,regionRoute,routeClearForElement} from './overmap-model.js';

// Follows the staged plan/attachment validation structure of AFT3D's pinned
// designer/a20b343a0234/tactics/overmap-generator.js and editor-3d-generator.js.
export const GENERATOR_VERSION='fighters-overmap-1';
export const DEFAULT_SETTINGS=Object.freeze({width:6,height:4,encounters:3});
function random(seed){
  let value=seed>>>0;
  return ()=>{value=(value+0x6D2B79F5)>>>0;let t=Math.imul(value^(value>>>15),value|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
function shuffled(values,r){
  const result=[...values];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
const edgeCell=side=>({north:{x:2,y:0},east:{x:4,y:2},south:{x:2,y:4},west:{x:0,y:2}})[side];
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);

function encounterCells(path,count,r){
  const candidates=shuffled(path.flatMap((cell,i)=>{
    if(!i||i===path.length-1)return [];
    return direction(path[i-1],cell)===direction(cell,path[i+1])?[i]:[];
  }),r);
  function select(start,chosen){
    if(chosen.length===count)return chosen;
    for(let i=start;i<candidates.length;i++){
      const at=candidates[i];
      if(chosen.some(other=>distance(path[at],path[other])<2))continue;
      const found=select(i+1,[...chosen,at]);if(found)return found;
    }
    return null;
  }
  return select(0,[]);
}
function planRoute(entry,exit,count,r){
  const start=edgeCell(entry),end=edgeCell(exit),path=[start],seen=new Set([start.x+','+start.y]);
  let searches=0,chosen;
  function search(cell){
    if(++searches>12000||path.length>17)return false;
    if(cell.x===end.x&&cell.y===end.y){
      if(path.length<count*2+1)return false;
      chosen=encounterCells(path,count,r);return !!chosen;
    }
    const neighbors=shuffled(Object.values(STEP),r).map(([x,y])=>({x:cell.x+x,y:cell.y+y}))
      .filter(next=>next.x>=0&&next.x<5&&next.y>=0&&next.y<5&&!seen.has(next.x+','+next.y));
    neighbors.sort((a,b)=>distance(a,end)-distance(b,end));
    for(const next of neighbors){
      const key=next.x+','+next.y;seen.add(key);path.push(next);
      if(search(next))return true;
      path.pop();seen.delete(key);
    }
    return false;
  }
  if(!search(start))throw Error('Could not connect the selected sector edges with enough guard approaches.');
  return {path:structuredClone(path),encounters:chosen};
}
function regionElements(region,route,r){
  const elements=[],occupied=new Set(),pathCells=new Set(route.path.map(cell=>cell.x+','+cell.y));
  const library=ELEMENTS.filter(item=>item.kind==='fortification'&&item.tags.includes(region.type));
  for(const index of route.encounters){
    const cell=route.path[index],entry=direction(cell,route.path[index-1]);
    const element=library[Math.floor(r()*library.length)];
    const rotation={south:0,west:90,north:180,east:270}[entry];
    elements.push({id:region.id+'-post-'+index,element:element.id,revision:element.revision,
      x:cell.x*2,y:cell.y*2,rotation,kit:element.kit,behavior:element.behavior,
      guardType:GUARD_TYPES[Math.floor(r()*GUARD_TYPES.length)].id});
    for(let y=cell.y*2;y<cell.y*2+2;y++)for(let x=cell.x*2;x<cell.x*2+2;x++)occupied.add(x+','+y);
  }
  const weakRoute=regionRoute({...region,path:route.path,elements});
  for(let y=0;y<10;y++)for(let x=0;x<10;x++){
    if(occupied.has(x+','+y))continue;
    const covered=pathCells.has(Math.floor(x/2)+','+Math.floor(y/2));
    const placement={id:region.id+'-'+x+'-'+y,x,y,rotation:0};
    const eligible=covered?shuffled(ELEMENTS.filter(item=>item.kind==='connection'),r)
      .filter(item=>routeClearForElement({...placement,element:item.id,revision:item.revision},weakRoute)):[];
    const id=covered?eligible[0].id:region.type==='depot'?'ground.yard':'ground.grass';
    const element=elementById(id);
    elements.push({...placement,element:id,revision:element.revision});
  }
  return elements;
}
export function generateOvermap(seed,settings={},progress=()=>{}){
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Seed must be a uint32.');
  if(Object.keys(settings).some(key=>!Object.hasOwn(DEFAULT_SETTINGS,key)))throw Error('Unsupported generator setting.');
  const options={...DEFAULT_SETTINGS,...settings};
  if(!Number.isInteger(options.width)||options.width<2||options.width>30||
    !Number.isInteger(options.height)||options.height<2||options.height>15||
    !Number.isInteger(options.encounters)||options.encounters<1||options.encounters>4)
    throw Error('Use 2–30 columns, 2–15 rows, and 1–4 guard posts per sector.');
  const r=random(seed),flipX=r()<.5,flipY=r()<.5,route=[];
  for(let y=0;y<options.height;y++)for(let step=0;step<options.width;step++){
    let x=y%2?options.width-1-step:step;
    const row=flipY?options.height-1-y:y;
    if(flipX)x=options.width-1-x;
    route.push({x,y:row,id:String.fromCharCode(65+x)+(row+1)});
  }
  const regions=[];
  for(const [index,cell]of route.entries()){
    progress({stage:'Connecting weak approaches',completed:index,total:route.length});
    const entry=index?direction(cell,route[index-1]):OPPOSITE[direction(cell,route[index+1])];
    const exit=index<route.length-1?direction(cell,route[index+1]):OPPOSITE[entry];
    const type=REGION_TYPES[Math.floor(r()*REGION_TYPES.length)];
    let region;
    for(let attempt=0;attempt<12;attempt++){
      try{
        const local=planRoute(entry,exit,options.encounters,r);
        region={...cell,name:type[0].toUpperCase()+type.slice(1)+' '+cell.id,type,entry,exit,path:local.path};
        region.elements=regionElements(region,local,r);
        break;
      }catch(error){if(attempt===11)throw Error(cell.id+': '+error.message);}
    }
    regions.push(region);
  }
  progress({stage:'Checking connections and footprints',completed:route.length,total:route.length});
  return assertOvermap({kind:OVERMAP_KIND,version:OVERMAP_SCHEMA,catalog:CATALOG_VERSION,
    sources:{aft3d:'a20b343a0234b5d8b365a4e1668961ca1bf37653',nautilus:'2502646482218524fd5129641da769bb82462e4d'},
    generator:GENERATOR_VERSION,revision:0,seed,settings:options,width:options.width,height:options.height,
    blockMetres:BLOCK_METRES,sectorMetres:SECTOR_METRES,route:route.map(cell=>cell.id),regions});
}
