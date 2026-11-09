import {ANIMAL_MOTION_CATALOG} from './animal-motion-catalog.js';
import {createBattlePosture} from './battle-posture.js';
import {createWorkerLocomotion} from './worker-locomotion.js';
import {createLadderJourney} from './ladder-journey.js';
import {ladderFrame} from './battle-traversal.js';
import {towerEntry,towerSlots,towerPost} from './tower-geometry.js';
import {exportLadderRoutes,clearLadderRoutes} from './ladder-motion.js';
let queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.then(()=>prepare(data));};
async function prepare({key,species,kind}){
 self.postMessage({key,started:true});
 let worker,locomotion,journey;
 try{
  const profile=ANIMAL_MOTION_CATALOG.find(p=>p.id===species);if(!profile)throw Error('Unknown ladder species');
  const response=await fetch(new URL(profile.file,import.meta.url));if(!response.ok)throw Error('Cannot prepare ladder model');
  worker=profile.create(await response.json());createBattlePosture(worker,profile);locomotion=createWorkerLocomotion(worker,profile);
  const tower={kind,x:10,y:10,z:0},from=towerEntry(tower),to=towerSlots(tower)[0];to.towerPost=towerPost(tower,to);
  clearLadderRoutes();journey=createLadderJourney(worker,profile,{tower,direction:'up',from,to},ladderFrame(tower));
  self.postMessage({key,routes:exportLadderRoutes()});
 }catch(error){self.postMessage({key,error:error.message});}
 finally{journey?.dispose();locomotion?.dispose();worker?.dispose();clearLadderRoutes();}
}
