import {Vector3} from './aft/tactics/vendor/three.module.js';
import {createCrawlMotion} from './crawl-motion.js';

// Fit the carry once per equipped weapon and release its rig during other poses.
export function createCrawlPose(worker,profile,posture,weapon){
  const motion=createCrawlMotion(worker,profile,posture,weapon==='pistol-offhand'?-1:1);
  motion.suspend();
  return {
    apply(sample){
      const distance=sample.crawlDistance,angle=sample.heading*Math.PI/180;
      // The study translates its root over a course. The field view already
      // places the actor at the simulation's collision-resolved position.
      const position=new Vector3(-distance*Math.cos(angle),0,-distance*Math.sin(angle));
      const state=motion.at(distance,{heading:sample.heading,blend:sample.blend,position});
      return {pose:state.carry,crawl:{distance,phase:state.phase,stride:state.stride,primary:state.primary}};
    },
    suspend:motion.suspend,
    dispose:motion.dispose
  };
}
