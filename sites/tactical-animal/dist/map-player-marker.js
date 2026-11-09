// Marker dimensions are displayed pixels, independent of canvas resolution and
// letterboxing. Map coordinates stay in the caller's backing-pixel projection.
export function mapCanvasScale(canvas){
  const rect=canvas.getBoundingClientRect?.(),style=canvas.ownerDocument?.defaultView?.getComputedStyle(canvas),px=key=>parseFloat(style?.[key])||0;
  const width=rect?.width?rect.width-px('borderLeftWidth')-px('borderRightWidth')-px('paddingLeft')-px('paddingRight'):canvas.width;
  const height=rect?.height?rect.height-px('borderTopWidth')-px('borderBottomWidth')-px('paddingTop')-px('paddingBottom'):canvas.height;
  let x=width/canvas.width,y=height/canvas.height;
  if(style?.objectFit==='contain'||style?.objectFit==='scale-down')x=y=Math.min(x,y,style.objectFit==='scale-down'?1:Infinity);
  return {x,y,width:canvas.width*x,height:canvas.height*y};
}
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function drawPlayerMapMarker(canvas,ctx,{x,y,heading=0},{expanded=false}={}){
  const scale=mapCanvasScale(canvas),cx=x*scale.x,cy=y*scale.y,r=expanded?7:6;
  ctx.save();ctx.scale(1/scale.x,1/scale.y);
  if(expanded){
    ctx.font='700 11px monospace';ctx.textBaseline='middle';ctx.textAlign='left';
    const text='YOU ARE HERE',w=ctx.measureText(text).width+12,h=22,pad=4;
    const lx=clamp(cx+12+w<=scale.width-pad?cx+12:cx-w-12,pad,scale.width-pad-w),ly=clamp(cy-32>=pad?cy-32:cy+14,pad,scale.height-pad-h);
    ctx.strokeStyle='#fff3d1';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(clamp(cx,lx,lx+w),clamp(cy,ly,ly+h));ctx.stroke();
    ctx.fillStyle='#10180f';ctx.fillRect(lx,ly,w,h);ctx.strokeRect(lx,ly,w,h);ctx.fillStyle='#fff3d1';ctx.fillText(text,lx+6,ly+h/2);
  }
  ctx.translate(cx,cy);
  // Heading is east=0, south=90. Preserve its projected direction even if a
  // caller stretches the map rather than displaying it with object-fit.
  const angle=(Number.isFinite(heading)?heading:0)*Math.PI/180;
  ctx.rotate(Math.atan2(Math.sin(angle)*scale.y,Math.cos(angle)*scale.x)+Math.PI/2);
  ctx.fillStyle='#10180f';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#10180f';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.fillStyle='#fff3d1';ctx.beginPath();ctx.moveTo(0,expanded?-12:-10);ctx.lineTo(4,-4);ctx.lineTo(-4,-4);ctx.closePath();ctx.stroke();ctx.fill();
  ctx.beginPath();ctx.arc(0,0,expanded?4:3.5,0,Math.PI*2);ctx.fill();ctx.restore();
}
