// Declared synthetic firing post, exercising the complete production town.
// Only the two actors' starting positions change; their health, weapons, AI and
// the remaining forty-nine guards retain the normal production rules.
import fs from 'node:fs';
import {loadTownTour} from '../../dist/mount-dora-entry.js';
import {getTourWorld} from '../../dist/mount-dora-activity.js';
import {DEFAULT_BUILD,hero,Core} from '../../dist/solo-game.js';
import * as interiors from '../../dist/mission-art/mount-dora-interiors/manifest.js';
const projectURL=new URL('../../../../maps/mount-dora/project.json',import.meta.url),fetcher=async url=>new Response(fs.readFileSync(url));
export async function windowFixture({level=1}={}){
 const state=await loadTownTour({build:{...DEFAULT_BUILD,primary:'assault',utility:'grenade'},fetcher,projectURL}),world=getTourWorld(state),unit=hero(state),guard=state.units.find(u=>u.team==='guard'&&!u.patrol?.length);
 try{
  if(!guard)throw Error('A production standing sentry is required.');
  const visits=level===1?[null]:interiors.BUILDINGS.filter(b=>b.stories>level);
  for(const visit of visits){if(visit)await world.readyAt({x:(visit.bounds[0]+visit.bounds[2])/2,y:(visit.bounds[1]+visit.bounds[3])/2});
  for(const building of world.interiors.buildings.values())for(const window of building.floors[level]?.windows||[]){
   const [dx,dy]=window.outward,player={x:window.x-dx*.5,y:window.y-dy*.5,level,elevation:level*2.12,heading:Core.headingTo({x:0,y:0},{x:dx,y:dy})};
   if(!world.pointClear(player))continue;
   for(const distance of [6.5,9.5,12.5,16.5,20.5,24.5]){
    const target={x:window.x+dx*distance,y:window.y+dy*distance,level:0,elevation:0};
    // This fixture verifies the live guard and the fallen body/ground below.
    // Require both rays; a valid torso shot may still leave the feet behind a sill.
    if(world.interiors.roomAt(target.x,target.y)||!world.pointClear(target)||!world.lineClear({...player,h:level*2.12+1.1},{...target,h:1.1})||!world.lineClear({...player,h:level*2.12+1.1},{...target,h:.12}))continue;
    const cover=[-1,1,-1.5,1.5,-2,2].map(n=>({...player,x:player.x+(window.axis==='s'?n:0),y:player.y+(window.axis==='e'?n:0)})).find(p=>world.pointClear(p)&&world.walkSegment(player,p)&&!world.lineClear({...p,h:level*2.12+1.1},{...target,h:1.1}));
    if(!cover)continue;
    Object.assign(unit,player);Object.assign(guard,target,{heading:Core.headingTo(target,player)});Core.refresh(state,{forceFog:true});
    return {state,world,unit,guard,window,building,cover,setup:{building:building.id,windowId:window.id,player,guard:{id:guard.id,...target,heading:guard.heading},cover}};
   }
  }
  }
  throw Error('No clear upper window and outdoor firing lane found in the production start sectors.');
 }catch(error){world.dispose();throw error;}
}
