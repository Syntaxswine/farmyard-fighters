import {WALL_DIMENSIONS} from './world-dimensions.js';
import {DEFAULT_MISSION_ID,missionForState,missionInteractables,objectiveSecured} from './missions.js';
export {missionInteractables} from './missions.js';

// The open leaf stays solid, tucked along the inside of its doorway.
export function doorFootprint(object,open=object.open){
  const {length,thickness,height}=WALL_DIMENSIONS,half=length/2,t=thickness/2;
  const swing=object.swing??1;
  if(object.edge?.startsWith('s:'))return open?
    {x0:object.x-half-t,x1:object.x-half+t,y0:Math.min(object.y,object.y+swing*length),y1:Math.max(object.y,object.y+swing*length),height}:
    {x0:object.x-half,x1:object.x+half,y0:object.y-t,y1:object.y+t,height};
  return open?{x0:Math.min(object.x,object.x+swing*length),x1:Math.max(object.x,object.x+swing*length),y0:object.y-half-t,y1:object.y-half+t,height}:
    {x0:object.x-t,x1:object.x+t,y0:object.y-half,y1:object.y+half,height};
}

export function interactionFootprint(object){
  if(object.kind==='door')return doorFootprint(object);
  if(object.kind==='chest')return {x0:object.x-.45,x1:object.x+.45,y0:object.y-.4,y1:object.y+.4,height:.75};
  return null;
}

export function isInactiveLoot(object){
  const container=object.kind==='chest'||object.kind==='body';
  const reusable=object.kind==='chest'&&object.reusable===true;
  return container&&!reusable&&!object.inventory?.length;
}

// Keep a usable selection until it leaves reach. Explicit object taps override it.
export function selectInteractionTarget(candidates,currentId=null){
  return candidates.find(object=>object.id===currentId)||[...candidates].sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id))[0]||null;
}

