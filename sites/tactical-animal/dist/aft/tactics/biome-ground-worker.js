import {createGroundComposition} from './biome-ground-composition.js';
import {paintGroundRegion} from './biome-connected-ground.js';

// One worker belongs to one terrain lifetime. The owner sends at most one page
// at a time, so a camera jump cannot queue hundreds of obsolete paint jobs.
let composition;
self.onmessage=({data})=>{
 try{
  if(data.type==='init'){
   const {width,depth,blocked,heights,family,seed}=data,inside=(x,z)=>x>=0&&z>=0&&x<width&&z<depth;
   const plan={width,depth,blockedAt:(x,z)=>inside(x,z)&&!!blocked[z*width+x],heightAt:(x,z)=>inside(x,z)?heights[z*width+x]:null};
   composition=createGroundComposition(plan,family,seed);
   const canvas=new OffscreenCanvas(1,1);paintGroundRegion(composition,{x:-.5,z:-.5,width,depth,pixelsPerTile:2},canvas);const image=canvas.transferToImageBitmap();canvas.width=canvas.height=1;self.postMessage({type:'overview',image},[image]);
  }else if(data.type==='page'){
   const start=performance.now(),canvas=new OffscreenCanvas(1,1);paintGroundRegion(composition,{x:data.x,z:data.z,width:26,depth:26,pixelsPerTile:32},canvas);const image=canvas.transferToImageBitmap();canvas.width=canvas.height=1;self.postMessage({type:'page',index:data.index,image,ms:performance.now()-start},[image]);
  }
 }catch(error){self.postMessage({type:'error',message:error?.message||String(error)});}
};
