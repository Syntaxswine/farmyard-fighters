import * as T from './vendor/three.module.js';
import {GROUND_SPRITE_ATLAS,createGroundSpriteLayout,spriteRandom} from './biome-ground-sprite-layout.js';

const PALETTES={
 temperate:{bark:['#3e3523','#655237','#8b724b','#a48a5c'],leaves:['#4c522b','#77733e','#96814b','#634d2c'],wash:'#77743c',moss:'#606333'},
 jungle:{bark:['#292d1a','#474730','#66633e','#838356'],leaves:['#29482d','#52663a','#6e793e','#434d27'],wash:'#455c30',moss:'#667740'},
 snow:{bark:['#394039','#555647','#7d7965','#a2997c'],leaves:['#56655b','#78877b','#a1b1a6','#c2cbc0'],wash:'#abb9b3',moss:'#718777'},
 dry:{bark:['#65513b','#897050','#af9269','#c8ad80'],leaves:['#8d7c43','#b09857','#ceaf6b','#72623b'],wash:'#baa065',moss:'#968349'},
 wetlands:{bark:['#29332a','#3b4834','#596044','#787c53'],leaves:['#485536','#6c7342','#8a8b52','#a39b66'],wash:'#74744b',moss:'#646f3c'}
};
const choose=(r,a)=>a[Math.floor(r()*a.length)];

// All of the visible wood grain, splinters, needles and leaf clusters are
// drawn into this transparent atlas. None of them creates a mesh or shadow.
export function paintGroundSpriteAtlas(recipes,canvas){
 const {columns,rows,panel}=GROUND_SPRITE_ATLAS;canvas.width=columns*panel;canvas.height=rows*panel;
 const c=canvas.getContext('2d');if(!c)throw Error('A 2D canvas is required to paint ground sprites');
 for(const recipe of recipes){
  c.save();c.translate(recipe.index%columns*panel,Math.floor(recipe.index/columns)*panel);c.scale(panel,panel);paintGroundFeature(c,recipe);c.restore();
 }
 return canvas;
}

