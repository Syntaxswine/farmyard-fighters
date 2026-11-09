import {blankMap} from './core/maps.js';
import {SIZE,portPoint,featureLine,transformPoint,transformConfig,TRANSFORMS,configurations,configKey} from './sector-catalog.js';
// Recipes are portable, declarative placeholders. Editor export is a normal v2 map.
export function expandPlaceholder(entry,transform=TRANSFORMS[0]){
 if(entry?.kind!=='sector-placeholder'||entry.version!==1||!entry.config)throw Error('Unsupported sector placeholder.');
 if(!Array.isArray(entry.config.roads)||entry.config.roads.some(s=>!['north','east','south','west'].includes(s))||new Set(entry.config.roads).size!==entry.config.roads.length)throw Error('Invalid road ports.');
 if(entry.config.feature&&(!['river','cliff'].includes(entry.config.feature.kind)||!Array.isArray(entry.config.feature.ports)||entry.config.feature.ports.length!==2||entry.config.feature.ports.some(p=>!['north','east','south','west'].includes(p.side)||![1,2].includes(p.slot))))throw Error('Invalid feature ports.');
 if(!configurations().some(c=>configKey(c)===configKey(entry.config)))throw Error('Unsupported feature combination.');
 if(typeof entry.id!=='string'||!entry.id||entry.id.length>120||!TRANSFORMS.some(t=>t.turns===transform.turns&&t.mirror===transform.mirror))throw Error('Invalid placeholder identity or transform.');
 if(!entry.allowedTransforms?.some(t=>t.turns===transform.turns&&t.mirror===transform.mirror))throw Error('This variant does not support that transform.');
 const map=blankMap(entry.id.slice(0,60)),water=new Set(),cliff=new Set(),road=new Set();
 const paint=(points,width,out)=>{for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],steps=Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]));for(let n=0;n<=steps;n++){const x=Math.floor(a[0]+(b[0]-a[0])*n/(steps||1)),y=Math.floor(a[1]+(b[1]-a[1])*n/(steps||1));if(width===1&&n>0){const px=Math.floor(a[0]+(b[0]-a[0])*(n-1)/(steps||1));if(px>=0&&px<SIZE&&y>=0&&y<SIZE)out.add(y*SIZE+px);}for(let dy=-Math.floor(width/2);dy<Math.ceil(width/2);dy++)for(let dx=-Math.floor(width/2);dx<Math.ceil(width/2);dx++){const px=x+dx,py=y+dy;if(px>=0&&py>=0&&px<SIZE&&py<SIZE)out.add(py*SIZE+px);}}}};
 if(entry.config.feature)paint(featureLine(entry.config),entry.config.feature.kind==='river'?6:1,entry.config.feature.kind==='river'?water:cliff);
 for(const side of entry.config.roads)paint([portPoint({side,slot:1.5}),[120,120]],6,road);
 for(const k of water)map.terrain[Math.floor(k/SIZE)][k%SIZE]='water';
 for(const k of road)map.terrain[Math.floor(k/SIZE)][k%SIZE]=water.has(k)?'bridge':'ground-asphalt';
 for(const k of cliff)if(!road.has(k))map.props.push({kind:'cliff-ledge',x:k%SIZE,y:Math.floor(k/SIZE),z:0});
 // Keep the preview squad and exit together on a supported patch.
 let home;for(let y=6;y<230&&!home;y+=8)for(let x=6;x<230&&!home;x+=8){const cells=[[x,y],[x+1,y],[x,y+1],[x+1,y+1],[x+2,y]];if(cells.every(([a,b])=>!water.has(b*SIZE+a)&&!cliff.has(b*SIZE+a)))home=cells;}
 if(!home)throw Error('No safe preview start.');map.starts=home.slice(0,4).map(([x,y])=>({x,y,z:0}));map.exits=[{x:home[4][0],y:home[4][1],z:0}];
 const cell=p=>{const [x,y]=transformPoint([p.x+.5,p.y+.5],transform);return {...p,x:Math.floor(x),y:Math.floor(y)};};
 if(transform.turns||transform.mirror){const terrain=map.terrain.map(row=>row.slice());for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const p=cell({x,y});terrain[p.y][p.x]=map.terrain[y][x];}map.terrain=terrain;map.props=map.props.map(cell);map.starts=map.starts.map(cell);map.exits=map.exits.map(cell);}
 map.sectorTemplate={id:entry.id,status:entry.status,role:entry.role,facilities:entry.facilities,difficulties:entry.difficulties,config:transformConfig(entry.config,transform),transform,notes:entry.notes,tutorialStep:entry.tutorialStep,travel:entry.travel?.map(side=>transformConfig({roads:[side],feature:null},transform).roads[0]),scope:'placeholder; not campaign-ready'};return map;
}
