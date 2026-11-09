import {cliffSupportAt} from './cliff-support.js';
import {invalidateMapGeometry} from './map-geometry-cache.js';

export const STRUCTURE_HP=Object.freeze({thin:75,light:100,heavy:200});
const floorKinds=new Set(['floor','bridge','ground-wood-planks','ground-concrete','ground-tiles','ground-asphalt']);
const isDoor=k=>['door','door-wood-closed','door-steel-closed','doorway-concrete-open'].includes(k);
const tier=k=>/wood|^bridge$/.test(k)?'thin':/concrete|brick|steel|parapet|^wall$/.test(k)?'heavy':'light';
const surface=(s,x,y,z)=>z?(s.upper?.[z-1]?.[`${x},${y}`]||'void'):(s.map||s.terrain)?.[y]?.[x];
const roofAt=(s,x,y,z)=>[...(s.props||[]),...(s.canopies||[])].find(p=>p.kind?.startsWith('roof-')&&(p.z||0)===z&&x>=p.x&&x<p.x+2&&y>=p.y&&y<p.y+2);

// Sparse encounter data: an absent entry is pristine. No authored map, old
// encounter or reusable block needs tens of thousands of new HP fields.
export function structureInfo(s,target){
 if(!target)return null;let id,kind,type,point,roof;
 if(target.edge!==undefined){
  kind=s.edges?.[target.edge];if(!kind||!(/^(wall|window|door)/.test(kind)))return null;
  id='edge:'+target.edge;type='wall';
 }else{
  const {x,y,z=0}=target;if(![x,y,z].every(Number.isInteger))return null;
  point={x,y,z};roof=roofAt(s,x,y,z);kind=roof?.kind||surface(s,x,y,z);
  if(!roof&&kind!=='wall'&&(!floorKinds.has(kind)||cliffSupportAt(s,point)))return null;
  type=roof?'roof':kind==='wall'?'wall':'floor';
  id=roof?`roof:${roof.x},${roof.y},${z}`:`tile:${x},${y},${z}`;
 }
 const stored=s.structureHealth?.[id],compatible=stored&&(stored.kind===kind||type==='wall'&&isDoor(stored.kind)&&isDoor(kind)),material=tier(compatible?stored.kind:kind),maxHp=STRUCTURE_HP[material];
 return {id,kind,type,material,maxHp,hp:compatible?stored.hp:maxHp,target:target.edge!==undefined?{edge:target.edge}:point,...roof&&{roof}};
}

export const emptyScenery=()=>({edges:{},props:[],tiles:[],canopies:[],stairs:[],climbs:[]});
export function mergeScenery(into,from){
 if(!from)return into;Object.assign(into.edges,from.edges);
 for(const field of ['props','tiles','canopies','stairs','climbs'])into[field].push(...from[field]||[]);
 return into;
}

export function damageStructure(s,target,amount){
 const info=structureInfo(s,target);if(!info||!Number.isFinite(amount)||amount<=0)return null;
 const damage=Math.min(info.hp,Math.max(1,Math.round(amount))),hp=info.hp-damage,before=emptyScenery();
 s.structureHealth??={};
 if(hp>0)s.structureHealth[info.id]={kind:info.type==='wall'&&isDoor(info.kind)&&isDoor(s.structureHealth[info.id]?.kind||'')?s.structureHealth[info.id].kind:info.kind,hp};
 else{
  delete s.structureHealth[info.id];
  if(target.edge!==undefined){before.edges[target.edge]=s.edges[target.edge];delete s.edges[target.edge];if(s.edgeLocks)delete s.edgeLocks[target.edge];}
  else{
   const cells=info.roof?Array.from({length:4},(_,i)=>({x:info.roof.x+i%2,y:info.roof.y+Math.floor(i/2),z:info.roof.z||0})):[target];
   if(info.roof){const field=(s.canopies||[]).includes(info.roof)?'canopies':'props';before[field].push(structuredClone(info.roof));s[field]=(s[field]||[]).filter(p=>p!==info.roof);}
   for(const p of cells){
    const {x,y,z=0}=p,kind=surface(s,x,y,z);if(info.roof&&(before.canopies||[]).length)continue;
    before.tiles.push({x,y,z,kind});delete s.structureHealth[`tile:${x},${y},${z}`];
    if(z){if(info.type==='wall')s.upper[z-1][`${x},${y}`]='floor';else delete s.upper[z-1][`${x},${y}`];}
    else (s.map||s.terrain)[y][x]=kind==='bridge'?'water':'ground-gravel';
   }
  }
 }
 if(hp===0)invalidateMapGeometry(s);
 return {id:info.id,kind:info.kind,type:info.type,maxHp:info.maxHp,hp,damage,destroyed:hp===0,before};
}

export function validStructureHealth(s){
 if(s.structureHealth===undefined)return true;
 if(!s.structureHealth||typeof s.structureHealth!=='object'||Array.isArray(s.structureHealth))return false;
 const map=s.map||s.terrain;
 for(const [id,entry]of Object.entries(s.structureHealth)){
  if(!entry||typeof entry.kind!=='string'||!Number.isInteger(entry.hp)||entry.hp<=0)return false;
  let target;
  if(/^edge:[es]:-?\d+:-?\d+(?::[0-5])?$/.test(id)){
   const [,axis,a,b,c='0']=id.split(':'),x=Number(a),y=Number(b),z=Number(c);
   if(x<(axis==='e'?-1:0)||y<(axis==='s'?-1:0)||x>=map[0].length||y>=map.length)return false;
   target={edge:id.slice(5)};
  }else if(/^(tile|roof):\d+,\d+,[0-5]$/.test(id)){
   const [x,y,z]=id.split(':')[1].split(',').map(Number);if(x>=map[0].length||y>=map.length)return false;target={x,y,z};
  }else return false;
  const info=structureInfo(s,target);
  if(!info||info.id!==id||entry.kind!==info.kind&&!(info.type==='wall'&&isDoor(entry.kind)&&isDoor(info.kind))||entry.hp>info.maxHp)return false;
 }
 return true;
}
