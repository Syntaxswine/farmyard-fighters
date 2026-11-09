import {createLightHorse} from './horse-light-model.js';
import {createGoatWorker,GOAT_PAINT} from './goat-worker.js';
import {createBullWorker,BULL_PAINT} from './bull-worker.js';
import {createCowWorker,COW_PAINT} from './cow-worker.js';
import {createDonkeyWorker,DONKEY_PAINT} from './donkey-worker.js';
import {createSheepWorker,SHEEP_PAINT} from './sheep-worker.js';
import {createSkunkWorker,SKUNK_PAINT,SKUNK_PAINT_FRAME,SKUNK_TAIL_PAINT} from './skunk-worker.js';
import {createPigForeman,PIG_FOREMAN_PAINT} from './pig-foreman.js';
import {createPigDirector,PIG_DIRECTOR_PAINT,PIG_DIRECTOR_FRAME} from './pig-director.js';
import {createRabbitWorker,RABBIT_PAINT,RABBIT_PAINT_FRAME} from './rabbit-worker.js';
import {createDogWorker,DOG_PAINT,DOG_PAINT_FRAME} from './dog-guard.js';
import {createHen,HEN_PAINT,HEN_FRAME} from './hen-worker.js';
import {MODEL_PAINT,PAINT_FRAME} from './horse-model-paint.js';

// Published smaller meshes, in their authored dimensions. No rescaling to fit.
export const ANIMAL_MOTION_CATALOG=[
 {id:'horse',label:'Horse worker',create:createLightHorse,paint:MODEL_PAINT,eye:[.058,1.477,.09]},
 {id:'goat',label:'Goat worker',create:createGoatWorker,paint:GOAT_PAINT,eye:[.048,1.471,.078]},
 {id:'bull',label:'Bull worker',create:createBullWorker,paint:BULL_PAINT,eye:[.05,1.447,.115],longTail:true},
 {id:'cow',label:'Cow worker',create:createCowWorker,paint:COW_PAINT,eye:[.05,1.447,.1],longTail:true},
 {id:'donkey',label:'Donkey worker',create:createDonkeyWorker,paint:DONKEY_PAINT,eye:[.027,1.397,.075],longTail:true},
 {id:'sheep',label:'Sheep worker',create:createSheepWorker,paint:SHEEP_PAINT,eye:[.075,1.505,.10]},
 {id:'skunk',label:'Skunk worker',create:createSkunkWorker,paint:SKUNK_PAINT,frame:SKUNK_PAINT_FRAME,tailPaint:SKUNK_TAIL_PAINT,eye:[.05,1.474,.09]},
 {id:'pig-foreman',label:'Pig foreman',create:createPigForeman,paint:PIG_FOREMAN_PAINT,eye:[.083,1.467,.12]},
 {id:'pig-director',label:'Pig director',create:createPigDirector,paint:PIG_DIRECTOR_PAINT,frame:PIG_DIRECTOR_FRAME,eye:[.093,1.53,.12]},
 {id:'rabbit',label:'Rabbit worker',create:createRabbitWorker,paint:RABBIT_PAINT,frame:RABBIT_PAINT_FRAME,eye:[.042,1.453,.09]},
 {id:'dog',label:'Dog guard',file:'dog-guard-10k-data.json',create:createDogWorker,paint:DOG_PAINT,frame:DOG_PAINT_FRAME,eye:[.04,1.47,.075]},
 {id:'hen',label:'Hen worker',create:createHen,paint:HEN_PAINT,frame:HEN_FRAME,unarmed:true}
].map(p=>({file:p.id+'-10k-data.json',frame:PAINT_FRAME,...p,...({
 horse:{kneelDrop:.3706,headPitch:-.8562,headYaw:27.734,headPitchSlope:1.459,proneAim:{stock:[.025,.03,.065],torsoFollow:.9,tuckHem:true}},
 goat:{kneelDrop:.3706,headPitch:-.8719,headYaw:23.469,headPitchSlope:1.453,proneAim:{stock:[.025,.03,.065],torsoFollow:.9,tuckHem:true}},
 bull:{kneelDrop:.3706,headPitch:-.7797,headYaw:35.172,headPitchSlope:1.606,proneAim:{stock:[.025,.03,.065],torsoFollow:.9,tuckHem:true}},
 cow:{kneelDrop:.3706,headPitch:-.7781,headYaw:30.141,headPitchSlope:1.556,proneAim:{stock:[.025,.03,.065],torsoFollow:.9,tuckHem:true}},
 donkey:{kneelDrop:.365,headPitch:-.6078,headYaw:13.844,headPitchSlope:1.6,proneAim:{stock:[.025,.03,.065],torsoFollow:.9,tuckHem:true,headOffset:-.25}},
 sheep:{kneelDrop:.365,headPitch:-.8844,headYaw:31.234,headPitchSlope:1.419,proneAim:{stock:[.025,.03,.065],torsoFollow:.9,tuckHem:true}},
 skunk:{kneelDrop:.3706,headPitch:-.875,headYaw:27.516,headPitchSlope:1.472,proneAim:{stock:[.025,.03,.065],torsoFollow:.9,tuckHem:true,tailUpright:true}},
 'pig-foreman':{kneelDrop:.3118,headPitch:-.8,headYaw:11.438,headPitchSlope:.75,bodyYaw:60,stockOffset:[.14,.12,-.035],proneAim:{stock:[.14,.12,-.035],torsoFollow:0,tuckHem:true,hipLift:.10,kneeClearance:.05,headOffset:-.35}},
 'pig-director':{kneelDrop:.3152,headPitch:-.7625,headYaw:21.172,headPitchSlope:.975,bodyYaw:60,stockOffset:[.14,.12,-.035],proneAim:{stock:[.14,.12,-.035],torsoFollow:0,tuckHem:true,hipLift:.13,kneeClearance:.04,headOffset:-.55}},
 rabbit:{kneelDrop:.3706,headPitch:-.8297,headYaw:26.641,headPitchSlope:1.525,proneAim:{stock:[.025,.03,.065],torsoFollow:.9,tuckHem:true}},
 dog:{proneAim:{stock:[.025,.03,.065],torsoFollow:.9,tuckHem:true,pastern:true}}
}[p.id]||{})}));