// The connected terrain painter calls this directly with a fresh recipe for
// every world feature. The old atlas exporter remains available for comparison.
export function paintGroundFeature(c,recipe){
  const r=spriteRandom(recipe.inkSeed),p=PALETTES[recipe.family],large=recipe.kind!=='litter',snow=recipe.family==='snow',wet=recipe.family==='wetlands';
  c.save();c.beginPath();c.rect(.04,.04,.92,.92);c.clip();
  function dab(x,y,rx,ry,color,alpha=1,angle=0){c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.globalAlpha=alpha;c.beginPath();const count=9;for(let i=0;i<count;i++){const a=i/count*Math.PI*2,f=.72+r()*.40,u=Math.cos(a)*rx*f,v=Math.sin(a)*ry*f;i?c.lineTo(u,v):c.moveTo(u,v);}c.closePath();c.fill();c.restore();}
  function stroke(points,width,color,alpha=1){c.save();c.globalAlpha=alpha;c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();c.restore();}
  // Broken brush marks make a soft patch, rather than an opaque rectangular
  // tile. A few broad color notes sit below the recognizable debris.
  for(let patch=0;patch<(large?4:3);patch++){
   const x=.22+r()*.56,y=.22+r()*.56,rx=.08+r()*.10,ry=.04+r()*.07;
   for(let i=0;i<24;i++)dab(x+(r()-.5)*rx*2,y+(r()-.5)*ry*2,.02+r()*.065,.01+r()*.025,p.wash,.025+r()*.035,r()*6.28);
  }
  function leaf(x,y,length,angle,color){
   c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.globalAlpha=.66+r()*.30;c.beginPath();c.moveTo(-length*.55,0);c.quadraticCurveTo(-length*.08,-length*.45,length*.5,0);c.quadraticCurveTo(0,length*.3,-length*.55,0);c.fill();stroke([[-length*.35,0],[length*.39,0]],length*.04,p.bark[3],.30);c.restore();
  }
  function twig(x,y,length,angle,width){
   const bend=(r()-.5)*.9,points=[[x,y],[x+Math.cos(angle)*length*.36,y+Math.sin(angle)*length*.36],[x+Math.cos(angle+bend)*length*.67,y+Math.sin(angle+bend)*length*.67],[x+Math.cos(angle+bend*.65)*length,y+Math.sin(angle+bend*.65)*length]];
   for(let j=0;j<3;j++){stroke(points.slice(j,j+2),width*(1.25-j*.32),p.bark[0],.76);stroke(points.slice(j,j+2).map(([u,v])=>[u,v-width*.10]),width*(.8-j*.22),p.bark[2],.82);}
   for(let i=0;i<1+Math.floor(r()*3);i++){const t=.22+r()*.6,bx=x+Math.cos(angle)*length*t,by=y+Math.sin(angle)*length*t,a=angle+(r()<.5?-1:1)*(.6+r()*.6);stroke([[bx,by],[bx+Math.cos(a)*length*.22,by+Math.sin(a)*length*.22]],width*.26,p.bark[1],.8);}
  }
  // Litter has its own smaller three-tile layout, so even the spaces between
  // large deadfalls receive different marks rather than the same log stamp.
  for(let cluster=0;cluster<(large?4:5);cluster++){
   const x=.20+r()*.60,y=.20+r()*.60;
   for(let i=0;i<(snow?7:wet?12:17);i++){
    const u=x+(r()-.5)*.20,v=y+(r()-.5)*.20;
    if(wet||recipe.family==='dry'||snow){const angle=r()*6.28,length=.025+r()*.10;stroke([[u,v],[u+Math.cos(angle)*length,v+Math.sin(angle)*length]],.002+r()*.002,choose(r,p.leaves),.32+r()*.40);}
    else leaf(u,v,(large?.014:.024)+r()*(recipe.family==='jungle'?.065:.035),r()*6.28,choose(r,p.leaves));
   }
  }
  if(large){
   c.save();c.translate(...recipe.center);c.rotate(recipe.angle);
   const length=recipe.length,width=recipe.width,left=-length/2,right=length/2;
   if(recipe.kind==='deadfall'){
    const bend=(r()-.5)*.09,phase=r()*6.28;
    const centerAt=x=>Math.sin((x-left)/length*Math.PI)*bend+Math.sin((x-left)/length*6.28)*bend*.25;
    const radiusAt=x=>width*(.57-.32*(x-left)/length)*(1+.12*Math.sin((x-left)/length*13+phase));
    const top=[],bottom=[];for(let i=0;i<=19;i++){const x=left+length*i/19,y=centerAt(x),radius=radiusAt(x);top.push([x+(r()-.5)*.006,y-radius*(.88+r()*.22)]);bottom.push([x+(r()-.5)*.008,y+radius*(.80+r()*.4)]);}
    // Splintered ends belong to the silhouette, rather than being lines drawn
    // on a constant-width capsule. No regular saw-cut or rounded beam caps.
    const outline=[...top,[right+.012,centerAt(right)-width*.10],[right-.015,centerAt(right)+width*.03],[right+.023,centerAt(right)+width*.08],...bottom.reverse(),[left-.025,width*.25],[left+.024,width*.13],[left-.033,-width*.09],[left+.015,-width*.27]];
    function woodOutline(){c.beginPath();outline.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
    // Offset dark brush marks read as contact dirt, not a floating drop shadow.
    for(let i=0;i<22;i++){const x=left+r()*length;dab(x,centerAt(x)+radiusAt(x)*.8,width*1.1,width*.7,p.bark[0],.035);}
    const branchCount=1+Math.floor(r()*5);for(let i=0;i<branchCount;i++){const x=left+length*(.12+r()*.76),sign=r()<.5?-1:1,a=sign*(.50+r()*1.35);twig(x,centerAt(x),.065+r()*.16,a,width*(.14+r()*.20));}
    woodOutline();c.fillStyle=p.bark[0];c.fill();c.save();woodOutline();c.clip();
    // Broad, broken brush strokes and dark fissures are intentionally larger
    // than pixel noise so bark remains legible at gameplay scale.
    for(let i=0;i<85;i++){
     const x=left+r()*length,l=.02+r()*length*.40,y=centerAt(x)+(r()-.5)*radiusAt(x)*1.8;
     stroke([[x,y],[x+l*.45,y+(r()-.5)*width*.18],[x+l,y+(r()-.5)*width*.18]],width*(.07+r()*.28),choose(r,p.bark),.45+r()*.45);
    }
    for(let i=0;i<5;i++){const x=left+r()*length;stroke([[x,centerAt(x)],[x+.04,centerAt(x)-width*.08],[x+.13,centerAt(x)+width*.10]],width*.08,p.bark[0],.78);}
    c.restore();
    // Chips at the snapped butt and bark flakes interrupt the straight edges.
    for(let i=0;i<5;i++){const y=(r()-.5)*width*.7;stroke([[left-.025+r()*.02,y],[left+.02+r()*.05,y+width*.07]],width*(.025+r()*.07),p.bark[3],.80);}
    for(let i=0;i<13;i++){const x=left+r()*length;dab(x,centerAt(x)+(r()<.5?-1:1)*radiusAt(x),.005+r()*.017,.002+r()*.005,p.bark[1],.85,r());}
    if(snow){
     // Wind-packed snow comes over one side in a few broad irregular banks.
     // Leave dark notches and broken ends, rather than a row of white dots.
     for(let patch=0;patch<2+Math.floor(r()*2);patch++){
      const x=left+r()*length*.82,span=length*(.16+r()*.24),points=[];
      for(let j=0;j<=9;j++){const u=Math.min(right+.018,x+span*j/9);points.push([u,centerAt(u)-radiusAt(u)-width*(.18+r()*.42)]);}
      for(let j=9;j>=0;j--){const u=Math.min(right+.018,x+span*j/9);points.push([u,centerAt(u)+radiusAt(u)*(-.1+r()*.5)]);}
      c.beginPath();points.forEach(([u,v],j)=>j?c.lineTo(u,v):c.moveTo(u,v));c.closePath();c.fillStyle=choose(r,['#c6d1c9','#d9dfd4','#e4e5d7']);c.globalAlpha=.9;c.fill();c.globalAlpha=1;
      for(let j=0;j<9;j++){const u=x+r()*span;dab(u,centerAt(u)-radiusAt(u)*.6,.008+r()*.035,.003+r()*.007,'#e9e9dd',.4);}
     }
    }else for(let i=0;i<26;i++){
     const x=left+r()*length,y=centerAt(x)-width*.12+(r()-.5)*width*.45;dab(x,y,.009+r()*.025,.005+r()*.011,p.moss,.12+r()*.28);
    }
    if(recipe.family==='jungle')for(let i=0;i<8;i++)leaf(left+r()*length,-width*.25,.025+r()*.035,r()*6.28,p.leaves[2]);
    if(wet)for(let i=0;i<7;i++)stroke([[left+r()*length,width*.7],[left+r()*length,width*.8]],.003,p.leaves[1],.20);
   }else for(let i=0;i<4;i++)twig(left+r()*length*.45,(r()-.5)*.1,length*(.55+r()*.25),(r()-.5)*.85,width*.25);
   c.restore();
  }else if(!wet){for(let i=0;i<2;i++)twig(.24+r()*.40,.24+r()*.40,.12+r()*.16,r()*6.28,.006+r()*.004);}
  // Fine mottling breaks the digital outlines without a costly extra texture.
  for(let i=0;i<140;i++)dab(.10+r()*.80,.10+r()*.80,.001+r()*.005,.001+r()*.003,choose(r,p.leaves),.04+r()*.10,r()*6.28);
  c.restore();
}

function defaultCanvas(){if(typeof document!=='undefined')return document.createElement('canvas');if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(1,1);return null;}
export function createGroundSpriteSkin(plan,family,{seed,canvas=defaultCanvas()}={}){
 const layout=createGroundSpriteLayout(plan,family,seed),textures=[],strength={value:1};let disposed=false;
 if(canvas){
  paintGroundSpriteAtlas(layout.recipes,canvas);const atlas=new T.CanvasTexture(canvas);atlas.colorSpace=T.SRGBColorSpace;atlas.flipY=false;atlas.minFilter=T.LinearMipmapLinearFilter;atlas.magFilter=T.LinearFilter;atlas.name='Procedural '+family+' ground sprites';textures.push(atlas);
  for(const l of layout.layers){const t=new T.DataTexture(l.data,l.width,l.depth);t.name='Seeded '+l.name+' ground layout';t.minFilter=t.magFilter=T.NearestFilter;t.needsUpdate=true;textures.push(t);}
 }
 function attach(material){
  if(!textures.length)return;
  const previous=material.onBeforeCompile,cache=material.customProgramCacheKey(),{columns,rows,panel}=GROUND_SPRITE_ATLAS;
  material.customProgramCacheKey=()=>cache+'-ground-sprites-v1-'+layout.layers.map(l=>l.width+'x'+l.depth).join('-');
  material.onBeforeCompile=s=>{
   previous.call(material,s);s.uniforms.groundSpriteAtlas={value:textures[0]};s.uniforms.groundLargeLayout={value:textures[1]};s.uniforms.groundLitterLayout={value:textures[2]};s.uniforms.groundSpriteStrength=strength;
   s.vertexShader='varying vec2 vGroundSpritePosition;varying float vGroundSpriteTop;\n'+s.vertexShader;
   s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vGroundSpritePosition=position.xz;vGroundSpriteTop=abs(normal.y);');
   s.fragmentShader=`varying vec2 vGroundSpritePosition;varying float vGroundSpriteTop;
    uniform sampler2D groundSpriteAtlas,groundLargeLayout,groundLitterLayout;uniform float groundSpriteStrength;
    vec4 groundInk(sampler2D placementMap,vec2 size,vec2 offset,float scale){
     vec2 continuous=(vGroundSpritePosition+offset)/scale,cell=floor(continuous);
     float footprint=log2(max(.0001,max(length(dFdx(continuous)),length(dFdy(continuous)))*${panel.toFixed(1)}));
     if(any(lessThan(cell,vec2(0)))||any(greaterThanEqual(cell,size)))return vec4(0);
     vec4 meta=floor(texture2D(placementMap,(cell+.5)/size)*255.+.5);if(meta.r<.5)return vec4(0);
     vec2 uv=fract(continuous)-.5;if(meta.b>.5)uv.x=-uv.x;
     if(meta.g<.5){}else if(meta.g<1.5)uv=vec2(-uv.y,uv.x);else if(meta.g<2.5)uv=-uv;else uv=vec2(uv.y,-uv.x);uv+=.5;
     float id=meta.r-1.;
     vec2 atlasUV=(vec2(mod(id,${columns.toFixed(1)}),floor(id/${columns.toFixed(1)}))+uv)/vec2(${columns.toFixed(1)},${rows.toFixed(1)});
     vec4 ink=textureLod(groundSpriteAtlas,atlasUV,clamp(footprint,0.,3.));ink.a*=1.-smoothstep(2.5,4.5,footprint);return ink;
    }
   `+s.fragmentShader;
   const sample=l=>`groundInk(${l.name==='large'?'groundLargeLayout':'groundLitterLayout'},vec2(${l.width.toFixed(1)},${l.depth.toFixed(1)}),vec2(${l.offset.map(n=>n.toFixed(2)).join(',')}),${l.size.toFixed(1)})`;
   s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec4 litterInk=${sample(layout.layers[1])},largeInk=${sample(layout.layers[0])};float topInk=pow(clamp(vGroundSpriteTop,0.,1.),4.)*groundSpriteStrength;
    diffuseColor.rgb=mix(diffuseColor.rgb,litterInk.rgb,litterInk.a*topInk);
    diffuseColor.rgb=mix(diffuseColor.rgb,largeInk.rgb,largeInk.a*topInk);
   `);
  };
 }
 return {layout,textures,canvas,attach,setEnabled(value){strength.value=value?1:0;},get stats(){return {...layout.stats,seed:layout.seed,atlasSize:canvas?[canvas.width,canvas.height]:[0,0],textureBytes:canvas?Math.ceil(canvas.width*canvas.height*4*4/3)+layout.layers.reduce((n,l)=>n+l.data.byteLength,0):0};},dispose(){if(disposed)return;disposed=true;textures.forEach(t=>t.dispose());if(canvas)canvas.width=canvas.height=1;}};
}
