// Independent offline route evidence. Reuses the reviewed Nautilus wall query;
// it is not a second navigation engine and is never shipped to the game.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const town=path.join(root,'maps/mount-dora'),artifact=path.join(root,'artifacts/mount-dora-playable');
const hash=data=>createHash('sha256').update(data).digest('hex');
const read=name=>JSON.parse(fs.readFileSync(path.join(town,name)));
const project=read('project.json'),features=read('features.json').features;
const provenance={commit:'2502646482218524fd5129641da769bb82462e4d',sourcePath:'packages/map-core/wall-runs.js',bytes:8795,sha256:'6d01eb4b49d6ba20ae71e4bb2cab095c80e63be5d14b6ff43f509a9cfc76633d'};
const args=process.argv.slice(2);
assert(args.length===0||args.length===2&&args[0]==='--wall-module','Usage: node tools/maps/review-mount-dora-routes.mjs [--wall-module exact-source-file]');
const runtimeWall=path.join(root,'sites/tactical-animal/dist/mount-dora-source/wall-runs.js');
const wallFile=args.length?path.resolve(args[1]):fs.existsSync(runtimeWall)?runtimeWall:path.join(artifact,'wall-runs.mjs');
assert.equal(hash(fs.readFileSync(wallFile)),provenance.sha256,'Use exact reviewed source bytes.');
const {wallRunsIntersect,WALL_KIT}=await import(pathToFileURL(wallFile).href);
assert.equal(WALL_KIT.thickness,.16);
const width=project.extent.widthM,height=project.extent.depthM,count=width*height,radius=.23;
const open=new Uint8Array(count),terrain=new Uint8Array(count),edge=new Uint8Array(count);
const walls=[],props=[];
for(const sector of project.sectors){
 const bytes=fs.readFileSync(path.join(town,sector.file));assert.equal(hash(bytes),sector.metrics.sha256);
 const map=JSON.parse(bytes),ox=sector.origin.x,oy=sector.origin.y;
 for(let y=0;y<240;y++)for(let x=0;x<240;x++){
  const kind=map.terrain[y][x],i=(oy+y)*width+ox+x;
  terrain[i]=kind==='water'?1:kind==='floor'?2:kind==='bridge'||kind==='ground-wood-planks'?3:0;
  // Closed source-building interiors are not required by an outdoor walk.
  open[i]=terrain[i]!==1&&terrain[i]!==2?1:0;
 }
 for(const run of map.wallRuns?.segments||[])walls.push({...run,a:[run.a[0]+ox,run.a[1]+oy],b:[run.b[0]+ox,run.b[1]+oy]});
 for(const prop of map.props||[])if(prop.kind.startsWith('tree-'))props.push({x:ox+prop.x,y:oy+prop.y});
}
// Conservatively reserve each tree trunk cell. The final runtime's
// exact physical parts and production landmark solids must still be checked.
for(const prop of props)open[prop.y*width+prop.x]=0;
for(const run of walls){
 const map={wallRuns:{version:1,segments:[run]}},pad=radius+WALL_KIT.thickness/2+1;
 const x0=Math.max(0,Math.floor(Math.min(run.a[0],run.b[0])-pad)),x1=Math.min(width-1,Math.ceil(Math.max(run.a[0],run.b[0])+pad));
 const y0=Math.max(0,Math.floor(Math.min(run.a[1],run.b[1])-pad)),y1=Math.min(height-1,Math.ceil(Math.max(run.a[1],run.b[1])+pad));
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
  const i=y*width+x,p={x,y,h:.8};
  if(open[i]&&wallRunsIntersect(map,p,p,{radius}))open[i]=0;
  if(x+1<width&&open[i]&&open[i+1]&&wallRunsIntersect(map,p,{x:x+1,y,h:.8},{radius}))edge[i]|=1;
  if(y+1<height&&open[i]&&open[i+width]&&wallRunsIntersect(map,p,{x,y:y+1,h:.8},{radius}))edge[i]|=2;
 }
}
function nearest(desired,{requiredTerrain,visited}={}){
 const x0=Math.floor(desired[0]),y0=Math.floor(desired[1]);let best=null;
 for(let y=Math.max(0,y0-32);y<=Math.min(height-1,y0+32);y++)for(let x=Math.max(0,x0-32);x<=Math.min(width-1,x0+32);x++){
  const i=y*width+x;if(!open[i]||visited&&!visited[i]||requiredTerrain!==undefined&&terrain[i]!==requiredTerrain)continue;
  const distance=Math.hypot(x+.5-desired[0],y+.5-desired[1]);if(!best||distance<best.distance)best={i,x,y,distance,town:[x+.5,y+.5]};
 }
 assert(best,'No safe outdoor cell near '+desired);return best;
}
const spawn=nearest([459.5,499.5]);
const parent=new Uint8Array(count),queue=new Int32Array(count);let head=0,tail=1;
queue[0]=spawn.i;parent[spawn.i]=1;
function visit(from,to,direction,blocked){if(!blocked&&open[to]&&!parent[to]){parent[to]=direction;queue[tail++]=to;}}
while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);
 if(x+1<width)visit(i,i+1,2,edge[i]&1);
 if(x>0)visit(i,i-1,3,edge[i-1]&1);
 if(y+1<height)visit(i,i+width,4,edge[i]&2);
 if(y>0)visit(i,i-width,5,edge[i-width]&2);
}
const townPoint=i=>[i%width+.5,Math.floor(i/width)+.5];
function routeTo(index){
 const cells=[];let i=index;
 while(i!==spawn.i){cells.push(i);const direction=parent[i];assert(direction>1,'Route is not in the spawn component.');i+=direction===2?-1:direction===3?1:direction===4?-width:width;}
 cells.push(spawn.i);cells.reverse();const compact=[];
 for(let p=0;p<cells.length;p++)if(p===0||p===cells.length-1||cells[p]-cells[p-1]!==cells[p+1]-cells[p])compact.push(townPoint(cells[p]));
 return {metres:cells.length-1,turnPoints:compact};
}
const boardwalk=features.find(f=>f.id==='osm-way-688219167');
const lake=features.find(f=>f.category==='water');
function inRing([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
}return inside;}
const inLake=p=>lake.geometry.coordinates.some(polygon=>inRing(p,polygon[0])&&!polygon.slice(1).some(ring=>inRing(p,ring)));
const bridgeCandidates=[];
for(const [a,b]of boardwalk.geometry.coordinates.slice(1).map((b,i)=>[boardwalk.geometry.coordinates[i],b])){
 const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));
 for(let k=1;k<n;k++){const x=a[0]+(b[0]-a[0])*k/n,y=a[1]+(b[1]-a[1])*k/n,i=Math.floor(y)*width+Math.floor(x);
  if(x>=0&&x<width&&y>=0&&y<height&&terrain[i]===3&&parent[i]&&inLake([Math.floor(x)+.5,Math.floor(y)+.5]))bridgeCandidates.push([x,y]);
 }
}
const bridgeTarget=bridgeCandidates[Math.floor(bridgeCandidates.length/2)];
assert(bridgeTarget,'Mapped boardwalk must have a reachable supported span.');
const targets=[
 ['donnelly-park','Donnelly Park',[459.5,499.5],['osm-way-468920884']],
 ['lakeside-inn','Lakeside Inn approach',[333.5,809.5],['osm-way-560095890','osm-way-560095892']],
 ['elizabeth-evans','Elizabeth Evans Park approach',[430.5,1015.5],['osm-way-486656245']],
 ['grantham-lighthouse','Grantham Point lighthouse approach',[504.5,1168.5],['osm-node-2704687214']],
 ['gilbert-park','Gilbert Park approach',[710.5,1205.5],['osm-way-468921011']],
 ['palm-island','Palm Island supported wooden route',bridgeTarget,['osm-way-688219167']],
 ['historic-shopfronts','Donnelly / Fourth shopfronts',[432.5,635.5],['osm-way-47163977']],
 ['donnelly-house','Donnelly House approach',[414.5,479.5],['osm-way-547799531']],
 ['history-museum','History Museum approach',[480.5,597.5],['osm-way-556809468']],
 ['former-depot','Former depot approach',[326.5,686.5],['osm-way-557494933']],
];
const routes=targets.map(([id,name,point,sourceIds])=>{const p=nearest(point,{visited:parent,...(id==='palm-island'?{requiredTerrain:3}:{})});return {id,name,sourceIds,townPoint:p.town,adjustmentM:+p.distance.toFixed(4),...routeTo(p.i)};});
const bySector=project.sectors.map(s=>{let reached=0;for(let y=0;y<240;y++)for(let x=0;x<240;x++)if(parent[(s.origin.y+y)*width+s.origin.x+x])reached++;return {id:s.id,reachedOutdoorCells:reached};});
const seamSamples=[];
for(let x=240;x<width;x+=240){let best;
 for(let y=0;y<height;y++){const i=y*width+x;if(parent[i-1]&&parent[i]&&!(edge[i-1]&1)){const d=Math.hypot(x-spawn.town[0],y+.5-spawn.town[1]);if(!best||d<best.d)best={d,from:townPoint(i-1),to:townPoint(i)};}}
 assert(best,'No reachable east/west crossing at '+x);seamSamples.push({axis:'east',townBoundaryM:x,from:best.from,to:best.to});
}
for(let y=240;y<height;y+=240){let best;
 for(let x=0;x<width;x++){const i=y*width+x;if(parent[i-width]&&parent[i]&&!(edge[i-width]&2)){const d=Math.hypot(x+.5-spawn.town[0],y-spawn.town[1]);if(!best||d<best.d)best={d,from:townPoint(i-width),to:townPoint(i)};}}
 assert(best,'No reachable north/south crossing at '+y);seamSamples.push({axis:'south',townBoundaryM:y,from:best.from,to:best.to});
}
const cornerTown=[[479.5,479.5],[480.5,479.5],[480.5,480.5],[479.5,480.5],[479.5,479.5]];
for(const [x,y]of cornerTown)assert(parent[Math.floor(y)*width+Math.floor(x)],'Donnelly four-sector corner must be reachable.');
const nativeWalls={wallRuns:{version:1,segments:walls}};
const game=p=>({x:p[0]-.5,y:p[1]-.5,h:.8});
for(let i=1;i<cornerTown.length;i++)assert(!wallRunsIntersect(nativeWalls,game(cornerTown[i-1]),game(cornerTown[i]),{radius}));
for(const sector of project.sectors)for(const guard of sector.guards){
 for(const point of [guard,...guard.patrol||[]]){
  const x=sector.origin.x+point.x,y=sector.origin.y+point.y;
  assert(parent[y*width+x],sector.id+' sentry '+guard.id+' patrol must be reachable from town.');
 }
}
assert(!wallRunsIntersect(nativeWalls,game([460.5,508.5]),game([488.5,508.5]),{radius}));
for(let x=460;x<=488;x++)assert(open[508*width+x],'Clear source approach cannot cross blocked terrain or a vegetation anchor.');
assert(wallRunsIntersect(nativeWalls,game([480.5,508.5]),game([480.5,500.5]),{radius}));
const output={schema:'mount-dora-route-evidence/1',sourceProjectSHA256:hash(fs.readFileSync(path.join(town,'project.json'))),sourceDigest:project.generation.sourceDigest,
 coordinateFrame:'town east/south metres; game = town - (0.5,0.5)',bounds:[0,0,width,height],actorRadiusM:radius,wallQuerySource:provenance,
 scope:'Offline outdoor source-terrain/reference-wall evidence. Final production art solids and streaming behavior require actual runtime tests.',
 terrainPolicy:'Water and closed building floor masks excluded; solid tree cells conservatively reserved. Existing Nautilus wall query checks 0.23m radius at 0.8m height.',
 spawn:{name:'Donnelly Park west approach',townPoint:spawn.town},reachableOutdoorCells:tail,reachedLandSectors:bySector.filter(s=>s.reachedOutdoorCells>0).length,
 sectors:bySector,routes,seamSamples,
 boardwalkLanes:features.filter(f=>['osm-way-548471563','osm-way-688219167'].includes(f.id)).map(f=>({sourceId:f.id,townPoints:f.geometry.coordinates,policy:'Follow the mapped centre line when validating production rails; source-only grid paths may touch a new side rail.'})),
 cornerLoop:{sectors:['B02','C02','C03','B03'],townPoints:cornerTown},
 crossSectorBuilding:{sourceId:'osm-way-557051202',sectors:['B03','C03'],clearApproachTown:[[460.5,508.5],[488.5,508.5]],blockedWallProbeTown:[[480.5,508.5],[480.5,500.5]]}};
fs.mkdirSync(path.join(town,'playable'),{recursive:true});
fs.writeFileSync(path.join(town,'playable/route-fixtures.json'),JSON.stringify(output,null,2)+'\n');
assert.equal(output.reachedLandSectors,39,'Every land sector must be in the outdoor component.');
console.log(JSON.stringify({spawn:output.spawn,reachedLandSectors:output.reachedLandSectors,reachableOutdoorCells:tail,routes:routes.map(r=>({id:r.id,townPoint:r.townPoint,metres:r.metres})),seamSamples:seamSamples.length},null,2));
