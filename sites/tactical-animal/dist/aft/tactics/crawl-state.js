const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);};
export const CRAWL_DURATION=12;
// Authored carrying profiles, not firing poses. Native weapon geometry stays
// unchanged; magazine, scope, belt, tube and tank clearance come from the fit.
export const CRAWL_WEAPONS=Object.freeze(Object.fromEntries(Object.entries({
 hands:{label:'Open-hand crawl',note:'Free hands brace and recover.',stride:1.04,lift:.048,footLift:.038,sway:1.05,curl:-.10,yaw:0,pitch:0,roll:0,twist:0},
 knife:{label:'Knife carried forward',note:'Closed grip; blade held clear of the ground.',stride:.98,lift:.044,footLift:.035,sway:1,curl:-.90,yaw:-.12,pitch:.10,roll:.10,twist:0},
 pistol:{label:'Compact pistol carry',note:'Tucked wrist; muzzle forward with the other forearm free to pull.',stride:.97,lift:.043,footLift:.035,sway:.95,curl:-.80,yaw:-.08,pitch:.08,roll:-.10,twist:0},
 rifle:{label:'Rifle under the forearm',note:'Stock cradled below the arm; barrel across the direction of travel.',stride:1,lift:.045,footLift:.035,sway:1,curl:-.65,yaw:.90,pitch:.035,roll:Math.PI/2,twist:-.55},
 assault:{label:'Assault rifle on its side',note:'Magazine turned out of the dirt; stock clear of the forearm.',stride:.94,lift:.042,footLift:.033,sway:.94,curl:-.72,yaw:.94,pitch:.04,roll:1.52,twist:-.55},
 smg:{label:'Drum-magazine carry',note:'Compact pull with the drum held sideways above the ground.',stride:.92,lift:.040,footLift:.032,sway:.90,curl:-.75,yaw:.96,pitch:.04,roll:1.60,twist:-.55},
 hmg:{label:'Heavy gun cradle',note:'Short pulls and low recovery; receiver and belt supported by the carrying arm.',stride:.74,lift:.030,footLift:.025,sway:.72,curl:-.80,yaw:.92,pitch:.035,roll:1.57,twist:-.60},
 shotgun:{label:'Long shotgun carry',note:'Low stock cradle with the long muzzle kept clear.',stride:.96,lift:.043,footLift:.034,sway:.95,curl:-.70,yaw:.92,pitch:.045,roll:1.54,twist:-.55},
 sniper:{label:'Scoped rifle carry',note:'Steady, shorter pulls with scope and stock away from the face.',stride:.90,lift:.039,footLift:.031,sway:.84,curl:-.70,yaw:.94,pitch:.035,roll:1.60,twist:-.55},
 grenade:{label:'Cupped grenade carry',note:'Closed hand around the casing; safety lever and pin remain intact.',stride:.94,lift:.040,footLift:.032,sway:.90,curl:-.90,yaw:-.08,pitch:.07,roll:.16,twist:0},
 launcher:{label:'Grenade launcher cradle',note:'Shorter pulls; cylinder and foregrip stay above the ground.',stride:.84,lift:.035,footLift:.028,sway:.80,curl:-.78,yaw:.95,pitch:.04,roll:1.57,twist:-.58},
 rpg:{label:'Tube carried lengthwise',note:'Warhead forward; rear venturi kept outside the body.',stride:.82,lift:.034,footLift:.027,sway:.78,curl:-.78,yaw:-.10,pitch:.055,roll:-.04,twist:0},
 flamethrower:{label:'Loaded backpack crawl',note:'Short pulls under the tanks; lance low and hose connected.',stride:.78,lift:.032,footLift:.026,sway:.75,curl:-.78,yaw:-.08,pitch:.055,roll:.02,twist:0}
}).map(([id,profile])=>[id,Object.freeze(profile)])));
export function crawlWeaponProfile(id){const p=CRAWL_WEAPONS[id==='pistol-offhand'?'pistol':id];if(!p)throw Error('No crawl carry for '+id);return p;}
export function validateCrawlSample(distance,options={}){
 const p=options.position||{x:0,y:0,z:0},values=[distance,options.blend??1,options.heading??0,p.x,p.y,p.z];if(!values.every(Number.isFinite))throw Error('Finite crawl travel, blend, heading and position required');if((options.blend??1)<0||(options.blend??1)>1)throw Error('Crawl blend must be between zero and one');
}
// Contact phase follows accepted travel, rather than a wall-clock walking loop.
export function crawlContact(distance,stride,offset=0,{stance=.62,lift=.045}={}){
 const cycles=distance/stride+offset,phase=((cycles%1)+1)%1,recover=(phase-stance)/(1-stance),planted=phase<stance;
 return {phase,planted,x:stride*(planted?.25-phase:.25-stance+stance*smooth(recover)),lift:planted?0:lift*Math.sin(Math.PI*recover)**2};
}
// Two tiles, with a supported pause before and after, and half-second speed ramps.
export function crawlJourney(time,{backward=false}={}){
 const t=Math.max(0,Math.min(CRAWL_DURATION,time)),u=t-1,ramp=.5,duration=8,speed=2/(duration-ramp),sign=backward?-1:1;
 const integral=x=>x<=0?0:x<ramp?x*x/(2*ramp):x<duration-ramp?x-ramp/2:x<duration?duration-ramp-(duration-x)**2/(2*ramp):duration-ramp;
 const blend=u<0||u>duration?0:u<ramp?u/ramp:u>duration-ramp?(duration-u)/ramp:1;
 return {time:t,distance:sign*speed*integral(u),blend,phase:t<1?'Prone rest':t<9?(backward?'Crawl backward':'Crawl forward'):'Settle and observe'};
}
