import {HOUSE_ROOMS,HOUSE_DOORS} from '../../sites/tactical-animal/dist/mission-art/donnelly-house/source/packages/mount-dora-core/donnelly-layout.js';

export const DONNELLY_ID='osm-way-547799531';
export const DONNELLY_LAYOUT='donnelly-v1';
export const DONNELLY_REVISION='18e6d5c155a30c645d6bf0fa068a2896bd26768e';
// Independent main/wing fits retain every original footprint cell. The smaller
// service wing has a different north/south span from the main two-storey body.
// These are gameplay dimensions, not new geographic observations.
export function donnellyRooms(mask,level,runs){
  const source=HOUSE_ROOMS.filter(r=>r.level===level),groups=new Map(source.map(r=>[r.id,[]]));
  for(const cell of mask.values()){
    const {x,y}=cell,wing=x<393&&y<483;
    const u=wing?x-386.5:Math.max(6.01,Math.min(15.99,6+(x-392.5)/15*10));
    const v=wing?y-469.5:(y-469.5)/16*12;
    let room=source.find(r=>u>=r.bounds[0]&&u<r.bounds[2]&&v>=r.bounds[1]&&v<r.bounds[3]);
    // The mapped eastern bay remains part of the front parlor/principal chamber.
    if(!room)throw Error('Donnelly fit has no room at '+x+','+y+' on '+level);
    groups.get(room.id).push({...cell,room:/^[GU]05$/.test(room.id)?'rhall':'r'+room.id});
  }
  const cells=new Map(),rooms=[];
  for(const r of source){const group=groups.get(r.id);if(!group.length)throw Error('Donnelly room was lost: '+r.id);for(const c of group)cells.set(c.x+','+c.y,c);rooms.push({id:group[0].room,name:r.label,sourceRoom:r.id,runs:runs(group)});}
  return {cells,rooms};
}
export const donnellyDoorOrder=level=>HOUSE_DOORS.filter(d=>d.level===level);
export function donnellyRoof(){
  const spec=(id,x,y,width,depth,style,axis,pitch)=>({id:'donnelly-'+id,x,y,width,depth,z:2,style,axis,pitch,overhang:.18,material:'metal',seed:1401});
  return {
    surfaces:[spec('main',392.5,469.5,15,16,'hip','y',Math.atan(Math.tan(42*Math.PI/180)*10/15)*180/Math.PI),spec('rear',386.5,473.5,6,9,'hip','y',36),spec('front-large',401.5,470.8,6,6.4,'gable','x',46),spec('front-small',402,479.9,7.5,3.2,'gable','x',43)],
    turret:{centre:[406,484],radius:1.5,sides:6,base:4.24,drumTop:6.36,rings:[[0,1.65],[.18,1.65],[.5,1.53],[1.2,1.3],[1.9,.95],[2.4,.55],[2.6,.18],[2.8,0]]},
    attic:'closed; no playable third floor',
  };
}
