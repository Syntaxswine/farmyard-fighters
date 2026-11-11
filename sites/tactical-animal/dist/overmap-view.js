import {BLOCK_METRES,SECTOR_METRES,elementById,footprintRectangles,
  buildingForElement,guardsForInstance,rotatePoint} from './overmap-elements.js';
import {regionRoute} from './overmap-model.js';
import {sightOf,acuity} from './aft/tactics/core/perception.js';

const COLORS={farm:'#c7bd8c',woodland:'#93a484',checkpoint:'#b9b2a1',settlement:'#cab39a',depot:'#a9b0a6'};
function context(canvas,width,height){
  const scale=Math.min(2,globalThis.devicePixelRatio||1),pixels=Math.max(320,canvas.clientWidth||600);
  canvas.width=Math.round(pixels*scale);canvas.height=Math.round(pixels*scale*height/width);
  const ctx=canvas.getContext('2d');
  ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
  ctx.clearRect(0,0,width,height);return ctx;
}
function line(ctx,points,color,width=1,dash=[]){
  if(points.length<2)return;
  ctx.beginPath();ctx.moveTo(...points[0]);
  for(const point of points.slice(1))ctx.lineTo(...point);
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);
}
function transformed(instance,point){
  const [x,y]=rotatePoint(point,instance.rotation);
  return [instance.x*BLOCK_METRES+x,instance.y*BLOCK_METRES+y];
}
function polygon(ctx,points,fill,stroke){
  ctx.beginPath();ctx.moveTo(...points[0]);
  for(const point of points.slice(1))ctx.lineTo(...point);
  ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.18;ctx.stroke();}
}
function rectangle(ctx,instance,[x,y,w,h],fill,stroke){
  polygon(ctx,[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>transformed(instance,p)),fill,stroke);
}
function rayDistance(origin,angle,box,maximum){
  let lo=0,hi=maximum;
  for(const [axis,direction,min,max]of [[0,Math.cos(angle),box[0],box[0]+box[2]],
    [1,Math.sin(angle),box[1],box[1]+box[3]]]){
    if(Math.abs(direction)<1e-9){if(origin[axis]<min||origin[axis]>max)return maximum;continue;}
    const a=(min-origin[axis])/direction,b=(max-origin[axis])/direction;
    lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return maximum;
  }
  return lo>0?lo:maximum;
}
function sight(ctx,instance,guard,element){
  const profile=sightOf(guard),origin=[guard.x,guard.y];
  const boxes=footprintRectangles(element).map(box=>{
    const corners=[transformed(instance,box.slice(0,2)),transformed(instance,[box[0]+box[2],box[1]+box[3]])];
    return [Math.min(corners[0][0],corners[1][0]),Math.min(corners[0][1],corners[1][1]),
      Math.abs(corners[1][0]-corners[0][0]),Math.abs(corners[1][1]-corners[0][1])];
  });
  const draw=(field,fill)=>{
    const points=[origin];
    for(let i=0;i<=96;i++){
      const offset=-field/2+field*i/96,angle=(guard.heading+offset)*Math.PI/180;
      let reach=26*profile.range*acuity(Math.abs(offset),profile);
      for(const box of boxes)reach=Math.min(reach,rayDistance(origin,angle,box,reach));
      points.push([origin[0]+Math.cos(angle)*reach,origin[1]+Math.sin(angle)*reach]);
    }
    polygon(ctx,points,fill);
  };
  draw(profile.field,'rgba(172,107,55,.09)');draw(profile.bino,'rgba(241,202,108,.24)');
}
function elementDrawing(ctx,instance,{detail=false,showSight=false}={}){
  const element=elementById(instance.element,instance.revision),x=instance.x*BLOCK_METRES,y=instance.y*BLOCK_METRES;
  if(element.kind==='connection'){
    ctx.fillStyle=element.concealment==='gap'?'#a2b18e':'#91a582';ctx.fillRect(x,y,24,24);
    for(const box of element.obstacles||[]){
      const from=rotatePoint([box[0],box[1]],instance.rotation,24),to=rotatePoint([box[0],box[1]+box[3]],instance.rotation,24);
      line(ctx,[[x+from[0],y+from[1]],[x+to[0],y+to[1]]],'#67735d',.3,[.35,.3]);
    }
    return;
  }
  if(element.kind==='ground'){
    ctx.fillStyle=element.id==='ground.yard'?'#c7c3ac':'#d1d1b0';ctx.fillRect(x,y,24,24);return;
  }
  const guards=guardsForInstance(instance);
  if(showSight)for(const guard of guards)sight(ctx,instance,guard,element);
  rectangle(ctx,instance,[28,-.5,8,48],'rgba(87,122,77,.26)');
  const finishes={'sage-siding':'#99a78a',plaster:'#cfbb94',wood:'#a68c69',brick:'#b18269',concrete:'#acae9e'};
  const building=element.building?buildingForElement(element):null;
  for(const box of footprintRectangles(element))rectangle(ctx,instance,box,building?finishes[building.source.wall]||'#c5b899':'#aaa084','#544e40');
  for(const cover of element.cover)rectangle(ctx,instance,cover,'#8e8054','#5e553f');
  if(detail&&element.building){
    const [ox,oy]=building.at;
    for(const wall of building.compiled.floors[0].walls){
      const [ax,ay]=wall.a,[bx,by]=wall.b,length=Math.hypot(bx-ax,by-ay);
      line(ctx,[transformed(instance,[ax+ox,ay+oy]),transformed(instance,[bx+ox,by+oy])],'#5c5141',wall.interior?.12:.22);
      for(const opening of wall.openings){
        const point=u=>transformed(instance,[ox+ax+(bx-ax)*u/length,oy+ay+(by-ay)*u/length]);
        line(ctx,[point(opening.u0),point(opening.u1)],opening.type==='door'?'#427a64':'#6b9aa1',.35);
      }
    }
  }
  for(const guard of guards){
    if(guard.patrol)line(ctx,[[guard.x,guard.y],...guard.patrol.map(p=>[p.x,p.y]),[guard.patrol[0].x,guard.patrol[0].y]],'#4c7186',.25,[.6,.5]);
    const angle=guard.heading*Math.PI/180;
    ctx.beginPath();ctx.arc(guard.x,guard.y,.55,0,Math.PI*2);ctx.fillStyle='#994a35';ctx.fill();
    line(ctx,[[guard.x,guard.y],[guard.x+Math.cos(angle)*1.4,guard.y+Math.sin(angle)*1.4]],'#733a2a',.28);
  }
  const weak=transformed(instance,element.weakPoint);
  ctx.beginPath();ctx.arc(...weak,1.15,0,Math.PI*2);ctx.strokeStyle='#315f4d';ctx.lineWidth=.25;ctx.stroke();
}

