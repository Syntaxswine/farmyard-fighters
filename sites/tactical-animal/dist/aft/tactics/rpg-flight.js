import * as T from './vendor/three.module.js';

// Native scene coordinates (X/Z ground, Y height), not tactical 3-unit floors.
// This is presentation timing; it neither traces hits nor applies damage.
export const RPG_SPEED=32,RPG_SMOKE_LIFE=.58,RPG_SMOKE_COUNT=72;
const point=p=>p?.isVector3?p.clone():new T.Vector3(...p);
export function createRPGFlight(from,to,{speed=RPG_SPEED}={}){
 const origin=point(from),impact=point(to);
 if(![...origin,...impact,speed].every(Number.isFinite)||speed<=0)throw Error('Invalid RPG flight');
 const delta=impact.clone().sub(origin),distance=delta.length(),direction=distance>1e-8?delta.clone().divideScalar(distance):new T.Vector3(1,0,0);
 const duration=distance/speed;if(!Number.isFinite(duration)||!Number.isFinite(distance))throw Error('Invalid RPG flight');
 return {origin,impact,direction,distance,speed,duration,smokeStep:Math.max(.24/speed,RPG_SMOKE_LIFE/(RPG_SMOKE_COUNT-2))};
}
export function sampleRPGFlight(flight,time){
 if(!Number.isFinite(time))throw Error('Invalid RPG time');
 const travelled=Math.max(0,Math.min(flight.distance,time*flight.speed));
 return {position:flight.origin.clone().addScaledVector(flight.direction,travelled),direction:flight.direction,
  flying:time>=0&&time<flight.duration&&flight.distance>1e-8,arrived:time>=flight.duration,
  blastAge:time-flight.duration,progress:flight.duration?Math.max(0,Math.min(1,time/flight.duration)):time<0?0:1};
}
export function rpgSmokeSamples(flight,time){
 if(!Number.isFinite(time))throw Error('Invalid RPG time');
 if(time<0||flight.distance<1e-8)return [];
 const last=Math.min(Math.floor(time/flight.smokeStep),Math.ceil(flight.duration/flight.smokeStep)-1),out=[];
 for(let i=Math.max(0,last-RPG_SMOKE_COUNT+1);i<=last;i++){
  const birth=i*flight.smokeStep,age=time-birth;if(age<0||age>=RPG_SMOKE_LIFE)continue;
  const point=flight.origin.clone().addScaledVector(flight.direction,birth*flight.speed-.62);
  // Each puff stays where it was emitted, then rises slightly. Rewinds and
  // dropped frames produce the same trail; nothing follows the moving rocket.
  point.y+=age*.25;point.z+=age*.045*Math.sin(i*2.399);
  const variation=.88+.18*Math.sin(i*1.73);
  out.push({id:i,birth,age,position:point,width:(.40+age*.80)*variation,height:(.25+age*.64)*(1.08-.16*Math.sin(i*2.17)),
   opacity:.69*(1-Math.pow(age/RPG_SMOKE_LIFE,1.25)),rotation:.33*Math.sin(i*1.73)});
 }
 return out;
}

export function createRPGProjectile(){
 const root=new T.Group();root.name='Simple RPG flight round';
 const positions=[],colors=[],normals=[];
 const olive=new T.Color(0x9b9955),dark=new T.Color(0x424c3f),bright=new T.Color(0xc9ad65);
 function triangle(a,b,c,color){
  const normal=new T.Vector3().subVectors(b,a).cross(new T.Vector3().subVectors(c,a)).normalize();
  const shade=.73+.25*Math.max(0,normal.y)+.10*Math.max(0,normal.z);
  for(const v of [a,b,c]){positions.push(...v);normals.push(...normal);colors.push(color.r*shade,color.g*shade,color.b*shade);}
 }
 const rings=[[-.62,.012],[-.39,.012],[-.34,.028],[-.29,.064],[-.23,.068],[-.15,.055],[-.035,.015],[0,.003]],sides=8;
 const at=(r,i)=>new T.Vector3(r[0],Math.cos(i/sides*Math.PI*2)*r[1],Math.sin(i/sides*Math.PI*2)*r[1]);
 for(let r=0;r<rings.length-1;r++)for(let i=0;i<sides;i++){
  const a=at(rings[r],i),b=at(rings[r],i+1),c=at(rings[r+1],i),d=at(rings[r+1],i+1),color=r<2?dark:r===5?bright:olive;
  triangle(a,b,c,color);triangle(b,d,c,color);
 }
 for(const end of [0,rings.length-1])for(let i=0;i<sides;i++){
  const p=new T.Vector3(rings[end][0],0,0),a=at(rings[end],i),b=at(rings[end],i+1);
  if(end)triangle(p,a,b,bright);else triangle(p,b,a,dark);
 }
 for(let i=0;i<4;i++){
  const radial=new T.Vector3(0,Math.cos(i*Math.PI/2),Math.sin(i*Math.PI/2)),a=radial.clone().multiplyScalar(.012).add(new T.Vector3(-.58,0,0)),b=radial.clone().multiplyScalar(.070).add(new T.Vector3(-.55,0,0)),c=radial.clone().multiplyScalar(.012).add(new T.Vector3(-.40,0,0));
  triangle(a,b,c,dark);triangle(c,b,a,dark);
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 const material=new T.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0}),mesh=new T.Mesh(geometry,material);mesh.name='Pointed head, booster and four fins';root.add(mesh);
 let disposed=false;return {root,mesh,triangles:positions.length/9,dispose(){if(disposed)return;disposed=true;root.removeFromParent();geometry.dispose();material.dispose();}};
}
