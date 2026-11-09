import * as T from './vendor/three.module.js';
import {DIMENSIONS} from './hybrid-world.js';
import {createPaintedGrass} from './painted-grass.js';
import {addCliffRimAttribute} from './cliff-rim.js';
import {paintFoliageMaterial} from './foliage-materials.js';

// Presentation kit: dimensions are authoritative; map activation is a separate adapter.
export const CLIFF_HEIGHT=DIMENSIONS.wall;
export const CLIFF_SHAPES=Object.freeze({straight:[4,2],corner:[3,3],end:[2,2]});
export const CLIFF_SETS=Object.freeze(['ledge','crag']);
const random=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
function occupied(shape,x,z){const [w,d]=CLIFF_SHAPES[shape];return x>=0&&z>=0&&x<w&&z<d&&(shape!=='corner'||x<1||z<1);}

export function cliffLayout(set='ledge',shape='straight'){
 if(!CLIFF_SETS.includes(set)||!Object.hasOwn(CLIFF_SHAPES,shape))throw Error('Unknown cliff set or shape');
 const [w,d]=CLIFF_SHAPES[shape],cells=[];
 for(let z=0;z<d;z++)for(let x=0;x<w;x++)if(occupied(shape,x,z))cells.push([x-w/2+.5,z-d/2+.5]);
 // The climbing side is local +Z. Only the ledge owns a landing and traversal socket.
 const x=shape==='corner'?-1:0;
 return {set,shape,width:w,depth:d,height:CLIFF_HEIGHT,climbable:set==='ledge',solid:true,
  footprint:cells,walkable:set==='ledge'?cells.map(([x,z])=>[x,CLIFF_HEIGHT,z]):[],
  climb:set==='ledge'?{approach:[x,0,d/2+.5],lip:[x,CLIFF_HEIGHT,d/2-.20],landing:[x,CLIFF_HEIGHT,d/2-.5]}:null};
}

export function cliffGeometry(set='ledge',shape='straight',seed=1){
 if(!Number.isInteger(seed)||Math.abs(seed)>100000)throw Error('Cliff seed must be an integer between -100000 and 100000');
 const layout=cliffLayout(set,shape),{width:w,depth:d}=layout,N=2,points=new Map(),quads=[],boundary=[];
 const key=(i,j)=>`${i},${j}`,inside=(i,j)=>occupied(shape,Math.floor(i/N),Math.floor(j/N));
 const point=(i,j)=>{
  const k=key(i,j);if(points.has(k))return points.get(k);
  const edge=![inside(i-1,j-1),inside(i,j-1),inside(i-1,j),inside(i,j)].every(Boolean);
  const seam=shape==='straight'&&(i===0||i===w*N);
  const n=i*31+j*79+seed*13;
  let dx=0,dz=0;for(const [di,dj]of [[-1,-1],[0,-1],[-1,0],[0,0]])if(inside(i+di,j+dj)){dx+=di+.5;dz+=dj+.5;}
  const length=Math.hypot(dx,dz)||1,chip=edge?.055+.11*random(seam?j*79:n+11):0;
  const p={i,j,x:i/N-w/2+(edge?(seam?0:dx/length*chip):(random(n)-.5)*.18),z:j/N-d/2+(edge?dz/length*chip:(random(n+1)-.5)*.18),edge,seam};
  // Broken crest: no horizontal landing. Peak envelope is normalized to wall height below.
  const ridge=Math.max(0,1-Math.abs(p.z)/(d*.5));
  p.y=set==='ledge'?CLIFF_HEIGHT:.52+1.05*ridge+.40*random(seam?j*79:n+7);
  points.set(k,p);return p;
 };
 for(let j=0;j<d*N;j++)for(let i=0;i<w*N;i++)if(inside(i,j)){
  const a=point(i,j),b=point(i+1,j),c=point(i+1,j+1),e=point(i,j+1);quads.push([a,b,c,e]);
  for(const [di,dj,u,v]of [[0,-1,a,b],[1,0,b,c],[0,1,c,e],[-1,0,e,a]])if(!inside(i+di,j+dj))boundary.push([u,v]);
 }
 if(set==='crag'){
  // Use a fixed envelope; one interior peak reaches exactly 2, without raising any other point.
  const peak=[...points.values()].filter(p=>!p.edge).sort((a,b)=>b.y-a.y)[0];peak.y=CLIFF_HEIGHT;
 }
 const positions=[],colors=[],groups=[];
 function tri(a,b,c,material=0){
  const start=positions.length/3;positions.push(...a,...b,...c);
  const shade=.82+random(start+seed*11)*.25,color=new T.Color(material?0x898459:0xa5997e).multiplyScalar(shade);
  for(let i=0;i<3;i++)colors.push(color.r,color.g,color.b);
  groups.push([start,3,material]);
 }
 const top=p=>[p.x,p.y,p.z],base=p=>[p.x,0,p.z];
 for(const [a,b,c,e]of quads){tri(top(a),top(c),top(b),set==='ledge'?1:0);tri(top(a),top(e),top(c),set==='ledge'?1:0);tri(base(a),base(b),base(c));tri(base(a),base(c),base(e));}
 const levels=[0,.18,.38,.61,.82,1];
 function wall(p,l){
  const t=levels[l],n=p.i*31+p.j*79+seed*13;
  // Recessed layers remain inside the occupied cells. End faces on straight pieces
  // stay on the exact connection plane and share the same cross-section for any seed.
  let dx=0,dz=0;
  for(const [di,dj]of [[-1,-1],[0,-1],[-1,0],[0,0]])if(inside(p.i+di,p.j+dj)){dx+=di+.5;dz+=dj+.5;}
  const length=Math.hypot(dx,dz)||1,recess=(l===0||l===5)?0:(.05+.19*random((p.seam?p.j*79:n)+l*47));
  const lift=(l===0||l===5)?0:(random((p.seam?p.j*79:n)+l*23)-.5)*.18;
  return [p.x+(p.seam?0:dx/length*recess),p.y*t+lift,p.z+dz/length*recess];
 }
 for(const [a,b]of boundary)for(let l=0;l<levels.length-1;l++){
  const aa=wall(a,l),bb=wall(b,l),cc=wall(b,l+1),dd=wall(a,l+1);tri(aa,dd,cc);tri(aa,cc,bb);
 }
 const g=new T.BufferGeometry(),ordered=[],tints=[];
 for(const material of [0,1]){const start=ordered.length/3;for(const [offset,count,kind]of groups)if(kind===material){ordered.push(...positions.slice(offset*3,(offset+count)*3));tints.push(...colors.slice(offset*3,(offset+count)*3));}if(ordered.length/3>start)g.addGroup(start,ordered.length/3-start,material);}
 g.setAttribute('position',new T.Float32BufferAttribute(ordered,3));g.setAttribute('color',new T.Float32BufferAttribute(tints,3));
 g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();g.userData.layout=layout;addCliffRimAttribute(g,boundary.map(([a,b])=>({a:top(a),b:top(b)})));return g;
}

