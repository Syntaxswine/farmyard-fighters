// A reachable gameplay fixture, also used by the existing editor's Playtest.
export const WINDOW_REVIEW_ID='window-yard';
export const WINDOW_REVIEW_MISSION={
  id:WINDOW_REVIEW_ID,title:'Window proving yard',name:'Window proving yard',location:'WINDOW WORKSHOP',bounds:{x:0,y:0,w:240,h:240},
  briefing:'Test plain and divided windows. Large borderless sheets stand north of the small target frames: 20 m × 5 m and 20 m × 10.6 m (five storeys), plus an independent repeated sheet. The first accepted hit breaks a whole sheet; later rounds pass through the hole. Frames and lower walls remain solid.',
  spawn:{x:20,y:25,heading:270},objective:{id:'window-notes',kind:'objective',name:'Workshop notes',x:20,y:25,range:1,cost:0,instruction:'Review the windows, then collect the workshop notes.',after:'Return to the field marker.',collected:'Window review complete.'},
  extraction:{x:20,y:26,name:'Field marker',label:'Finish window review',range:1},steps:['Break a plain pane.','Break one divided pane.','Save and return.'],rooms:[],cover:[],containers:[],clues:[],
  guards:[{name:'Glass target',species:'pig-foreman',weapon:'pistol',x:20,y:19,heading:270},{name:'Divided target',species:'goat',weapon:'pistol',x:25,y:19,heading:270}],
  result:{title:'Review complete.',summary:'tested the workshop windows.',epilogue:'The authored map can be exported from the map designer.'},
};
export function windowReviewSource(){
  const instances=[
    {id:'clear-a',definitionId:'window.full.clear.3m',x:20,y:21.5,rotation:0},
    {id:'grid-a',definitionId:'window.full.grid-3x2.3m',x:25,y:21.5,rotation:0},
    {id:'waist-clear',definitionId:'window.waist.clear.2m',x:19.5,y:28.5,rotation:180},
    {id:'waist-grid',definitionId:'window.waist.grid-2x2.2m',x:24.5,y:28.5,rotation:180},
    {id:'clear-b',definitionId:'window.full.clear.3m',x:16.5,y:24,rotation:90},
    {id:'seam-grid',definitionId:'window.waist.vertical-3.3m',x:29.5,y:24,rotation:270},
    {id:'borderless-five-storeys',definitionId:'window.full.borderless',x:24.5,y:12.5,rotation:0,dimensions:{width:20,height:10.6}},
    {id:'borderless-five-metres',definitionId:'window.full.borderless',x:24.5,y:7.5,rotation:0,dimensions:{width:20,height:5}},
    {id:'borderless-repeat',definitionId:'window.full.borderless',x:24.5,y:3.5,rotation:0,dimensions:{width:20,height:10.6}},
  ];
  const edges={'s:18:21':'wall-brick','s:22:21':'wall-brick','s:23:21':'wall-brick','s:27:21':'wall-brick'};
  // Deliberately retain old wall/window source edges under this sheet. Both
  // the editor and runtime must suppress the whole span, including its seam.
  for(let x=15;x<35;x++)edges[`s:${x}:12`]=x%2?'wall-brick':'window-concrete';
  // The pinned designer requires the complete portable map schema, even for
  // a ground-only playtest. Its other squad markers do not spawn solo actors.
  return {version:2,name:'Window proving yard',width:240,height:240,levels:3,upper:[{},{}],stairs:[],climbs:[],terrain:Array.from({length:240},()=>Array(240).fill('ground-gravel')),edges,props:[],starts:[{x:20,y:25,z:0,heading:270},{x:19,y:25,z:0},{x:19,y:26,z:0},{x:21,y:25,z:0}],guards:structuredClone(WINDOW_REVIEW_MISSION.guards),exits:[{x:20,y:26,z:0}],farmyardWindows:{version:1,instances}};
}
