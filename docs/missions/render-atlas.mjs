import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const source=new URL('./first-shift.maps.json',import.meta.url);
const output=new URL('./first-shift-atlas.svg',import.meta.url);
const campaign=JSON.parse(readFileSync(source,'utf8'));
const errors=[],ids=new Set(),radius=.23;
const within=([x,y])=>Number.isFinite(x)&&Number.isFinite(y)&&x>=1&&x<=38&&y>=1&&y<=28;
const boxDistance=([x,y],b)=>Math.hypot(Math.max(b.x0-x,0,x-b.x1),Math.max(b.y0-y,0,y-b.y1));
const coverBox=([x,y,w,h])=>({x0:x-.5,x1:x+w-.5,y0:y-.5,y1:y+h-.5});
function wallBoxes(mission){
  const boxes=[];
  const add=(axis,at,from,to,gaps=[])=>{
    let start=from;
    for(const [a,b] of [...gaps,[to,to]].sort((a,b)=>a[0]-b[0])){
      if(a>start)boxes.push(axis==='x'?{x0:at-.08,x1:at+.08,y0:start,y1:a}:{x0:start,x1:a,y0:at-.08,y1:at+.08});
      start=Math.max(start,b);
    }
  };
  for(const room of mission.rooms){
    const [x,y,w,h]=room.rect,x0=x-.5,x1=x+w-.5,y0=y-.5,y1=y+h-.5;
    for(const [axis,at,from,to] of [['x',x0,y0,y1],['x',x1,y0,y1],['y',y0,x0,x1],['y',y1,x0,x1]]){
      const gaps=room.doors.filter(p=>Math.abs(p[axis==='x'?0:1]-at)<1e-8).map(p=>[p[axis==='x'?1:0]-.5,p[axis==='x'?1:0]+.5]);
      add(axis,at,from,to,gaps);
    }
  }
  for(const wall of mission.walls)add(wall.axis,wall.at,wall.from,wall.to,wall.gaps);
  return boxes;
}
let routeCount=0;
for(const mission of campaign.missions){
  const fail=message=>errors.push(`${mission.id}: ${message}`);
  if(ids.has(mission.id))fail('duplicate mission ID');ids.add(mission.id);
  const objectIds=new Set();
  for(const item of [...mission.rooms,...mission.objectives,...mission.storyPoints]){
    if(objectIds.has(item.id))fail(`duplicate placement ID ${item.id}`);objectIds.add(item.id);
  }
  for(const p of [mission.spawn,mission.extraction,...mission.objectives.map(o=>o.at),...mission.storyPoints.map(o=>o.at),...mission.guardPosts.map(g=>g.at)])if(!within(p))fail(`out-of-bounds point ${p}`);
  for(const [x,y,w,h] of [...mission.rooms.map(r=>r.rect),...mission.cover])if(!(w>0&&h>0&&within([x,y])&&within([x+w-1,y+h-1])))fail(`invalid rectangle ${[x,y,w,h]}`);
  for(const room of mission.rooms){
    const [x,y,w,h]=room.rect;
    for(const [dx,dy] of room.doors){
      const onVertical=(Math.abs(dx-(x-.5))<1e-8||Math.abs(dx-(x+w-.5))<1e-8)&&dy>=y&&dy<=y+h-1;
      const onHorizontal=(Math.abs(dy-(y-.5))<1e-8||Math.abs(dy-(y+h-.5))<1e-8)&&dx>=x&&dx<=x+w-1;
      if(!onVertical&&!onHorizontal)fail(`door ${dx},${dy} is not on ${room.id}'s boundary`);
    }
  }
  const solids=[...wallBoxes(mission),...mission.cover.map(coverBox)];
  for(const objective of mission.objectives){
    for(const before of objective.after||[])if(!mission.objectives.some(o=>o.id===before))fail(`unknown prerequisite ${before}`);
    if(solids.some(b=>boxDistance(objective.at,b)<radius))fail(`objective use position ${objective.id} is inside a solid`);
  }
  for(const point of [mission.spawn,mission.extraction])if(solids.some(b=>boxDistance(point,b)<radius))fail(`spawn/extraction inside a solid at ${point}`);
  for(const route of mission.routes){
    routeCount++;
    for(const p of route.points)if(!within(p))fail(`${route.id} waypoint outside bounds`);
    let blocked=false;
    for(let i=1;i<route.points.length&&!blocked;i++){
      const a=route.points[i-1],b=route.points[i],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.05));
      for(let t=0;t<=steps;t++){
        const p=[a[0]+(b[0]-a[0])*t/steps,a[1]+(b[1]-a[1])*t/steps];
        if(solids.some(box=>boxDistance(p,box)<radius-1e-7)){fail(`${route.id} crosses a solid near ${p.map(v=>v.toFixed(2)).join(',')}`);blocked=true;break;}
      }
    }
  }
}
if(errors.length)throw Error(errors.join('\n'));
console.log(`Validated ${campaign.missions.length} spatial briefs and ${routeCount} suggested routes against reference walls and cover. Runtime validation remains required.`);
if(process.argv.includes('--check'))process.exit(0);

