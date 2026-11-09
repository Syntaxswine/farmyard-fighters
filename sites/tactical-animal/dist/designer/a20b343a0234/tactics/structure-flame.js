import {insideFlame} from './flame-cone.js';
import {planStructureBlast,commitStructureDamage} from './structure-damage.js';

// A direct spray damages timber. Metal and masonry need projectile or blast
// damage; this is a single committed attack, not render-frame fire damage.
export const planFlameStructureDamage=(s,shape,damage)=>planStructureBlast(s,shape.origin,shape.range,()=>damage,{spacing:3,accept:(info,p)=>info.material==='thin'&&p.h>=shape.base-.15&&p.h<=shape.base+2.7&&insideFlame(shape,p)});
export const flameStructureDamage=(s,shape,damage)=>commitStructureDamage(s,planFlameStructureDamage(s,shape,damage));
