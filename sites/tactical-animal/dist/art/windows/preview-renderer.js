import * as T from '../../aft/tactics/vendor/three.module.js';

// The fallback rasterizes the actual asset geometry, including alpha glass.
// It is a static orthographic review renderer, not a gameplay replacement.
export function createWindowPreview(width=768,height=480){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const context=canvas.getContext('webgl2',{antialias:true,preserveDrawingBuffer:true});
 if(context){
  const renderer=new T.WebGLRenderer({canvas,context,antialias:true,preserveDrawingBuffer:true});renderer.setSize(width,height);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  return {mode:'WebGL',render(scene,camera){renderer.render(scene,camera);return canvas.toDataURL('image/png');},dispose(){renderer.dispose();renderer.forceContextLoss();canvas.width=canvas.height=0;}};
 }
 const surface=document.createElement('canvas');surface.width=width;surface.height=height;const ctx=surface.getContext('2d'),light=new T.Vector3(-3,8,5).normalize();
 function render(scene,camera){
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const opaque=[],alpha=[],lines=[],direction=camera.getWorldDirection(new T.Vector3()).negate();
  const project=p=>{const v=p.clone().project(camera);return [(v.x+1)*width/2,(1-v.y)*height/2,v.z];};
  scene.traverseVisible(o=>{
   if(o.isMesh){
    const g=o.geometry,p=g.attributes.position,uv=g.attributes.uv,idx=g.index,m=o.material;if(Array.isArray(m))throw Error('One review material per mesh is required');
    const positions=Array.from({length:p.count},(_,i)=>new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));
    for(let i=0;i<(idx?idx.count:p.count);i+=3){
     const ids=[0,1,2].map(j=>idx?idx.getX(i+j):i+j),v=ids.map(j=>positions[j]),n=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();
     if(n.dot(direction)<=0&&m.side!==T.DoubleSide)continue;
     const points=v.map(project),face={points,uv:uv?ids.map(j=>[uv.getX(j),uv.getY(j)]):null,material:m,shade:.72+.28*Math.max(0,n.dot(light)),depth:points.reduce((s,p)=>s+p[2],0)/3};
     (m.transparent&&m.opacity<1?alpha:opaque).push(face);
    }
   }else if(o.isLineSegments){
    const p=o.geometry.attributes.position;for(let i=0;i<p.count;i+=2)lines.push({a:project(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld)),b:project(new T.Vector3().fromBufferAttribute(p,i+1).applyMatrix4(o.matrixWorld)),material:o.material});
   }
  });
  const image=ctx.createImageData(width,height),pixels=image.data,depths=new Float32Array(width*height);depths.fill(Infinity);
  const rgb=color=>{const h=color.getHex();return [h>>16&255,h>>8&255,h&255];},background=rgb(scene.background);
  for(let i=0;i<pixels.length;i+=4){pixels[i]=background[0];pixels[i+1]=background[1];pixels[i+2]=background[2];pixels[i+3]=255;}
  function blend(index,color,opacity){const offset=index*4;for(let c=0;c<3;c++)pixels[offset+c]=color[c]*opacity+pixels[offset+c]*(1-opacity);}
  function raster(face,transparent){
   const [a,b,c]=face.points,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-8)return;
   const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),maxX=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0]))),minY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),maxY=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
   const m=face.material,base=rgb(m.color).map(v=>v*face.shade),texture=m.map?.image?.data?m.map:null;
   const topLeft=(p,q)=>{if(den<0)[p,q]=[q,p];return p[1]<q[1]||(p[1]===q[1]&&p[0]>q[0]);};
   for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const wa=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/den,wb=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/den,wc=1-wa-wb;
    if(wa<-.000001||wb<-.000001||wc<-.000001)continue;
    if(transparent&&((Math.abs(wa)<1e-9&&!topLeft(b,c))||(Math.abs(wb)<1e-9&&!topLeft(c,a))||(Math.abs(wc)<1e-9&&!topLeft(a,b))))continue;
    const z=wa*a[2]+wb*b[2]+wc*c[2]-(m.polygonOffset?.000001:0),index=y*width+x;if(z>=depths[index])continue;
    let color=base;
    if(texture&&face.uv){
     const uv=[0,1].map(j=>wa*face.uv[0][j]+wb*face.uv[1][j]+wc*face.uv[2][j]);
     const u=uv[0]*texture.repeat.x+texture.offset.x,v=uv[1]*texture.repeat.y+texture.offset.y,p=texture.image;
     const wrap=(n,mode)=>mode===T.RepeatWrapping?n-Math.floor(n):Math.max(0,Math.min(.999999,n));
     const tx=Math.min(p.width-1,Math.floor(wrap(u,texture.wrapS)*p.width)),ty=Math.min(p.height-1,Math.floor(wrap(texture.flipY?1-v:v,texture.wrapT)*p.height)),source=(ty*p.width+tx)*4;
     color=base.map((value,j)=>value*p.data[source+j]/255);
    }
    blend(index,color,transparent?m.opacity:1);if(!transparent)depths[index]=z;
   }
  }
  opaque.forEach(f=>raster(f,false));alpha.sort((a,b)=>b.depth-a.depth).forEach(f=>raster(f,true));
  for(const line of lines){
   const {a,b,material}=line,steps=Math.max(1,Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1])))),color=rgb(material.color);
   for(let i=0;i<=steps;i++){const t=i/steps,x=Math.round(a[0]+(b[0]-a[0])*t),y=Math.round(a[1]+(b[1]-a[1])*t);if(x<0||x>=width||y<0||y>=height)continue;const index=y*width+x,z=a[2]+(b[2]-a[2])*t;if(z<=depths[index]+.000001)blend(index,color,material.opacity);}
  }
  ctx.putImageData(image,0,0);return surface.toDataURL('image/png');
 }
 return {mode:'software',render,dispose(){canvas.width=canvas.height=surface.width=surface.height=0;}};
}
