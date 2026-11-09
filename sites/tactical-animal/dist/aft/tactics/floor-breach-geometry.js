import * as T from './vendor/three.module.js';

// The intact center, underside and fractured rim form one closed slab. All
// points stay inside the surviving tile; missing tiles contain no geometry.
export function floorBreachGeometry(shape){
 const match=/^floor-breach-(concrete|wood|metal)-(\d+)-([012])$/.exec(shape);if(!match)return null;
 const [,family,smask,sseed]=match,mask=+smask,seed=+sseed;if(mask<1||mask>15)return null;
 const positions=[],colors=[],uvs=[],rings={inner:[],top:[],middle:[],bottom:[]},kinds=[];
 const noise=(i,j)=>((Math.sin(i*17.13+j*73.7+seed*21.1)*15731.73)%1+1)%1;
 const point=(side,t,inset,h)=>side===0?[-.5+t,h,-.5+inset]:side===1?[.5-inset,h,-.5+t]:side===2?[.5-t,h,.5-inset]:[-.5+inset,h,.5-t];
 for(let side=0;side<4;side++)for(let j=0;j<8;j++){
  const t=j/8,damage=!!(mask&(1<<side)),envelope=damage?Math.sin(Math.PI*t):0,n=noise(j,side),cut=envelope*(family==='wood'?.06+n*.15:.035+n*.1);
  const a=point(side,t,cut,.5-envelope*.13),width=envelope*(.024+noise(j,side+7)*.025),inner=point(side,t,cut+width,.5);
  rings.inner.push(inner);rings.top.push(a);rings.middle.push(point(side,t,cut+envelope*(noise(j,side+4)-.3)*.025,-.03));rings.bottom.push(point(side,t,cut+envelope*.014,-.5));
  kinds.push(damage);
 }
 const color=(kind,i)=>kind==='skin'||kind==='under'?[1,1,1]:family==='wood'?(kind==='core'?[.65,.55,.42]:[1.45,1.29,1.08]):family==='metal'?(kind==='core'?[.58,.62,.6]:[1.36,1.34,1.27]):kind==='core'?[.82,.79,.71]:[1.38+noise(i,9)*.1,1.34,1.2];
 function tri(a,b,c,kind,i){
  const ab=new T.Vector3(...b).sub(new T.Vector3(...a)),ac=new T.Vector3(...c).sub(new T.Vector3(...a));if(ab.cross(ac).lengthSq()<1e-18)return;
  positions.push(...a,...b,...c);for(const p of [a,b,c]){colors.push(...color(kind,i));uvs.push(p[0]+.5,p[2]+.5);}
 }
 const quad=(a,b,c,d,kind,i)=>{tri(a,b,c,kind,i);tri(a,c,d,kind,i);};
 const n=rings.top.length;
 for(let i=0;i<n;i++){
  const j=(i+1)%n,chip=kinds[i]?'chip':'skin',core=kinds[i]?'core':'skin';
  tri([0,.5,0],rings.inner[j],rings.inner[i],'skin',i);
  quad(rings.inner[i],rings.inner[j],rings.top[j],rings.top[i],chip,i);
  quad(rings.top[i],rings.top[j],rings.middle[j],rings.middle[i],chip,i);
  quad(rings.middle[i],rings.middle[j],rings.bottom[j],rings.bottom[i],core,i);
  tri([0,-.5,0],rings.bottom[i],rings.bottom[j],'under',i);
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
