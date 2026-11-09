import {Core,hero,distance,dressing,tick,objectiveSecured} from '../dist/solo-game.js';

// Only public simulation commands advance this controller: no coordinate,
// health, AP, inventory, door, or objective edits. Also used to prepare browser
// checkpoints reached by playing, rather than manufacturing completed saves.
export function playRoute(state,steps,{onStep=()=>{},onFrame=()=>{}}={}){
  let frames=0;
  const advance=()=>{
    onFrame(state);
    if(++frames>14000)throw Error('Route timed out: '+JSON.stringify({step:steps[0],position:hero(state),phase:state.phase}));
    if(state.solo.status==='lost')throw Error('The animal fell on the route.');
    const unit=hero(state);
    if(state.phase==='enemy'){tick(state,.05);return false;}
    if(state.phase==='player'){
      if(unit.hp<unit.maxHp-30&&state.solo.dressings&&unit.ap>=3&&dressing(state))return false;
      const targets=Core.visibleOpponents(state).filter(guard=>Core.previewAttack(state,unit,guard,true).ok);
      if(targets.length){Core.attack(state,unit,targets[0],true);return false;}
      if(unit.ammo[unit.weapon]<3&&unit.ap>=3&&Core.reload(state,unit))return false;
      if(unit.ap<2){Core.endTurn(state);return false;}
    }
    return true;
  };
  for(const step of steps){
    let done=false;
    while(!done){
      if(!advance())continue;
      const unit=hero(state);
      if(step.action){
        const preview=Core.previewInteraction(state,step.id,step.action);
        if(!preview.ok){if(preview.reason==='Not enough AP.'&&Core.endTurn(state))continue;throw Error(step.id+': '+preview.reason);}
        if(!Core.performInteraction(state,step.id,step.action).ok)throw Error('Action failed: '+step.id);
        done=true;
      }else if(distance(unit,step)<.04){Core.stop(state);done=true;}
      else{
        if(!state.queue.length&&!Core.move(state,unit,step.x,step.y))throw Error('No route: '+JSON.stringify(step));
        const before={x:unit.x,y:unit.y};tick(state,.05);
        if(distance(before,unit)<1e-8&&!state.queue.length){if(state.phase==='player')Core.endTurn(state);else throw Error('Route blocked: '+JSON.stringify(step));}
      }
    }
    onStep(step,state);
  }
  return {frames,secured:objectiveSecured(state)};
}

export const SHORT_MEASURE_ROUTE=[
  {x:4,y:23.2},{id:'supply-chest',action:'open'},{id:'supply-chest',action:'take-all'},
  // The ration scale is solid around its clue anchor (8,20): stand south of it and reach in.
  {x:4.4,y:20},{id:'ration-west',action:'open'},{x:8,y:21},{id:'worker-scale',action:'inspect'},
  {x:10.4,y:20},{id:'ration-east',action:'open'},
  {x:19,y:18.6},{id:'packing-south',action:'open'},{x:19,y:13},
  {x:23.4,y:13},{id:'packing-east',action:'open'},{x:25.6,y:13},
  {x:26.4,y:8},{id:'dispatch-west',action:'open'},{x:32,y:7},
  {id:'shipping-manifest',action:'collect'},
  {x:32,y:10.4},{id:'dispatch-south',action:'open'},{x:32,y:12.6},
  {x:28,y:21},{id:'sealed-load',action:'inspect'},{x:35,y:25},{id:'extraction',action:'extract'},
];

export const SHORT_MEASURE_ALTERNATE=[
  {x:4,y:13},{x:12,y:13},{x:12,y:7},{x:26.4,y:8},
  {id:'dispatch-west',action:'open'},{x:32,y:7},{id:'shipping-manifest',action:'collect'},
  {x:28.6,y:8},{x:26.4,y:8},{x:35,y:25},{id:'extraction',action:'extract'},
];
