import {savedFoliageCompositionFixture} from './foliage-composition-fixture.js';
import {tutorialFoliagePlan} from './biome-terrain-plan.js';
import {edgeKey,validateMap} from './core/maps.js';

// Disposable review inputs, never installed as campaign templates.
export function foliageReviewFixture(family='jungle',mix='trees-v1',layout='fill'){
 const map=savedFoliageCompositionFixture(family,mix);
 if(layout==='sector'){
  const plan=tutorialFoliagePlan(map);map.foliage={};
  for(let y=0;y<240;y++)for(let x=0;x<240;x++)if(plan.blockedAt(x,y))map.foliage[`${x},${y},0`]=[65,true,family==='wetlands'?'wetland-v1':'thicket-v1',...mix==='brush-v1'?[]:[mix]];
 }
 // A furnished room, a roof, two local lamps and an animated fire border a
 // continuous lane. A squad can move without approaching hidden hostiles.
 for(let y=121;y<=138;y++)for(let x=109;x<=130;x++)delete map.foliage[`${x},${y},0`];
 for(let y=130;y<136;y++)for(let x=111;x<117;x++){map.terrain[y][x]='floor';map.upper[0][`${x},${y}`]='floor';}
 for(let x=111;x<117;x++)for(const y of [129,135])map.edges[edgeKey('s',x,y)]='wall-brick';
 for(let y=130;y<136;y++)for(const x of [110,116])map.edges[edgeKey('e',x,y)]='wall-brick';
 map.edges[edgeKey('e',116,132)]='doorway-concrete-open';map.props.push({kind:'crate-wood',x:112,y:131,z:0},{kind:'streetlight',x:110,y:125,z:0,lightMode:'on'},{kind:'floor-lamp',x:118,y:132,z:0,lightMode:'on'},{kind:'campfire',x:128,y:131,z:0});
 if(layout==='corridor')map.starts=[104,105,106,107].map(y=>({x:148,y,z:0}));
 map.name=`Tree-cover review · ${family} · ${mix} · ${layout}`;
 const errors=validateMap(map);if(errors.length)throw Error(errors.join('\n'));return map;
}
