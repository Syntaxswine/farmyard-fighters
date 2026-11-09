import {blankMap} from './core/maps.js';

// Explicit review map. Never replaces the player's Quick Fight or campaign.
export function climbingFixture(){
 const m=blankMap('Climbing skills · ladder, window, roof and wall');
 m.starts=[
  {x:10,y:10,z:0,species:'horse',weapon:'rifle',stats:{climbing:100}},
  {x:14,y:10,z:0,species:'goat',weapon:'rifle',stats:{climbing:20}},
  {x:18,y:10,z:0,species:'donkey',weapon:'rifle',stats:{climbing:40}},
  {x:24,y:10,z:0,species:'sheep',weapon:'rifle',stats:{climbing:90}}
 ];
 for(let y=8;y<15;y++)for(let x=8;x<27;x++)m.terrain[y][x]='ground-grass';
 m.stairs=[{x:10,y:10,z:0,kind:'ladder'},{x:10,y:13,z:0,kind:'ladder',rusty:true}];
 for(const p of m.stairs)for(let dx=0;dx<2;dx++)m.upper[0][`${p.x+dx},${p.y}`]='ground-wood-planks';
 m.props=[{kind:'roof-corrugated-flat',x:19,y:10,z:1}];
 for(let x=19;x<21;x++)for(let y=10;y<12;y++)m.upper[0][x+','+y]='floor';
 m.edges['e:14:10']='window-concrete';m.edges['e:24:10']='wall-brick';m.exits=[{x:8,y:10,z:0}];
 return m;
}
