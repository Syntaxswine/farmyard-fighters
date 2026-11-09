import {toWorld} from './hybrid-world.js';
import {foliageBlocks} from './foliage-data.js';
export const knownFoliageGround=(state,p)=>{
 const x=Math.round(p.x),y=Math.round(p.y),z=p.z||0,k=z?`${x},${y},${z}`:`${x},${y}`;
 return !!state.seen?.has(k)&&!state.concealedInteriors?.has(k);
};
export function battleFoliageTargets(state,displayedUnits,ids,hover,routes,level){
 const targets=[];
 for(const u of displayedUnits)if(u.team==='squad'&&u.hp>0&&!u.away&&ids.has(u.id)&&(u.presentationLevel??u.z??0)===level){const position=toWorld(u);position[1]+=.65;targets.push({id:'merc:'+u.id,position,level,radius:1.45});}
 const add=(p,id,radius)=>{if(p&&(p.z||0)===level&&knownFoliageGround(state,p)){const position=toWorld(p);position[1]+=.12;targets.push({id,position,level,radius});}};
 add(hover,'hover',1.4);
 // Reveal the nearby portion and destination of valid known routes. A long
 // order never cuts a corridor through the whole forest or unknown terrain.
 for(const route of routes||[])for(const [i,p]of [...route.path.slice(0,3),route.path.at(-1)].filter(Boolean).entries())add(p,'route:'+route.id+':'+i,1.05);
 return targets.slice(0,12);
}
export function drawFoliageHover(ctx,state,hover,project,level){
 if(!hover||!knownFoliageGround(state,hover))return;
 const p={x:Math.round(hover.x),y:Math.round(hover.y),z:level};
 if(!foliageBlocks(state,p.x,p.y,level))return;
 const corners=[[-.48,-.48],[.48,-.48],[.48,.48],[-.48,.48]].map(([x,y])=>project({...p,x:p.x+x,y:p.y+y}));
 ctx.save();ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.strokeStyle='#ff9b79';ctx.lineWidth=2;ctx.stroke();const at=project(p);ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillStyle='#ffcfaa';ctx.fillText('Impassable',at.x,at.y-12);ctx.restore();
}