const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const colors={paper:'#f1ead5',ink:'#25392f',muted:'#586453',yard:'#d4d9bd',room:'#eee7cf',cover:'#79806a',wall:'#384a3c',direct:'#a44e31',alternate:'#39717c',departure:'#725888'};
const w=1040,h=1460,parts=[];
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="atlas-title atlas-desc">`);
parts.push(`<title id="atlas-title">The First Shift: six mission blockouts</title><desc id="atlas-desc">Top-down spatial briefs for Mill 04, the feed mill, pump station, freight yard, dormitory and radio relay. Solid rectangles are cover; outlines are rooms. Suggested routes assume usable doors and require runtime validation. S marks spawn, E extraction, numbered circles required objectives and small diamonds story details.</desc>`);
parts.push(`<style>text{font-family:Arial,sans-serif;fill:${colors.ink}}.title{font-size:25px;font-weight:bold}.sub{font-size:13px;fill:${colors.muted}}.name{font-size:19px;font-weight:bold}.room{font-size:10px;text-anchor:middle}.small{font-size:11px}.badge{font-size:10px;text-anchor:middle;dominant-baseline:central;font-weight:bold;fill:${colors.paper}}.note{font-size:12px}</style>`);
parts.push(`<rect width="${w}" height="${h}" fill="${colors.paper}"/><text x="30" y="38" class="title">THE FIRST SHIFT</text><text x="30" y="62" class="sub">Six connected locations • Spatial authoring references • North ↑ • 38 × 28 m playable bounds</text>`);
const legend=(x,color,label,dash='')=>`<path d="M${x} 89h28" stroke="${color}" stroke-width="3" ${dash?`stroke-dasharray="${dash}"`:''}/><text x="${x+35}" y="93" class="small">${label}</text>`;
parts.push(legend(30,colors.direct,'Direct approach'),legend(210,colors.alternate,'Alternative approach','5 4'),legend(420,colors.departure,'Departure','2 3'),'<text x="590" y="93" class="small">S spawn · E extraction · 1/2 objectives · ◇ story detail</text>');
campaign.missions.forEach((mission,index)=>{
  const px=25+(index%2)*510,py=120+Math.floor(index/2)*440,ox=px+42,oy=py+82,scale=10;
  const point=([x,y])=>[ox+(x-1)*scale,oy+(y-1)*scale];
  parts.push(`<g><rect x="${px}" y="${py}" width="490" height="424" rx="5" fill="none" stroke="#b5bba4"/><text x="${px+16}" y="${py+28}" class="name">${mission.order}. ${esc(mission.title)}</text><text x="${px+16}" y="${py+49}" class="sub">${esc(mission.location)}</text>`);
  parts.push(`<rect x="${ox-5}" y="${oy-5}" width="380" height="280" fill="${colors.yard}"/>`);
  for(const room of mission.rooms){const [x,y,rw,rh]=room.rect,[sx,sy]=point([x-.5,y-.5]);parts.push(`<rect x="${sx}" y="${sy}" width="${rw*scale}" height="${rh*scale}" fill="${colors.room}"/>`);}
  for(const box of wallBoxes(mission)){const [sx,sy]=point([box.x0,box.y0]);parts.push(`<rect x="${sx}" y="${sy}" width="${(box.x1-box.x0)*scale}" height="${(box.y1-box.y0)*scale}" fill="${colors.wall}"/>`);}
  for(const rect of mission.cover){const [x,y,cw,ch]=rect,[sx,sy]=point([x-.5,y-.5]);parts.push(`<rect x="${sx}" y="${sy}" width="${cw*scale}" height="${ch*scale}" fill="${colors.cover}"/>`);}
  for(const route of mission.routes){const type=route.id==='alternate'?'alternate':route.id==='departure'?'departure':'direct';parts.push(`<polyline points="${route.points.map(p=>point(p).join(',')).join(' ')}" fill="none" stroke="${colors[type]}" stroke-width="2.3" stroke-linejoin="round" opacity=".85" ${type==='alternate'?'stroke-dasharray="5 4"':type==='departure'?'stroke-dasharray="2 3"':''}><title>${esc(route.name)}</title></polyline>`);}
  for(const room of mission.rooms){const [x,y,rw,rh]=room.rect,[sx,sy]=point([x+(rw-1)/2,y+(rh-1)/2]);parts.push(`<text x="${sx}" y="${sy+3}" class="room">${esc(room.name)}</text>`);}
  for(const story of mission.storyPoints){const [sx,sy]=point(story.at);parts.push(`<path d="M${sx} ${sy-4}l4 4-4 4-4-4Z" fill="${colors.muted}"><title>${esc(story.name)}</title></path>`);}
  for(const [number,obj] of mission.objectives.entries()){const [sx,sy]=point(obj.at);parts.push(`<circle cx="${sx}" cy="${sy}" r="8" fill="${colors.direct}"/><text x="${sx}" y="${sy}" class="badge">${number+1}</text>`);}
  for(const [label,pos] of [['S',mission.spawn],['E',mission.extraction]]){const [sx,sy]=point(pos);const offset=label==='E'&&mission.spawn.join()===mission.extraction.join()?13:0;parts.push(`<rect x="${sx-7+offset}" y="${sy-7}" width="14" height="14" rx="2" fill="${colors.ink}"/><text x="${sx+offset}" y="${sy}" class="badge">${label}</text>`);}
  parts.push(`<text x="${px+16}" y="${py+386}" class="note">${esc(mission.objectives.map((o,i)=>`${i+1}: ${o.name}`).join(' → '))}</text><text x="${px+16}" y="${py+407}" class="sub">${esc(mission.stage)}</text></g>`);
});
parts.push(`<text x="30" y="1450" class="sub">Blockouts describe structure and intent. Guard positions, door states, sight lines and final prop footprints require in-game review.</text></svg>`);
writeFileSync(output,parts.join('\n')+'\n');
console.log(`Wrote ${fileURLToPath(output)}`);
