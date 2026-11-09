// Tile-independent paint placements. The large sprites span eight tiles and
// cross 24-tile render blocks; small litter fills the spaces between them.
export const GROUND_SPRITE_SEED=173;
export const GROUND_SPRITE_FAMILIES=['temperate','jungle','snow','dry','wetlands'];
export const GROUND_SPRITE_ATLAS={columns:8,rows:4,panel:256,gutter:.04};
export function spriteRandom(seed){let n=seed>>>0;return()=>{n+=0x6d2b79f5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function groundSpriteRecipes(family,seed=GROUND_SPRITE_SEED){
 if(!GROUND_SPRITE_FAMILIES.includes(family))throw Error('Unknown ground sprite family');
 if(!Number.isSafeInteger(seed)||seed<0||seed>2147483647)throw Error('Ground sprite seed must be a nonnegative 31-bit integer');
 const recipes=[];
 for(let index=0;index<32;index++){
  const inkSeed=(seed+index*701+GROUND_SPRITE_FAMILIES.indexOf(family)*7919)>>>0,r=spriteRandom(inkSeed),large=index<16;
  const kind=large?(index%4===3?'branches':'deadfall'):'litter';
  const length=large?(family==='wetlands'?.30+r()*.20:.48+r()*.28):0;
  recipes.push({index,kind,family,inkSeed,size:large?8:3,length,width:large?.032+r()*.036:0,angle:(r()-.5)*Math.PI,center:[.5+(r()-.5)*.12,.5+(r()-.5)*.12],bounds:[.04,.04,.96,.96]});
 }
 return recipes;
}
export function createGroundSpriteLayout(plan,family,seed=GROUND_SPRITE_SEED){
 const recipes=groundSpriteRecipes(family,seed),layers=[];
 for(const [layer,size,offset]of [['large',8,[2.5,3.5]],['litter',3,[1.75,.75]]]){
  const width=Math.ceil((plan.width-.5+offset[0])/size),depth=Math.ceil((plan.depth-.5+offset[1])/size),data=new Uint8Array(width*depth*4),placements=[];
  for(let z=0;z<depth;z++)for(let x=0;x<width;x++){
   const r=spriteRandom(seed+x*92821+z*68917+(layer==='large'?719:17011));if(r()>(layer==='large'?.82:.91))continue;
   const index=(layer==='large'?0:16)+Math.floor(r()*16),turn=Math.floor(r()*4),mirror=Math.floor(r()*2),recipe=recipes[index];
   const min=[x*size-offset[0]+size*.04,z*size-offset[1]+size*.04],max=[(x+1)*size-offset[0]-size*.04,(z+1)*size-offset[1]-size*.04];
   const cx=(min[0]+max[0])/2,cz=(min[1]+max[1])/2,h=plan.heightAt(Math.floor(cx+.5),Math.floor(cz+.5));let safe=h!==null;
   // The complete ink footprint must stay on one blocked elevation. A long
   // branch must not masquerade as a bridge across a path, bog bank or cliff.
   for(let v=Math.floor(min[1]+.5);safe&&v<=Math.floor(max[1]+.5);v++)for(let u=Math.floor(min[0]+.5);u<=Math.floor(max[0]+.5);u++)if(!plan.blockedAt(u,v)||plan.heightAt(u,v)!==h){safe=false;break;}
   if(!safe)continue;
   data.set([index+1,turn,mirror,255],(z*width+x)*4);placements.push({x:cx,z:cz,height:h,index,turn,mirror,kind:recipe.kind,length:recipe.length*size,min,max});
  }
  layers.push({name:layer,size,offset,width,depth,data,placements});
 }
 return {family,seed,recipes,layers,stats:{large:layers[0].placements.length,litter:layers[1].placements.length,paintedLogs:layers[0].placements.filter(p=>p.kind==='deadfall').length,addedTriangles:0}};
}
