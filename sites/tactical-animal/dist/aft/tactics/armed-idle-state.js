import {WEAPON_MODELS} from './weapon-models.js';

export const IDLE_MOODS={guard:{label:'Guard',duration:12},mercenary:{label:'Mercenary',duration:16}};
export const IDLE_KEYS=[{u:0,label:'Rest'},{u:.20,label:'Glance left'},{u:.40,label:'Shift weight'},{u:.60,label:'Glance right'},{u:.79,label:'Settle the grip'},{u:1,label:'Return to rest'}];
export const IDLE_LOADS={hands:[0,0],knife:[.3,0],pistol:[.9,0],grenade:[.5,0],rifle:[4,0],assault:[4.3,0],smg:[5.5,0],shotgun:[3.5,0],sniper:[5.1,0],launcher:[5.3,0],hmg:[12,0],rpg:[7,0],flamethrower:[3,18]};
const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);};
function curve(u,rows){let i=1;while(i<rows.length-1&&u>rows[i][0])i++;const a=rows[i-1],b=rows[i],t=ease((u-a[0])/(b[0]-a[0]));return a[1]+(b[1]-a[1])*t;}
export function idleState(time,{mood='guard',weapon='rifle',animal='horse',phase=0}={}){
 if(!Number.isFinite(time)||!Number.isFinite(phase))throw Error('Idle time and phase must be finite');
 if(!IDLE_MOODS[mood]||!WEAPON_MODELS[weapon])throw Error('Unsupported idle mood or weapon');
 const duration=IDLE_MOODS[mood].duration,u=((time/duration+phase)%1+1)%1,relaxed=mood==='mercenary',heavy=['hmg','rpg','flamethrower'].includes(weapon),bird=animal==='hen',pig=animal.startsWith('pig-');
 const weight=curve(u,[[0,0],[.16,0],[.35,1],[.45,1],[.68,-.55],[.76,-.55],[.96,0],[1,0]]);
 const look=curve(u,[[0,0],[.07,0],[.17,1],[.24,1],[.33,0],[.45,0],[.56,-1],[.63,-1],[.72,0],[1,0]]);
 const follow=curve(u,[[0,0],[.17,0],[.24,1],[.30,1],[.39,0],[.56,0],[.63,-1],[.68,-1],[.76,0],[1,0]]);
 const adjust=curve(u,[[0,0],[.73,0],[.79,1],[.84,1],[.93,0],[1,0]]),breath=Math.sin(3*Math.PI*u)**2;
 return {time,u,duration,mood,weapon,weight,look,follow,adjust,
  shift:(relaxed?.032:.021)*(heavy?.70:1)*(bird?.70:1)*weight,
  drop:((relaxed?.012:.008)+(pig?.004:0))*weight*weight,
  chestYaw:(relaxed?.065:.042)*(heavy?.6:1)*follow,
  headYaw:(weapon==='rpg'?.17:bird?.32:relaxed?.42:.32)*look,
  headPitch:-(relaxed?.09:.035)*adjust,
  lift:(heavy?.004:.011)*adjust,
  breathe:.0025*breath,
  phase:IDLE_KEYS.reduce((last,k)=>u>=k.u?k.label:last,'Rest')};
}
