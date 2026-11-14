import {WALL_KIT,wallRunErrors,wallRunsIntersect,wallPanels,shiftWallRun} from './mount-dora-source/wall-runs.js';
import {TownExplored} from './mount-dora-progress.js';
import {blockWindow} from './world-grid.js';
import {trunkDistance,trunkSpan} from './trunk-geometry.js';
import {MATURE_TREE_SCALE} from './aft/tactics/biome-foliage-data.js';
import {groundHash} from './aft/tactics/biome-ground-composition.js';
import {maturePinesForSector,MATURE_PINE_STYLES} from './mount-dora-pines.js';
import {matureBroadleavesForSector,MATURE_BROADLEAF_STYLES} from './mount-dora-broadleaf.js';
import {patrolError} from './aft/tactics/character-patrol.js';
import {woodlandDepth} from './designer/a20b343a0234/tactics/core/woodland.js';
import {foliageDepth} from './designer/a20b343a0234/tactics/foliage-data.js';
import {TownInteriors} from './town-interiors.js';
// The tour walker's body radius, in metres: what pointClear keeps clear, and what the
// town's art lifts onto a raised deck when it overlaps one.
export const WALKER_RADIUS=.23;
export const TOWN_LIMITS=Object.freeze({decodedSectors:9,concurrentFetches:2,pendingFetches:9,sectorBytes:4_000_000});
export const TOWN_GROUNDS=Object.freeze(['ground-grass','water','woodland','ground-dirt','ground-gravel','ground-asphalt','ground-concrete','ground-wood-planks','bridge','floor']);
const groundKinds=new Set(TOWN_GROUNDS),EPS=1e-7,BUCKET=8;
const sentryWeapons=new Set(['pistol','smg','rifle','shotgun']);
const nativeSentries=s=>s.guards??(s.guard?[s.guard]:[]);
const nativePoint=p=>p&&[p.x,p.y].every(n=>Number.isInteger(n)&&n>=0&&n<240)&&p.z===0;
const sentryFields=g=>[g?.id,g?.x,g?.y,g?.z,g?.species,g?.weapon,g?.heading,g?.patrolSource,Array.isArray(g?.patrol)?g.patrol.map(p=>[p?.x,p?.y,p?.z,p?.waitSeconds]):g?.patrol];
const roofedScenery=new Set(['building','pavilion','lighthouse','stage']);
const plantKinds=new Set(['tree-broadleaf','tree-pine','tree-broadleaf-large','tree-pine-large','bush','reeds']);
export const sha256=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const intersect=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
const boxDistance=(p,b)=>Math.hypot(Math.max(b[0]-p.x,0,p.x-b[2]),Math.max(b[1]-p.y,0,p.y-b[3]));
const segmentDistance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/n)):0;return Math.hypot(p.x-a[0]-t*dx,p.y-a[1]-t*dy);};
function ringContains(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function solidDistance(s,p){
  if(s.kind==='circle')return trunkDistance(p,s);
  if(s.kind==='segment')return Math.max(0,segmentDistance(p,s.a,s.b)-s.radius);
  if(s.kind!=='polygon')throw Error('Unsupported landmark collision kind: '+s.kind);
  let distance=Infinity;
  for(const polygon of s.polygons){if(ringContains(p,polygon[0])&&!polygon.slice(1).some(r=>ringContains(p,r)))return 0;
    for(const ring of polygon)for(let i=0;i<ring.length;i++)distance=Math.min(distance,segmentDistance(p,ring[i],ring[(i+1)%ring.length]));}
  return distance;
}
export function shapeBounds(s){
  if(s.kind==='circle')return [s.centre[0]-s.radius,s.centre[1]-s.radius,s.centre[0]+s.radius,s.centre[1]+s.radius];
  if(s.kind==='segment')return [Math.min(s.a[0],s.b[0])-s.radius,Math.min(s.a[1],s.b[1])-s.radius,Math.max(s.a[0],s.b[0])+s.radius,Math.max(s.a[1],s.b[1])+s.radius];
  if(s.kind==='polygon'){const points=s.polygons.flat(2);return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];}
  throw Error('Unsupported landmark shape');
}
function moveShape(s){
  const point=p=>[p[0]-.5,p[1]-.5],result={...s};
  if(s.kind==='polygon')result.polygons=s.polygons.map(poly=>poly.map(ring=>ring.map(point)));
  else if(s.kind==='circle')result.centre=point(s.centre);
  else if(s.kind==='segment'){result.a=point(s.a);result.b=point(s.b);}else throw Error('Unsupported landmark shape');
  result.bounds=shapeBounds(result);return result;
}
class SpatialIndex{
  constructor(){this.buckets=new Map();this.records=[];}
  add(item,bounds){item.bounds=bounds;this.records.push(item);for(let y=Math.floor(bounds[1]/BUCKET);y<=Math.floor(bounds[3]/BUCKET);y++)for(let x=Math.floor(bounds[0]/BUCKET);x<=Math.floor(bounds[2]/BUCKET);x++){const id=x+','+y;if(!this.buckets.has(id))this.buckets.set(id,[]);this.buckets.get(id).push(item);}}
  query(bounds){const out=new Set();for(let y=Math.floor(bounds[1]/BUCKET);y<=Math.floor(bounds[3]/BUCKET);y++)for(let x=Math.floor(bounds[0]/BUCKET);x<=Math.floor(bounds[2]/BUCKET);x++)for(const item of this.buckets.get(x+','+y)||[])if(intersect(bounds,item.bounds))out.add(item);return [...out];}
}
function sparseStore(limit){const values=new Map();return new Proxy({},{get(target,key){return key==='size'?values.size:values.get(key)||0;},set(target,key,value){if(values.size>=limit&&!values.has(key))values.delete(values.keys().next().value);values.set(key,value);return true;}});}
export function validateTownProject(p){
  if(p?.id!=='mount-dora-downtown'||p.sectorSize!==240||p.columns!==6||p.rows!==7||p.extent?.widthM!==1440||p.extent?.depthM!==1680||!Array.isArray(p.sectors)||p.sectors.length!==42)throw Error('Unsupported Mount Dora project extent.');
  const ids=new Set(),cells=new Set();
  for(const s of p.sectors){const key=s.column+','+s.row;if(ids.has(s.id)||cells.has(key)||!Number.isInteger(s.column)||!Number.isInteger(s.row)||s.column<0||s.column>=6||s.row<0||s.row>=7||s.origin?.x!==s.column*240||s.origin?.y!==s.row*240||!/^sectors\/[A-F]0[1-7]\.map\.json$/.test(s.file)||!/^[a-f0-9]{64}$/.test(s.metrics?.sha256))throw Error('Unsupported town sector '+s.id);ids.add(s.id);cells.add(key);}
  const withPatrols=p.generation?.version>=7,guardIds=new Set();
  for(const s of p.sectors){
    const posts=nativeSentries(s),primary=s.row*p.columns+s.column+1;
    if(!Array.isArray(posts)||posts.length>(withPatrols?2:1)||withPatrols&&!Array.isArray(s.guards))throw Error('Invalid guard roster in '+s.id);
    if(p.generation?.version>=6&&(posts.length>0)!==s.nativeImport?.ready)throw Error('Missing land/water guard coverage in '+s.id);
    for(const [i,g]of posts.entries()){
      const id=withPatrols?g?.id:primary;
      if(!nativePoint(g)||g.species!=='pig-foreman'||!sentryWeapons.has(g.weapon)||!Number.isFinite(g.heading)||g.heading<0||g.heading>=360||guardIds.has(id)||
        (i===0?id!==primary:!Number.isInteger(id)||id<43||id>45)||patrolError(g.patrol)||g.patrol?.some(p=>!nativePoint(p)))throw Error('Invalid guard post in '+s.id);
      guardIds.add(id);
    }
  }
  if(withPatrols&&guardIds.size!==42)throw Error('The town needs 42 authored sentries.');
  return p;
}
export function decodeTownSector(raw,sector,visualReplacement=new Set(),physicalReplacement=new Set(),roofBounds=[]){
  if(raw?.version!==2||raw.width!==240||raw.height!==240||raw.mountDora?.sectorId!==sector.id||!Array.isArray(raw.terrain)||raw.terrain.length!==240||raw.terrain.some(row=>!Array.isArray(row)||row.length!==240||row.some(t=>!groundKinds.has(t))))throw Error('Unsupported terrain in '+sector.id);
  if(Object.keys(raw.edges||{}).length||(raw.stairs||[]).length||(raw.climbs||[]).length||raw.buildingPrefabs||raw.slopedRoofs||raw.canopies||raw.farmyardWindows)throw Error('This sector needs an unsupported walking-tour feature: '+sector.id);
  const issues=wallRunErrors(raw);if(issues.length)throw Error(sector.id+': '+issues.join(' '));
  const posts=raw.guards||[],expected=nativeSentries(sector);
  if(!Array.isArray(posts)||posts.length!==expected.length||posts.some((g,i)=>JSON.stringify(sentryFields(g))!==JSON.stringify(sentryFields(expected[i]))))throw Error('Guard post differs from the town atlas in '+sector.id);
  const packet={id:sector.id,sector,raw,walls:new SpatialIndex(),plants:new SpatialIndex(),plantSolids:new SpatialIndex(),roofs:new Map(),used:0};
  for(const original of raw.wallRuns?.segments||[]){
    if(!Array.isArray(original.sourceBuildingIds)||!original.sourceBuildingIds.length||!original.sourceWallId)throw Error('Native wall lacks global source ownership.');
    const run=shiftWallRun(original,sector.origin.x,sector.origin.y),key=run.sourceWallId+':'+run.a.join(',')+'>'+run.b.join(',')+':'+run.z+':'+run.stories;
    const bounds=[Math.min(run.a[0],run.b[0])-.08,Math.min(run.a[1],run.b[1])-.08,Math.max(run.a[0],run.b[0])+.08,Math.max(run.a[1],run.b[1])+.08];
    packet.walls.add({run,key,draw:!run.sourceBuildingIds.every(id=>visualReplacement.has(id)),walk:!run.sourceBuildingIds.every(id=>physicalReplacement.has(id))},bounds);
  }
  const allRoofsReplaced=(raw.mountDora.buildingIds||[]).length&&(raw.mountDora.buildingIds||[]).every(id=>visualReplacement.has(id));
  if(!Array.isArray(raw.upper)||raw.upper.length!==raw.levels-1)throw Error('Unsupported native upper masks.');
  for(let level=1;level<raw.levels;level++)for(const [cell,kind]of Object.entries(raw.upper[level-1])){
    if(kind!=='floor')throw Error('Unsupported upper terrain in '+sector.id);const [x,y]=cell.split(',').map(Number);
    if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=240||y>=240)throw Error('Invalid upper cell.');
    if(!allRoofsReplaced){const gx=x+sector.origin.x,gy=y+sector.origin.y,id=Math.floor(gx/24)+','+Math.floor(gy/24);if(!packet.roofs.has(id))packet.roofs.set(id,[]);packet.roofs.get(id).push({x:gx,y:gy,level});}
  }
  const plantCells=new Set();
  const place=(p,maturePine,matureBroadleaf)=>{
    const {x:localX,y:localY,kind}=p,x=localX+sector.origin.x,y=localY+sector.origin.y;
    const placed={...p,x,y,maturePine,matureBroadleaf,id:sector.id+':'+kind+':'+localX+','+localY};
    packet.plants.add(placed,[x,y,x,y]);
    return placed;
  };
  const props=raw.props||[],retained=raw.mountDora.retainedMatureTrees===true;
  const maturePines=retained?new Map():maturePinesForSector(props,sector.origin);
  const matureBroadleaves=retained?new Map():matureBroadleavesForSector(props,sector.origin,maturePines,(x,y,reach)=>{
    const p={x,y},area=[x-reach,y-reach,x+reach,y+reach];
    if(roofBounds.some(bounds=>boxDistance(p,bounds)<reach)||
       packet.walls.query(area).some(w=>w.draw&&boxDistance(p,w.bounds)<reach))return true;
    const lx=x-sector.origin.x,ly=y-sector.origin.y;
    for(let row=Math.floor(ly-reach);row<=Math.ceil(ly+reach);row++){
      for(let col=Math.floor(lx-reach);col<=Math.ceil(lx+reach);col++){
        if(raw.terrain[row]?.[col]==='floor'&&Math.hypot(col-lx,row-ly)<reach+Math.SQRT1_2)return true;
      }
    }
    return false;
  });
  for(const p of props){
    if(!plantKinds.has(p.kind)||(p.z||0)!==0||!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x>=240||p.y>=240)throw Error('Unsupported native town prop: '+p.kind);
    if(retained&&p.mountDora?.matureVariant!==undefined){
      const variant=p.mountDora.matureVariant,pine=p.kind.startsWith('tree-pine');
      const styles=pine?MATURE_PINE_STYLES:MATURE_BROADLEAF_STYLES;
      if(!Number.isInteger(variant)||!styles[variant]||!pine&&p.kind!=='tree-broadleaf-large')
        throw Error('Unsupported retained mature tree in '+sector.id);
      (pine?maturePines:matureBroadleaves).set(p,variant);
    }
    const pine=maturePines.get(p),broadleaf=matureBroadleaves.get(p);
    const placed=place(p,pine,broadleaf);
    plantCells.add(p.x+','+p.y+',0');
    if(p.kind.startsWith('tree-')){
      const scale=p.kind.endsWith('-large')?MATURE_TREE_SCALE:1;
      const style=MATURE_PINE_STYLES[pine]??MATURE_BROADLEAF_STYLES[broadleaf];
      const solid={kind:'circle',centre:[placed.x,placed.y],radius:style?.radius??.22*scale,
        trunkHeight:style?.trunkHeight??2*scale,id:placed.id};
      packet.plantSolids.add(solid,shapeBounds(solid));
    }
  }
  if(raw.foliage!==undefined){
    if(!raw.foliage||typeof raw.foliage!=='object'||Array.isArray(raw.foliage))throw Error('Unsupported native town foliage.');
    for(const [key,cell] of Object.entries(raw.foliage)){
      const [x,y]=key.split(',').map(Number),ground=raw.terrain[y]?.[x];
      if(!Number.isInteger(x)||!Number.isInteger(y)||key!==x+','+y+',0'||plantCells.has(key)||!['woodland','ground-grass'].includes(ground)||
        !Array.isArray(cell)||cell.length!==3||!Number.isInteger(cell[0])||cell[0]<1||cell[0]>100||cell[1]!==false||cell[2]!=='woodland-v1')throw Error('Unsupported native town foliage: '+key);
      const wx=x+sector.origin.x,wy=y+sector.origin.y;
      if(groundHash(wx,wy,1947)*100<cell[0])place({x,y,kind:ground==='woodland'?'woodland-brush':'wetland-brush'});
    }
  }
  return packet;
}

