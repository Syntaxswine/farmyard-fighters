import {WIDTH as W,HEIGHT as H,SIDES,STEP,OPPOSITE,blank,route,validate,warnings,placeTutorial,tutorialCells} from './overmap-model.js';
import {generateEnvironments,environmentCoverageErrors} from './environment-regions.js';

export const GENERATOR_VERSION='strategic-plan-12';
export const STAGES=['Tutorial','Rivers','Cliffs','Environments','Difficulty zoning','Settlements and fortresses','Roads','Bridges and gates','Validation'];
export const DEFAULTS={villages:3,towns:4,cities:5,maxAttempts:40};
export const SETTLEMENT_ZONES={easy:{towns:2,villages:1,cities:[[3,3]]},medium:{towns:1,villages:2,cities:[[3,4],[4,4]]},hard:{towns:1,villages:0,cities:[[3,4],[5,5]]}};
export const isSettlement=s=>['city','town','village'].includes(s.role);
const reachesInland=i=>Math.min(i%W,W-1-i%W,Math.floor(i/W),H-1-Math.floor(i/W))>=2;
const interior=i=>i%W>0&&i%W<W-1&&Math.floor(i/W)>0&&Math.floor(i/W)<H-1;
const N=W*H,all=()=>Array.from({length:N},(_,i)=>i),xy=i=>[i%W,Math.floor(i/W)];
export function neighbor(i,side){const [x,y]=xy(i),[dx,dy]=STEP[side];return x+dx<0||x+dx>=W||y+dy<0||y+dy>=H?null:(y+dy)*W+x+dx;}
const neighbors=i=>SIDES.map(s=>neighbor(i,s)).filter(i=>i!==null);
const direction=(a,b)=>SIDES.find(s=>neighbor(a,s)===b);
export const sectorDistance=(a,b)=>{const [x,y]=xy(a),[u,v]=xy(b);return Math.max(Math.abs(x-u),Math.abs(y-v));};
const near=(a,b)=>{const [x,y]=xy(a),[u,v]=xy(b);return Math.max(Math.abs(x-u),Math.abs(y-v))<=1;};
const fail=message=>{throw Error(message);};
function random(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
const pick=(a,r)=>a[Math.floor(r()*a.length)];
function shuffled(a,r){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function settings(options){const o={...DEFAULTS,...options};for(const [k,min,max]of [['villages',3,3],['towns',4,4],['cities',5,5],['maxAttempts',1,100]])if(!Number.isInteger(o[k])||o[k]<min||o[k]>max)fail(`${k} must be a whole number from ${min} to ${max}.`);return o;}

export const BOUNDARY_POSITION_WEIGHTS={north:1,south:1,east:.5,west:.5};
export function boundaryPorts(){return SIDES.flatMap(side=>Array.from({length:side==='north'||side==='south'?W:H},(_,n)=>({side,index:side==='north'?n:side==='south'?(H-1)*W+n:side==='west'?n*W:n*W+W-1,weight:BOUNDARY_POSITION_WEIGHTS[side]})));}
export function sampleBoundaryEndpoints(r,count=6){
 const pool=boundaryPorts(),result=[];
 for(let i=0;i<count;i++){if(!pool.length)fail('Not enough distinct boundary sectors.');let value=r()*pool.reduce((n,p)=>n+p.weight,0),chosen=pool.at(-1);for(const p of pool){value-=p.weight;if(value<0){chosen=p;break;}}result.push({side:chosen.side,index:chosen.index});for(let j=pool.length-1;j>=0;j--)if(pool[j].index===chosen.index)pool.splice(j,1);}
 return result;
}
function feature(m,kind,start,end,reserved,r,id){
 const occupied=new Set(m.sectors.flatMap((s,i)=>s.routes.length?[i]:[])),blocked=new Set(reserved);
 for(const i of occupied){blocked.add(i);neighbors(i).forEach(j=>blocked.add(j));}
 const first=neighbor(start.index,OPPOSITE[start.side]),last=neighbor(end.index,OPPOSITE[end.side]);
 if(first===null||last===null||[start.index,end.index,first,last].some(i=>blocked.has(i)))fail(kind+': chosen endpoints meet reserved terrain.');
 const allowed=i=>!blocked.has(i)&&i!==start.index&&i!==end.index&&(interior(i)||i===first||i===last);
 // Track direction and whether the route has reached two sectors inland. Endpoints
 // are fixed before routing; impossible pairs reject the attempt, never move ends.
 const noise=all().map(()=>r()*.9),dist=new Map(),previous=new Map(),open=[];
 const initial=(first*4+SIDES.indexOf(OPPOSITE[start.side]))*2+Number(reachesInland(first));dist.set(initial,0);open.push({key:initial,cost:0});let finish;
 while(open.length){open.sort((a,b)=>b.cost-a.cost||b.key-a.key);const item=open.pop();if(item.cost!==dist.get(item.key))continue;const i=Math.floor(item.key/8),heading=Math.floor(item.key/2)%4,inland=item.key%2;if(i===last&&inland){finish=item.key;break;}
  for(let d=0;d<4;d++){const j=neighbor(i,SIDES[d]);if(j===null||!allowed(j))continue;const key=(j*4+d)*2+Number(inland||reachesInland(j)),cost=item.cost+1+noise[j]+(reachesInland(j)?0:3)+(d===heading?0:1.8);if(cost<(dist.get(key)??Infinity)){dist.set(key,cost);previous.set(key,item.key);open.push({key,cost});}}
 }
 if(finish===undefined)fail(kind+': no route between the selected boundary endpoints.');
 const path=[];for(let key=finish;key!==undefined;key=previous.get(key))path.push(Math.floor(key/8));path.reverse();path.unshift(start.index);path.push(end.index);
 if(new Set(path).size!==path.length||path.length<5)fail(kind+': selected endpoints produce a short or self-overlapping route.');
 let offset=r()<.5?1/3:2/3;
 path.forEach((index,i)=>{const from=i?direction(index,path[i-1]):start.side,to=i<path.length-1?direction(index,path[i+1]):end.side,next=r()<.28?(offset===1/3?2/3:1/3):offset;m.sectors[index].routes.push(route(kind,from,to,offset,next));m.sectors[index].terrain=kind==='river'?'wetland':'plain';offset=next;});
 return {id,kind,cells:path,start:{...start},end:{...end}};
}
function zones(m,tutorial,r){
 const distance=Array(N).fill(Infinity),done=new Set(),noise=all().map(()=>r()*.4);tutorial.forEach(c=>distance[c.index]=0);
 for(let count=0;count<N;count++){let at=-1;for(let i=0;i<N;i++)if(!done.has(i)&&(at<0||distance[i]<distance[at]))at=i;done.add(at);for(const j of neighbors(at))distance[j]=Math.min(distance[j],distance[at]+1+noise[j]);}
 const order=all().sort((a,b)=>distance[a]-distance[b]||a-b);order.forEach((i,n)=>m.sectors[i].difficulty=n<150?'easy':n<300?'medium':'hard');
}
function settlements(m,tutorial,o,r){
 const groups=[],used=new Set(tutorial.map(c=>c.index)),settlementBuffer=new Set();
 const land=i=>!used.has(i)&&!m.sectors[i].routes.length;
 const barriers=barrierMap(m);
 const settlementLand=i=>!used.has(i)&&!settlementBuffer.has(i)&&(land(i)||barriers.get(i)?.kind==='river'&&crossingAxis(m,i,barriers));
 const cluster=(start,count)=>{const group=[start];while(group.length<count){const candidates=[...new Set(group.flatMap(neighbors))].filter(i=>settlementLand(i)&&!group.includes(i)&&m.sectors[i].difficulty===m.sectors[start].difficulty);if(!candidates.length)return null;group.push(pick(candidates,r));}return group;};
 const assign=(kind,cells,id)=>{cells.forEach(i=>{used.add(i);Object.assign(m.sectors[i],{role:kind,name:`${kind==='town'&&id==='town-1'?'Starting town':kind+' '+id.split('-')[1]}`,settlementId:id,owner:'red-hats',terrain:'plain',facilities:[]});});
  if(kind==='town')m.sectors[cells[0]].facilities=['workshop'];
  if(kind==='city'){m.sectors[cells[0]].facilities=['factory'];for(const i of shuffled(cells,r).slice(0,1+Math.floor(r()*3)))m.sectors[i].facilities.push('workshop');}
  cells.forEach(i=>{m.sectors[i].facilityIds=Object.fromEntries(m.sectors[i].facilities.map(f=>[f,`${id}-${f}-${i}`]));});groups.push({id,kind,cells});for(const i of cells)for(const j of all())if(near(i,j))settlementBuffer.add(j);
 };
 const town=tutorial[4].index,second=tutorial[5].index;assign('town',[town,second],'town-1');
 const serial={town:1,village:0,city:0};
 for(const [difficulty,rule]of Object.entries(SETTLEMENT_ZONES)){
  const requests=[...rule.cities.map(([min,max])=>['city',min+Math.floor(r()*(max-min+1))]),...Array.from({length:rule.towns-(difficulty==='easy'?1:0)},()=>['town',2]),...Array.from({length:rule.villages},()=>['village',2])];
  for(const [kind,size]of requests){let group;for(const start of shuffled(all().filter(i=>settlementLand(i)&&m.sectors[i].difficulty===difficulty),r)){group=cluster(start,size);if(group)break;}
   if(!group)fail('No compatible space for '+difficulty+' '+kind+' ('+size+' sectors).');assign(kind,group,kind+'-'+(++serial[kind]));
  }
 }
 for(const [difficulty,count]of [['easy',1],['medium',2],['hard',2]])for(let n=0;n<count;n++){const i=pick(all().filter(i=>land(i)&&m.sectors[i].difficulty===difficulty&&all().filter(j=>m.sectors[j].role==='fortress').every(j=>sectorDistance(i,j)>=4)&&(difficulty!=='easy'||[town,second].every(t=>sectorDistance(i,t)>=4))),r);if(i===undefined)fail(`No space for ${difficulty} fortress.`);used.add(i);Object.assign(m.sectors[i],{role:'fortress',name:`${difficulty} fortress ${n+1}`,owner:'red-hats',facilities:[]});}
 return groups;
}
function barrierMap(m){return new Map(m.sectors.flatMap((s,i)=>{const f=s.routes.find(r=>r.kind==='river'||r.kind==='cliff');return f?[[i,f]]:[];}));}
function crossingAxis(m,i,barriers){const f=barriers.get(i);if(!f||OPPOSITE[f.from.side]!==f.to.side)return null;const sides=f.from.side==='north'||f.from.side==='south'?['west','east']:['north','south'];const ends=sides.map(s=>neighbor(i,s));return ends.every(j=>j!==null&&!barriers.has(j)&&m.sectors[j].role!=='tutorial')?{sides,ends}:null;}
function selectRoadCrossings(m,features,r){
 const barriers=barrierMap(m),chosen=new Set();
 for(const f of features){const target=f.kind==='river'?Math.ceil(f.cells.length/5):Math.max(1,Math.ceil(f.cells.length/12));let found=null;
  // Random greedy trials operate only on potential road crossings. Gates are
  // materialized after roads are routed through these crossing constraints.
  for(let attempt=0;attempt<40&&!found;attempt++){const local=[];for(const i of shuffled(f.cells,r))if(crossingAxis(m,i,barriers)&&!local.some(j=>near(i,j))&&![...chosen].some(j=>near(i,j))){local.push(i);if(local.length===target){found=local;break;}}}
  if(!found)fail(`${f.kind}: cannot fit ${target} spaced road crossings.`);found.forEach(i=>{chosen.add(i);if(f.kind==='river')m.sectors[i].crossingOrigin='planned-bridge';});
 }
 for(const [i,f]of barriers)if(f.kind==='river'&&isSettlement(m.sectors[i])){if(!crossingAxis(m,i,barriers))fail('River settlement has no usable crossing.');if(!chosen.has(i))m.sectors[i].crossingOrigin='settlement';chosen.add(i);}
 return chosen;
}
function landEdges(m,i,barriers,crossings){
 if(m.sectors[i].role==='tutorial'||barriers.has(i))return [];
 const edges=[];for(const side of SIDES){const j=neighbor(i,side);if(j===null)continue;
  if(!barriers.has(j)){if(m.sectors[j].role!=='tutorial')edges.push({to:j,path:[i,j],cost:1});continue;}
  const axis=crossings.has(j)&&crossingAxis(m,j,barriers);if(axis&&axis.ends.includes(i))edges.push({to:axis.ends.find(n=>n!==i),path:[i,j,axis.ends.find(n=>n!==i)],cost:3});
 }return edges;
}
function roads(m,features,groups,r){
 const barriers=barrierMap(m),crossings=selectRoadCrossings(m,features,r),links=Array.from({length:N},()=>new Set()),network=new Set(),noise=all().map(()=>r()*.5);
 const link=(a,b)=>{links[a].add(direction(a,b));links[b].add(direction(b,a));network.add(a);network.add(b);};
 const targets=[...groups.flatMap(g=>g.cells),...all().filter(i=>m.sectors[i].role==='fortress')];network.add(targets[0]);
 function connect(start,exclude=null,force=false){
  if(network.has(start)&&!force)return;const dist=Array(N).fill(Infinity),prev=new Map(),done=new Set();dist[start]=0;let end;
  for(let n=0;n<N;n++){let at=-1;for(let i=0;i<N;i++)if(!done.has(i)&&(at<0||dist[i]<dist[at]))at=i;if(at<0||!Number.isFinite(dist[at]))break;if(network.has(at)&&at!==start){end=at;break;}done.add(at);
   for(const e of landEdges(m,at,barriers,crossings)){if(exclude!==null&&e.path.includes(exclude))continue;const cost=dist[at]+e.cost+noise[e.to];if(cost<dist[e.to]){dist[e.to]=cost;prev.set(e.to,{from:at,path:e.path});}}
  }
  if(end===undefined)fail('Road routing could not connect a location across the reserved geography.');
  while(end!==start){const e=prev.get(end);for(let i=1;i<e.path.length;i++)link(e.path[i-1],e.path[i]);end=e.from;}
 }
 for(const target of targets){if(barriers.has(target)){const axis=crossingAxis(m,target,barriers);if(!axis||!crossings.has(target))fail('River settlement cannot join the road network.');connect(axis.ends[0]);link(axis.ends[0],target);link(target,axis.ends[1]);}else connect(target);}
 for(const i of crossings){const {ends}=crossingAxis(m,i,barriers);connect(ends[0]);link(ends[0],i);link(i,ends[1]);}
 // A crossing must continue on both banks, not merely terminate at a landing.
 const destinations=new Set(targets);
 for(const i of crossings)for(const end of crossingAxis(m,i,barriers).ends)if(links[end].size===1&&!destinations.has(end))connect(end,i,true);
 links.forEach((set,i)=>{const sides=[...set];if(sides.length===2)m.sectors[i].routes.push(route('road',...sides));else for(const side of sides)m.sectors[i].routes.push(route('road',side,'center'));});
 return crossings;
}
function gates(m,crossings,r){for(const i of crossings){const river=m.sectors[i].routes.some(r=>r.kind==='river');Object.assign(m.sectors[i],{gate:river?'bridge':'passage',gateGuards:river?2+Math.floor(r()*14):2+Math.floor(r()*6)});}}

export function validateGenerated(m){
 const errors=[];try{validate(m);}catch(e){return {valid:false,errors:[e.message],counts:{}};}
 errors.push(...environmentCoverageErrors(m.environments));
 const count=predicate=>m.sectors.filter(predicate).length,counts={easy:count(s=>s.difficulty==='easy'),medium:count(s=>s.difficulty==='medium'),hard:count(s=>s.difficulty==='hard'),bridges:count(s=>s.gate==='bridge'&&!isSettlement(s)),settlementCrossings:count(s=>s.gate==='bridge'&&isSettlement(s)),passages:count(s=>s.gate==='passage')};
 const check=(condition,message)=>{if(!condition)errors.push(message);};
 for(const z of ['easy','medium','hard'])check(counts[z]===150,`${z}: expected 150 sectors, found ${counts[z]}.`);
 check(!all().some(i=>m.sectors[i].difficulty==='easy'&&neighbors(i).some(j=>m.sectors[j].difficulty==='hard')),'Easy and hard regions touch without a medium buffer.');
 const easy=all().filter(i=>m.sectors[i].difficulty==='easy'),seen=new Set(easy.slice(0,1)),queue=[...seen];for(const i of queue)for(const j of neighbors(i))if(m.sectors[j].difficulty==='easy'&&!seen.has(j)){seen.add(j);queue.push(j);}check(seen.size===150,'Easy region is not connected.');
 let tutorial=[];try{const p=m.tutorialPlacement;tutorial=tutorialCells(p.x,p.y,p.rotation);}catch{errors.push('Missing or invalid tutorial placement.');}
 if(tutorial.length){check(tutorial.every(c=>m.sectors[c.index].difficulty==='easy'),'All six tutorial-group sectors must be easy.');check(tutorial.slice(0,4).every((c,n)=>m.sectors[c.index].role==='tutorial'&&m.sectors[c.index].terrain==='plateau'&&m.sectors[c.index].tutorialStep===n+1),'Tutorial footprint or start changed.');check(tutorial.slice(4).every((c,i)=>m.sectors[c.index].role==='town'&&m.sectors[c.index].tutorialStep===i+5),'Both tutorial town sectors must occupy their reserved positions.');
  let exits=0;for(const c of tutorial.slice(0,4)){check(m.sectors[c.index].routes.length===0,'A generated route entered the tutorial plateau.');for(const side of m.sectors[c.index].travel){const j=neighbor(c.index,side);if(!tutorial.slice(0,4).some(c=>c.index===j)){exits++;check(j===tutorial[4].index,'Tutorial exit does not lead to its town.');}}}check(exits===1,'Tutorial must have exactly one descent to its town.');
  const group=new Set(tutorial.map(c=>c.index)),reachable=new Set([tutorial[0].index]),pending=[tutorial[0].index];
  for(const i of pending)for(const side of m.sectors[i].travel){const j=neighbor(i,side);if(group.has(j)&&m.sectors[j].travel.includes(OPPOSITE[side])&&!reachable.has(j)){reachable.add(j);pending.push(j);}}
  check(reachable.size===6,'All six tutorial sectors, including both town sectors, must be reachable from the start through reciprocal declared travel connections.');}
 for(const [z,n]of [['easy',1],['medium',2],['hard',2]])check(count(s=>s.role==='fortress'&&s.difficulty===z)===n,`Expected ${n} ${z} fortress(es).`);
 check(m.sectors.filter(s=>s.role==='fortress').every(s=>s.facilities.length===0),'Fortresses must not have civilian facilities.');
 const fortresses=all().filter(i=>m.sectors[i].role==='fortress');check(fortresses.every((i,n)=>fortresses.slice(n+1).every(j=>sectorDistance(i,j)>=4)),'Every pair of fortresses must be at least four sectors apart, including diagonally.');
 const startingTown=all().filter(i=>m.sectors[i].settlementId==='town-1');for(const i of all().filter(i=>m.sectors[i].role==='fortress'&&m.sectors[i].difficulty==='easy'))check(startingTown.length>0&&startingTown.every(t=>sectorDistance(i,t)>=4),'Easy fortress must be at least four sectors from every starting-town sector.');
 const barriers=barrierMap(m),crossings=new Set(all().filter(i=>m.sectors[i].gate!=='none'));
 for(const kind of ['river','cliff']){
  const cells=all().filter(i=>barriers.get(i)?.kind===kind),edgeCount=cells.reduce((n,i)=>n+[barriers.get(i).from,barriers.get(i).to].filter(p=>neighbor(i,p.side)===null).length,0);check(edgeCount===(kind==='river'?4:2),`${kind}: expected ${kind==='river'?4:2} world-edge connections, found ${edgeCount}.`);
  const remaining=new Set(cells);while(remaining.size){const chain=[remaining.values().next().value];remaining.delete(chain[0]);for(const i of chain)for(const p of [barriers.get(i).from,barriers.get(i).to]){const j=neighbor(i,p.side);if(remaining.has(j)){remaining.delete(j);chain.push(j);}}check(chain.some(reachesInland),`${kind} must reach at least two sectors inward from the nearest map edge.`);if(kind==='river'){check(chain.length>=5,'River is shorter than five sectors.');check(chain.filter(i=>m.sectors[i].gate==='bridge'&&m.sectors[i].crossingOrigin==='planned-bridge').length===Math.ceil(chain.length/5),'Planned river bridge count must round up to one per five river sectors; extra settlement crossings are additional.');}}
 }
 const bridges=[...crossings].filter(i=>m.sectors[i].gate==='bridge'&&m.sectors[i].crossingOrigin==='planned-bridge');check(!bridges.some((i,n)=>bridges.slice(n+1).some(j=>near(i,j))),'Bridge sectors touch, including diagonally.');
 for(const i of crossings){const s=m.sectors[i],axis=crossingAxis(m,i,barriers);check(!!axis&&s.routes.some(r=>r.kind==='road'&&axis.sides.includes(r.from.side)&&axis.sides.includes(r.to.side)&&r.from.side!==r.to.side),`Gate at ${i%W+1},${Math.floor(i/W)+1} lacks a crossing road.`);check(Number.isInteger(s.gateGuards)&&s.gateGuards>=2&&s.gateGuards<=15,'Gate guards must number 2–15.');check(barriers.get(i)?.kind===(s.gate==='bridge'?'river':'cliff'),'Gate type does not match its obstacle.');}
 for(const [i,f]of barriers)if(f.kind==='river'){const s=m.sectors[i];if(isSettlement(s))check(s.gate==='bridge','River settlement must provide a crossing.');if(s.gate==='bridge')check(s.crossingOrigin==='planned-bridge'||s.crossingOrigin==='settlement'&&isSettlement(s),'Additional river crossings must belong to a settlement.');}
 for(const [i]of barriers)check(!m.sectors[i].routes.some(r=>r.kind==='road')||crossings.has(i),'Road crosses a barrier without a gate.');
 for(const i of all())errors.push(...warnings(m,i).map(s=>`Sector ${i%W+1},${Math.floor(i/W)+1}: ${s}`));
 // Conservative strategic graph: barrier sectors are crossed only at gates.
 // Bank-level movement inside a tactical river/cliff map requires local templates.
 const land=all().filter(i=>!barriers.has(i)&&m.sectors[i].role!=='tutorial'),reachable=new Set(land.slice(0,1)),todo=[...reachable];for(const i of todo)for(const e of landEdges(m,i,barriers,crossings))if(!reachable.has(e.to)){reachable.add(e.to);todo.push(e.to);}check(reachable.size===land.length,'A land region is isolated by rivers or cliffs.');
 const sites=all().filter(i=>['town','city','village','fortress'].includes(m.sectors[i].role));
 const roadSides=i=>new Set(m.sectors[i].routes.filter(r=>r.kind==='road').flatMap(r=>[r.from.side,r.to.side]).filter(s=>s!=='center'));
 const connected=new Set(sites.slice(0,1)),roadQueue=[...connected];for(const i of roadQueue)for(const side of roadSides(i)){const j=neighbor(i,side);if(j!==null&&roadSides(j).has(OPPOSITE[side])&&!connected.has(j)){connected.add(j);roadQueue.push(j);}}check(sites.every(i=>connected.has(i)),'Roads do not connect every settlement sector and fortress.');
 const roadCells=all().filter(i=>roadSides(i).size>0);check(roadCells.every(i=>connected.has(i)),'Orphaned roads are disconnected from the settlement road network.');check(roadCells.every(i=>roadSides(i).size!==1||sites.includes(i)),'Road dead ends must terminate at a settlement or fortress, not an empty crossing landing.');
 const groups=new Map();m.sectors.forEach((s,i)=>{if(s.settlementId){if(!groups.has(s.settlementId))groups.set(s.settlementId,[]);groups.get(s.settlementId).push(i);}});
 for(const [id,cells]of groups){const role=m.sectors[cells[0]].role,expected=role==='village'||role==='town'?[2,2]:[3,5];check(cells.length>=expected[0]&&cells.length<=expected[1],`${id}: invalid settlement size.`);const joined=new Set([cells[0]]),q=[cells[0]];for(const i of q)for(const j of neighbors(i))if(cells.includes(j)&&!joined.has(j)){joined.add(j);q.push(j);}check(joined.size===cells.length,`${id}: settlement is not contiguous.`);check(cells.every(i=>m.sectors[i].role===role),`${id}: constituent roles do not match.`);check(cells.every(i=>m.sectors[i].difficulty===m.sectors[cells[0]].difficulty),`${id}: settlement crosses difficulty zones.`);if(id==='town-1')check(cells.every(interior),'Starting town must be fully inland.');const facilities=cells.flatMap(i=>m.sectors[i].facilities);if(role==='town')check(facilities.filter(f=>f==='workshop').length===1,`${id}: town needs one workshop.`);if(role==='city')check(facilities.filter(f=>f==='factory').length===1&&facilities.filter(f=>f==='workshop').length>=1&&facilities.filter(f=>f==='workshop').length<=3,`${id}: city needs one factory and 1–3 workshops.`);}
 errors.push(...settlementSpacingErrors(m));
 counts.zones={};
 for(const [difficulty,rule]of Object.entries(SETTLEMENT_ZONES)){
  const inZone=[...groups.values()].filter(g=>m.sectors[g[0]].difficulty===difficulty),citySizes=inZone.filter(g=>m.sectors[g[0]].role==='city').map(g=>g.length).sort((a,b)=>a-b);
  const actual={towns:inZone.filter(g=>m.sectors[g[0]].role==='town').length,villages:inZone.filter(g=>m.sectors[g[0]].role==='village').length,cities:citySizes};counts.zones[difficulty]=actual;
  check(actual.towns===rule.towns,difficulty+': expected '+rule.towns+' towns.');check(actual.villages===rule.villages,difficulty+': expected '+rule.villages+' villages.');
  check(citySizes.length===rule.cities.length&&rule.cities.every(([min,max],i)=>citySizes[i]>=min&&citySizes[i]<=max),difficulty+': city sizes must be '+rule.cities.map(([a,b])=>a===b?String(a):a+'–'+b).join(', ')+' sectors.');
 }
 for(const [role,key]of [['town','towns'],['city','cities'],['village','villages']])counts[key]=[...groups.values()].filter(g=>m.sectors[g[0]].role===role).length;
 return {valid:errors.length===0,errors:[...new Set(errors)],counts};
}

export function generateWorld(seed,options={},onProgress=()=>{}){
 if(!Number.isInteger(seed)||seed<0||seed>4294967295)fail('Seed must be a whole number from 0 to 4294967295.');const o=settings(options),failures={};
 for(let attempt=0;attempt<o.maxAttempts;attempt++){
  const r=random((seed+Math.imul(attempt,0x9e3779b9))>>>0);let stage=0;const report=n=>{stage=n;onProgress({attempt:attempt+1,stage:STAGES[n]});};
  try{
   report(0);let m=blank();const placements=[];for(const rotation of [0,90,180,270])for(let y=0;y<H;y++)for(let x=0;x<W;x++){try{tutorialCells(x,y,rotation);placements.push({x,y,rotation});}catch{}}
   const p=pick(placements,r);m=placeTutorial(m,p.x,p.y,p.rotation);const tutorial=tutorialCells(p.x,p.y,p.rotation),reserved=new Set(tutorial.map(c=>c.index));
   report(1);const endpoints=sampleBoundaryEndpoints(r);const features=[feature(m,'river',endpoints[0],endpoints[1],reserved,r,'river-1'),feature(m,'river',endpoints[2],endpoints[3],reserved,r,'river-2')];
   report(2);features.push(feature(m,'cliff',endpoints[4],endpoints[5],reserved,r,'cliff-1'));
   report(3);m.environments=generateEnvironments(m,seed);
   report(4);zones(m,tutorial,r);for(const i of all())if(!reserved.has(i)&&!m.sectors[i].routes.length)m.sectors[i].terrain=r()<.23?'forest':'plain';
   report(5);const groups=settlements(m,tutorial,o,r);
   report(6);const crossings=roads(m,features,groups,r);
   report(7);gates(m,crossings,r);
   m.name=`Generated world · ${seed}`;m.generation={seed,version:GENERATOR_VERSION,contentLibraryVersion:'schematic-symbols-1',attempt:attempt+1,options:o,stages:STAGES,features,settlements:groups,scope:'strategic-plan',boundaryPositionWeights:{...BOUNDARY_POSITION_WEIGHTS}};
   report(8);const result=validateGenerated(m);if(!result.valid)fail(result.errors.slice(0,4).join(' '));m.generation.counts=result.counts;return m;
  }catch(e){const reason=`${STAGES[stage]}: ${e.message}`;failures[reason]=(failures[reason]||0)+1;}
 }
 const reasons=Object.entries(failures).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([reason,n])=>`${n} attempt(s): ${reason}`).join('\n');fail(`Seed ${seed} failed after ${o.maxAttempts} deterministic attempts. Current map was preserved.\n${reasons}`);
}

export function settlementSpacingErrors(m){
 const settlements=m.sectors.flatMap((s,i)=>['city','town','village'].includes(s.role)?[{s,i}]:[]),errors=new Set();
 for(let a=0;a<settlements.length;a++)for(let b=a+1;b<settlements.length;b++){
  const left=settlements[a],right=settlements[b];if(!near(left.i,right.i))continue;
  if(left.s.settlementId&&left.s.settlementId===right.s.settlementId)continue;
  const names=[left.s.settlementId||'sector '+(left.i+1),right.s.settlementId||'sector '+(right.i+1)].sort();
  errors.add(names.join(' and ')+': different settlements need a one-sector gap, including diagonally.');
 }
 return [...errors];
}
