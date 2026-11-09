// One tile-wide open structural timber panel, shared by rendering and edge rays.
export const TRELLIS_KIND='wall-wood-trellis',TRELLIS_ARCH_KIND='wall-wood-trellis-arch';
export const TRELLIS_BEAMS=[
 {a:[.045,.04],b:[.045,1.96],width:.09},
 {a:[.955,.04],b:[.955,1.96],width:.09},
 {a:[0,.09],b:[1,.09],width:.14},
 {a:[0,1.91],b:[1,1.91],width:.18},
 {a:[.09,.20],b:[.91,1.80],width:.10},
 {a:[.09,1.80],b:[.91,.20],width:.10}
];
export const TRELLIS_ARCH_BEAMS=[TRELLIS_BEAMS[0],TRELLIS_BEAMS[1],TRELLIS_BEAMS[3],{a:[.09,1.62],b:[.30,1.86],width:.09},{a:[.91,1.62],b:[.70,1.86],width:.09}];
const beams=kind=>kind===TRELLIS_ARCH_KIND?TRELLIS_ARCH_BEAMS:TRELLIS_BEAMS;
export function trellisBlocks(height,offset,kind=TRELLIS_KIND){return beams(kind).some(({a,b,width})=>{const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),x=offset-a[0],y=height-a[1],along=(x*dx+y*dy)/length,across=(x*-dy+y*dx)/length;return along>=0&&along<=length&&Math.abs(across)<=width/2;});}
export function trellisParts(axis,x,y,z,spacing=2.12,kind=TRELLIS_KIND){return beams(kind).map(({a,b,width},i)=>{const along=(a[0]+b[0])/2,height=(a[1]+b[1])/2;return {id:i,center:axis==='e'?[x+.5,z*spacing+height,y-.5+along]:[x-.5+along,z*spacing+height,y+.5],size:[Math.hypot(b[0]-a[0],b[1]-a[1]),width,.16],rotation:[0,axis==='e'?-Math.PI/2:0,Math.atan2(b[1]-a[1],b[0]-a[0])]};});}

export function trellisSegment(start,end,p){
 const local=v=>{let [x,y,z]=v.map((n,i)=>n-p.center[i]);if(p.rotation[1]) [x,z]=[z,-x];const a=p.rotation[2],c=Math.cos(a),s=Math.sin(a);return [x*c+y*s,-x*s+y*c,z];};
 const a=local(start),b=local(end);let near=0,far=1;
 for(let i=0;i<3;i++){const d=b[i]-a[i],h=p.size[i]/2;if(Math.abs(d)<1e-10){if(Math.abs(a[i])>h)return null;continue;}let lo=(-h-a[i])/d,hi=(h-a[i])/d;if(lo>hi)[lo,hi]=[hi,lo];near=Math.max(near,lo);far=Math.min(far,hi);if(near>far)return null;}return near;
}