export function cliffMaterials({sand=false,water=false,grassTexture}={}){
 return [false,true].map(turf=>{
  if(turf){const cap=createPaintedGrass({rim:true,sand});if(grassTexture)paintFoliageMaterial(cap,'grass',grassTexture,{cliff:true});return cap;}
  const m=new T.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true});
  m.onBeforeCompile=s=>{
   s.vertexShader='varying vec3 vCliff;\n'+s.vertexShader;
   s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCliff=position;');
   s.fragmentShader=`varying vec3 vCliff;
    float ch(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
    float cn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(ch(i),ch(i+vec3(1,0,0)),f.x),mix(ch(i+vec3(0,1,0)),ch(i+vec3(1,1,0)),f.x),f.y),mix(mix(ch(i+vec3(0,0,1)),ch(i+vec3(1,0,1)),f.x),mix(ch(i+vec3(0,1,1)),ch(i+vec3(1,1,1)),f.x),f.y),f.z);}
   `+s.fragmentShader;
   s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float broad=cn(vCliff*vec3(.9,2.,.9));float chips=cn(vCliff*vec3(12.,18.,12.));
    diffuseColor.rgb*=.77+broad*.34+(chips-.5)*.09;
    ${turf?'diffuseColor.rgb*=mix(vec3(.65,.68,.40),vec3(1.20,1.05,.77),smoothstep(.30,.66,cn(vCliff*2.6)));':`float seam=abs(sin(vCliff.y*16.+cn(vCliff*vec3(2.,.4,2.))*4.));diffuseColor.rgb*=1.-(1.-smoothstep(.02,.12,seam))*.17;diffuseColor.rgb*=mix(vec3(.68,.66,.57),vec3(1.),smoothstep(0.,.40,vCliff.y));`}
    ${water?'float wet=(1.-smoothstep(.04,.23+cn(vCliff*15.)*.06,vCliff.y));diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.52,.61,.58),wet*.75);':''}
   `);
  };m.customProgramCacheKey=()=>`cliff-painted-v3-${turf}-${water}`;return m;
 });
}
export function createCliff(set='ledge',shape='straight',seed=1,{water=false}={}){
 const geometry=cliffGeometry(set,shape,seed),materials=cliffMaterials({water}),root=new T.Group(),mesh=new T.Mesh(geometry,materials);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);let disposed=false;
 return {root,mesh,layout:geometry.userData.layout,dispose(){if(disposed)return;disposed=true;geometry.dispose();materials.forEach(m=>m.dispose());}};
}
