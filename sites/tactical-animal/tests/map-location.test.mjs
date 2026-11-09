import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {drawPlayerMapMarker} from '../dist/map-player-marker.js';
import {drawMinimap} from '../dist/field-view.js';
import {drawTownMinimap} from '../dist/mount-dora-view.js';
import {bindTourWorld,getTourWorld} from '../dist/mount-dora-activity.js';
import {createSoloGame,DEFAULT_BUILD,hero,tick,encodeSave} from '../dist/solo-game.js';
import {loadTownTour,visitTownLandmark} from '../dist/mount-dora-entry.js';
import {readTourProgress} from '../dist/mount-dora-progress.js';
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,a+' != '+b);
function canvas(width=760,height=560,displayWidth=234,displayHeight=234*560/760,fit='fill'){
  let matrix=[1,0,0,1,0,0];const stack=[],arcs=[],moves=[],boxes=[];
  const point=(x,y)=>({x:matrix[0]*x+matrix[2]*y+matrix[4],y:matrix[1]*x+matrix[3]*y+matrix[5]});
  const ctx={arcs,moves,boxes,fillRect(x,y,w,h){boxes.push({...point(x,y),w:w*matrix[0],h:h*matrix[3],color:this.fillStyle});},strokeRect(){},fillText(){},measureText:text=>({width:text.length*6.6}),drawImage(){},beginPath(){},closePath(){},stroke(){},fill(){},
    save(){stack.push([...matrix]);},restore(){matrix=stack.pop();},
    scale(x,y){matrix[0]*=x;matrix[1]*=x;matrix[2]*=y;matrix[3]*=y;},
    translate(x,y){const p=point(x,y);matrix[4]=p.x;matrix[5]=p.y;},
    rotate(t){const [a,b,c,d]=matrix,co=Math.cos(t),si=Math.sin(t);matrix[0]=a*co+c*si;matrix[1]=b*co+d*si;matrix[2]=c*co-a*si;matrix[3]=d*co-b*si;},
    moveTo(x,y){moves.push(point(x,y));},lineTo(){},
    arc(x,y,r){arcs.push({...point(x,y),rx:r*Math.hypot(matrix[0],matrix[1]),ry:r*Math.hypot(matrix[2],matrix[3]),color:this.fillStyle});}};
  return {width,height,getContext:()=>ctx,getBoundingClientRect:()=>({width:displayWidth,height:displayHeight}),ownerDocument:{defaultView:{getComputedStyle:()=>({objectFit:fit})}},ctx};
}
const marker=c=>c.ctx.arcs.filter(a=>a.color==='#10180f').at(-1);
function withDocument(fn){const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({drawImage(){},fillRect(){}})})};try{return fn();}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}}
test('normal map marker honors nonzero worldBounds without the town half-metre offset',()=>{
  const s=createSoloGame();s.worldBounds={x:100,y:200,w:40,h:20};s.seen=new Set();s.edges={};Object.assign(hero(s),{x:110,y:205,heading:0});const c=canvas(380,280,190,140);drawMinimap(c,s);const m=marker(c);close(m.x,98);close(m.y,94);const tip=c.ctx.moves.at(-1);close((tip.x-m.x)*.5,10);close(tip.y,m.y);
});
test('town projection aligns to the unpadded atlas and adds exactly one half metre',()=>withDocument(()=>{
  assert.match(fs.readFileSync(new URL('../../../maps/mount-dora/atlas.svg',import.meta.url),'utf8'),/viewBox="0 0 1440 1680"/);
  const s={units:[{x:477.5,y:484.25,heading:90}]};bindTourWorld(s,{bind(){},overviewImage:{},drawMinimap:drawTownMinimap});
  const c=canvas();drawMinimap(c,s,{expanded:true});const m=marker(c),scale=548/1680,ox=(760-1440*scale)/2;close(m.x,ox+478*scale);close(m.y,6+484.75*scale);const tip=c.ctx.moves.at(-1);close(tip.x,m.x);close((tip.y-m.y)*234/760,12);
}));
test('HUD halo and bright center retain visible CSS size through contain letterboxing',()=>{
  for(const [w,h,dw,dh]of [[190,140,77,50],[190,140,130,93],[760,560,234,172.42105263157896]]){
    const c=canvas(w,h,dw,dh,'contain'),scale=Math.min(dw/w,dh/h);drawPlayerMapMarker(c,c.ctx,{x:w/2,y:h/2,heading:0});const [halo,center]=c.ctx.arcs;close(halo.rx*scale,6);close(halo.ry*scale,6);close(center.rx*scale,3.5);close(halo.x,w/2);close(halo.y,h/2);
  }
});
test('expanded-map location labels remain fully on screen near every edge on phone',()=>{
  for(const [x,y]of [[0,0],[760,0],[0,560],[760,560]]){const c=canvas(),scale=234/760;drawPlayerMapMarker(c,c.ctx,{x,y,heading:0},{expanded:true});const box=c.ctx.boxes.find(b=>b.color==='#10180f');assert(box.x*scale>=4-1e-7&&box.y*scale>=4-1e-7);assert((box.x+box.w)*scale<=234-4+1e-7);assert((box.y+box.h)*scale<=234*560/760-4+1e-7);close(marker(c).x,x);close(marker(c).y,y);}
});
test('redraw tracks real travel, landmark visits and restored tour state',async()=>{
  const projectURL=new URL('../../../maps/mount-dora/project.json',import.meta.url),fetcher=async url=>new Response(fs.readFileSync(url)),s=await loadTownTour({build:DEFAULT_BUILD,fetcher,projectURL});let resumed;
  try{
    const c=canvas(),scale=548/1680,ox=(760-1440*scale)/2,draw=state=>withDocument(()=>{drawMinimap(c,state);return marker(c);}),first=draw(s);tick(s,.05,{x:1,y:0});const moved=draw(s);assert(moved.x>first.x);close(moved.x,ox+(hero(s).x+.5)*scale);
    await visitTownLandmark(s,'grantham-lighthouse');const visited=draw(s);close(visited.x,ox+504.5*scale);close(visited.y,6+1168.5*scale);
    resumed=await loadTownTour({build:DEFAULT_BUILD,progress:readTourProgress(encodeSave(s)),fetcher,projectURL});const restored=draw(resumed);close(restored.x,visited.x);close(restored.y,visited.y);
  }finally{getTourWorld(s).dispose();if(resumed)getTourWorld(resumed).dispose();}
});