export function drawWorld(canvas,map,selected){
  const width=map.width*100,height=map.height*78,ctx=context(canvas,width,height);
  ctx.fillStyle='#e9e0c5';ctx.fillRect(0,0,width,height);
  for(const region of map.regions){
    const x=region.x*100,y=region.y*78;
    ctx.fillStyle=COLORS[region.type];ctx.fillRect(x+3,y+3,94,72);
  }
  const regions=new Map(map.regions.map(r=>[r.id,r]));
  line(ctx,map.route.map(id=>{const r=regions.get(id);return [r.x*100+50,r.y*78+39];}),'rgba(44,91,66,.42)',6);
  for(const region of map.regions){
    const x=region.x*100,y=region.y*78;
    ctx.fillStyle='#24382b';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.fillText(region.id,x+50,y+31);
    ctx.font='11px sans-serif';ctx.fillText(region.type,x+50,y+49);
    if(region.id===selected){ctx.strokeStyle='#273f2e';ctx.lineWidth=3;ctx.strokeRect(x+4,y+4,92,70);}
  }
}
export function worldCell(canvas,event,map){
  const rect=canvas.getBoundingClientRect(),x=Math.floor((event.clientX-rect.left)/rect.width*map.width);
  const y=Math.floor((event.clientY-rect.top)/rect.height*map.height);
  return map.regions.find(r=>r.x===x&&r.y===y);
}
export function drawRegion(canvas,region,selected){
  const ctx=context(canvas,SECTOR_METRES,SECTOR_METRES);
  for(const element of region.elements.filter(item=>elementById(item.element,item.revision).kind!=='fortification'))elementDrawing(ctx,element);
  ctx.strokeStyle='rgba(62,74,51,.22)';ctx.lineWidth=.15;
  for(let at=0;at<=240;at+=24)line(ctx,[[at,0],[at,240]],'rgba(62,74,51,.22)',.15);
  for(let at=0;at<=240;at+=24)line(ctx,[[0,at],[240,at]],'rgba(62,74,51,.22)',.15);
  for(const element of region.elements.filter(item=>elementById(item.element,item.revision).kind==='fortification'))elementDrawing(ctx,element);
  line(ctx,regionRoute(region),'#315f4d',.75);
  const item=region.elements.find(element=>element.id===selected);
  if(item){const element=elementById(item.element,item.revision);ctx.strokeStyle='#243f2d';ctx.lineWidth=.75;ctx.strokeRect(item.x*24+.4,item.y*24+.4,element.footprint[0]*24-.8,element.footprint[1]*24-.8);}
}
export function regionElement(canvas,event,region){
  const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*240,y=(event.clientY-rect.top)/rect.height*240;
  return region.elements.find(item=>{const element=elementById(item.element,item.revision);
    return x>=item.x*24&&x<(item.x+element.footprint[0])*24&&y>=item.y*24&&y<(item.y+element.footprint[1])*24;});
}
export function drawDetail(canvas,instance){
  const element=elementById(instance.element,instance.revision),size=element.footprint[0]*BLOCK_METRES;
  const ctx=context(canvas,size,size);
  ctx.fillStyle='#d5d1b3';ctx.fillRect(0,0,size,size);
  const item={...instance,x:0,y:0};
  if(element.kind==='fortification'){
    elementDrawing(ctx,item,{detail:true,showSight:true});
    const route=element.approach.map(point=>rotatePoint(point,item.rotation));
    line(ctx,route,'#315f4d',.35);
  }else elementDrawing(ctx,item,{detail:true});
}
