// Equipment overlay shared by all existing character poses and outfits.
import {weaponExpansionArt} from './weapon-expansion-art.js';
export function drawFlamethrower(ctx,unit,zoom){
 if(weaponExpansionArt(unit.species,unit.weapon,unit.stance||'standing',unit.outfit==='red-hats'?'red-hats':'normal'))return;
 if(['grenade','launcher','rpg'].includes(unit.weapon)){drawExplosiveWeapon(ctx,unit,zoom);return;}
 if(unit.weapon!=='flamethrower')return;
 const stance=unit.stance||'standing',y=stance==='prone'?-16:stance==='kneeling'?-29:-42;
 ctx.save();ctx.scale(zoom,zoom);ctx.lineJoin='round';ctx.lineCap='round';
 ctx.strokeStyle='#272c20';ctx.lineWidth=2;
 for(const x of [-19,-11]){ctx.fillStyle='#75744a';ctx.beginPath();ctx.roundRect(x,y-4,8,22,3);ctx.fill();ctx.stroke();ctx.fillStyle='#b1924d';ctx.fillRect(x+1,y+5,6,3);}
 ctx.strokeStyle='#272720';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-10,y+16);ctx.quadraticCurveTo(1,y+27,10,y+10);ctx.stroke();
 ctx.strokeStyle='#9c9b76';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,y+8);ctx.lineTo(25,y+2);ctx.stroke();
 ctx.strokeStyle='#33372c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(4,y+8);ctx.lineTo(3,y+15);ctx.moveTo(20,y);ctx.lineTo(23,y+6);ctx.stroke();
 ctx.fillStyle='#efaa41';ctx.beginPath();ctx.arc(27,y+3,2,0,Math.PI*2);ctx.fill();ctx.restore();
}

function drawExplosiveWeapon(ctx,u,zoom){
 const y=u.stance==='prone'?-15:u.stance==='kneeling'?-28:-42;
 ctx.save();ctx.scale(zoom,zoom);ctx.translate(4,y);ctx.rotate(-.18);ctx.strokeStyle='#252a20';ctx.lineWidth=2;
 if(u.weapon==='grenade'){ctx.fillStyle='#7c8650';ctx.beginPath();ctx.ellipse(8,6,5,7,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#ddd1a1';ctx.beginPath();ctx.arc(9,-3,3,0,Math.PI*2);ctx.stroke();}
 else {ctx.fillStyle=u.weapon==='rpg'?'#777c46':'#676e64';ctx.fillRect(-18,0,48,7);ctx.strokeRect(-18,0,48,7);ctx.fillStyle='#67492e';ctx.fillRect(-9,7,5,10);ctx.strokeRect(-9,7,5,10);if(u.weapon==='rpg'){ctx.fillStyle='#a5a36b';ctx.beginPath();ctx.moveTo(21,-3);ctx.lineTo(39,3);ctx.lineTo(21,10);ctx.closePath();ctx.fill();ctx.stroke();}else{ctx.fillStyle='#2b3229';ctx.fillRect(24,1,7,5);}}
 ctx.restore();
}
