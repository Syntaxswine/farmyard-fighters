import {ANIMALS,DEFAULT_BUILD,createSoloGame,hero,Core,decodeSave,encodeSave} from '../dist/solo-game.js';

export const flameCases=ANIMALS.flatMap(animal=>['standing','kneeling','prone'].flatMap(stance=>['open','wall','fog'].map(scene=>({animal:animal.id,stance,scene}))));
export function flameScenario({animal='heavy',stance='standing',scene='open'}={}){
  let state=createSoloGame({...DEFAULT_BUILD,animal,primary:'flamethrower'});
  const unit=hero(state);Object.assign(unit,{x:4,y:25,ap:20,stance});
  const [target,near,protectedGuard]=state.units.slice(1);
  Object.assign(target,{x:8,y:25,hp:600,stance:'standing',alert:true});
  Object.assign(near,{x:9,y:26,hp:35,stance:'prone',alert:true});
  Object.assign(protectedGuard,{x:10,y:23,hp:600,stance:'standing',alert:true});
  if(scene==='wall')state.edges['s:9:23']='wall';
  state.phase='player';state.engaged=true;state.seed=47291;
  state=decodeSave(encodeSave(state));Core.refresh(state,{forceFog:true});
  if(scene==='fog')for(let y=24;y<=26;y++)state.visible.delete(`7,${y}`);
  return {state,unit:hero(state),target:state.units[1]};
}
export function gameplayReceipt(state){
  return {phase:state.phase,round:state.round,seed:state.seed,log:state.log,units:state.units.map(unit=>({id:unit.id,x:unit.x,y:unit.y,hp:unit.hp,ap:unit.ap,ammo:unit.ammo,ammoPouch:unit.ammoPouch,heading:unit.heading,stance:unit.stance,casualty:unit.casualty,alert:unit.alert,lastKnown:unit.lastKnown})),interactables:state.interactables,seen:[...state.seen],visible:[...state.visible],detected:[...state.detected]};
}
