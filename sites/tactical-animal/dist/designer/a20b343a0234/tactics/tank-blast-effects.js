// Compatibility entry point for the worn-tank study and live controller.
export {PAINTED_BURST_ATLAS as TANK_BURST_ATLAS,loadPaintedBlastTextures as loadTankBlastTextures,localFireCells,fireCellMask} from './painted-blast-effects.js';
import {createPaintedBlastEffects} from './painted-blast-effects.js';
export function createTankBlastEffects(scene,loader,origin,options={}){
 return createPaintedBlastEffects(scene,loader,origin,{name:'Worn fuel pack rupture',...options});
}
