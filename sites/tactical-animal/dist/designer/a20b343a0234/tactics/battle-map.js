import {biomeFixture} from './biome-fixture.js';
import {sceneryFixture} from './scenery-fixture.js';
import {wallXrayFixture} from './wall-xray-fixture.js';
import {strategicSiteFixture} from './strategic-site-fixture.js';
import {grenadeFixture} from './grenade-fixture.js';
import {wallBreachBattleFixture} from './wall-breach-fixture.js';
import {parseMap} from './core/maps.js';
import {receivePlaytest} from './editor-playtest.js';

// The authored sprite-game map, not the small factoryMap() training template.
export async function loadBattleMap(fetcher=fetch){
 const token=globalThis.location?new URLSearchParams(location.search).get('editorPlaytest'):null;
 if(token)return receivePlaytest(token);
 if(globalThis.location&&new URLSearchParams(location.search).get('study')==='gunshot-impacts')return (await import('./gunshot-impact-map.js')).gunshotImpactMap();
 if(globalThis.location&&new URLSearchParams(location.search).get('study')==='tutorial-intro')return (await import('./tutorial-intro-fixture.js')).tutorialIntroFixture(fetcher);
 if(globalThis.location&&new URLSearchParams(location.search).get('study')==='dialogue')return (await import('./dialogue-fixture.js')).dialogueFixture(fetcher);
 if(globalThis.location&&new URLSearchParams(location.search).get('study')==='hedges')return (await import('./hedge-fixture.js')).hedgeFixtureMap();
 if(globalThis.location&&new URLSearchParams(location.search).get('study')==='climbing')return (await import('./climbing-fixture.js')).climbingFixture();
 if(globalThis.location&&new URLSearchParams(location.search).get('study')==='tree-cover'){const q=new URLSearchParams(location.search),{foliageReviewFixture}=await import('./foliage-review-fixture.js');return foliageReviewFixture(q.get('family')||'jungle',q.get('mix')||'trees-v1',q.get('layout')||'fill');}
 if(globalThis.location&&new URLSearchParams(location.search).get('study')==='stone-arches')return (await import('./stone-arch-fixture.js')).stoneArchFixture();
 if(globalThis.location&&new URLSearchParams(location.search).get('study')==='factory-machines')return (await import('./factory-machine-fixture.js')).factoryMachineFixture(new URLSearchParams(location.search).get('layout')||'review');
 if(globalThis.location&&new URLSearchParams(location.search).get('study')==='biomes')return biomeFixture();
 if(globalThis.location&&new URLSearchParams(location.search).get('study')==='scenery')return sceneryFixture();
 if(globalThis.location&&new URLSearchParams(location.search).get('study')==='grenades')return grenadeFixture();
 if(globalThis.location&&new URLSearchParams(location.search).get('study')==='wall-breaches')return wallBreachBattleFixture();
 if(globalThis.location&&new URLSearchParams(location.search).get('study')==='wall-xray')return wallXrayFixture();
 if(globalThis.location&&new URLSearchParams(location.search).get('study')==='strategic-sites')return strategicSiteFixture();
 const response=await fetcher(new URL('./default-factory.json',import.meta.url),{cache:'no-store'});
 if(!response.ok)throw Error('Authored factory map could not load (HTTP '+response.status+'). Reload to retry.');
 return parseMap(await response.text());
}
