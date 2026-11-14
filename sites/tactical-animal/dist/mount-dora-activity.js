// Map-owned exploration entry. Editor squad/travel anchors are never gameplay.
export const TOUR_ID='mount-dora';
export const TOUR_ACTIVITY=Object.freeze({
  id:TOUR_ID,layoutVersion:1,exploration:true,title:'Mount Dora walking tour',name:'Mount Dora',
  location:'MOUNT DORA / DOWNTOWN & LAKEFRONT',bounds:{x:0,y:0,w:1440,h:1680},spawn:{x:459,y:500,heading:0},
  briefing:'Explore downtown Mount Dora and the lakefront with your chosen animal and equipment. Enter fictional ground-floor interiors using the hand control at doors. Sentries watch streets, patrol neighborhoods and hold posts. Sneak past them or engage at your own pace.',
  steps:['Move with the joystick, WASD or arrow keys.','Watch where sentries turn on street patrols and local circuits.','Use Options to visit a landmark or return to your loadout. Your tour has its own save.'],
  objective:null,extraction:null,rooms:[],cover:[],guards:[],containers:[],clues:[]
});
export const townToGame=p=>({x:p.x-.5,y:p.y-.5});
export const gameToTown=p=>({x:p.x+.5,y:p.y+.5});
export const isTour=s=>s?.solo?.missionId===TOUR_ID;
const worlds=new WeakMap();
export const getTourWorld=s=>worlds.get(s);
export function bindTourWorld(s,world){worlds.set(s,world);world.bind(s);return s;}
