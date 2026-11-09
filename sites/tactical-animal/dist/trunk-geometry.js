const EPS=1e-7;

export const trunkDistance=(p,{centre,radius})=>Math.max(0,Math.hypot(p.x-centre[0],p.y-centre[1])-radius);

// Clip the parameter span to the same finite cylinder used by ground collision.
export function trunkSpan(a,b,{centre,radius,trunkHeight},za=0,zb=0){
  const dx=b.x-a.x,dy=b.y-a.y,ox=a.x-centre[0],oy=a.y-centre[1],length2=dx*dx+dy*dy;
  let lo=0,hi=1;
  if(length2<=EPS*EPS){
    if(ox*ox+oy*oy>radius*radius)return null;
  }else{
    const cross=ox*dy-oy*dx,remaining=radius*radius-cross*cross/length2;
    if(remaining<0)return null;
    const midpoint=-(ox*dx+oy*dy)/length2,halfSpan=Math.sqrt(remaining/length2);
    lo=Math.max(lo,midpoint-halfSpan);hi=Math.min(hi,midpoint+halfSpan);
  }
  const dz=zb-za;
  if(Math.abs(dz)<EPS){
    if(za<0||za>trunkHeight)return null;
  }else{
    const base=-za/dz,top=(trunkHeight-za)/dz;
    lo=Math.max(lo,Math.min(base,top));hi=Math.min(hi,Math.max(base,top));
  }
  return lo<=hi?[lo,hi]:null;
}
