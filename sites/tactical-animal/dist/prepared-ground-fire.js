import * as T from './aft/tactics/vendor/three.module.js';
import {baseHeight} from './town-levels.js';
import {createPaintedBlastEffects} from './designer/a20b343a0234/tactics/painted-blast-effects.js';

// Reuse AFT's painted cards and boundary shader. Keep cards/materials resident;
// changing the real fire cells changes their positions and one small mask only.
export class PreparedGroundFire{
  constructor(scene,textures){this.scene=scene;this.textures=textures;this.disposed=false;}
  async prepare(capacity=256){
    if(this.effects)return;
    this.capacity=capacity;
    this.contract={origin:{x:0,y:0},fires:Array.from({length:capacity},(_,i)=>({x:i%32,y:Math.floor(i/32)}))};
    const fx=await createPaintedBlastEffects(this.scene,null,new T.Vector3(0,1,0),{textures:this.textures,world:true,fragmentCount:0});
    if(this.disposed){fx.dispose();return;}
    const lights=[];fx.group.traverse(o=>{if(o.isLight)lights.push(o);});lights.forEach(o=>o.removeFromParent());
    fx.update(10000,{camera:new T.PerspectiveCamera(),contract:this.contract});
    this.effects=fx;this.resizeMask(128);fx.group.visible=false;
  }
  resizeMask(size){
    this.size=size;this.effects.groundMask.image={data:new Uint8Array(size*size*4),width:size,height:size};
    this.effects.groundMask.needsUpdate=true;
  }
  draw(cells,now,camera,reduced){
    if(this.disposed)return;
    if(this.replacement?.effects){this.effects.group.visible=false;this.replacement.draw(cells,now,camera,reduced);return;}
    const fx=this.effects;if(!fx)return;
    if(cells.length>this.capacity&&!this.replacement){this.replacement=new PreparedGroundFire(this.scene,this.textures);this.growing=this.replacement.prepare(2**Math.ceil(Math.log2(cells.length)));}
    if(!cells.length){fx.group.visible=false;return;}
    const signature=cells.map(p=>`${p.x},${p.y},${baseHeight(p)}`).join(';');
    if(signature!==this.signature){
      this.signature=signature;
      const minX=Math.min(...cells.map(p=>p.x)),minY=Math.min(...cells.map(p=>p.y));
      const width=Math.max(...cells.map(p=>p.x))-minX+1,height=Math.max(...cells.map(p=>p.y))-minY+1;
      const size=2**Math.ceil(Math.log2(Math.max(128,width,height)));
      if(size!==this.size)this.resizeMask(size);
      const mask=fx.groundMask.image.data;mask.fill(0);
      for(const p of cells){const at=((p.y-minY)*size+p.x-minX)*4;mask.fill(255,at,at+4);}
      fx.groundMask.needsUpdate=true;
      fx.ground[0]?.material.uniforms.groundBounds.value.set(minX-.5,minY-.5,size,size);
      for(let i=0;i<fx.ground.length;i++){const p=cells[i],cell=fx.ground[i].userData.cell;cell.x=p?.x??0;cell.z=p?.y??0;cell.y=baseHeight(p);if(fx.ground[i].material.uniforms.groundFloor)fx.ground[i].material.uniforms.groundFloor.value=baseHeight(p);}
    }
    fx.update(reduced?10000:10000+now/1000,{camera,contract:this.contract});
    for(let i=0;i<fx.ground.length;i++)fx.ground[i].visible=i<cells.length;
  }
  dispose(){this.disposed=true;this.effects?.dispose();this.replacement?.dispose();this.effects=null;}
}
