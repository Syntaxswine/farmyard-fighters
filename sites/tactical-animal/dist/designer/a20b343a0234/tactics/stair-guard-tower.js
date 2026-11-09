import {IRON_LADDER_EXIT,ironTowerDoor} from './tower-geometry.js';
import * as THREE from './vendor/three.module.js';
import {DIMENSIONS} from './hybrid-world.js';
export function buildStairGuardTower(root,{box,wood,iron,material,skin,metal,cargo,wrap=false,large=false,ladder=false,wideExit=false}){
 const H=3*DIMENSIONS.floorSpacing,m=metal?material('tower-rust',0xd3b6a8,[.012,.012,.30,.475],cargo):wood(skin),trim=metal?iron:wood(skin,1),shift=wrap?0:-.95;let parent=root;
 // Expand the 3×3 core to 5×5 while preserving one-tile perimeter stair widths.
 const axis=v=>large?(Math.abs(v)<=1.5?v*5/3:v+Math.sign(v)):v;
 const point=p=>[axis(p[0]),p[1],axis(p[2])];
 const rawBox=(name,mat,p,s,r)=>{const o=box(parent,mat,[p[0]+shift,p[1],p[2]],s,r);o.name=name;return o;};
 const b=(name,mat,p,s,r)=>{const lo=point(p.map((v,i)=>v-s[i]/2)),hi=point(p.map((v,i)=>v+s[i]/2));return rawBox(name,mat,lo.map((v,i)=>(v+hi[i])/2),lo.map((v,i)=>hi[i]-v),r);};
 function beam(name,a,c,width=.10,mat=trim){a=point(a);c=point(c);const d=a.map((v,i)=>c[i]-v),o=rawBox(name,mat,a.map((v,i)=>(v+c[i])/2),[width,Math.hypot(...d),width]);o.quaternion.setFromUnitVectors(o.up.clone(),o.up.clone().set(...d).normalize());return o;}
 for(const x of [-1.36,1.36])for(const z of [-1.36,1.36])b('house-support',trim,[x,H/2,z],[.25,H,.25]);
 for(let level=0;level<3;level++)for(const side of [-1,1]){
  const lo=level*2.12+.15,hi=(level+1)*2.12-.15;
  beam('tower-brace',[-1.36,lo,side*1.36],[1.36,hi,side*1.36],.13);beam('tower-brace',[1.36,lo,side*1.36],[-1.36,hi,side*1.36],.13);
  beam('tower-brace',[side*1.36,lo,-1.36],[side*1.36,hi,1.36],.13);
  b('frame-beam',trim,[0,hi,side*1.36],[2.9,.18,.18]);b('frame-beam',trim,[side*1.36,hi,0],[.18,.18,2.9]);
 }
 for(let i=0;i<12;i++)b('guardhouse-floor',m,[-1.375+i*.25,H-.06,0],[.245,.12,3]);
 if(ladder){
  // A clear outside climb ends at a guarded landing aligned with the existing doorway.
  const doorZ=axis(-.8),edge=large?2.5:1.5,outer=edge+.94;
  const place=(name,mat,[x,y,z],size)=>{const pos=wrap?[z,y,-x]:[x,y,z],dims=wrap?[size[2],size[1],size[0]]:size;return rawBox(name,mat,pos,dims);};
  place('ladder-landing',m,[edge+.45,H-.06,doorZ],[.90,.12,wideExit?IRON_LADDER_EXIT.landingWidth:.96]);
  for(const side of [-1,1]){
   const z=doorZ+side*(wideExit?IRON_LADDER_EXIT.railSpan/2:.43);
   place('ladder-landing-rail',trim,[edge+.45,H+.90,z],[.90,.065,.065]);place('ladder-landing-post',trim,[outer-.04,H+.45,z],[.065,.90,.065]);
   const ys=wideExit?[0,H,H+.35,H+.93]:[0,H+.93],span=y=>side*(wideExit?THREE.MathUtils.lerp(.70,IRON_LADDER_EXIT.width,THREE.MathUtils.clamp((y-H)/.35,0,1)):.70)/2;
   for(let i=1;i<ys.length;i++){const y0=ys[i-1],y1=ys[i],z0=span(y0),z1=span(y1),o=place('ladder-stile',trim,[outer,(y0+y1)/2,doorZ+(z0+z1)/2],[.075,Math.hypot(y1-y0,z1-z0),.075]),axis=new THREE.Vector3(0,y1-y0,z1-z0);if(wrap)axis.set(z1-z0,y1-y0,0);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize());}
   place('ladder-landing-column',trim,[outer-.10,H/2,z],[.10,H,.10]);
  }
  for(let y=.22;y<H-.05;y+=.28)place('ladder-rung',metal?iron:trim,[outer,y,doorZ],[.08,.06,.70]);
  for(const y of [.4,H/3,H*2/3,H-.2])for(const side of [-1,1])place('ladder-standoff',iron,[outer-.10,y,doorZ+side*.35],[.20,.06,.06]);
 }else if(wrap){
  // Quarter-turn landings carry each flight onto the next face of the trellis.
  const corners=new Map();
  const rotate=([x,y,z],q)=>{for(let i=0;i<q;i++)[x,z]=[-z,x];return [x,y,z];};
  for(let flight=0;flight<6;flight++){
   const q=flight%4,base=flight*1.06,point=(x,y,z)=>rotate([x,y,z],q);
   for(let step=0;step<9;step++){b('stair-tread',m,point(1.45-(step+.5)*2.9/9,base+(step+1)*1.06/9-.035,1.99),q%2?[.88,.07,2.9/9+.012]:[2.9/9+.012,.07,.88]);}
   for(const side of [-1,1]){const z=1.99+side*.40;beam('stair-stringer',point(1.45,base+.06,z),point(-1.45,base+1.01,z));beam('stair-handrail',point(1.45,base+.9,z),point(-1.45,base+1.96,z),.065);for(const f of [0,.5,1])beam('stair-baluster',point(1.45-f*2.9,base+f*1.06+.04,z),point(1.45-f*2.9,base+f*1.06+.9,z),.05);}
   const y=base+1.06,center=point(-1.97,y-.06,1.97);b('stair-landing',m,center,[1.04,.12,1.04]);
   for(const [a,c]of [[[-2.40,y+.9,1.48],[-2.40,y+.9,2.40]],[[-2.40,y+.9,2.40],[-1.48,y+.9,2.40]]])beam('landing-rail',point(...a),point(...c),.065);
   for(const [x,z]of [[-2.40,1.48],[-2.40,2.40],[-1.48,2.40]])beam('landing-post',point(x,y,z),point(x,y+.9,z),.065);
   const corner=point(-2.39,0,2.39);corners.set(corner[0].toFixed(2)+':'+corner[2].toFixed(2),{corner,height:y});
   beam('landing-knee',point(-1.36,y-.65,1.36),point(-2.30,y-.12,2.30),.13);
  }
  for(const {corner,height}of corners.values())b('stair-column',trim,[corner[0],height/2,corner[2]],[.12,height,.12]);
  // After the sixth flight the route turns onto the rear wall, clear of the steps.
  b('entry-landing',m,[-1.04,H-.06,-1.97],[.98,.12,1.04]);
  beam('entry-outer-rail',[-1.53,H+.9,-2.40],[-.55,H+.9,-2.40],.065);
  beam('entry-end-rail',[-.55,H+.9,-2.40],[-.55,H+.9,-1.50],.065);
  beam('entry-post',[-.55,H,-2.40],[-.55,H+.9,-2.40],.065);
 }else{
 // Paired switchback flights climb one side in three full-story stages.
 for(let flight=0;flight<6;flight++){
  const x=flight%2?2.98:1.99,dir=flight%2?-1:1,start=-dir*1.45,base=flight*1.06;
  for(let step=0;step<9;step++){const z=start+dir*(step+.5)*2.9/9,y=base+(step+1)*1.06/9;b('stair-tread',m,[x,y-.035,z],[.88,.07,2.9/9+.012]);}
  for(const side of [-1,1]){const xx=x+side*.40;beam('stair-stringer',[xx,base+.06,start],[xx,base+1.01,-start],.10);beam('stair-handrail',[xx,base+.9,start],[xx,base+1.96,-start],.065);for(const f of [0,.5,1])beam('stair-baluster',[xx,base+f*1.06+.04,start+dir*f*2.9],[xx,base+f*1.06+.9,start+dir*f*2.9],.05);}
  const y=base+1.06,z=dir*1.81;
  b('stair-landing',m,[2.485,y-.06,z],[1.89,.12,.73]);
  for(const xx of [1.55,3.42])beam('landing-post',[xx,y,z+dir*.30],[xx,y+.9,z+dir*.30],.065);
  b('landing-rail',trim,[2.485,y+.9,z+dir*.30],[1.94,.065,.065]);
  for(const xx of [1.55,3.42])b('landing-side-rail',trim,[xx,y+.9,z],[.065,.065,.67]);
 }
 // Wider final landing leads directly to the side doorway, away from the corner post.
 b('entry-landing',m,[1.985,H-.04,-1.04],[.97,.08,.98]);
 b('entry-outer-rail',trim,[2.47,H+.9,-1.04],[.065,.065,.98]);beam('entry-post',[2.47,H,-.55],[2.47,H+.9,-.55],.065);
 b('entry-end-rail',trim,[1.985,H+.9,-.55],[.97,.065,.065]);
 for(const x of [1.57,3.40])for(const z of [-2.1,2.1])b('stair-column',trim,[x,H/2,z],[.10,H,.10]);
 }
 if(wrap){parent=new THREE.Group();parent.name='rear-entry-guardhouse';parent.rotation.y=Math.PI/2;root.add(parent);}
 // Open windows on three sides, with raised sills and lintels; +X holds the door.
 for(const z of [-1.45,1.45]){
  b('house-wall',m,[0,H+.42,z],[3,.84,.10]);b('house-lintel',m,[0,H+1.91,z],[3,.22,.10]);
  for(const x of [-1.43,0,1.43])b('window-post',trim,[x,H+1.32,z],[.12,.96,.14]);
  b('window-sill',trim,[0,H+.86,z],[3.04,.07,.18]);
 }
 b('house-wall',m,[-1.45,H+.42,0],[.10,.84,3]);b('house-lintel',m,[-1.45,H+1.91,0],[.10,.22,3]);
 for(const z of [-1.43,0,1.43])b('window-post',trim,[-1.45,H+1.32,z],[.14,.96,.12]);
 b('window-sill',trim,[-1.45,H+.86,0],[.18,.07,3.04]);
 for(const part of ironTowerDoor(wideExit,H))b(part.name,part.name==='door-wall'?m:trim,part.p,part.size);
 // Shallow pitched roof; overhang stays separate from the stair doorway.
 for(const side of [-1,1]){if(large)rawBox('roof-panel',metal?m:trim,[side*1.30,H+2.25,0],[2.68,.10,5.30],[0,0,-side*Math.atan(Math.tan(.28)*1.68/2.68)]);else b('roof-panel',metal?m:trim,[side*.80,H+2.25,0],[1.68,.10,3.30],[0,0,-side*.28]);}
 b('roof-ridge',trim,[0,H+2.49,0],[.16,.12,3.35]);
 if(metal){for(const z of [-1.505,1.505])for(const x of [-1.3,-.65,0,.65,1.3])for(const y of [.14,.72])b('panel-rivet',iron,[x,H+y,z],[.032,.032,.018]);}
 else{for(const z of [-1.507,1.507])for(let i=0;i<12;i++)b('wood-batten',trim,[-1.375+i*.25,H+.42,z],[.027,.82,.018]);}
 root.userData.stairTower={stories:3,deckHeight:H,guardhouse:large?[5,5]:[3,3],flights:ladder?0:6,treadsPerFlight:ladder?0:9,access:ladder?'ladder':'stairs',layout:wrap?'wraparound':'switchback',entrySide:wrap?'-Z':'+X',coreOffsetX:shift,exitWidth:wideExit?IRON_LADDER_EXIT.width:.70,door:wideExit?{z:[-.8-IRON_LADDER_EXIT.doorHalf+.0325,-.8+IRON_LADDER_EXIT.doorHalf-.0325],x:1.45,height:IRON_LADDER_EXIT.doorHeight}:wrap?{x:[axis(-1.25),axis(-.35)],z:axis(-1.45),height:1.76}:{z:[-1.25,-.35],x:1.45,height:1.76}};
}
