import * as T from './vendor/three.module.js';
const skinPixels=new Map();
// Floor-rooted, reusable model. X is the long axis; rotate the group for placement.
export function createMedicalChest(){
 const model=new T.Group(),geometry=new T.BoxGeometry(1,1,1),materials={},textures=[];
 const skin=(name,base,rects)=>{
  const width=512,height=256,key=JSON.stringify([name,base,rects]),data=skinPixels.get(key)||new Uint8Array(width*height*4);
  if(!skinPixels.has(key)){
  // Layered broad brush variation plus fine pigment grain, deterministic per face.
  const hash=(x,y)=>{let n=Math.imul(x+79,374761393)^Math.imul(y+name.length*17,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
  const noise=(x,y,scale)=>{const u=x/scale,v=y/scale,ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);return (hash(ix,iy)*(1-sx)+hash(ix+1,iy)*sx)*(1-sy)+(hash(ix,iy+1)*(1-sx)+hash(ix+1,iy+1)*sx)*sy;};
  const paint=(x,y,w,h,color,detail=false)=>{
   const left=Math.max(0,Math.round(x*width)),top=Math.max(0,Math.round(y*height)),right=Math.min(width,Math.round((x+w)*width)),bottom=Math.min(height,Math.round((y+h)*height));
   for(let row=top;row<bottom;row++)for(let col=left;col<right;col++){
    const i=(row*width+col)*4,dx=col-left,dy=row-top,rx=right-col-1,by=bottom-row-1;
    const brush=(noise(col,row,57)-.5)*23+(noise(col*1.4,row*.42,13)-.5)*12+(hash(col,row)-.5)*5;
    // Painted bevel light and contact shade, not extra geometry or bump mapping.
    const edge=Math.min(dx,dy,rx,by);
    const highlight=detail?12*Math.exp(-Math.min(dx,dy)/1.8):17*Math.exp(-Math.min(dx,dy)/3.5);
    const shade=detail?16*Math.exp(-Math.min(rx,by)/2.4):24*Math.exp(-by/13)+14*Math.exp(-rx/6)+12*Math.exp(-dy/10);
    const wear=edge<4&&noise(col*2,row,7)>.57?15:0;
    const value=brush+(color===0xa33430?0:highlight-shade+wear);
    for(let c=0;c<3;c++)data[i+c]=Math.max(0,Math.min(255,((color>>(16-c*8))&255)+value*(c===2?.83:1)));
    data[i+3]=255;
   }
  };
  paint(0,0,1,1,base);
  // Scumbled horizontal dry-brush marks across the painted steel, before markings.
  for(let n=0;n<100;n++){const x=Math.floor(hash(n,3)*width),y=Math.floor(hash(n,8)*height),length=3+Math.floor(hash(n,12)*24),tone=hash(n,18)>.5?8:-9;
   for(let k=0;k<length&&x+k<width;k++){const i=(y*width+x+k)*4;for(let c=0;c<3;c++)data[i+c]=Math.max(0,Math.min(255,data[i+c]+tone*Math.sin(Math.PI*k/length)));}
  }
  for(const r of rects){
   // A thin painted shadow beneath straps and fittings anchors them to the case.
   const [x,y,w,h,color]=r;if(color!==0xa33430)paint(x+.004,y+.008,w,h,0x4a503e,true);paint(...r,true);
  }
  skinPixels.set(key,data);
  }
  const texture=new T.DataTexture(data,width,height);texture.name=name;texture.colorSpace=T.SRGBColorSpace;texture.flipY=true;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;textures.push(texture);
  return materials[name]=new T.MeshStandardMaterial({map:texture,roughness:.88});
 };
 const straps=(span)=>[-.32,.32].map(x=>[.5+(x-.0225)/span,0,.045/span,1,0xb8af87]);
 const front=skin('body-face',0x64705b,[...straps(.96),[.5-.085/.96,1-(.167-.02+.075)/.28,.17/.96,.15/.28,0xede6cb],[.5-.018/.96,1-(.167-.02+.0575)/.28,.036/.96,.115/.28,0xa33430],[.5-.058/.96,1-(.167-.02+.018)/.28,.116/.96,.036/.28,0xa33430]]);
 const side=skin('side-face',0x64705b,[[.5-.082/.44,1-(.203-.02+.0275)/.28,.024/.44,.055/.28,0xd4c89a],[.5+.058/.44,1-(.203-.02+.0275)/.28,.024/.44,.055/.28,0xd4c89a],[.5-.08/.44,1-(.225-.02+.012)/.28,.16/.44,.024/.28,0x283c38]]);
 const lidSkin=skin('lid-face',0x91977c,straps(.99));
 model.name='large-medical-chest';
 const colors={body:0x64705b,lid:0x91977c,dark:0x283c38,metal:0xd4c89a};
 for(const [key,color]of Object.entries(colors)){skin(key,color,[]);materials[key].roughness=key==='metal'?.62:.88;materials[key].metalness=key==='metal'?.2:0;}
 const box=(name,size,position,material)=>{const m=new T.Mesh(geometry,Array.isArray(material)?material:materials[material]);m.name=name;m.scale.set(...size);m.position.set(...position);m.castShadow=true;m.receiveShadow=true;model.add(m);return m;};
 box('body',[.96,.28,.44],[0,.16,0],[side,side,materials.body,materials.body,front,front]);
 box('base',[.98,.025,.46],[0,.0125,0],'dark');
 box('lid-seam',[.975,.014,.455],[0,.302,0],'dark');
 box('lid',[.99,.065,.47],[0,.34,0],[materials.lid,materials.lid,lidSkin,materials.lid,lidSkin,lidSkin]);
 for(const x of [-.32,.32]){
  for(const z of [-.226,.226]){
   box('latch',[.061,.074,.024],[x,.294,z],'metal');
   box('latch-slot',[.012,.025,.026],[x,.278,z],'dark');
  }
 }
 for(const x of [-.105,.105])box('handle-mount',[.032,.045,.035],[x,.403,0],'dark');
 box('carry-handle',[.24,.026,.035],[0,.431,0],'dark');
 model.userData.dispose=()=>{geometry.dispose();textures.forEach(t=>t.dispose());Object.values(materials).forEach(m=>m.dispose());};
 return model;
}
