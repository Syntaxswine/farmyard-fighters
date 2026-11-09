// Strategic drawing data. This is deliberately separate from local map/block schemas.
import {environmentErrors} from './environment-regions.js';
export const WIDTH=30,HEIGHT=15;
export const SIDES=['north','east','south','west'];
export const KINDS=['road','river','cliff'];
export const ROLES=['countryside','village','town','city','fortress','tutorial'];
export const TERRAINS=['plain','forest','mountains','wetland','plateau'];
export const OPPOSITE={north:'south',south:'north',east:'west',west:'east'};
export const STEP={north:[0,-1],south:[0,1],east:[1,0],west:[-1,0]};
export const slots=kind=>kind==='road'?[.5]:[1/3,2/3];
export function anchor({side,offset}){
 if(side==='center')return [50,50];
 if(side==='north')return [offset*100,0];
 if(side==='south')return [offset*100,100];
 if(side==='west')return [0,offset*100];
 return [100,offset*100];
}
export function sector(){return {name:'',terrain:'plain',role:'countryside',difficulty:'unassigned',owner:'unassigned',facilities:[],routes:[],travel:[],gate:'none'};}
export function blank(){return {kind:'animal-factory-overmap-sketch',version:1,width:WIDTH,height:HEIGHT,name:'Untitled overmap',sectors:Array.from({length:WIDTH*HEIGHT},sector)};}
export function route(kind,a,b,ao=slots(kind)[0],bo=ao){return {kind,from:{side:a,offset:ao},to:{side:b,offset:bo}};}
export function demo(){
 const m=blank();m.name='Attachment study';
 m.sectors.forEach((s,i)=>{const x=i%WIDTH,y=Math.floor(i/WIDTH),n=(x*17+y*31)%23;s.difficulty=x<10?'easy':x<20?'medium':'hard';s.terrain=y===0&&x>11||y===14&&x>17?'mountains':n<5?'forest':n===8?'wetland':'plain';});
 // Explicitly illustrative geography, not a campaign-generator result.
 const riverOffsets=[1,1,1,2,2,2,1,1,2,2,2,2,1,1,2,2].map(n=>n/3);
 for(let y=0;y<HEIGHT;y++)m.sectors[y*WIDTH+7].routes.push(route('river','north','south',riverOffsets[y],riverOffsets[y+1]));
 for(let x=0;x<WIDTH;x++)m.sectors[7*WIDTH+x].routes.push(route('road','west','east'));
 for(let y=2;y<13;y++)m.sectors[y*WIDTH+18].routes.push(route('road','north','south'));
 for(let y=3;y<12;y++)m.sectors[y*WIDTH+24].routes.push(route('cliff','north','south',y%2?2/3:1/3,y%2?1/3:2/3));
 m.sectors[7*WIDTH+7].gate='bridge';m.sectors[7*WIDTH+24].gate='passage';
 for(const [x,y,role,name,facilities]of [[3,7,'village','Orchard',[]],[11,7,'town','Mill town',['workshop']],[18,7,'city','Foundry',['factory','workshop']],[27,7,'fortress','East watch',[]],[18,3,'fortress','North watch',[]]])Object.assign(m.sectors[y*WIDTH+x],{role,name,facilities,owner:'red-hats'});
 return placeTutorial(m,2,3,0);
}
export function validate(m){
 if(!m||m.kind!=='animal-factory-overmap-sketch'||m.version!==1||m.width!==WIDTH||m.height!==HEIGHT||!Array.isArray(m.sectors)||m.sectors.length!==WIDTH*HEIGHT)throw Error('Use a version 1 overmap sketch with 30 × 15 sectors. Local maps and blocks use a different format.');
 if(typeof m.name!=='string'||m.name.length>100)throw Error('Overmap name must be 100 characters or fewer.');
 const environmentIssues=environmentErrors(m.environments);if(environmentIssues.length)throw Error(environmentIssues[0]);
 const has=(arr,v)=>arr.includes(v);
 m.sectors.forEach((s,i)=>{
  const fail=()=>{throw Error('Invalid properties in sector '+(i%WIDTH+1)+','+(Math.floor(i/WIDTH)+1)+'.');};
  if(!s||typeof s.name!=='string'||s.name.length>100||!has(TERRAINS,s.terrain)||!has(ROLES,s.role)||!has(['unassigned','easy','medium','hard'],s.difficulty)||!has(['unassigned','player','red-hats','neutral'],s.owner)||!has(['none','bridge','passage'],s.gate))fail();
  for(const [key,allowed,max]of [['facilities',['factory','workshop'],2],['travel',SIDES,4]])if(!Array.isArray(s[key])||s[key].length>max||new Set(s[key]).size!==s[key].length||s[key].some(v=>!has(allowed,v)))fail();
  if(s.tutorialStep!==undefined&&(!Number.isInteger(s.tutorialStep)||s.tutorialStep<1||s.tutorialStep>6||!['tutorial','town'].includes(s.role)))fail();
  if(!Array.isArray(s.routes)||s.routes.length>12)fail();
  for(const r of s.routes){if(!r||!has(KINDS,r.kind))fail();for(const p of [r.from,r.to])if(!p||!has(r.kind==='road'?[...SIDES,'center']:SIDES,p.side)||!slots(r.kind).some(n=>Math.abs(n-p.offset)<1e-9)||typeof p.offset!=='number')fail();if(r.from.side===r.to.side&&r.from.offset===r.to.offset)fail();}
 });
 if(m.tutorialPlacement){const p=m.tutorialPlacement,legacy=p.layoutVersion===undefined&&p.underlay?.length===5,cells=tutorialCells(p.x,p.y,p.rotation,legacy?1:2);if(p.layoutVersion!==undefined&&p.layoutVersion!==2||!Array.isArray(p.underlay)||p.underlay.length!==cells.length||p.underlay.some((v,i)=>!v||v.index!==cells[i].index))throw Error('Invalid tutorial placement backup.');const background=blank();for(const v of p.underlay)background.sectors[v.index]=v.sector;validate(background);}
 return m;
}
export function warnings(m,index){
 const s=m.sectors[index],x=index%WIDTH,y=Math.floor(index/WIDTH),out=[];
 for(const r of s.routes)for(const p of [r.from,r.to]){
  if(p.side==='center')continue;
  const [dx,dy]=STEP[p.side],nx=x+dx,ny=y+dy;if(nx<0||nx>=WIDTH||ny<0||ny>=HEIGHT)continue;
  const other=m.sectors[ny*WIDTH+nx];
  if(!other.routes.some(q=>q.kind===r.kind&&[q.from,q.to].some(e=>e.side===OPPOSITE[p.side]&&Math.abs(e.offset-p.offset)<1e-9)))out.push(`${r.kind} at ${p.side} ${fraction(p.offset)} has no matching attachment in sector ${nx+1},${ny+1}.`);
 }
 for(const side of s.travel){const [dx,dy]=STEP[side],nx=x+dx,ny=y+dy;if(nx<0||nx>=WIDTH||ny<0||ny>=HEIGHT)out.push(`Travel at ${side} leaves the overmap.`);else if(!m.sectors[ny*WIDTH+nx].travel.includes(OPPOSITE[side]))out.push(`Travel at ${side} is not declared by the neighboring sector.`);}
 if(s.gate==='bridge'&&!['road','river'].every(k=>s.routes.some(r=>r.kind===k)))out.push('Bridge needs a road and a river.');
 if(s.gate==='passage'&&!['road','cliff'].every(k=>s.routes.some(r=>r.kind===k)))out.push('Passage needs a road and a cliff.');
 return [...new Set(out)];
}
export const fraction=n=>Math.abs(n-.5)<1e-9?'½':Math.abs(n-1/3)<1e-9?'⅓':'⅔';
export class SketchDocument{
 constructor(map=demo()){this.map=structuredClone(validate(map));this.past=[];this.future=[];}
 replace(map){const next=structuredClone(validate(map));this.past.push(this.map);if(this.past.length>60)this.past.shift();this.map=next;this.future=[];}
 edit(index,fn){const next=structuredClone(this.map);fn(next.sectors[index]);this.replace(next);}
 undo(){if(this.past.length){this.future.push(this.map);this.map=this.past.pop();}}
 redo(){if(this.future.length){this.past.push(this.map);this.map=this.future.pop();}}
}

