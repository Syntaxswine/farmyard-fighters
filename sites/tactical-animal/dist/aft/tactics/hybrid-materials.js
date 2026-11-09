import {diagonalRoad} from './diagonal-roads.js';
// Flat procedural surfaces: no baked architectural perspective or stretched wall art.
// Pure UV mapping is shared with numeric material-density checks.
export const MATERIAL_DENSITY=Object.freeze({brickWidth:.5,brickCourse:.2,texturePeriod:1});
export function surfaceUV(position,normal){
 if(Math.abs(normal[1])>.5)return [position[0],position[2]];
 return [Math.abs(normal[0])>.5?position[2]:position[0],position[1]];
}
export function surfacePixels(kind,size=128){
 if(kind?.startsWith('breach-'))kind=kind.slice(7);
 const data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size,noise=((x*73+y*97+(x*y)%31)%17)-8;
  let color;
  if(kind==='wood-planks'){
   const row=Math.floor(v*4),across=v*4-row,end=(u+(row%2)*.5)%1;
   const wave=Math.sin(u*Math.PI*2)*.016+Math.sin(u*Math.PI*6+row)*.006;
   const grain=Math.sin((across+wave)*Math.PI*34)*3+Math.sin((across+wave)*Math.PI*12)*4;
   const broad=Math.sin(u*Math.PI*2+row)*5+Math.cos(across*Math.PI)*3;
   const knotX=[.28,.71,.54,.16][row],dx=Math.min(Math.abs(u-knotX),1-Math.abs(u-knotX)),dy=across-.55;
   const knot=Math.exp(-((dx/.075)**2+(dy/.24)**2)),rings=Math.sin(Math.hypot(dx*18,dy*5)*12)*knot*7;
   let shade=grain+broad+rings-knot*15+row%3*6;
   if(across<.035||end<.014)shade-=45;else if(across<.07||end<.026)shade+=20;else if(across>.95)shade-=12;
   color=[145+shade,107+shade*.85,65+shade*.65];
  }else if(kind==='brick'){

   const course=Math.floor(v/MATERIAL_DENSITY.brickCourse),a=(u+(course%2)*.25)%.5,b=v%.2;
   color=a<.018||b<.015?[111,107,88]:[151+course%3*7,101+course%2*5,73];
  }else if(kind==='metal'){const rib=(Math.floor(u*16)%4===0)?-25:0;color=[111+rib,125+rib,117+rib];}
  else if(kind==='wood'){const grain=((Math.floor(u*48)+Math.floor(v*7))%7)*2;color=[120+grain,95+grain,62+grain];}
  else if(kind==='steel'){const wear=((x*17+y*31)%113===0)?-12:0;color=[128+wear,148+wear,136+wear];}
  else if(kind==='grass')color=[92,109,72];
  else if(kind==='sand')color=[151,139,102];
  else if(kind==='foliage')color=[48,93,48];
  else if(kind==='leaf-light')color=[93,130,55];
  else if(kind==='leaf-olive')color=[96,109,57];
  else if(kind==='pine')color=[34,70,48];
  else if(kind==='water')color=[47,91,118];
  else if(kind==='linen')color=[193,204,180];
  else if(kind==='screen')color=[43,133,130];
  else if(kind==='dark-metal')color=[48,55,54];
  else if(kind==='rust')color=[144,81,48];
  else if(kind==='red')color=[187,46,35];
  else if(kind==='olive')color=[80,89,47];
  else if(kind==='asphalt')color=[61,66,63];
  else color=[127,128,113];
  const i=(y*size+x)*4;for(let c=0;c<3;c++)data[i+c]=color[c]+noise;data[i+3]=255;
 }
 return {data,width:size,height:size};
}
export function materialKind(box){
 if(box.material?.startsWith('breach-'))return box.material;
 if(box.material==='ground-wood-planks')return 'wood-planks';
 if(diagonalRoad(box.material))return box.material;
 if(box.material==='bark'||box.material==='grass-blade')return box.material;
 if(['steel','leaf-light','leaf-dry','leaf-sage','leaf-olive','pine','foliage','water','linen','screen','dark-metal','rust','red','olive','metal','wood','sand'].includes(box.material))return box.material;
 if(['woodland','woodland-dense'].includes(box.material))return box.kind==='floor'?'cover-grass':'foliage';
 if(box.material==='ground-asphalt'||box.material==='bridge')return 'asphalt';
 if(box.material==='ground-dirt'||box.material==='ground-gravel')return 'sand';
 if(box.kind==='stairs')return 'metal';
 if(/brick|^wall$/.test(box.material))return 'brick';
 if(/corrugated|steel/.test(box.material))return 'metal';
 if(/wood|crate|door/.test(box.material))return 'wood';
 if(box.material==='yard'||box.material==='ground-grass'||box.material?.startsWith('ground-biome-'))return 'grass';
 if(box.kind==='cover')return 'sand';return 'concrete';
}
export function materialGallery(map){
 const m=structuredClone(map);
 for(let y=0;y<12;y++)for(let x=12;x<18;x++)m.terrain[y][x]='yard';
 for(let y=2;y<6;y++)for(let x=2;x<6;x++)m.upper[0][`${x},${y}`]='floor';
 for(let y=2;y<6;y++){m.edges[`e:1:${y}:1`]='wall-brick';m.edges[`e:5:${y}:1`]='wall-brick';}
 for(let x=2;x<6;x++){m.edges[`s:${x}:1:1`]='wall-brick';m.edges[`s:${x}:5:1`]='wall-brick';}
 m.edges['s:4:5:1']='window-brick';m.stairs=[{x:4,y:4,z:0,kind:'stairs'}];
 for(let y=2;y<7;y++){m.edges[`e:10:${y}`]='wall-corrugated';m.edges[`e:15:${y}`]='wall-corrugated';}
 for(let x=11;x<16;x++){m.edges[`s:${x}:1`]='wall-corrugated';m.edges[`s:${x}:6`]='wall-corrugated';}
 m.edges['s:13:6']='doorway-concrete-open';return m;
}
