import {createDonkeyStrawHat} from './donkey-straw-hat.js';
import {applyDonkeyHawaiian,DONKEY_GUIDE_OUTFIT} from './donkey-hawaiian.js';
import {createModelPaint} from './horse-model-paint.js';
import {cowNeckPaint,COW_NECK_PAINT} from './cow-neck-paint.js';
import {rabbitPaintLayers,RABBIT_CLOTH_PAINT,RABBIT_EYE_PAINT} from './rabbit-paint-layers.js';
import {dogMotionPaint} from './dog-motion-paint.js';
import {DOG_CLOTH_PAINT,DOG_EYE_PAINT} from './dog-paint-layers.js';
import {sheepPaintLayers} from './sheep-paint-layers.js';
import {henPaintLayers} from './hen-paint-layers.js';
import {animalMotionRepairPaint} from './animal-motion-repair-paint.js';
import {applyRedHatUniform,RED_HAT_UNIFORM_PAINT} from './red-hat-uniform.js';
import {applyTailoredRedHat} from './red-hat-tailored-paint.js';
export async function createAnimalPaint(renderer,worker,profile,loader,outfit='normal',sceneLighting=false){
 let released=false,paint,disposePaint,disposeUniform,guideHat,disposeHawaiian;
 const options={species:profile.id,frame:profile.frame,sceneLighting},textures=[],load=async url=>{const t=await loader.loadAsync(url);if(released)t.dispose();else textures.push(t);return t;},base='../assets/characters/lowpoly-proof/';
 // Later outfit loads may fail after projection targets already exist. Keep
 // their ownership here, including textures that finish after a sibling fails.
 function dispose(){if(released)return;released=true;guideHat?.dispose();disposeHawaiian?.();disposeUniform?.();if(disposePaint)disposePaint();else {options.paintLayers?.dispose();options.preparedProjection?.dispose();}textures.forEach(t=>t.dispose());}
 try{
 const main=await load(profile.paint);
 if(profile.id==='cow')options.paintLayers=cowNeckPaint(await load(COW_NECK_PAINT),renderer);
 if(profile.id==='rabbit')options.paintLayers=rabbitPaintLayers(await load(RABBIT_CLOTH_PAINT),renderer,await load(RABBIT_EYE_PAINT));
 if(profile.id==='dog')options.paintLayers=dogMotionPaint(await load(DOG_CLOTH_PAINT),renderer,await load(DOG_EYE_PAINT));
 if(profile.id==='sheep')options.paintLayers=sheepPaintLayers(renderer,worker,[await load(base+'sheep-underlay-paint-v1.png')],profile.frame);
 if(profile.id==='hen')options.paintLayers=henPaintLayers(renderer,worker,await Promise.all(['hen-underlay-paint-v1.png','hen-tail-paint-v1.png'].map(f=>load(base+f))),profile.frame);
 if(profile.id==='pig-foreman')options.earTexture=await load('../assets/characters/model-references/pig-foreman-turnaround-v2.png');
 if(profile.tailPaint)options.tailTexture=await load(profile.tailPaint);
 options.paintLayers=animalMotionRepairPaint(profile,options.paintLayers);
 if(loader.prepareProjection)options.preparedProjection=await loader.prepareProjection(worker,profile.frame);
 paint=createModelPaint(renderer,worker,main,options);disposePaint=paint.dispose;
 const tailored=profile.id==='hen'||profile.id==='pig-director';
 disposeUniform=outfit==='red-hats'&&profile.id!=='pig-foreman'?(tailored?await applyTailoredRedHat(renderer,paint.material,await load(base+profile.id+'-red-hat-paint-v1.png'),profile):await applyRedHatUniform(renderer,paint.material,await load(RED_HAT_UNIFORM_PAINT),profile)):null;
 guideHat=profile.id==='donkey'&&outfit===DONKEY_GUIDE_OUTFIT?createDonkeyStrawHat(worker):null;
 disposeHawaiian=profile.id==='donkey'&&outfit===DONKEY_GUIDE_OUTFIT?applyDonkeyHawaiian(paint.material):null;
 paint.dispose=dispose;return paint;
 }catch(error){dispose();throw error;}
}
