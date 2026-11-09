import {paintValidity} from './horse-model-paint.js';
import {ANIMAL_MOTION_CATALOG} from './animal-motion-catalog.js';
import {preparePortraitRig} from './dialogue-rig-preparation.js';
self.onmessage=async({data:{id,url,rig}})=>{let bitmap;try{
 if(rig){const data=preparePortraitRig(ANIMAL_MOTION_CATALOG.find(p=>p.id===rig.species),rig.data,rig.head),buffers=new Set();for(const p of data){buffers.add(p.index.buffer);for(const a of Object.values(p.attributes))buffers.add(a.array.buffer);}self.postMessage({id,data},[...buffers]);return;}
 const response=await fetch(url);if(!response.ok)throw Error('Portrait paint unavailable');bitmap=await createImageBitmap(await response.blob());const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);const data=paintValidity(ctx.getImageData(0,0,bitmap.width,bitmap.height).data,bitmap.width,bitmap.height);self.postMessage({id,data},[data.buffer]);
 }catch(e){self.postMessage({id,error:e.message});}finally{bitmap?.close();}};
