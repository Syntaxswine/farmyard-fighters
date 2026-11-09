import * as T from './vendor/three.module.js';

// A separate prop, at the original workshop's scale. The painted facets echo
// the approved inventory drawing; fine cuts are paint, not extra subdivisions.
export function createGrenadeModel(paint=null){
 const root=new T.Group();root.name='Painted fragmentation grenade';
 const parts=[],anchors={},materials=[];let disposed=false,ownsPaint=false;
 if(!paint&&typeof document!=='undefined'){ownsPaint=true;paint=new T.TextureLoader().load(new URL('../assets/equipment/painted-ui/grenade-surface.png',import.meta.url).href,t=>{if(disposed)t.dispose();});}
 if(paint){paint.colorSpace=T.SRGBColorSpace;paint.wrapS=paint.wrapT=T.RepeatWrapping;paint.anisotropy=4;}
 function material(color){const m=new T.MeshStandardMaterial({color,roughness:.92,metalness:0,vertexColors:true});materials.push(m);return m;}
 const shell=material(0xadb06b),steel=material(0x77817b),brass=material(0xc1a458),dark=material(0x292e21);
 if(paint){shell.color.set(0xffffff);shell.map=paint;steel.color.set(0x8497aa);steel.map=paint;brass.map=paint;
  for(const m of [steel,brass]){m.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>','vec3 brush=texture2D(map,vMapUv).rgb;float value=dot(brush,vec3(.299,.587,.114));diffuseColor.rgb*=.48+value*2.4;');};m.customProgramCacheKey=()=> 'grenade-metal-brush-v1';}
 }
 function add(g,m,name){const a=g.attributes.position,n=g.attributes.normal,colors=[];for(let i=0;i<a.count;i++){
   const x=a.getX(i),y=a.getY(i),z=a.getZ(i),brush=Math.sin(x*860+y*270+z*510)*Math.sin(y*770-z*640);
   const light=.48+.40*Math.max(0,n.getY(i))+.22*Math.max(0,n.getZ(i))+.12*Math.max(0,n.getX(i));
   const tone=light+brush*.075;colors.push(tone,tone*.97,tone*.82);
  }g.setAttribute('color',new T.Float32BufferAttribute(colors,3));const mesh=new T.Mesh(g,m);mesh.name=name;root.add(mesh);parts.push(mesh);return mesh;}
 const radius=y=>.036*Math.sqrt(Math.max(0,1-(y/.049)**2));
 add(new T.LatheGeometry([[-.047,.009],[-.035,.026],[-.018,.033],[.005,.035],[.026,.029],[.040,.018],[.045,.012]].map(([y,r])=>new T.Vector2(r,y)),12),dark,'dark shell beneath painted panels');
 const levels=[-.045,-.029,-.009,.013,.031,.042];
 for(let row=0;row<levels.length-1;row++)for(let col=0;col<10;col++){
  const y0=levels[row]+.001,y1=levels[row+1]-.001,a0=col*Math.PI/5+.025,a1=(col+1)*Math.PI/5-.025,ac=(a0+a1)/2,yc=(y0+y1)/2;
  const p=[],indices=[],points=[[a0+.04,y0],[a1-.04,y0],[a1,y0+.002],[a1,y1-.002],[a1-.04,y1],[a0+.04,y1],[a0,y1-.002],[a0,y0+.002]];
  for(const [a,y]of [[ac,yc],...points]){const rr=radius(y)+(a===ac?.0015:0);p.push(Math.cos(a)*rr,y,Math.sin(a)*rr);}
  for(let i=1;i<=8;i++)indices.push(0,i===8?1:i+1,i);
  const uv=[];for(const [a,y]of [[ac,yc],...points])uv.push((a-a0)/(a1-a0)*.42+(col*.173)% .55,(y-y0)/(y1-y0)*.42+(row*.273)% .55);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const mesh=add(g,shell,'painted casing panel '+row+':'+col),c=g.attributes.color;
  // A broad warm edge and a dark lower edge survive at inventory/game scale.
  for(let i=0;i<c.count;i++){const high=p[i*3+1]>yc,boost=high?1.8:.84;c.setXYZ(i,c.getX(i)*boost,c.getY(i)*boost,c.getZ(i)*(high?1.35:.9));}
  mesh.material.side=T.DoubleSide;
 }
 // Keep the tiny prop inexpensive when a whole squad carries one. The facets
 // share a material/skin, so submit them as one mesh rather than fifty draws.
 const panels=parts.filter(p=>p.name.startsWith('painted casing panel ')),merged=new T.BufferGeometry(),attributes={position:[],normal:[],uv:[],color:[]},indices=[];let offset=0;
 for(const p of panels){for(const name of Object.keys(attributes))attributes[name].push(...p.geometry.attributes[name].array);indices.push(...Array.from(p.geometry.index.array,i=>i+offset));offset+=p.geometry.attributes.position.count;root.remove(p);parts.splice(parts.indexOf(p),1);p.geometry.dispose();}
 for(const [name,a]of Object.entries(attributes))merged.setAttribute(name,new T.Float32BufferAttribute(a,name==='uv'?2:3));merged.setIndex(indices);const panelsMesh=new T.Mesh(merged,shell);panelsMesh.name='painted casing panels';root.add(panelsMesh);parts.push(panelsMesh);
 const neck=new T.CylinderGeometry(.011,.013,.021,10);neck.translate(0,.050,0);add(neck,steel,'metal collar');
 const leverShape=new T.Shape();leverShape.moveTo(-.015,.063);leverShape.lineTo(.017,.063);leverShape.lineTo(.031,.047);leverShape.lineTo(.045,.004);leverShape.lineTo(.041,-.039);leverShape.lineTo(.035,-.041);leverShape.lineTo(.039,.003);leverShape.lineTo(.025,.044);leverShape.lineTo(.013,.057);leverShape.lineTo(-.015,.057);leverShape.closePath();
 const lever=new T.ExtrudeGeometry(leverShape,{depth:.012,bevelEnabled:true,bevelThickness:.001,bevelSize:.001,bevelSegments:1,steps:1});lever.translate(0,0,-.006);add(lever,steel,'curved safety lever');
 const ring=new T.TorusGeometry(.013,.0018,5,16);ring.translate(.026,.049,.017);add(ring,brass,'pull ring');
 for(const [name,p]of Object.entries({grip:[0,0,.016],release:[0,0,0]})){const o=new T.Object3D();o.name=name;o.position.fromArray(p);root.add(o);anchors[name]=o;}
 return {id:'grenade',label:'Fragmentation grenade',kind:'thrown',root,parts,anchors,carry:{position:[.17,1.28,.34],axis:[.65,.1,-.7],hands:[1]},get triangles(){return parts.reduce((n,p)=>n+(p.geometry.index?.count||p.geometry.attributes.position.count)/3,0);},dispose(){if(disposed)return;disposed=true;for(const p of parts)p.geometry.dispose();for(const m of materials)m.dispose();if(ownsPaint)paint.dispose();}};
}