export function createInteractionSystem({hero,canControl,combatCosts,distance,geometry,blocksWalking=()=>true,pointBoxDistance,refresh,stop,log,clearGeometry,weapons,radius}){
  const epsilon=1e-7;
  function registerBody(state,unit){
    if(unit.team!=='guard'||unit.hp>0||state.interactables.some(object=>object.id==='body:'+unit.id))return;
    const kinds=[...new Set([unit.weapon,...(unit.pack||[]).filter(i=>i.type==='weapon').map(i=>i.kind)])].filter(kind=>kind!=='hands'&&weapons[kind]&&!(unit.tanksExploded&&kind==='flamethrower'));
    const inventory=kinds.map((kind,index)=>({id:index?'weapon:'+kind:'weapon',type:'weapon',kind,rounds:unit.ammo[kind]||0,condition:unit.pack?.find(i=>i.type==='weapon'&&i.kind===kind)?.condition??100}));
    for(const [kind,quantity] of Object.entries(unit.ammoPouch||{}))if(quantity>0&&!(unit.tanksExploded&&kind==='flamethrower'))inventory.push({id:'ammo:'+kind,type:'ammo',kind,quantity});
    state.interactables.push({id:'body:'+unit.id,kind:'body',unitId:unit.id,name:unit.name+' · fallen guard',range:1.7,searched:false,inventory});
  }
  function objects(state){
    const result=state.interactables.map(object=>{
      if(object.kind!=='body')return object;
      const unit=state.units.find(unit=>unit.id===object.unitId);
      return unit&&unit.hp<=0?{...object,x:unit.x,y:unit.y}:null;
    }).filter(Boolean);
    const mission=missionForState(state);
    if(mission.exploration)return result;
    if(!objectiveSecured(state))result.push({...mission.objective,inventory:[]});
    result.push({...mission.extraction,id:'extraction',kind:'extract',inventory:[]});
    return result;
  }
  function accessible(state,object){
    const unit=hero(state);
    if(!canControl(state,unit)||distance(unit,object)>object.range+epsilon)return false;
    if(object.kind==='extract'&&!objectiveSecured(state))return false;
    // Use the movement system's rounded clearance, including around corners.
    // The target's own footprint is the only solid object we may reach into.
    // Reach sweeps a body across the ground, so it asks what walking asks.
    const blockers=geometry(state).filter(box=>box.interactionId!==object.id&&blocksWalking(box)),steps=Math.max(1,Math.ceil(distance(unit,object)/.1));
    for(let i=0;i<=steps;i++){
      const point={x:unit.x+(object.x-unit.x)*i/steps,y:unit.y+(object.y-unit.y)*i/steps};
      if(blockers.some(box=>pointBoxDistance(point,box)<radius-epsilon))return false;
    }
    return true;
  }
  function cost(state,base){return combatCosts(state)?base:0;}
  function actions(state,object){
    if(isInactiveLoot(object))return [];
    const action=(id,label,base)=>({id,label,cost:cost(state,base)});
    if(object.kind==='door')return [action(object.open?'close':'open',object.open?'Close':'Open',1)];
    if(object.kind==='chest')return object.open?
      [action('loot','Loot',0),action('close','Close',1)]:[action('open','Open',2)];
    if(object.kind==='body')return [action(object.searched?'loot':'search',object.searched?'Loot':'Search',object.searched?0:2)];
    if(object.kind==='clue')return [{id:'inspect',label:'Inspect',cost:0}];
    return [action(object.kind==='extract'?'extract':'collect',object.kind==='extract'?'Extract':'Collect',object.kind==='extract'?0:object.cost)];
  }
  function preview(state,id,actionId,itemId=null){
    const object=objects(state).find(object=>object.id===id),unit=hero(state);
    const available=object?actions(state,object):[];
    let action=available.find(action=>action.id===actionId),reason='';
    if(object&&['take','take-all'].includes(actionId)&&object.searched&&(object.kind==='body'||object.open))action={id:actionId,label:actionId==='take-all'?'Take all':'Take',cost:cost(state,1)};
    if(!object||!action)reason='That action is no longer available.';
    else if(!canControl(state,unit))reason='Wait for your turn.';
    else if(object.kind==='extract'&&!objectiveSecured(state))reason='Secure the '+missionForState(state).objective.name.toLowerCase()+' first.';
    else if(!accessible(state,object))reason='Move within clear reach of the object.';
    else if(['take','take-all'].includes(actionId)&&(!object.inventory.length||actionId==='take'&&!object.inventory.some(item=>item.id===itemId)))reason='There is nothing to take.';
    else if(object.kind==='door'&&['open','close'].includes(actionId)&&state.units.some(other=>other.hp>0&&pointBoxDistance(other,doorFootprint(object,actionId==='open'))<radius+epsilon))reason='Someone is in the doorway.';
    else if(unit.ap+epsilon<action.cost)reason='Not enough AP.';
    return {ok:!reason,reason,cost:action?.cost||0,action,object};
  }
  function nearby(state){
    return objects(state).flatMap(object=>{
      const available=actions(state,object);
      if(!available.length||!accessible(state,object))return [];
      return [{...object,distance:distance(hero(state),object),actions:available.map(action=>({...action,...preview(state,object.id,action.id),object:undefined}))}];
    });
  }
  function addItem(state,item){
    const unit=hero(state);
    if(item.type==='ammo')unit.ammoPouch[item.kind]=(unit.ammoPouch[item.kind]||0)+item.quantity;
    else if(item.type==='dressing')state.solo.dressings+=item.quantity;
    else if(item.type==='grenade'){
      unit.ammo.grenade=(unit.ammo.grenade||0)+item.quantity;
      if(!unit.pack.some(entry=>entry.kind==='grenade'))unit.pack.push({type:'weapon',kind:'grenade',rounds:0,condition:100});
    }else if(unit.pack.some(entry=>entry.kind===item.kind))unit.ammoPouch[item.kind]=(unit.ammoPouch[item.kind]||0)+item.rounds;
    else{
      unit.pack.push({type:'weapon',kind:item.kind,rounds:item.rounds,condition:item.condition});
      unit.ammo[item.kind]=item.rounds;
    }
  }
  function perform(state,id,actionId,itemId=null){
    const check=preview(state,id,actionId,itemId);
    if(!check.ok)return {ok:false,reason:check.reason};
    const object=check.object,stored=state.interactables.find(entry=>entry.id===id),unit=hero(state);
    stop(state);unit.ap=Math.max(0,unit.ap-check.cost);
    let loot=false,message=null;
    if(object.kind==='door'){
      stored.open=actionId==='open';state.edges[object.edge]=stored.open?'door':'closed-door';
      log(state,`${stored.open?'Opened':'Closed'} the ${object.name.toLowerCase()} (${check.cost} AP).`);
    }else if(actionId==='open'||actionId==='search'){
      if(object.kind==='chest')stored.open=true;
      stored.searched=true;loot=true;log(state,`${actionId==='open'?'Opened':'Searched'} ${object.name} (${check.cost} AP).`);
    }else if(actionId==='close'){
      stored.open=false;log(state,`Closed ${object.name} (${check.cost} AP).`);
    }else if(actionId==='loot')loot=true;
    else if(actionId==='take'||actionId==='take-all'){
      const items=stored.inventory.filter(item=>actionId==='take-all'||item.id===itemId);
      for(const item of items)addItem(state,item);
      stored.inventory=stored.inventory.filter(item=>!items.includes(item));loot=!isInactiveLoot(stored);
      log(state,`Took ${actionId==='take-all'?'all items':'an item'} from ${object.name} (${check.cost} AP).`);
    }else if(actionId==='collect'){
      const mission=missionForState(state);state.solo.objectives[mission.objective.id]=true;
      if(mission.id===DEFAULT_MISSION_ID)state.solo.ledger=true;
      message=mission.objective.collected;log(state,message);log(state,mission.objective.after);
    }else if(actionId==='inspect'){
      if(!state.solo.inspected.includes(object.id))state.solo.inspected.push(object.id);
      message=object.text;log(state,message);
    }else if(actionId==='extract'){
      state.solo.status='extracted';log(state,missionForState(state).result.epilogue);
    }
    clearGeometry(state);refresh(state,{forceFog:true});
    return {ok:true,loot,targetId:id,message,name:object.name};
  }
  function restore(state){
    if(state.interactables===undefined){
      if(missionForState(state).id!==DEFAULT_MISSION_ID)throw Error('This operation is missing its saved objects.');
      state.interactables=missionInteractables({legacy:true});
      // Existing saves retain their passable doorway. Avoid placing a newly
      // introduced solid chest on top of an animal's saved position.
      const chest=state.interactables.find(object=>object.kind==='chest');
      for(const point of [{x:5.5,y:22.5},{x:4,y:22.5},{x:3,y:24}]){
        Object.assign(chest,point);
        if(!state.units.some(unit=>unit.hp>0&&pointBoxDistance(unit,interactionFootprint(chest))<radius))break;
      }
    }
    if(!Array.isArray(state.interactables))throw Error('Unsupported interaction save.');
    const ids=new Set();
    for(const object of state.interactables){
      if(!object||typeof object.id!=='string'||ids.has(object.id)||!['door','chest','body','clue'].includes(object.kind)||!Number.isFinite(object.range)||object.range<=0||!Array.isArray(object.inventory))throw Error('Unsupported interaction save.');
      ids.add(object.id);
      if(object.kind==='body'){
        if(!state.units.some(unit=>unit.id===object.unitId&&unit.team==='guard'&&unit.hp<=0))throw Error('Unsupported body save.');
      }else if(!Number.isFinite(object.x)||!Number.isFinite(object.y)||object.kind!=='clue'&&typeof object.open!=='boolean')throw Error('Unsupported object save.');
      if(object.kind==='door'&&(!/^[es]:\d+:\d+$/.test(object.edge)||!Object.hasOwn(state.edges,object.edge)||object.swing!==undefined&&![-1,1].includes(object.swing)))throw Error('Unsupported door save.');
      if(['chest','body'].includes(object.kind)&&typeof object.searched!=='boolean')throw Error('Unsupported container save.');
      if(object.kind==='clue'&&(typeof object.text!=='string'||!missionForState(state).clues.some(clue=>clue.id===object.id)))throw Error('Unsupported clue save.');
      const itemIds=new Set();
      for(const item of object.inventory){
        if(!item||typeof item.id!=='string'||itemIds.has(item.id)||!['ammo','weapon','dressing','grenade'].includes(item.type))throw Error('Unsupported loot save.');
        itemIds.add(item.id);
        if(['weapon','ammo'].includes(item.type)&&!Object.hasOwn(weapons,item.kind))throw Error('Unknown loot weapon.');
        if(item.type==='weapon'? !Number.isInteger(item.rounds)||item.rounds<0||!Number.isFinite(item.condition):!Number.isInteger(item.quantity)||item.quantity<1)throw Error('Unsupported loot quantity.');
      }
      if(object.kind==='door')state.edges[object.edge]=object.open?'door':'closed-door';
    }
    for(const unit of state.units)registerBody(state,unit);
    clearGeometry(state);
    return state;
  }
  return {objects,nearby,preview,perform,registerBody,restore};
}
