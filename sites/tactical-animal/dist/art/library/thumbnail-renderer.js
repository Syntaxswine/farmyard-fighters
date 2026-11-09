import * as T from '../../aft/tactics/vendor/three.module.js';

// A software fallback keeps this asset catalog useful in WebGL-disabled review
// browsers. It projects the SAME model triangles and samples the SAME atlases.
// Lighting is approximate; this is a catalog snapshot, never a game renderer.
export function createThumbnailRenderer(width=768,height=500){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const context=canvas.getContext('webgl2',{antialias:true,preserveDrawingBuffer:true});
 if(context){
  const renderer=new T.WebGLRenderer({canvas,context,antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(width,height);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  return {mode:'WebGL',render(scene,camera){renderer.render(scene,camera);return canvas.toDataURL('image/png');},dispose(){renderer.dispose();renderer.forceContextLoss();canvas.width=canvas.height=0;}};
 }
 // A canvas cannot switch context type after a successful getContext call;
 // use a separate 2D surface for the fallback.
 const output=document.createElement('canvas');output.width=width;output.height=height;
 const ctx=output.getContext('2d'),light=new T.Vector3(-3,8,5).normalize(),instance=new T.Matrix4();
 function render(scene,camera){
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  ctx.fillStyle=scene.background.getStyle();ctx.fillRect(0,0,width,height);
  const faces=[],lines=[],tiles=new Map(),viewDirection=camera.getWorldDirection(new T.Vector3()).negate();
  function screen(v){const p=v.clone().project(camera);return [(p.x+1)*width/2,(1-p.y)*height/2,p.z];}
  function collect(mesh,matrix){
   const geometry=mesh.geometry,position=geometry.attributes.position,uv=geometry.attributes.uv,index=geometry.index;
   const count=index?index.count:position.count,material=mesh.material;
   if(Array.isArray(material))throw Error('Catalog software preview expects one material per batch');
   const points=Array.from({length:position.count},(_,i)=>new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix));
   for(let i=0;i<count;i+=3){
    const ids=[0,1,2].map(n=>index?index.getX(i+n):i+n),p=ids.map(n=>points[n]);
    const normal=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize();
    if(normal.dot(viewDirection)<=0)continue;
    const vertices=p.map(screen),shade=Math.round((.69+.31*Math.max(0,normal.dot(light)))*12)/12;
    faces.push({vertices,uv:uv?ids.map(n=>[uv.getX(n),uv.getY(n)]):null,material,shade,ground:!!mesh.userData.ground,depth:vertices.reduce((sum,v)=>sum+v[2],0)/3});
   }
  }
  scene.traverseVisible(object=>{
   if(object.isInstancedMesh){for(let i=0;i<object.count;i++){object.getMatrixAt(i,instance);collect(object,object.matrixWorld.clone().multiply(instance));}}
   else if(object.isMesh)collect(object,object.matrixWorld);
   else if(object.isLine){const p=object.geometry.attributes.position;lines.push({points:Array.from({length:p.count},(_,i)=>screen(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(object.matrixWorld))),color:object.material.color.getStyle()});}
  });
  faces.sort((a,b)=>Number(b.ground)-Number(a.ground)||b.depth-a.depth);
  function color(material,shade){const rgb=material.color.getHex();return `rgb(${[rgb>>16&255,rgb>>8&255,rgb&255].map(n=>Math.round(n*shade)).join(',')})`;}
  function tile(material,shade){
   const key=material.uuid+':'+shade;if(tiles.has(key))return tiles.get(key);
   const map=material.map,image=map.image,texture=document.createElement('canvas');texture.width=texture.height=128;
   const paint=texture.getContext('2d');
   paint.drawImage(image,map.offset.x*image.width,(1-map.offset.y-map.repeat.y)*image.height,map.repeat.x*image.width,map.repeat.y*image.height,0,0,128,128);
   paint.globalCompositeOperation='multiply';paint.fillStyle=color(material,shade);paint.fillRect(0,0,128,128);
   const value={canvas:texture,pixels:paint.getImageData(0,0,128,128).data};tiles.set(key,value);return value;
  }
  function draw(face){
   const p=face.vertices;ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]);ctx.lineTo(p[1][0],p[1][1]);ctx.lineTo(p[2][0],p[2][1]);ctx.closePath();
   ctx.fillStyle=color(face.material,face.shade);ctx.fill();
   if(!face.material.map||!face.uv)return;
   const uv=face.uv.map(([u,v])=>[Math.max(0,Math.min(1,u))*128,(1-Math.max(0,Math.min(1,v)))*128]);
   const [u0,v0]=uv[0],[u1,v1]=uv[1],[u2,v2]=uv[2],det=(u1-u0)*(v2-v0)-(u2-u0)*(v1-v0);
   if(Math.abs(det)<1e-5)return;
   const a=((p[1][0]-p[0][0])*(v2-v0)-(p[2][0]-p[0][0])*(v1-v0))/det;
   const c=((u1-u0)*(p[2][0]-p[0][0])-(u2-u0)*(p[1][0]-p[0][0]))/det;
   const b=((p[1][1]-p[0][1])*(v2-v0)-(p[2][1]-p[0][1])*(v1-v0))/det;
   const d=((u1-u0)*(p[2][1]-p[0][1])-(u2-u0)*(p[1][1]-p[0][1]))/det;
   ctx.save();ctx.clip();ctx.transform(a,b,c,d,p[0][0]-a*u0-c*v0,p[0][1]-b*u0-d*v0);ctx.drawImage(tile(face.material,face.shade).canvas,0,0);ctx.restore();
  }
  // Floor guides go behind model triangles, even where their large polygons
  // cross the model's average depth in painter ordering.
  faces.filter(f=>f.ground).forEach(draw);
  for(const line of lines){ctx.beginPath();line.points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.strokeStyle=line.color;ctx.lineWidth=1.3;ctx.stroke();}
  // Large low-poly cabinet faces cross many smaller shelf faces in screen
  // space. Per-pixel depth keeps their occlusion correct without adding any
  // polygons to the actual game model. Cameras here are orthographic.
  const snapshot=ctx.getImageData(0,0,width,height),pixels=snapshot.data,depths=new Float32Array(width*height);depths.fill(Infinity);
  for(const face of faces.filter(f=>!f.ground)){
   const [a,b,c]=face.vertices,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
   if(Math.abs(den)<1e-8)continue;
   const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),maxX=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0])));
   const minY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),maxY=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
   const texture=face.material.map&&face.uv?tile(face.material,face.shade).pixels:null;
   const rgb=face.material.color.getHex(),flat=[rgb>>16&255,rgb>>8&255,rgb&255].map(n=>Math.round(n*face.shade));
   for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const px=x+.5,py=y+.5,wa=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den;
    const wb=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den,wc=1-wa-wb;
    if(wa<-.00001||wb<-.00001||wc<-.00001)continue;
    const z=wa*a[2]+wb*b[2]+wc*c[2],index=y*width+x;if(z>=depths[index])continue;depths[index]=z;
    const out=index*4;
    if(texture){
     const u=wa*face.uv[0][0]+wb*face.uv[1][0]+wc*face.uv[2][0],v=wa*face.uv[0][1]+wb*face.uv[1][1]+wc*face.uv[2][1];
     const tx=Math.min(127,Math.max(0,Math.floor(u*128))),ty=Math.min(127,Math.max(0,Math.floor((1-v)*128))),sample=(ty*128+tx)*4;
     pixels[out]=texture[sample];pixels[out+1]=texture[sample+1];pixels[out+2]=texture[sample+2];
    }else{pixels[out]=flat[0];pixels[out+1]=flat[1];pixels[out+2]=flat[2];}
    pixels[out+3]=255;
   }
  }
  ctx.putImageData(snapshot,0,0);
  const image=output.toDataURL('image/png');for(const t of tiles.values()){t.canvas.width=t.canvas.height=0;}return image;
 }
 return {mode:'software',render,dispose(){output.width=output.height=0;canvas.width=canvas.height=0;}};
}