export class TownWorld{
  constructor(project,{baseURL,fetcher=globalThis.fetch,art={},interiors}={}){
    this.project=validateTownProject(project);this.baseURL=new URL(baseURL||'./maps/mount-dora/',import.meta.url);this.fetcher=(...args)=>fetcher(...args);
    this.width=1440;this.height=1680;this.cache=new Map();this.inFlight=new Map();this.errors=new Map();this.queue=[];this.wanted=new Set();this.pinned=new Set();this.clock=0;this.revision=0;this.listeners=new Set();this.disposed=false;
    this.byId=new Map(project.sectors.map(s=>[s.id,s]));this.byCell=new Map(project.sectors.map(s=>[s.column+','+s.row,s]));
    this.guardRosterVersion=project.generation?.version>=7?1:undefined;
    this.guardPosts=project.sectors.flatMap(s=>nativeSentries(s).map((g,i)=>{
      const globalPoint=p=>({...p,x:s.origin.x+p.x,y:s.origin.y+p.y});
      return {...globalPoint(g),id:g.id??s.row*project.columns+s.column+1,name:s.id+' sentry'+(i?' '+(i+1):''),patrol:g.patrol?.map(globalPoint)};
    }));
    this.visualReplacement=new Set(art.REPLACEMENT_SOURCE_IDS||[]);this.physicalReplacement=new Set();this.artIndex=new SpatialIndex();this.closedBuildings=new SpatialIndex();this.artRevision=art.ART_REVISION||'0'.repeat(64);this.placements=art.PLACEMENTS||[];
    if(interiors){this.interiors=new TownInteriors(this,interiors);for(const b of interiors.BUILDINGS){this.visualReplacement.add(b.id);this.physicalReplacement.add(b.id);}}
    const placementsForBounds=art.placementsForBounds??(bounds=>this.placements.filter(p=>p.bounds&&intersect(bounds,p.bounds)));
    this.roofBoundsForSector=({origin:{x,y}})=>placementsForBounds([x,y,x+240,y+240])
      .filter(p=>roofedScenery.has(p.kind)).map(p=>p.bounds.map(n=>n-.5));
    for(const placement of this.placements){
      if(placement.collisionPolicy==='replace-source-walls')for(const id of placement.replacesSourceIds||[])this.physicalReplacement.add(id);
      if(placement.collisionPolicy==='retain-source-walls'){
        if(!this.interiors?.catalogue.has(placement.id))for(const solid of placement.solids||[])if(solid.kind==='polygon'){const item=moveShape(solid);this.closedBuildings.add(item,item.bounds);}
        continue;
      }
      for(const solid of placement.solids||[]){const item=moveShape({...solid,placementId:placement.id});if(!item.bounds.every(Number.isFinite))throw Error('Invalid landmark solid');this.artIndex.add(item,item.bounds);}
    }
    this.stats={fetches:0,decoded:0,evicted:0,discarded:0,peakDecoded:0,peakFetches:0,peakQueued:0};
    this.overview=new Uint8Array(180*210);this.overviewRevision=0;
    // Metadata-only row facades: no full town terrain matrix or sparse JS array backing stores.
    const rows=new Map();this.map=new Proxy({length:this.height},{get:(target,key)=>{
      if(key==='length')return this.height;if(typeof key==='symbol')return target[key];const y=Number(key);
      if(!Number.isInteger(y)||y<0||y>=this.height)return target[key];
      if(!rows.has(y))rows.set(y,new Proxy({length:this.width},{get:(row,k)=>{if(k==='length')return this.width;if(typeof k==='symbol')return row[k];const x=Number(k);return Number.isInteger(x)?this.tile(x,y):row[k];}}));return rows.get(y);
    }});
  }
  async identify(){this.sourceRevision=await sha256(new TextEncoder().encode(JSON.stringify({source:this.project.generation.sourceDigest,version:this.project.generation.version,projection:this.project.projection,sectors:this.project.sectors.map(s=>[s.id,s.metrics.sha256]),...(this.interiors?{interiors:this.interiors.manifest.INTERIOR_REVISION}:{})})));return this;}
  descriptor(){return {terrain:this.map,edges:{},props:[],obstacles:[],worldBounds:{x:0,y:0,w:this.width,h:this.height},groundPalette:'mount-dora'};}
  bind(state){this.state=state;state.seen=state.seen instanceof TownExplored?state.seen:new TownExplored();this.interiors?.sync();this.subscribe(()=>{state.revision++;delete state.fogAt;});}
  interactionChanged(){this.interiors?.changed();}
  savedObjects(state){return this.interiors?.savedObjects(state)??state.interactables.map(({id,open,searched,inventory})=>({id,open,searched,inventory}));}
  restoreObjectChanges(objects){this.interiors?.restore(objects);}
  subscribe(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
  emit(){this.revision++;this.navigation=null;for(const fn of this.listeners)fn();}
  sectorAt(x,y){return this.byCell.get(Math.floor((x+.5)/240)+','+Math.floor((y+.5)/240));}
  residentAt(point){return this.cache.has(this.sectorAt(point.x,point.y)?.id);}
  packetForCell(x,y){if(x<0||y<0||x>=this.width||y>=this.height)return null;const sector=this.byCell.get(Math.floor(x/240)+','+Math.floor(y/240)),packet=this.cache.get(sector?.id);if(packet)packet.used=++this.clock;return packet;}
  tile(x,y){if(!Number.isInteger(x)||!Number.isInteger(y))return null;const p=this.packetForCell(x,y);return p?p.raw.terrain[y-p.sector.origin.y][x-p.sector.origin.x]:null;}
  sectorIdsForBounds(bounds){return this.project.sectors.filter(s=>intersect(bounds,[s.origin.x,s.origin.y,s.origin.x+240-EPS,s.origin.y+240-EPS])).map(s=>s.id);}
  ensureCoverage(window,player){
    if(this.disposed)return;
    this.interiors?.sync(window);
    if(this.coverageTarget){player=this.coverageTarget;window=blockWindow(this.descriptor(),player);}
    const physics=[player.x+.5-1,player.y+.5-1,player.x+.5+1,player.y+.5+1],render=[window.x,window.y,window.x+window.w-EPS,window.y+window.h-EPS];
    const pinned=new Set([...this.sectorIdsForBounds(physics),...this.sectorIdsForBounds(render)]),centre=this.sectorAt(player.x,player.y);
    const nearby=this.project.sectors.filter(s=>centre&&Math.abs(s.column-centre.column)<=1&&Math.abs(s.row-centre.row)<=1).sort((a,b)=>Math.hypot(a.origin.x+119.5-player.x,a.origin.y+119.5-player.y)-Math.hypot(b.origin.x+119.5-player.x,b.origin.y+119.5-player.y));
    this.pinned=pinned;this.wanted=new Set(pinned);for(const s of nearby)if(this.wanted.size<TOWN_LIMITS.decodedSectors)this.wanted.add(s.id);
    this.queue=this.queue.filter(id=>this.wanted.has(id));
    for(const id of this.wanted)if(!this.cache.has(id)&&!this.inFlight.has(id)&&!this.queue.includes(id)&&!this.errors.has(id))this.queue.push(id);
    this.stats.peakQueued=Math.max(this.stats.peakQueued,this.queue.length);this.evict();this.pump();
  }
  async readyAt(point){
    if(this.disposed)throw Error('Town loading was canceled.');
    const window=blockWindow(this.descriptor(),point);this.ensureCoverage(window,point);
    const needed=this.sectorIdsForBounds([window.x,window.y,window.x+window.w-EPS,window.y+window.h-EPS]);
    await new Promise((resolve,reject)=>{
      const check=()=>{if(this.disposed){off();reject(Error('Town loading was canceled.'));}else{const failed=needed.find(id=>this.errors.has(id));if(failed){off();reject(Error('Could not load '+failed+': '+this.errors.get(failed)));}else if(needed.every(id=>this.cache.has(id))){off();resolve();}}};
      const off=this.subscribe(check);check();
    });
  }
  evict(reserve=0){let changed=false;while(this.cache.size>TOWN_LIMITS.decodedSectors-reserve){const candidates=[...this.cache.values()].filter(p=>!this.pinned.has(p.id)).sort((a,b)=>a.used-b.used);if(!candidates.length)throw Error('Town residency exceeds its explicit cache cap.');this.cache.delete(candidates[0].id);this.stats.evicted++;changed=true;}if(changed)this.interiors?.reconcile();}
  pump(){
    while(!this.disposed&&this.inFlight.size<TOWN_LIMITS.concurrentFetches&&this.queue.length){
      const id=this.queue.shift();if(!this.wanted.has(id)||this.cache.has(id))continue;
      const controller=new AbortController(),sector=this.byId.get(id),url=new URL(sector.file,this.baseURL);url.searchParams.set('v',sector.metrics.sha256);
      this.inFlight.set(id,controller);this.stats.fetches++;this.stats.peakFetches=Math.max(this.stats.peakFetches,this.inFlight.size);
      Promise.resolve().then(()=>this.fetcher(url,{signal:controller.signal})).then(async response=>{
        if(!response.ok)throw Error('HTTP '+response.status);
        const bytes=await response.arrayBuffer();if(bytes.byteLength>TOWN_LIMITS.sectorBytes)throw Error('Sector exceeds the byte budget.');
        if(this.disposed||!this.wanted.has(id)){this.stats.discarded++;return;}
        if(await sha256(bytes)!==sector.metrics.sha256)throw Error('Town source changed. Reload to load matching map and artwork.');
        if(this.disposed||!this.wanted.has(id))return;this.evict(1);const raw=JSON.parse(new TextDecoder().decode(bytes));
        const roofs=this.roofBoundsForSector(sector);
        const packet=decodeTownSector(raw,sector,this.visualReplacement,this.physicalReplacement,roofs);packet.used=++this.clock;
        if(this.interiors){
          const definition=this.interiors.sectors.get(id);if(!definition)throw Error('Missing interior sector '+id);
          const interiorURL=new URL(definition.file,this.baseURL);interiorURL.searchParams.set('v',definition.sha256);
          const response=await this.fetcher(interiorURL,{signal:controller.signal});if(!response.ok)throw Error('Interior HTTP '+response.status);
          const bytes=await response.arrayBuffer();if(bytes.byteLength>1_000_000||bytes.byteLength!==definition.bytes||await sha256(bytes)!==definition.sha256)throw Error('Town interior data changed. Reload the page.');
          if(this.disposed||!this.wanted.has(id))return;
          packet.interiors=this.interiors.validate(JSON.parse(new TextDecoder().decode(bytes)),id);
          this.evict(1);
        }
        this.cache.set(id,packet);this.stats.decoded++;this.stats.peakDecoded=Math.max(this.stats.peakDecoded,this.cache.size);
        this.interiors?.reconcile();
        for(let y=4;y<240;y+=8)for(let x=4;x<240;x+=8)this.overview[Math.floor((y+sector.origin.y)/8)*180+Math.floor((x+sector.origin.x)/8)]=TOWN_GROUNDS.indexOf(raw.terrain[y][x])+1;this.overviewRevision++;
      }).catch(error=>{if(!this.disposed&&error.name!=='AbortError')this.errors.set(id,error.message);})
        .finally(()=>{this.inFlight.delete(id);if(!this.disposed){this.emit();this.pump();}});
    }
  }
  retry(){for(const id of this.wanted)if(this.errors.delete(id)&&!this.cache.has(id)&&!this.inFlight.has(id))this.queue.push(id);this.pump();this.emit();}
  status(){return {loading:[...this.wanted].filter(id=>!this.cache.has(id)&&!this.errors.has(id)),failed:[...this.errors].filter(([id])=>this.wanted.has(id)).map(([id,message])=>({id,message})),decoded:this.cache.size,inFlight:this.inFlight.size,queued:this.queue.length};}
  wallsFor(bounds,{draw=false,walk=false}={}){const walls=new Map();for(const packet of this.cache.values())for(const item of packet.walls.query(bounds))if((!draw||item.draw)&&(!walk||item.walk))walls.set(item.key,item);return [...walls.values()];}
  solidsFor(bounds){const result=this.artIndex.query(bounds);for(const packet of this.cache.values())result.push(...packet.plantSolids.query(bounds));return result;}
  pointClear(p,radius=WALKER_RADIUS){
    if(this.disposed||p.x<-.5+radius||p.x>this.width-.5-radius||p.y<-.5+radius||p.y>this.height-.5-radius)return false;
    for(let y=Math.floor(p.y+.5-radius);y<=Math.floor(p.y+.5+radius);y++)for(let x=Math.floor(p.x+.5-radius);x<=Math.floor(p.x+.5+radius);x++){
      const tile=this.tile(x,y);if(tile===null||tile==='water')if(boxDistance(p,[x-.5,y-.5,x+.5,y+.5])<radius-EPS)return false;
    }
    const bounds=[p.x-radius,p.y-radius,p.x+radius,p.y+radius];
    if(this.solidsFor(bounds).some(s=>solidDistance(s,p)<radius-EPS))return false;
    if(this.interiors&&!this.interiors.pointClear(p,radius))return false;
    const segments=this.wallsFor(bounds,{walk:true}).map(w=>w.run);
    return !wallRunsIntersect({wallRuns:{version:1,segments}},{...p,h:.8},{...p,h:.8},{radius});
  }
  resumeClear(p){
    // Closed tour buildings have no entrances. An old save can be enclosed by
    // a moved shell even when it does not touch a wall (including a courtyard).
    return this.pointClear(p)&&!this.closedBuildings.query([p.x,p.y,p.x,p.y]).some(s=>s.polygons.some(poly=>ringContains(p,poly[0])));
  }
  walkSegment(a,b,radius=WALKER_RADIUS){const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.07));for(let i=1;i<=steps;i++)if(!this.pointClear({x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps},radius))return false;return true;}
  lineClear(a,b){
    if(!this.residentAt(a)||!this.residentAt(b))return false;
    const bounds=[Math.min(a.x,b.x),Math.min(a.y,b.y),Math.max(a.x,b.x),Math.max(a.y,b.y)];
    const segments=this.wallsFor(bounds,{walk:true}).map(w=>w.run),za=a.h??1.1,zb=b.h??1.1;
    if(wallRunsIntersect({wallRuns:{version:1,segments}},{...a,h:za},{...b,h:zb}))return false;
    if(this.interiors&&!this.interiors.lineClear({...a,h:za},{...b,h:zb}))return false;
    for(const packet of this.cache.values())for(const trunk of packet.plantSolids.query(bounds)){
      const span=trunkSpan(a,b,trunk,za,zb);
      if(span&&span[1]>EPS&&span[0]<1-EPS)return false;
    }
    return true;
  }
  hasBrush(p,radius){
    // The footprint can still overlap brush while the centre passes a trunk.
    for(let y=Math.round(p.y-radius);y<=Math.round(p.y+radius);y++)for(let x=Math.round(p.x-radius);x<=Math.round(p.x+radius);x++){
      const packet=this.packetForCell(x,y);
      if(!packet||boxDistance(p,[x-.5,y-.5,x+.5,y+.5])>=radius)continue;
      const origin=packet.sector.origin;
      if(foliageDepth(packet.raw,x-origin.x,y-origin.y)>0)return true;
    }
    return false;
  }
  brushDepth(a,b){
    const bounds=[Math.min(a.x,b.x),Math.min(a.y,b.y),Math.max(a.x,b.x),Math.max(a.y,b.y)];
    let depth=0;
    // AFT integrates density along the whole sight line, including brush in
    // front of an unpainted trunk tile. Each sector contributes its own cells.
    for(const packet of this.cache.values()){
      const {x,y}=packet.sector.origin;
      if(intersect(bounds,[x-.5,y-.5,x+239.5,y+239.5])){
        depth+=woodlandDepth(packet.raw,{x:a.x-x,y:a.y-y},{x:b.x-x,y:b.y-y});
      }
    }
    return depth;
  }
  geometryBoxes(bounds=[-.5,-.5,1439.5,1679.5]){
    const walls=this.wallsFor(bounds,{walk:true}).map(w=>({x0:w.bounds[0],y0:w.bounds[1],x1:w.bounds[2],y1:w.bounds[3],height:WALL_KIT.height,kind:'wall'}));
    const props=this.solidsFor(bounds).map(s=>{
      const [x0,y0,x1,y1]=s.bounds||shapeBounds(s);
      return {x0,y0,x1,y1,height:s.trunkHeight??s.height??2,kind:'prop',...(s.cover?{cover:true}:{}),...(s.trunkHeight?{trunk:s}:{})};
    });
    return [...walls,...props,...(this.interiors?.boxes(bounds)||[])];
  }
  navigationGrid(){return this.navigation||(this.navigation={width:this.width,height:this.height,nodes:sparseStore(16384),walks:sparseStore(131072),standIns:new Map()});}
  reveal(state,unit){
    if(state.fogAt&&Math.hypot(unit.x-state.fogAt.x,unit.y-state.fogAt.y)<.75)return;
    const rooms=this.interiors?.reveal(unit);
    const visible=new Set();for(let y=Math.max(0,Math.floor(unit.y-36));y<=Math.min(this.height-1,Math.ceil(unit.y+36));y++)for(let x=Math.max(0,Math.floor(unit.x-36));x<=Math.min(this.width-1,Math.ceil(unit.x+36));x++)if(Math.hypot(x-unit.x,y-unit.y)<36&&this.tile(x,y)!==null){const key=x+','+y,room=this.interiors?.roomAt(x,y);if(room&&!rooms.has(room.id))continue;visible.add(key);if(Math.hypot(x-unit.x,y-unit.y)<24)state.seen.add(key);}
    state.visible=visible;state.fogAt={x:unit.x,y:unit.y};
  }
  wallPanelsFor(window){const bounds=[window.x-.5,window.y-.5,window.x+window.w-.5,window.y+window.h-.5],panels=[];for(const {run,key}of this.wallsFor(bounds,{draw:true}))for(const p of wallPanels(run)){const hx=(Math.abs(Math.cos(p.yaw))*p.size[0]+Math.abs(Math.sin(p.yaw))*p.size[2])/2,hy=(Math.abs(Math.sin(p.yaw))*p.size[0]+Math.abs(Math.cos(p.yaw))*p.size[2])/2;if(intersect(bounds,[p.center[0]-hx,p.center[2]-hy,p.center[0]+hx,p.center[2]+hy]))panels.push({...p,id:key+':'+p.id});}return panels;}
  roofsFor(block){const result=[];for(const packet of this.cache.values())result.push(...packet.roofs.get(block.id)||[]);return result;}
  plantsFor(bounds){const result=[];for(const packet of this.cache.values())result.push(...packet.plants.query(bounds));return result;}
  dispose(){if(this.disposed)return;this.disposed=true;for(const controller of this.inFlight.values())controller.abort();this.inFlight.clear();this.cache.clear();this.interiors?.dispose();this.queue=[];for(const fn of this.listeners)fn();this.listeners.clear();this.navigation=null;this.artIndex=new SpatialIndex();this.closedBuildings=new SpatialIndex();this.state=null;}
}
