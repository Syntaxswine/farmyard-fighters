import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {PLACEMENTS,ART_REVISION,SOURCE_FEATURES_SHA256,REPLACEMENT_SOURCE_IDS,placementsForBounds,solidsForBounds,boundsIntersect,deckHeightAt,deckCovers} from '../dist/mission-art/mount-dora/manifest.js';
import {WALKER_RADIUS} from '../dist/mount-dora-world.js';
import {createMountDoraArt,loadMountDoraAtlas,trellisBoxes} from '../dist/mission-art/mount-dora/kit.js';
import {TRELLIS_BEAMS} from '../dist/aft/tactics/bridge-trellis.js';
import {TownEnvironment} from '../dist/mount-dora-view.js';
const base=new URL('../dist/mission-art/mount-dora/',import.meta.url),raw=fs.readFileSync(new URL('../../../maps/mount-dora/features.json',import.meta.url)),features=JSON.parse(raw).features;
const sha=b=>createHash('sha256').update(b).digest('hex');
const cases=[['donnelly',[444,444,516,516]],['inn',[276,768,348,840]],['lighthouse',[468,1140,540,1212]],['gilbert',[720,1152,792,1224]],['palm',[528,1344,600,1416]],['evans',[432,972,504,1044]],['shops',[384,528,456,600]],['donnelly-house',[363,442,435,514]],['courtyard',[240,432,312,504]],['north',[984,96,1056,168]],['lakefront',[140,580,212,652]]];
test('production bindings preserve the complete geography and explicit replacement policies',()=>{
 assert.equal(SOURCE_FEATURES_SHA256,sha(raw));assert.equal(ART_REVISION,sha(JSON.stringify(PLACEMENTS)));assert.equal(new Set(PLACEMENTS.map(p=>p.id)).size,PLACEMENTS.length);
 for(const p of PLACEMENTS)assert.ok(p.bounds.length===4&&p.bounds.every(Number.isFinite),p.id);
 for(const p of PLACEMENTS.filter(p=>p.kind==='court'))assert.deepEqual(p.points,features.find(f=>f.id===p.sourceIds[0]).geometry.coordinates[0][0]);
 const buildings=PLACEMENTS.filter(p=>p.kind==='building');assert.equal(buildings.length,1076);assert.equal(buildings.filter(p=>features.find(f=>f.id===p.id).county).length,126);for(const p of buildings){const f=features.find(f=>f.id===p.id);assert.deepEqual(p.polygons,f.geometry.coordinates);assert.equal(p.collisionPolicy,'retain-source-walls');assert.deepEqual(p.solids,[{kind:'polygon',polygons:p.polygons}]);assert.ok(p.provenance.details.includes('approximations'));}
 assert.equal(buildings.filter(p=>p.treatment.type==='lakeside-inn').length,10);assert.equal(buildings.find(p=>p.id==='osm-way-558337885').treatment.stories,3);
 const house=buildings.find(p=>p.id==='osm-way-547799531');assert.equal(house.treatment.roofFinish,'silver');assert.equal(house.treatment.wall,'yellow-siding');assert.ok(house.treatment.crossGable);assert.ok(house.treatment.turret.centre.every(Number.isFinite));assert.match(house.treatment.turret.placement,/inferred/);const shamrock=buildings.find(p=>p.id==='osm-way-558337885');assert.equal(shamrock.treatment.baseWall,'plaster');assert.ok(shamrock.treatment.archedLowerWindows&&shamrock.treatment.cornice);assert.match(shamrock.provenance.observedFeatures,/historical/);
 for(const id of [557154683,557154684,557051211]){const p=PLACEMENTS.find(p=>p.id==='md:shelter:'+id);assert.equal(p.collisionPolicy,'replace-source-walls');assert.deepEqual(p.replacesSourceIds,['osm-way-'+id]);assert.ok(p.solids.every(s=>s.kind==='circle'));assert.ok(p.solids.length>=4);}
 assert.equal(REPLACEMENT_SOURCE_IDS.length,1079);const light=PLACEMENTS.find(p=>p.kind==='lighthouse');assert.deepEqual(light.anchor,[500.2877,1169.7989]);assert.equal(light.solids[0].radius,1.45);
 const evans=PLACEMENTS.find(p=>p.id==='md:evans-pavilion');assert.equal(evans.provenance.position,'inferred-within-mapped-park');assert.ok(evans.provenance.uncertaintyBounds.length===4);
 const stage=PLACEMENTS.find(p=>p.id==='md:donnelly-stage');assert.deepEqual(stage.anchor,[478.5,483.5]);for(const c of PLACEMENTS.filter(p=>p.kind==='court'))assert.equal(boundsIntersect(stage.bounds,c.bounds),false);const civic=buildings.find(p=>p.id==='osm-way-557051202');assert.ok(civic.bounds[1]-stage.bounds[3]>1,'Stage leaves a clear approach north of the Art Centre');
 const provenance=JSON.parse(fs.readFileSync(new URL('provenance.json',base)));for(const f of provenance.files)assert.equal(sha(fs.readFileSync(new URL(f.path,base))),f.sha256);assert.equal(sha(fs.readFileSync(new URL('painted-materials-bbe33709.png',base))),provenance.atlasSHA256);
});
test('spatial index uses complete visual bounds and returns original solid identities',()=>{
 for(const [,b]of cases){assert.deepEqual(placementsForBounds(b).map(p=>p.id),PLACEMENTS.filter(p=>boundsIntersect(p.bounds,b)).map(p=>p.id));const solids=solidsForBounds(b);for(const s of solids){const p=PLACEMENTS.find(p=>p.id===s.placementId);assert.ok(p);assert.equal(s.collisionPolicy,p.collisionPolicy);assert.deepEqual(p.solids[Number(s.id.split(':solid:')[1])],Object.fromEntries(Object.entries(s).filter(([k])=>!['id','placementId','sourceIds','collisionPolicy'].includes(k))));}}
 const p=PLACEMENTS.find(p=>p.id==='osm-relation-7980769'),b=[p.bounds[0],p.bounds[1],p.bounds[0]+.1,p.bounds[1]+.1];assert.ok(placementsForBounds(b).includes(p));assert.ok(p.anchor[0]>b[2]);
 assert.throws(()=>placementsForBounds([0,1,NaN,4]));assert.throws(()=>placementsForBounds([4,1,0,4]));
});
test('native production geometry stays inside declared town bounds and is actually evicted',()=>{
 const atlas=new T.Texture();let borrowed=0;atlas.addEventListener('dispose',()=>borrowed++);const kit=createMountDoraArt({THREE:T,atlas});let released=0,totalTracked=0;
 for(const [id,b]of cases){const expected=placementsForBounds(b);kit.updateResident(b);assert.equal(kit.root.children.length,expected.length);assert.ok(expected.length<90);for(const g of kit.root.children){const p=expected.find(p=>p.id===g.name),box=new T.Box3().setFromObject(g,true);assert.ok(box.min.x>=p.bounds[0]-.002&&box.max.x<=p.bounds[2]+.002&&box.min.z>=p.bounds[1]-.002&&box.max.z<=p.bounds[3]+.002,`${id}: ${g.name} exceeds ${p.bounds}: ${box.min.toArray()} / ${box.max.toArray()}`);g.traverse(o=>{if(o.isMesh){for(const a of Object.values(o.geometry.attributes))for(const v of a.array)assert.ok(Number.isFinite(v));if(!o.geometry.userData.tracked){o.geometry.userData.tracked=true;totalTracked++;o.geometry.addEventListener('dispose',()=>released++);}}});}
  if(id==='lighthouse'){const l=kit.root.getObjectByName('md:lighthouse');assert.ok(Math.abs(new T.Box3().setFromObject(l).max.y-10.6)<.001);assert.equal(l.position.x,500.2877);}
 }
 const before=kit.metrics();assert.ok(before.evicted>20);assert.ok(before.created>before.resident);kit.updateResident([1400,1660,1440,1680]);kit.dispose();kit.dispose();assert.equal(released,totalTracked);assert.equal(borrowed,0);assert.equal(kit.metrics().geometries,0);assert.equal(kit.root.children.length,0);
});
test('native roof clipping retains the original courtyard hole without rectangle fill',()=>{
 const p=PLACEMENTS.find(p=>p.id==='osm-relation-7980769'),kit=createMountDoraArt({THREE:T});kit.updateResident(p.bounds);const g=kit.root.getObjectByName(p.id);let topArea=0;
 for(const o of g.children.filter(o=>o.isMesh&&o.material.name.endsWith(':true'))){const a=o.geometry.attributes.position,n=o.geometry.attributes.normal,indices=o.geometry.index;for(let i=0;i<(indices?.count??a.count);i+=3){const ids=[0,1,2].map(k=>indices?indices.getX(i+k):i+k);if(n.getY(ids[0])<.01)continue;const q=ids.map(i=>[a.getX(i),a.getZ(i)]);topArea+=Math.abs((q[1][0]-q[0][0])*(q[2][1]-q[0][1])-(q[1][1]-q[0][1])*(q[2][0]-q[0][0]))/2;}}
 const area=ring=>Math.abs(ring.slice(1).reduce((v,b,i)=>v+ring[i][0]*b[1]-b[0]*ring[i][1],0)/2),expected=p.polygons.reduce((v,poly)=>v+area(poly[0])-poly.slice(1).reduce((v,h)=>v+area(h),0),0);
 assert.ok(Math.abs(topArea-expected)<.02,`projected roof area ${topArea} must equal footprint minus holes ${expected}`);kit.dispose();
});
test('source ring winding keeps the painted exterior outside and static batches bounded',()=>{
 const kit=createMountDoraArt({THREE:T});kit.updateResident([276,772,348,844]);const lobby=kit.root.getObjectByName('osm-way-560095890');kit.root.updateMatrixWorld(true);const ray=new T.Raycaster(new T.Vector3(330,.3,810),new T.Vector3(1,0,0));const hits=ray.intersectObject(lobby,true);assert.ok(hits.length);assert.match(hits[0].object.material.name,/yellow-siding/);assert.ok(kit.metrics().drawObjects<55,'Static veranda and wall pieces batch per material per placement');kit.dispose();
});
test('one owned sampler protects painted atlas cells without mutating the borrowed texture',()=>{
 const atlas=new T.Texture(),filter=atlas.minFilter,kit=createMountDoraArt({THREE:T,atlas});kit.updateResident([276,772,348,844]);const maps=new Set();let safeShader=false;kit.root.traverse(o=>{if(o.isMesh&&o.material.map){maps.add(o.material.map);const shader={fragmentShader:'#include <map_fragment>'};o.material.onBeforeCompile(shader);assert.match(shader.fragmentShader,/clamp\(/);assert.match(shader.fragmentShader,/textureGrad/);safeShader=true;}});assert.ok(safeShader);assert.equal(maps.size,1);const sampler=[...maps][0];assert.notEqual(sampler,atlas);assert.equal(sampler.image,atlas.image);assert.equal(atlas.minFilter,filter);let released=0;sampler.addEventListener('dispose',()=>released++);kit.dispose();kit.dispose();assert.equal(released,1);assert.equal(kit.metrics().ownedSamplers,0);
});
const distance=(p,a,b)=>{const d=b.map((v,i)=>v-a[i]),den=d[0]**2+d[1]**2,t=Math.max(0,Math.min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/den));return Math.hypot(p[0]-a[0]-t*d[0],p[1]-a[1]-t*d[1]);};
test('boardwalk pieces preserve both full source polylines and leave the lane and ends open',()=>{
 const boardwalk=PLACEMENTS.filter(p=>p.kind==='boardwalk');assert.equal(boardwalk.length,69);for(const n of [548471563,688219167]){const f=features.find(f=>f.id==='osm-way-'+n),parts=boardwalk.filter(p=>p.sourceIds[0]===f.id);for(let j=1;j<f.geometry.coordinates.length;j++){const a=f.geometry.coordinates[j-1],b=f.geometry.coordinates[j],ps=parts.filter(p=>p.id.startsWith(`md:boardwalk:${n}:${j}:`));assert.deepEqual(ps.find(p=>p.id.endsWith(':0')).ends[0],a);const ends=ps.map(p=>p.ends).flat();assert.ok(ends.some(p=>Math.hypot(p[0]-b[0],p[1]-b[1])<.00001));for(const p of ps)for(const q of p.ends)assert.ok(distance(q,a,b)<.00001);}}
 for(const p of boardwalk){assert.equal(p.width,2);assert.ok(p.solids.length===0||p.solids.length===2);for(const s of p.solids){for(const t of [0,.5,1]){const point=p.ends[0].map((v,i)=>v+(p.ends[1][i]-v)*t);assert.ok(distance(point,s.a,s.b)>1.11);}assert.equal(s.kind,'segment');assert.equal(s.radius,.055);}}
});
test('texture owner cancels late loads, handles failure and preserves borrowed atlas lifetime',async()=>{
 const abort=new AbortController(),texture=new T.Texture();let disposed=0,callback;texture.addEventListener('dispose',()=>disposed++);const owner=loadMountDoraAtlas({THREE:T,signal:abort.signal,loader:{load(url,done){callback=done;return texture;}}});abort.abort();await assert.rejects(owner.ready,{name:'AbortError'});callback(texture);owner.dispose();assert.equal(disposed,1);
 const t=new T.Texture(),success=loadMountDoraAtlas({THREE:T,loader:{load(url,done){queueMicrotask(()=>done(t));return t;}}});assert.equal(await success.ready,t);assert.equal(t.colorSpace,T.SRGBColorSpace);let released=0;t.addEventListener('dispose',()=>released++);const k=createMountDoraArt({THREE:T,atlas:t});k.dispose();assert.equal(released,0);success.dispose();assert.equal(released,1);
 const pre=new AbortController();pre.abort();let calls=0;const cancelled=loadMountDoraAtlas({THREE:T,signal:pre.signal,loader:{load(){calls++;}}});await assert.rejects(cancelled.ready,{name:'AbortError'});assert.equal(calls,0);
});
test('focus fades only the occupied shelter roof and releases per-placement variants',()=>{
 const kit=createMountDoraArt({THREE:T,atlas:new T.Texture()});kit.updateResident([716,1154,788,1226]);const id='md:shelter:557154683',a=kit.root.getObjectByName(id),b=kit.root.getObjectByName('md:shelter:557154684'),point=PLACEMENTS.find(p=>p.id===id).anchor,roof=a.children.find(m=>m.userData.occlusionRole==='roof'),otherRoof=b.children.find(m=>m.userData.occlusionRole==='roof'),original=roof.material;assert.equal(original,otherRoof.material);const geometry=a.children.map(m=>m.geometry),solids=JSON.stringify(solidsForBounds([716,1154,788,1226]));
 kit.setFocus(point);assert.deepEqual(kit.metrics().fadedPlacements,[id]);assert.notEqual(roof.material,original);assert.equal(roof.material.opacity,.22);assert.equal(otherRoof.material.opacity,1);assert.equal(original.opacity,1);assert.equal(roof.material.onBeforeCompile,original.onBeforeCompile);for(const m of a.children.filter(m=>m.userData.occlusionRole!=='roof'))assert.equal(m.material.opacity,1);assert.deepEqual(a.children.map(m=>m.geometry),geometry);assert.equal(JSON.stringify(solidsForBounds([716,1154,788,1226])),solids);
 const variants=new Set(a.children.map(m=>m.material).filter(m=>m.transparent));let released=0;for(const m of variants)m.addEventListener('dispose',()=>released++);kit.setFocus(null);assert.equal(released,variants.size);assert.equal(roof.material,original);assert.equal(kit.metrics().occlusionMaterials,0);
 kit.setFocus(point);const next=new Set(a.children.map(m=>m.material).filter(m=>m.transparent));let evicted=0;for(const m of next)m.addEventListener('dispose',()=>evicted++);kit.updateResident([468,1140,540,1212]);assert.equal(evicted,next.size);assert.equal(kit.metrics().occlusionMaterials,0);kit.dispose();
});
test('camera occlusion respects the common parent offset and clears when the ray is unobstructed',()=>{
 const kit=createMountDoraArt({THREE:T});kit.updateResident([464,1133,536,1205]);const scene=new T.Scene(),host=new T.Group();host.position.set(-.5,0,-.5);scene.add(host);host.add(kit.root);const [x,z]=PLACEMENTS.find(p=>p.id==='md:lighthouse').anchor,camera=new T.PerspectiveCamera();camera.position.set(x-10-.5,3,z-.5);camera.lookAt(x+5-.5,1.2,z-.5);kit.setFocus([x+5,z],{camera});assert.ok(kit.metrics().fadedPlacements.includes('md:lighthouse'));camera.position.set(x+10-.5,3,z-.5);camera.lookAt(x+5-.5,1.2,z-.5);kit.setFocus([x+5,z],{camera});assert.equal(kit.metrics().fadedPlacements.length,0);assert.equal(kit.metrics().occlusionMaterials,0);kit.dispose();
});
test('orthographic camera uses parallel view rays and reacts to rotation without moving',()=>{
 const kit=createMountDoraArt({THREE:T});kit.updateResident([464,1133,536,1205]);const [x,z]=PLACEMENTS.find(p=>p.id==='md:lighthouse').anchor,camera=new T.OrthographicCamera(-30,30,20,-20,.1,100);camera.position.set(x-10,3,z);camera.lookAt(x,0,z);kit.setFocus([x+4,z],{camera});assert.ok(kit.metrics().fadedPlacements.includes('md:lighthouse'));camera.lookAt(x-10,2,z-10);kit.setFocus([x+4,z],{camera});assert.equal(kit.metrics().fadedPlacements.length,0);kit.dispose();
});
const r6=v=>Math.round(v*1e6)/1e6,span=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
const unit=(p,q)=>{const d=[q[0]-p[0],q[1]-p[1]],l=Math.hypot(...d);return [d[0]/l,d[1]/l];};
const toSegment=(q,[s,e])=>{const d=[e[0]-s[0],e[1]-s[1]],t=Math.max(0,Math.min(1,((q[0]-s[0])*d[0]+(q[1]-s[1])*d[1])/(d[0]**2+d[1]**2)));return span(q,[s[0]+d[0]*t,s[1]+d[1]*t]);};
test('every mapped pier draws raised deck pieces end to end along each deck line, with no railing',()=>{
 const piers=features.filter(f=>f.nativePier),pieces=PLACEMENTS.filter(p=>p.kind==='pier'),same=(p,q)=>p[0]===q[0]&&p[1]===q[1];
 const turns=[],freeEndsOnADeck=[];
 assert.equal(piers.length,19);assert.equal(features.filter(f=>f.tags.man_made==='pier').length,19);
 for(const f of piers){
  const n=f.id.replace('osm-way-',''),lines=f.nativePier.lines,own=pieces.filter(p=>p.sourceIds[0]===f.id),joints=new Set(f.nativePier.joints.map(p=>p.join(',')));assert.ok(own.length,f.id);
  assert.equal(f.nativePier.heightM,.4);
  for(const [i,[a,b]]of lines.entries()){
   const line=own.filter(p=>p.id.startsWith(`md:pier:${n}:${i}:`)).sort((p,q)=>Number(p.id.split(':').at(-1))-Number(q.id.split(':').at(-1)));
   assert.deepEqual(line[0].ends[0],a.map(r6));assert.deepEqual(line.at(-1).ends[1],b.map(r6));
   for(let k=1;k<line.length;k++)assert.deepEqual(line[k].ends[0],line[k-1].ends[1]);
   assert.ok(Math.abs(line.reduce((s,p)=>s+span(...p.ends),0)-span(a,b))<1e-4,f.id);
   assert.equal(new Set(line.map(q=>q.deck.topM)).size,1);
   for(const [k,p]of line.entries()){
    assert.ok(span(...p.ends)<=8+1e-9);
    // Joints, extensions and caps belong to a line's own two ends only; a joint is never capped.
    const atEnd=[k===0,k===line.length-1],isJoint=[atEnd[0]&&joints.has(a.join(',')),atEnd[1]&&joints.has(b.join(','))];
    assert.deepEqual(p.deck.joints,isJoint,p.id);
    for(const e of [0,1]){if(!atEnd[e])assert.ok(!p.trellis.caps[e]&&p.deck.extend[e]===0,p.id);if(isJoint[e])assert.equal(p.trellis.caps[e],false,p.id);if(p.deck.extend[e])assert.ok(isJoint[e],p.id);}
    // At a joint the straightest pair of lines mitres: each runs on half the width times
    // tan(turn / 2), the turn being 0 straight on. Any other line (a T's stem) ends at the joint.
    for(const e of [0,1])if(isJoint[e]){
     const joint=e===0?a:b,at=lines.map((l,j)=>({j,l})).filter(({l})=>l.some(q=>same(q,joint))).map(({j,l})=>({j,dir:unit(joint,same(l[0],joint)?l[1]:l[0])}));
     let best=null;for(let x=0;x<at.length;x++)for(let y=x+1;y<at.length;y++){const turn=Math.PI-Math.acos(Math.max(-1,Math.min(1,at[x].dir[0]*at[y].dir[0]+at[x].dir[1]*at[y].dir[1])));if(!best||turn<best.turn)best={turn,pair:[at[x].j,at[y].j]};}
     const expected=best.pair.includes(i)?p.width/2*Math.tan(best.turn/2):0;
     assert.ok(Math.abs(p.deck.extend[e]-expected)<2e-6,`${p.id} end ${e}: ${p.deck.extend[e]} against ${expected}`);
     turns.push({id:p.id,end:e,joint:joint.join(','),lines:at.length,turn:best.turn*180/Math.PI,stem:!best.pair.includes(i)});
    }
    // A free end without a cap stands on another deck line, of this pier or another.
    for(const e of [0,1])if(atEnd[e]&&!isJoint[e]&&!p.trellis.caps[e]){
     const end=e===0?a:b,on=features.filter(g=>g.nativePier).flatMap(g=>g.nativePier.lines.map((l,j)=>({g,j,l}))).filter(({g,j,l})=>!(g===f&&j===i)&&toSegment(end,l)<p.width/2);
     assert.ok(on.length,p.id+' end '+e);freeEndsOnADeck.push({id:p.id,ownPier:on.some(({g})=>g===f)});
    }
   }
  }
  assert.equal(own.length,lines.reduce((s,[a,b])=>s+Math.ceil(span(a,b)/8),0));
  for(const p of own){assert.equal(p.width,2);assert.deepEqual(p.rails,[]);assert.deepEqual(p.solids,[]);assert.equal(p.collisionPolicy,'additional-solids');assert.match(p.provenance.railing,/none/);assert.equal(p.deck.heightM,.4);assert.ok(Number.isInteger(p.deck.level)&&p.deck.level>=0);assert.equal(p.deck.topM,r6(.4+.002*p.deck.level));}
 }
 // Mount Dora has joints within a degree of straight, square bends, and the Rusty Anchor's T,
 // whose stem ends at the crossbar while the straight crossbar halves barely run on.
 assert.ok(turns.some(t=>t.lines===2&&t.turn<1)&&turns.some(t=>t.lines===2&&t.turn>89),JSON.stringify(turns.slice(0,4)));
 const tee=turns.filter(t=>t.lines===3);assert.equal(tee.length,3);assert.equal(tee.filter(t=>t.stem).length,1);
 for(const t of tee)assert.ok(pieces.find(p=>p.id===t.id).deck.extend[t.end]<1e-5,t.id);
 // Where two lines meet, their outer corners meet: no notch on the outside, and nothing sticking out.
 const corners=(p,e)=>{const [a,b]=p.ends,u=unit(a,b),n=[-u[1],u[0]],end=e===0?a.map((v,k)=>v-u[k]*p.deck.extend[0]):b.map((v,k)=>v+u[k]*p.deck.extend[1]);return [1,-1].map(side=>end.map((v,k)=>v+n[k]*side*p.width/2));};
 const byJoint=new Map();for(const t of turns.filter(t=>t.lines===2)){if(!byJoint.has(t.joint))byJoint.set(t.joint,[]);byJoint.get(t.joint).push(t);}
 assert.ok(byJoint.size>=10);
 for(const [joint,[s,t]]of byJoint){const cs=corners(pieces.find(p=>p.id===s.id),s.end),ct=corners(pieces.find(p=>p.id===t.id),t.end);
  assert.ok(Math.min(...cs.flatMap(c=>ct.map(d=>span(c,d))))<1e-4,'outer corners apart at '+joint);}
 // The walkway is the Rusty Anchor T's stem: it meets the dock's north-south leg (mapped, then carried
 // on south by the observation) at the leg's centre line, with no run-on and no cap. The leg's
 // north end turns 91.4 degrees into the next line and runs on the mitre, 1.025 m.
 const walkway=pieces.find(p=>p.id==='md:pier:556100376:0:3');assert.deepEqual([walkway.deck.extend[1],walkway.trellis.caps[1],walkway.deck.joints[1]],[0,false,true]);
 assert.ok(tee.some(t=>t.stem&&t.id===walkway.id));
 const leg=pieces.find(p=>p.id==='md:pier:556100376:1:0');assert.ok(Math.abs(leg.deck.extend[1]-Math.tan(91.41/2*Math.PI/180))<2e-3);
 // A stem that ends on a crossbar takes no cap, whether the crossbar is its own pier's line or another pier's.
 assert.ok(freeEndsOnADeck.some(e=>e.ownPier)&&freeEndsOnADeck.some(e=>!e.ownPier),JSON.stringify(freeEndsOnADeck));
 // A stem that ends on its crossbar takes no cap; a finger's free far end does.
 const stem=pieces.filter(p=>p.sourceIds[0]==='osm-way-623947049').sort((p,q)=>p.id.localeCompare(q.id)).at(-1);assert.equal(stem.trellis.caps[1],false);
 const finger=pieces.filter(p=>p.sourceIds[0]==='osm-way-556100384');assert.equal(finger.length,1);assert.deepEqual(finger[0].trellis.caps,[false,true]);
 // A cross-dock mapped out and back (A-B-C-A) is drawn once, along its chord.
 const cross=features.find(f=>f.id==='osm-way-556100378'),ring=cross.geometry.coordinates;
 assert.equal(cross.geometry.type,'LineString');assert.deepEqual(ring[0],ring.at(-1));assert.equal(cross.nativePier.lines.length,1);
 const drawn=pieces.filter(p=>p.sourceIds[0]===cross.id).reduce((s,p)=>s+span(...p.ends),0);assert.ok(Math.abs(drawn-span(...cross.nativePier.lines[0]))<1e-4&&drawn<.6*ring.slice(1).reduce((s,q,i)=>s+span(ring[i],q),0));
 // The reviewed observation's line is drawn and says where it came from.
 const t=pieces.filter(p=>p.provenance.position==='reviewed-observation:rusty-anchor-t');assert.equal(t.length,1);assert.deepEqual(t[0].ends.at(-1),[136.042,647]);
});
// Each pier piece's drawn deck as a sampling test: along its line, including the run past a bend.
const onPiece=(p,q,margin=0)=>{const [a,b]=p.ends,len=span(a,b),u=[(b[0]-a[0])/len,(b[1]-a[1])/len],d=[q[0]-a[0],q[1]-a[1]],along=d[0]*u[0]+d[1]*u[1],across=Math.abs(d[0]*u[1]-d[1]*u[0]),[before,after]=p.deck.extend;return along>=-before+margin&&along<len+after-margin&&across<p.width/2-margin;};
test('no two pier decks share more than a junction square, and overlapping decks never share a top',()=>{
 // Rasterise each deck at 0.25 m. Decks meet where a cross-dock crosses its stem or a
 // line bends (about 4 m2), but no deck is drawn along another; and where two lines'
 // decks overlap by more than a sliver, their tops stand at different levels.
 const pieces=PLACEMENTS.filter(p=>p.kind==='pier'),step=.25,area=new Map(),inner=new Map(),line=p=>p.id.split(':').slice(0,4).join(':');
 for(const p of pieces)for(let x=Math.floor(p.bounds[0]/step);x<=Math.ceil(p.bounds[2]/step);x++)for(let y=Math.floor(p.bounds[1]/step);y<=Math.ceil(p.bounds[3]/step);y++){
  const q=[(x+.5)*step,(y+.5)*step],key=x+','+y;
  if(onPiece(p,q)){if(!area.has(key))area.set(key,[]);area.get(key).push(p);}
  if(onPiece(p,q,.02)){if(!inner.has(key))inner.set(key,[]);inner.get(key).push(p);}
 }
 const pairs=new Map();for(const ps of area.values())for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const key=[ps[i].id,ps[j].id].sort().join(' ');pairs.set(key,(pairs.get(key)||0)+step*step);}
 const worst=Math.max(...pairs.values());assert.ok(worst<=4.5,[...pairs].find(([,v])=>v===worst)?.join(' = ')+' m2');assert.ok(pairs.size>5);
 let shared=0,crossing=0;for(const ps of inner.values())for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)if(line(ps[i])!==line(ps[j])){crossing++;if(ps[i].deck.topM===ps[j].deck.topM)shared++;}
 assert.ok(crossing>100);assert.equal(shared,0);
});
test('a walker stands on a deck wherever their body overlaps it, and on any deck cell over water',()=>{
 const pier=PLACEMENTS.find(p=>p.id==='md:pier:556100376:0:0'),[a,b]=pier.ends,mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],len=span(a,b),n=[-(b[1]-a[1])/len,(b[0]-a[0])/len],u=[(b[0]-a[0])/len,(b[1]-a[1])/len];
 const at=(across,along=0,from=mid)=>[from[0]+n[0]*across+u[0]*along,from[1]+n[1]*across+u[1]*along],R=WALKER_RADIUS;
 assert.equal(R,.23);
 // A point counts on the drawn deck, to its edge; a body counts within its radius of it, round at the corners.
 assert.equal(deckHeightAt(mid),.4);assert.equal(deckHeightAt(at(.98)),.4);assert.equal(deckHeightAt(at(1.02)),0);
 assert.equal(deckHeightAt(at(1.2),R),.4);assert.equal(deckHeightAt(at(1.25),R),0);
 // 1.22 m off this east-west piece's line lies outside its 1.2 m bounds, so the lookup widens by the radius.
 assert.ok(at(1.22)[1]>pier.bounds[3]||at(1.22)[1]<pier.bounds[1]);assert.equal(deckHeightAt(at(1.22),R),.4);
 // The shore end is free: the deck stops square there.
 assert.deepEqual([pier.deck.joints[0],pier.deck.extend[0]],[false,0]);
 assert.equal(deckHeightAt(at(0,.02,a)),.4);assert.equal(deckHeightAt(at(0,-.02,a)),0);assert.equal(deckHeightAt(at(0,-.2,a),R),.4);assert.equal(deckHeightAt(at(0,-.25,a),R),0);
 assert.equal(deckHeightAt(at(1.15,-.15,a),R),.4);assert.equal(deckHeightAt(at(1.2,-.2,a),R),0);
 // At the 64.6 degree bend of 548471565 each leg runs on its mitre, and each run carries deck no other piece draws.
 const legs=PLACEMENTS.filter(p=>p.sourceIds[0]==='osm-way-548471565'&&(p.deck.joints[0]||p.deck.joints[1])),incoming=legs.find(p=>p.deck.joints[1]),outgoing=legs.find(p=>p.deck.joints[0]),joint=incoming.ends[1];
 assert.ok(Math.abs(incoming.deck.extend[1]-Math.tan(64.62/2*Math.PI/180))<2e-3&&incoming.deck.extend[1]===outgoing.deck.extend[0]);
 const others=PLACEMENTS.filter(o=>o.kind==='pier'&&o!==incoming&&o!==outgoing);
 for(const [p,k]of [[incoming,1],[outgoing,0]]){
  const trimmed={...p,deck:{...p.deck,extend:p.deck.extend.map((x,j)=>j===k?0:x)}},other=p===incoming?outgoing:incoming;let found=null;
  for(let x=-1.3;x<=1.3&&!found;x+=.05)for(let y=-1.3;y<=1.3&&!found;y+=.05){const q=[joint[0]+x,joint[1]+y];if(deckCovers(q,p)&&!deckCovers(q,trimmed)&&!deckCovers(q,other)&&!others.some(o=>deckCovers(q,o)))found=q;}
  assert.ok(found,p.id+' has deck of its own past the joint');assert.equal(deckHeightAt(found),.4);
 }
 const v=[(joint[0]-incoming.ends[0][0])/span(...incoming.ends),(joint[1]-incoming.ends[0][1])/span(...incoming.ends)];
 assert.equal(deckHeightAt([joint[0]+v[0]*1.3,joint[1]+v[1]*1.3]),0);
 // A boardwalk stays at the water; far from any deck is 0; a point must be a point.
 const piers=PLACEMENTS.filter(p=>p.kind==='pier');
 const board=PLACEMENTS.find(p=>p.kind==='boardwalk'&&piers.every(q=>toSegment(p.ends[0],q.ends)>3));assert.ok(board);assert.equal(deckHeightAt(board.ends[0],R),0);assert.equal(deckHeightAt([480,480],R),0);
 assert.throws(()=>deckHeightAt([1,NaN]));assert.throws(()=>deckHeightAt([1]));assert.throws(()=>deckHeightAt([1,1],-1));
 // The town view asks with the walker's position (town metres are field + 0.5) and body; on a deck
 // cell over water it also asks about the cell's centre, so a walker never stands at water level there.
 const asked=[],probe=tile=>({world:{tile:()=>tile},artModule:{deckHeightAt:(q,r)=>{asked.push([q,r??0]);return 0;}}});
 TownEnvironment.prototype.surfaceHeight.call(probe('ground-grass'),10.25,20.75);assert.deepEqual(asked,[[[10.75,21.25],R]]);
 asked.length=0;TownEnvironment.prototype.surfaceHeight.call(probe('bridge'),10.25,20.75);assert.deepEqual(asked,[[[10.75,21.25],R],[[10.5,21.5],0]]);
 asked.length=0;TownEnvironment.prototype.surfaceHeight.call(probe('bridge'),-.375,.5);assert.deepEqual(asked,[[[.125,1],R],[[.5,1.5],0]]);
 assert.equal(TownEnvironment.prototype.surfaceHeight.call({},0,0),0);
 const land={world:{tile:()=>'ground-grass'},artModule:{deckHeightAt}},water={world:{tile:()=>'bridge'},artModule:{deckHeightAt}},field=q=>[q[0]-.5,q[1]-.5];
 assert.equal(TownEnvironment.prototype.surfaceHeight.call(land,...field(at(1.2))),.4);assert.equal(TownEnvironment.prototype.surfaceHeight.call(land,...field(at(1.3))),0);
 // Off the free far end of 548471565's leg over water, a walker more than a radius past the deck still
 // stands on it while their cell's centre is under the deck; on land they would step down.
 const far=PLACEMENTS.filter(p=>p.sourceIds[0]==='osm-way-548471565').find(p=>!p.deck.joints[1]&&p.trellis.caps[1]),fe=far.ends[1],fu=unit(far.ends[0],fe);let past=null;
 for(let t=.24;t<=.6&&!past;t+=.01)for(let side=-.9;side<=.9&&!past;side+=.05){const q=[fe[0]+fu[0]*t-fu[1]*side,fe[1]+fu[1]*t+fu[0]*side],c=[Math.floor(q[0])+.5,Math.floor(q[1])+.5];if(deckHeightAt(q,R)===0&&deckHeightAt(c)>0)past=q;}
 assert.ok(past,'a position past the far end whose cell centre is under the deck');
 assert.equal(TownEnvironment.prototype.surfaceHeight.call(water,...field(past)),.4);assert.equal(TownEnvironment.prototype.surfaceHeight.call(land,...field(past)),0);
 const view=fs.readFileSync(new URL('../dist/mount-dora-view.js',import.meta.url),'utf8');assert.match(view,/constructor\(renderer,state,\{[^\n]*\bartModule\b[^\n]*\}=\{\}\)\{\r?\n[^\n]*\bthis\.artModule=artModule;/);
 const fieldView=fs.readFileSync(new URL('../dist/field-view.js',import.meta.url),'utf8');
 assert.match(fieldView,/a\.root\.position\.set\(sample\.x,this\.art\?\.surfaceHeight\?\.\(sample\.x,sample\.y\)\?\?0,sample\.y\);a\.root\.updateMatrixWorld\(true\);/);
});
test('every walkable pier cell over water has its centre under the drawn deck',()=>{
 // The generator's band: cell centres within 0.75 m of a deck line (square at its ends) or of a joint.
 // Read against the generated terrain, so the generator and the art agree on every pier cell.
 const project=JSON.parse(fs.readFileSync(new URL('../../../maps/mount-dora/project.json',import.meta.url))),width=project.extent.widthM,terrain=new Map(),loaded=new Set();
 const tileAt=(x,y)=>{const s=project.sectors.find(s=>x>=s.origin.x&&x<s.origin.x+240&&y>=s.origin.y&&y<s.origin.y+240);if(!s)return null;
  if(!loaded.has(s.id)){loaded.add(s.id);const m=JSON.parse(fs.readFileSync(new URL('../../../maps/mount-dora/'+s.file,import.meta.url)));for(let j=0;j<240;j++)for(let i=0;i<240;i++)terrain.set((s.origin.y+j)*width+s.origin.x+i,m.terrain[j][i]);}
  return terrain.get(y*width+x);};
 let checked=0;
 for(const f of features.filter(f=>f.nativePier&&f.nativePier.lines)){const {lines,joints}=f.nativePier;
  const xs=lines.flat().map(p=>p[0]),ys=lines.flat().map(p=>p[1]);
  for(let y=Math.floor(Math.min(...ys)-1);y<=Math.ceil(Math.max(...ys)+1);y++)for(let x=Math.floor(Math.min(...xs)-1);x<=Math.ceil(Math.max(...xs)+1);x++){
   const q=[x+.5,y+.5],inBand=lines.some(([a,b])=>{const d=[b[0]-a[0],b[1]-a[1]],l2=d[0]**2+d[1]**2,t=((q[0]-a[0])*d[0]+(q[1]-a[1])*d[1])/l2;return t>=0&&t<=1&&toSegment(q,[a,b])<=.75+1e-9;})||joints.some(j=>span(q,j)<=.75+1e-9);
   if(!inBand||tileAt(x,y)!=='bridge')continue;checked++;
   assert.ok(deckHeightAt(q)>0,`${f.id} cell ${x},${y}`);
  }}
 assert.ok(checked>1000,checked+' cells');
});
test('AFT trellis panels stand under the deck edges, tilted within their panels',()=>{
 // trellisBoxes: AFT's six beams per one-metre panel, heights scaled to the space under the deck.
 const run=trellisBoxes([0,0],[3,0],.3);assert.equal(run.length,18);
 for(const [k,box]of run.entries()){const beam=TRELLIS_BEAMS[k%6],panel=Math.floor(k/6),a=[panel+beam.a[0],beam.a[1]*.15],b=[panel+beam.b[0],beam.b[1]*.15];
  assert.ok(Math.abs(box.centre[0]-(a[0]+b[0])/2)<1e-9&&Math.abs(box.centre[1]-(a[1]+b[1])/2)<1e-9&&box.centre[2]===0);
  assert.ok(Math.abs(box.roll-Math.atan2(b[1]-a[1],b[0]-a[0]))<1e-9&&box.yaw===-0);assert.deepEqual(box.size.map(v=>+v.toFixed(9)),[+span(a,b).toFixed(9),+(beam.width*.4).toFixed(9),.064]);}
 assert.ok(Math.abs(trellisBoxes([0,0],[0,2],.3)[0].yaw+Math.PI/2)<1e-9);assert.equal(trellisBoxes([0,0],[2.6,0],.3).length,18);assert.deepEqual(trellisBoxes([0,0],[3,0],0),[]);
 // The drawn geometry of a diagonal piece is exactly its deck slab and these trellis boxes,
 // each turned by yaw about Y and then rolled within its panel (Three's XYZ order).
 const diagonal=q=>Math.abs(Math.sin(2*Math.atan2(q.ends[1][1]-q.ends[0][1],q.ends[1][0]-q.ends[0][0])))>.3,capped=PLACEMENTS.find(q=>q.kind==='pier'&&diagonal(q)&&q.trellis.caps.some(Boolean));
 const runsOnAtStart=PLACEMENTS.find(q=>q.kind==='pier'&&diagonal(q)&&q.deck.extend[0]>.1),runsOnAtEnd=PLACEMENTS.find(q=>q.kind==='pier'&&diagonal(q)&&q.deck.extend[1]>.1);
 assert.ok(capped,'a diagonal, capped pier piece');assert.ok(runsOnAtStart&&runsOnAtEnd,'diagonal pieces that run on past a joint at each end');
 for(const p of [capped,runsOnAtStart,runsOnAtEnd]){
 const kit=createMountDoraArt({THREE:T});kit.updateResident(p.bounds);const group=kit.root.getObjectByName(p.id);
 const [a,b]=p.ends.map(q=>q.map((v,i)=>v-p.anchor[i])),len=span(a,b),u=[(b[0]-a[0])/len,(b[1]-a[1])/len],n=[-u[1],u[0]],yaw=-Math.atan2(b[1]-a[1],b[0]-a[0]),top=p.deck.topM,inset=1-.032,under=top-.1,[before,after]=p.deck.extend,s=a.map((v,i)=>v-u[i]*before),e=b.map((v,i)=>v+u[i]*after);
 const boxes=[{centre:[(s[0]+e[0])/2,top-.05,(s[1]+e[1])/2],size:[len+before+after,.1,2],yaw,roll:0}];
 for(const side of [-1,1])boxes.push(...trellisBoxes(s.map((v,i)=>v+n[i]*side*inset),e.map((v,i)=>v+n[i]*side*inset),under));
 for(const [k,end]of [a,b].entries())if(p.trellis.caps[k])boxes.push(...trellisBoxes(end.map((v,i)=>v-n[i]*inset),end.map((v,i)=>v+n[i]*inset),under));
 const drawn=[];for(const m of group.children){const s=m.geometry.attributes.position;for(let i=0;i<s.count;i++)drawn.push([s.getX(i),s.getY(i),s.getZ(i)]);}
 assert.equal(drawn.length,36*boxes.length);
 // Each expected corner must have a drawn vertex within a micrometre (bucketed by millimetre, neighbours searched).
 const bucket=v=>v.map(x=>Math.floor(x*1e3)),buckets=new Map();for(const v of drawn){const k=bucket(v).join(',');if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(v);}
 const near=c=>{const [i,j,k]=bucket(c);for(let x=i-1;x<=i+1;x++)for(let y=j-1;y<=j+1;y++)for(let z=k-1;z<=k+1;z++)for(const v of buckets.get(x+','+y+','+z)||[])if(Math.hypot(v[0]-c[0],v[1]-c[1],v[2]-c[2])<1e-6)return true;return false;};
 for(const box of boxes){const m=new T.Matrix4().compose(new T.Vector3(...box.centre),new T.Quaternion().setFromEuler(new T.Euler(0,box.yaw,box.roll,'XYZ')),new T.Vector3(1,1,1));
  for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){const c=new T.Vector3(sx*box.size[0]/2,sy*box.size[1]/2,sz*box.size[2]/2).applyMatrix4(m).toArray();assert.ok(near(c),`${p.id}: corner ${c} of a box at ${box.centre}`);}}
 const bounds=new T.Box3().setFromObject(group,true);assert.ok(Math.abs(bounds.max.y-top)<1e-6&&bounds.min.y>-.02);
 kit.dispose();
 }
});
test('the boardwalk stays at the water, and the art metrics count every instance',()=>{
 const board=PLACEMENTS.find(p=>p.kind==='boardwalk'&&!p.rails.length),kit=createMountDoraArt({THREE:T});kit.updateResident(board.bounds);
 const deck=new T.Box3().setFromObject(kit.root.getObjectByName(board.id),true);assert.ok(Math.abs(deck.max.y-.005)<1e-6&&Math.abs(deck.min.y+.095)<1e-6);
 const rail=PLACEMENTS.find(p=>p.kind==='railway');kit.updateResident(rail.bounds);
 let triangles=0;kit.root.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});
 assert.ok(kit.root.children.some(g=>g.children.some(m=>m.isInstancedMesh&&m.count>1)));assert.equal(kit.metrics().triangles,triangles);
 kit.dispose();
});
test('a railway placement instances the pinned Nautilus piece on each chord and leaves the kit shared',()=>{
 // Count the kit's own per-piece clones as they retire: each placement borrows one piece.
 const original=T.InstancedMesh.prototype.dispose;let retired=0;
 T.InstancedMesh.prototype.dispose=function(){if(['Timber ties','Rail tie plates'].includes(this.name))retired++;return original.call(this);};
 try{
 const p=PLACEMENTS.find(p=>p.kind==='railway'&&p.pieces.length===12),kit=createMountDoraArt({THREE:T});kit.updateResident(p.bounds);
 const borrowed=2*placementsForBounds(p.bounds).filter(q=>q.kind==='railway').length;assert.ok(borrowed>=2);assert.equal(retired,borrowed);
 const group=kit.root.getObjectByName(p.id),meshes=[...group.children];
 assert.equal(meshes.length,5);assert.ok(meshes.every(m=>m.isInstancedMesh&&m.userData.sharedGeometry));
 assert.deepEqual(meshes.map(m=>m.count).sort((a,b)=>a-b),[12,12,12,48,96]);
 const bed=meshes.find(m=>/ballast/.test(m.name)),ties=meshes.find(m=>/Timber ties/.test(m.name)),plates=meshes.find(m=>/tie plates/.test(m.name)),matrix=new T.Matrix4(),local=([a,b],t,across=0)=>{const len=span(a,b),u=[(b[0]-a[0])/len,(b[1]-a[1])/len];return [a[0]+(b[0]-a[0])*t-u[1]*across-p.anchor[0],a[1]+(b[1]-a[1])*t+u[0]*across-p.anchor[1]];};
 for(const [k,[a,b]]of p.pieces.entries()){
  bed.getMatrixAt(k,matrix);const start=new T.Vector3(0,0,0).applyMatrix4(matrix),end=new T.Vector3(0,0,2).applyMatrix4(matrix);
  assert.ok(Math.hypot(start.x+p.anchor[0]-a[0],start.z+p.anchor[1]-a[1])<1e-4&&Math.abs(start.y)<1e-9);
  assert.ok(Math.hypot(end.x+p.anchor[0]-b[0],end.z+p.anchor[1]-b[1])<1e-4&&Math.abs(end.y)<1e-9);
  // Four ties at quarter stations, square to the chord; a plate under each rail, 0.45 m out.
  for(let i=0;i<4;i++){ties.getMatrixAt(k*4+i,matrix);const at=new T.Vector3().setFromMatrixPosition(matrix),want=local([a,b],(i+.5)/4);assert.ok(Math.hypot(at.x-want[0],at.z-want[1])<1e-4,`tie ${k}:${i}`);
   const across=new T.Vector3(1,0,0).transformDirection(matrix),along=[b[0]-a[0],b[1]-a[1]];assert.ok(Math.abs(across.x*along[0]+across.z*along[1])<1e-4*span(a,b));
   for(const [j,side]of [-1,1].entries()){plates.getMatrixAt((k*4+i)*2+j,matrix);const plate=new T.Vector3().setFromMatrixPosition(matrix);assert.ok(Math.abs(Math.hypot(plate.x-at.x,plate.z-at.z)-.45)<1e-3,`plate ${k}:${i}:${side}`);}}
 }
 const tint=new T.Color(),tints=new Set();assert.ok(ties.instanceColor);for(let i=0;i<ties.count;i++){ties.getColorAt(i,tint);tints.add(tint.r.toFixed(3));}assert.ok(tints.size>3);
 // Culling needs every vertex of every instance inside the mesh's bounding sphere.
 for(const m of meshes){const sphere=m.boundingSphere,position=m.geometry.attributes.position,v=new T.Vector3();assert.ok(sphere);let worst=-Infinity;for(let i=0;i<m.count;i++){m.getMatrixAt(i,matrix);for(let j=0;j<position.count;j++)worst=Math.max(worst,sphere.distanceToPoint(v.fromBufferAttribute(position,j).applyMatrix4(matrix)));}assert.ok(worst<=1e-4,`${m.name}: ${worst}`);}
 const box=new T.Box3().setFromObject(group,true);assert.ok(box.min.x>=p.bounds[0]-.002&&box.max.x<=p.bounds[2]+.002&&box.min.z>=p.bounds[1]-.002&&box.max.z<=p.bounds[3]+.002,`${box.min.toArray()} / ${box.max.toArray()}`);
 assert.ok(box.max.y>.4&&box.max.y<.45);
 let geometries=0,instances=0;for(const m of meshes){m.geometry.addEventListener('dispose',()=>geometries++);m.addEventListener('dispose',()=>instances++);}
 kit.updateResident([0,0,1,1]);assert.equal(instances,5);assert.equal(geometries,0);
 kit.updateResident(p.bounds);assert.equal(retired,2*borrowed);const again=kit.root.getObjectByName(p.id);assert.ok(again!==group&&again.children.every(c=>meshes.some(m=>m.geometry===c.geometry&&m.material===c.material)));
 // A pier piece stands at its deck height on a trellis that reaches down to the water.
 const pier=PLACEMENTS.find(q=>q.kind==='pier'&&q.trellis.caps.every(Boolean))??PLACEMENTS.find(q=>q.kind==='pier'&&q.trellis.caps.some(Boolean)&&!q.deck.extend.some(Boolean));kit.updateResident(pier.bounds);const deck=kit.root.getObjectByName(pier.id),deckBox=new T.Box3().setFromObject(deck,true);
 assert.ok(deck.children.length>=1&&deck.children.every(m=>m.isMesh&&!m.isInstancedMesh));assert.ok(Math.abs(deckBox.max.y-pier.deck.topM)<1e-6&&deckBox.min.y<.01&&deckBox.min.y>-.05,`${deckBox.min.y} / ${deckBox.max.y}`);
 assert.ok(deckBox.min.x>=pier.bounds[0]-.002&&deckBox.max.x<=pier.bounds[2]+.002&&deckBox.min.z>=pier.bounds[1]-.002&&deckBox.max.z<=pier.bounds[3]+.002);
 const vertices=deck.children.reduce((s,m)=>s+m.geometry.attributes.position.count,0),panels=2*Math.max(1,Math.round(span(...pier.ends)+pier.deck.extend[0]+pier.deck.extend[1]))+2*pier.trellis.caps.filter(Boolean).length;assert.equal(vertices,36*(1+6*panels));
 kit.dispose();assert.equal(geometries,5);assert.equal(kit.root.children.length,0);
 }finally{T.InstancedMesh.prototype.dispose=original;}
});
test('the retained Nautilus railway files are the ones SOURCE.json records',()=>{
 const record=JSON.parse(fs.readFileSync(new URL('../../../maps/mount-dora/art/source/nautilus/packages/railway-visuals/SOURCE.json',import.meta.url)));
 assert.equal(record.commit,'ed951ba4723ce4cdb87db25d226ad1ceaead7f46');assert.equal(record.files.length,4);
 for(const f of record.files){
  const retained=fs.readFileSync(new URL('../../../maps/mount-dora/art/source/nautilus/packages/railway-visuals/'+f.path,import.meta.url)),shipped=fs.readFileSync(new URL('source/packages/railway-visuals/'+f.path,base));
  assert.equal(retained.length,f.bytes);assert.equal(sha(retained),f.sha256);assert.equal(createHash('sha1').update(`blob ${retained.length}\0`).update(retained).digest('hex'),f.gitBlob);assert.ok(shipped.equals(retained),f.path);
 }
});
