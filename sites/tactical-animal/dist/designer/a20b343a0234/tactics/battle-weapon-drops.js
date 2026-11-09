import {createCasualtyWeaponSnapshot} from './casualty-weapon-assembly.js';
import {personVisible} from './battle-visibility.js';
import {shotVisible} from './shot-coordinates.js';
import {unitBaseHeight} from './tower-geometry.js';
import {DIMENSIONS} from './hybrid-world.js';
import {handWeapons} from './one-handed.js';

export const WEAPON_DROP_ACTORS=2;
// The engine keeps the only real inventory/loot item. These proxies cannot be
// picked, never roll loot and cannot keep a combat action busy.
export class BattleWeaponDrops {
 constructor(scene,{onError=()=>{}}={}){this.scene=scene;this.onError=onError;this.actors=new Map();this.seen=new Map();}
 beforeActor(unit,model,state,now){
  const definition=state.definition;
  if(this.definition&&this.definition!==definition)this.clear();this.definition=definition;
  const prior=this.seen.get(unit.id),alive=unit.hp>0;
  this.seen.set(unit.id,{alive,model,weapon:unit.weapon,hands:handWeapons(unit)});
  if(alive){this.remove(unit.id);return;}
  if(!prior?.alive||prior.model!==model||!personVisible(state,unit)||unit.burnedRemains||unit.burningTurns)return;
  this.remove(unit.id);if(this.actors.size>=WEAPON_DROP_ACTORS)this.remove(this.actors.keys().next().value);
  const entries=[],pile=state.loot?.find(p=>p.body===unit.id);
  for(const [i,weapon]of [model.equipment,model.offhand?.gun].entries()){
   if(!weapon||!weapon.root.visible)continue;
   const kind=prior.hands[i]||prior.weapon,item=pile?.items.find(p=>p.type==='weapon'&&p.kind===kind)||unit.pack?.find(p=>p.type==='weapon'&&p.kind===kind);
   try{const visual=createCasualtyWeaponSnapshot(weapon,{floor:unitBaseHeight(unit,DIMENSIONS.floorSpacing)});if(!visual)continue;this.scene.add(visual.root);entries.push({visual,item,kind});}
   catch(error){this.onError('Weapon release kept its ordinary fallback: '+error.message);}
  }
  if(entries.length)this.actors.set(unit.id,{unitId:unit.id,entries,start:now});
 }
 afterActor(unit,model){if(unit.hp>0||unit.burnedRemains||unit.burningTurns)return;for(const weapon of [model.equipment,model.offhand?.gun])for(const root of [weapon?.root,weapon?.mount,weapon?.hose])if(root)root.visible=false;}
 update(state,now){
  for(const [id,actor]of this.actors){const unit=state.units.find(u=>u.id===id);if(!unit||unit.hp>0||!personVisible(state,unit)){this.remove(id);continue;}
   actor.entries=actor.entries.filter(entry=>{const owned=!entry.item||unit.pack?.includes(entry.item)||state.loot?.some(p=>p.body===id&&p.items.includes(entry.item)),result=entry.visual.update((now-actor.start)/1000);if(!owned||result.phase==='retired'){entry.visual.dispose();return false;}entry.visual.root.visible=result.visible&&shotVisible(state,{x:result.position[0],y:result.position[1],z:result.position[2],shotLevel:unit.cliffSupport?.level??unit.z??0});return true;});
   if(!actor.entries.length)this.remove(id);
  }
  // Forget hidden actors so discovery or rebuilding never replays an old fall.
  for(const id of this.seen.keys())if(!state.units.some(u=>u.id===id&&personVisible(state,u)))this.seen.delete(id);
 }
 remove(id){const actor=this.actors.get(id);if(actor)for(const e of actor.entries)e.visual.dispose();this.actors.delete(id);}
 clear(){for(const id of this.actors.keys())this.remove(id);this.seen.clear();}
 dispose(){this.clear();}
}
