import * as T from './vendor/three.module.js';
import {DIMENSIONS as D} from './hybrid-world.js';

// Connected, capped wall sections. Every broken point retreats into the
// surviving segment; an open tile never receives a hidden stump or collider.
export function wallBreachGeometry(shape){
 const match=/^breach-(brick|concrete|metal)-([123])-([012])-([es])-(wall|sill|lintel)$/.exec(shape);if(!match)return null;
 const [,family,smask,sseed,axis,section]=match,mask=+smask,seed=+sseed;
 const bottom=section==='lintel'?D.windowTop:0,top=section==='sill'?D.windowBottom:D.wall,height=top-bottom;
 const levels=[bottom,...Array.from({length:19},(_,i)=>(i+1)*D.wall/20).filter(y=>y>bottom+.001&&y<top-.001),top],positions=[],colors=[],uvs=[];
 const noise=(i,j)=>((Math.sin(i*17.13+j*73.7+seed*21.1)*15731.73)%1+1)%1;
 function vertex(end,y,side){
  const band=Math.floor((y+.001)/.2),rough=noise(band,end*3+side+2),rise=y/D.wall;
  let inset=0;if(mask&(1<<end)){
   if(family==='brick')inset=.045+rough*.16+rise*.075;
   else if(family==='metal')inset=.045+noise(Math.round(y*10),end*5+2)*.15+rise*.07;
   else inset=.045+noise(Math.round(y*10),end*4+side+2)*.18+rise*.08;
  }
  const x=(end?1:-1)*(.5-inset),z=side*.5;
  // Thin corrugated sheets bend at the torn edge without leaving the old wall
  // thickness. Adjacent intact sections retain their exact join.
  const fold=family==='metal'&&(mask&(1<<end))?1-(.15+.45*noise(Math.round(y*10),end))*rise:1;
  return [x,(y-bottom)/height-.5,z*fold];
 }
 const color=(kind,index)=>kind==='skin'?[1,1,1]:family==='metal'?(kind==='chip'?[1.24,1.22,1.13]:[.57+index*.08,.52+index*.08,.40+index*.06]):family==='brick'?[1.28+index*.09,1.12+index*.08,.98+index*.06]:[1.25+index*.1,1.23+index*.09,1.12+index*.08];
 const tri=(a,b,c,kind,index)=>{positions.push(...a,...b,...c);for(const p of [a,b,c]){colors.push(...color(kind,index));uvs.push(p[0]+.5,p[1]+.5);}};
 const quad=(a,b,c,d,kind,index)=>{tri(a,b,c,kind,index);tri(a,c,d,kind,index);};
 function face(left,right,Right,Left,reverse,index){
  const inset=(p,end,shift)=>[p[0]+(end?-1:1)*shift,p[1],p[2]],width=.025+noise(index,4)*.045;
  const l=mask&1?inset(left,0,width):left,L=mask&1?inset(Left,0,.025+noise(index+1,4)*.045):Left,r=mask&2?inset(right,1,width):right,R=mask&2?inset(Right,1,.025+noise(index+1,4)*.045):Right;
  const surface=(a,b,c,d,kind)=>reverse?quad(b,a,d,c,kind,noise(index,3)):quad(a,b,c,d,kind,noise(index,3));
  surface(l,r,R,L,'skin');if(mask&1)surface(left,l,L,Left,'chip');if(mask&2)surface(r,right,Right,R,'chip');
  return {l,r,R,L};
 }
 const cap=points=>{const unique=points.filter((p,i)=>i===0||p.some((v,j)=>v!==points[i-1][j]));if(unique.at(-1).every((v,i)=>v===unique[0][i]))unique.pop();const center=[0,1,2].map(i=>unique.reduce((n,p)=>n+p[i],0)/unique.length);for(let i=0;i<unique.length;i++)tri(center,unique[i],unique[(i+1)%unique.length],'skin',0);};
 for(let i=0;i<levels.length-1;i++){
  const lo=levels[i],hi=levels[i+1],lf=vertex(0,lo,1),rf=vertex(1,lo,1),lb=vertex(0,lo,-1),rb=vertex(1,lo,-1),LF=vertex(0,hi,1),RF=vertex(1,hi,1),LB=vertex(0,hi,-1),RB=vertex(1,hi,-1);
  const F=face(lf,rf,RF,LF,false,i),B=face(lb,rb,RB,LB,true,i);
  quad(lb,lf,LF,LB,mask&1?'fracture':'skin',noise(i,1));quad(rf,rb,RB,RF,mask&2?'fracture':'skin',noise(i,2));
  if(i===0)cap([lb,B.l,B.r,rb,rf,F.r,F.l,lf]);
  if(i===levels.length-2)cap([LF,F.L,F.R,RF,RB,B.R,B.L,LB]);
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();if(axis==='e')g.rotateY(-Math.PI/2);g.computeBoundingBox();g.computeBoundingSphere();return g;
}
