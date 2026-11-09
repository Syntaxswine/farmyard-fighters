import {createHash} from 'node:crypto';

// Seeded random play through the public simulation commands, hashing the full
// state after every command: the save, visible opponents, attack previews and
// nearby interactions. Pass the solo-game module so the same run can be played
// against another checkout (the baseline was recorded from origin/main).
const PRIMARIES=['assault','rifle','smg','shotgun','sniper','hmg','flamethrower','rpg'];
function rng(seed){let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function digest(M,s){
  const u=M.hero(s),guards=s.units.filter(g=>g.team==='guard');
  const attacks=guards.map(g=>{const p=M.Core.previewAttack(s,u,g);return [g.id,p.ok,p.reason,p.chance,p.cover];});
  const near=M.Core.nearbyInteractions(s).map(o=>o.id+':'+o.actions.map(a=>a.id+(a.ok?'+':'-')+a.reason).join(','));
  const flame=u.weapon==='flamethrower'?JSON.stringify(M.Core.previewFlame(s,u,u.heading)):'';
  return M.encodeSave(s)+'|'+JSON.stringify({visible:M.Core.visibleOpponents(s).map(g=>g.id),attacks,near})+'|'+flame;
}
export function fuzzRun(M,missionId,seed,steps){
  const r=rng(seed*7919),build={animal:'rifleman',primary:PRIMARIES[seed%PRIMARIES.length],secondary:'pistol',utility:seed%2?'grenade':'dressing'};
  const s=M.createSoloGame(build,1947+seed,missionId);let hash='';
  for(let step=0;step<steps;step++){
    const roll=r(),u=M.hero(s);
    if(roll<.45){const angle=r()*Math.PI*2,n=1+Math.floor(r()*30);for(let i=0;i<n;i++)M.tick(s,.05,{x:Math.cos(angle),y:Math.sin(angle)});}
    else if(roll<.55)M.Core.setStance(s,u,['standing','kneeling','prone'][Math.floor(r()*3)]);
    else if(roll<.65){const index=Math.floor(r()*4),burst=r()<.5,guards=s.units.filter(g=>g.team==='guard'),g=guards[index%Math.max(1,guards.length)];if(g)M.Core.attack(s,u,g,burst);}
    else if(roll<.72){const dx=(r()-.5)*24,dy=(r()-.5)*24;if(u.ammo.grenade>0)M.Core.throwGrenade(s,u,{x:u.x+dx,y:u.y+dy});}
    else if(roll<.78){const heading=r()*360;if(u.pack.some(i=>i.kind==='flamethrower')){if(u.weapon!=='flamethrower')M.Core.equip(s,u,'flamethrower');M.Core.fireFlame(s,u,heading);}}
    else if(roll<.84){M.Core.endTurn(s);for(let i=0;i<400&&s.phase==='enemy';i++)M.tick(s,.05);}
    else if(roll<.94){const dx=(r()-.5)*30,dy=(r()-.5)*30;if(M.Core.move(s,u,u.x+dx,u.y+dy))for(let i=0;i<120&&s.queue.length;i++)M.tick(s,.05);}
    else{const pick=r(),near=M.Core.nearbyInteractions(s);if(near.length){const o=near[Math.floor(pick*near.length)],act=o.actions.find(a=>a.ok);if(act)M.Core.performInteraction(s,o.id,act.id);}}
    for(let i=0;i<400&&s.phase==='enemy';i++)M.tick(s,.05);
    hash=createHash('sha256').update(hash+digest(M,s)).digest('hex');
  }
  return hash;
}