// Plateau rims are drawn only at the outside of contiguous plateau terrain.
export function plateauRim(m,index){
 if(m.sectors[index].terrain!=='plateau')return [];
 const x=index%WIDTH,y=Math.floor(index/WIDTH);
 return SIDES.filter(side=>{const [dx,dy]=STEP[side],nx=x+dx,ny=y+dy;return nx<0||nx>=WIDTH||ny<0||ny>=HEIGHT||m.sectors[ny*WIDTH+nx].terrain!=='plateau';}).map(side=>({side,opening:m.sectors[index].travel.includes(side)}));
}

// Six occupied cells: town 5/6, plateau 4/3, plateau 2/1. Version 1 is
// read-only compatibility for saved five-cell placement backups.
export function tutorialCells(x,y,rotation=0,layoutVersion=2){
 if(!Number.isInteger(x)||!Number.isInteger(y)||![0,90,180,270].includes(rotation))throw Error('Use whole-number columns/rows and a quarter-turn rotation.');
 const base=[[1,2],[0,2],[1,1],[0,1],[0,0],...layoutVersion===1?[]:[[1,0]]];
 const cells=base.map(([a,b],i)=>{let px=a,py=b;if(rotation===90){px=2-b;py=a;}if(rotation===180){px=1-a;py=2-b;}if(rotation===270){px=b;py=1-a;}return {x:x+px,y:y+py,step:i+1,index:(y+py)*WIDTH+x+px};});
 if(cells.some(c=>c.x<0||c.x>=WIDTH||c.y<0||c.y>=HEIGHT))throw Error('All six tutorial-group sectors must fit on the overmap.');
 for(const town of cells.slice(4))if(town.x===0||town.x===WIDTH-1||town.y===0||town.y===HEIGHT-1)throw Error('The tutorial town must not be on the edge of the overmap.');
 return cells;
}
function rotateSector(s,turns){
 const out=structuredClone(s),rotate=p=>{if(p.side==='center')return p;for(let i=0;i<turns;i++){if(p.side==='east'||p.side==='west')p.offset=Math.abs(p.offset-.5)<1e-9?.5:p.offset<.5?2/3:1/3;p.side=SIDES[(SIDES.indexOf(p.side)+1)%4];}return p;};
 out.travel=out.travel.map(side=>SIDES[(SIDES.indexOf(side)+turns)%4]);
 out.routes=out.routes.map(r=>({...r,from:rotate({...r.from}),to:rotate({...r.to})}));return out;
}
export function placeTutorial(map,x,y,rotation=0){
 const cells=tutorialCells(x,y,rotation),next=structuredClone(map),old=next.tutorialPlacement;let content;
 if(old){const previous=tutorialCells(old.x,old.y,old.rotation,old.underlay.length===5?1:2);content=previous.map(c=>rotateSector(next.sectors[c.index],((rotation-old.rotation+360)%360)/90));for(const v of old.underlay)next.sectors[v.index]=structuredClone(v.sector);
  if(content.length===5){const side=SIDES[(1+rotation/90)%4];content[4].travel=[...new Set([...content[4].travel,side])];content.push({...sector(),name:'Starting town · east',role:'town',difficulty:'easy',owner:'red-hats',tutorialStep:6,travel:[OPPOSITE[side]]});}
 }
 else{
  content=cells.map((c,i)=>({...sector(),name:i===0?'Tutorial start':i>=4?'Starting town · '+(i===4?'west':'east'):'Tutorial '+(i+1),role:i>=4?'town':'tutorial',terrain:i>=4?'plain':'plateau',difficulty:'easy',owner:i>=4?'red-hats':'unassigned',tutorialStep:i+1,facilities:i===4?['workshop']:[]}));
  // Both town sectors join each other. Only step 4 descends into step 5;
  // physical adjacency between step 3 and step 6 is a closed cliff seam.
  for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){const a=cells[i],b=cells[j];if(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)!==1||i===2&&j===5)continue;const side=b.x>a.x?'east':b.x<a.x?'west':b.y>a.y?'south':'north';content[i].travel.push(side);content[j].travel.push(OPPOSITE[side]);}
 }
 const underlay=cells.map(c=>({index:c.index,sector:structuredClone(next.sectors[c.index])}));
 cells.forEach((c,i)=>next.sectors[c.index]=content[i]);next.tutorialPlacement={x,y,rotation,layoutVersion:2,underlay};return validate(next);
}

export function randomizeTutorial(map,random=Math.random){
 const previous=map.tutorialPlacement,choices=[];
 for(const rotation of [0,90,180,270])for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
  if(previous&&(rotation===previous.rotation||x===previous.x&&y===previous.y))continue;
  try{tutorialCells(x,y,rotation);choices.push({x,y,rotation});}catch{/* Outside the map or town on the boundary. */}
 }
 if(!choices.length)throw Error('No alternative tutorial placement fits this map.');
 const value=random();if(!Number.isFinite(value)||value<0||value>=1)throw Error('Random value must be between zero (inclusive) and one (exclusive).');
 const {x,y,rotation}=choices[Math.floor(value*choices.length)];return placeTutorial(map,x,y,rotation);
}
