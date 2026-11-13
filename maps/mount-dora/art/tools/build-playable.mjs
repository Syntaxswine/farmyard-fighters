// Deterministic, map-owned production bindings. Never modifies base geography.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {runOns} from './pier-joints.mjs';
import {BOATHOUSE_POSTS,boathousePosts,onPierDeck,pieceRoof} from './boathouse.mjs';
const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const target=path.join(repo,'sites/tactical-animal/dist/mission-art/mount-dora');
const bytes=fs.readFileSync(path.join(repo,'maps/mount-dora/features.json'));
const source=JSON.parse(bytes),byId=new Map(source.features.map(f=>[f.id,f]));
const structures=new Map(source.authoredStructures.map(s=>[s.id,s]));
const output=[],r=n=>Math.round(n*1e6)/1e6;
const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const bound=points=>[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
const expand=(b,p)=>b.map((v,i)=>r(v+(i<2?-p:p)));
const centre=b=>[r((b[0]+b[2])/2),r((b[1]+b[3])/2)];
const near=(a,b,t)=>Math.hypot(a[0]-b[0],a[1]-b[1])<t;
const pointInside=(p,ring)=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
function insetCorner(f,radius,target=[f.bounds[2],f.bounds[3]]){const ring=f.geometry.coordinates[0][0],b=f.bounds,distance=(p,a,b)=>{const d=[b[0]-a[0],b[1]-a[1]],t=Math.max(0,Math.min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/(d[0]**2+d[1]**2)));return Math.hypot(p[0]-a[0]-d[0]*t,p[1]-a[1]-d[1]*t);};let best;
 for(let y=b[1];y<b[3];y+=.25)for(let x=b[0];x<b[2];x+=.25){const p=[r(x),r(y)];if(!pointInside(p,ring)||ring.slice(1).some((q,i)=>distance(p,ring[i],q)<radius))continue;const score=Math.hypot(p[0]-target[0],p[1]-target[1]);if(!best||score<best.score)best={p,score};}if(!best)throw Error('No bounded inferred turret position '+f.id);return best.p;}
const inn=new Set(Array.from({length:10},(_,i)=>560095890+i).map(n=>'osm-way-'+n));
const palettes=[['cream-siding','slate',[1,.98,.9]],['sage-siding','brown-shingle',[.94,1,.94]],['plaster','terracotta',[1,.94,.84]],['yellow-siding','green-metal',[1,.97,.85]],['brick','slate',[1,.95,.9]],['cream-siding','blue-metal',[.94,.98,1]]];
// Recorded evidence (nativeProxy: county record, lidar, survey) chooses the wall class,
// roof cover, roof form, ridge axis and pitch. Colours stay seeded placeholders until a
// survey records them; `why` names the source of every evidence-driven field.
const SIDINGS=['cream-siding','sage-siding','yellow-siding'],SHAPES=['gable','hip','flat'];
const COVERS={metal:{roof:'blue-metal',roofFinish:'silver'},tile:{roof:'terracotta'},'tar-and-gravel':{roof:'slate',roofStyle:'flat'},'rolled-asphalt':{roof:'slate',roofStyle:'flat'}};
// County-sketched buildings carry no OSM tags; their county use says shop or office.
const COUNTY_COMMERCIAL=/STORE|OFFICE|SHOP|PROFESSIONAL/;
function evidenceTreatment(f,seed){
 const np=f.nativeProxy,ev=np.evidence||{},lidar=ev.lidar||{},survey=ev.survey||{},cover=ev.county?.roofCover,out={},why={};
 if(!/^unsurveyed/.test(np.materialSource)){out.wall=np.material==='wood'?SIDINGS[seed%SIDINGS.length]:np.material==='brick'?'brick':'plaster';why.wall=np.materialSource;}
 if(cover==='asphalt-shingle'){out.roof=seed%2?'slate':'brown-shingle';why.roof='county:'+cover;}
 else if(COVERS[cover]){Object.assign(out,COVERS[cover]);why.roof='county:'+cover;if(out.roofStyle)why.roofStyle='county:'+cover;}
 const shape=SHAPES.includes(survey.roofShape)?['survey',survey.roofShape]:SHAPES.includes(lidar.roofForm)&&lidar.roofConfidence>=.7?['lidar',lidar.roofForm]:null;
 if(shape){out.roofStyle=shape[1];why.roofStyle=shape.join(':')+(shape[0]==='lidar'?' confidence '+lidar.roofConfidence:'');}
 if(out.roofStyle==='flat')out.pitch=0;
 else if(shape?.[0]==='lidar'&&lidar.pitchDeg){
  out.pitch=Math.max(12,Math.min(40,Math.round(lidar.pitchDeg)));why.pitch='lidar:'+lidar.pitchDeg+' deg';
  // The kit's axis 'x' runs the ridge east-west; lidar bearings are compass degrees.
  if(Number.isFinite(lidar.ridgeBearingDeg)){const b=(lidar.ridgeBearingDeg%180+180)%180;out.roofAxis=b>=45&&b<135?'x':'y';why.roofAxis='lidar:ridge '+lidar.ridgeBearingDeg+' deg';}
 }
 return {out,why};
}
for(const f of source.features.filter(f=>f.category==='building')){
 const seed=hash(f.id),a=centre(f.bounds),isInn=inn.has(f.id),shop=f.tags.building==='commercial'||f.tags.shop||f.tags.amenity&&['restaurant','cafe','bar','pub','bank'].includes(f.tags.amenity)||COUNTY_COMMERCIAL.test(f.county?.style||'')||(a[0]>345&&a[0]<590&&a[1]>520&&a[1]<690),p=palettes[seed%palettes.length];
 const type=isInn?'lakeside-inn':shop?'commercial':f.id==='osm-way-557051202'?'donnelly-civic':'vernacular';
 const hero={'osm-way-547799531':'donnelly-house','osm-way-556809468':'history-museum','osm-way-557494933':'former-depot','osm-way-558337885':'shamrock-building'}[f.id];
 const stories=isInn||hero==='donnelly-house'?2:f.nativeProxy.stories;
 const treatment={type,wall:isInn?'yellow-siding':shop?(seed%2?'brick':'plaster'):p[0],trim:'cream-siding',roof:isInn?'brown-shingle':shop?'slate':p[1],roofStyle:shop?'flat':seed%3?'gable':'hip',tint:isInn?[1,1,.9]:p[2],stories,pitch:shop?0:22+seed%9,windowSpacing:shop?3.3:3.8,veranda:isInn&&['osm-way-560095890','osm-way-560095893'].includes(f.id)};
 if(hero){Object.assign(treatment,{type:hero,wall:hero==='donnelly-house'?'cream-siding':hero==='former-depot'?'cream-siding':'brick',roof:hero==='donnelly-house'?'green-metal':'slate',roofStyle:hero==='shamrock-building'?'flat':hero==='former-depot'?'hip':'gable',pitch:28,veranda:hero==='donnelly-house'});}
 if(hero==='donnelly-house')Object.assign(treatment,{wall:'yellow-siding',roof:'blue-metal',roofFinish:'silver',roofRiseLimit:2.2,crossGable:true,ornate:true,frontGables:[.3,.65].map(t=>insetCorner(f,2.2,[f.bounds[2],f.bounds[1]+(f.bounds[3]-f.bounds[1])*t])),turret:{centre:insetCorner(f,1.8),radius:1.5,stories:3,capRiseFactor:1.3,placement:'inferred-inset-southeast-corner; not surveyed'}});
 if(hero==='former-depot'){
  const [west,north,east,south]=f.bounds, [polygon,...other]=f.geometry.coordinates;
  const [ring,...holes]=polygon;
  if(other.length||holes.length||ring.length!==5||
     ring.slice(0,-1).some(([x,z],i)=>!(x===west||x===east)||!(z===north||z===south)||x!==ring[i+1][0]&&z!==ring[i+1][1]))
    throw Error('The reviewed depot facade requires an axis-aligned rectangular footprint.');
  Object.assign(treatment,{
   wallFinish:'painted-white',roof:'slate',roofFinish:'stamped-tin',pitch:26,tint:[1,1,.98],
   depot:{
    // The west and south eaves finish at the wall face beside the service lane.
    eaveOverhang:[.08,.4,.4,.08],chimney:[.53,.71],
    // Fractions along the east wall (north to south) and south wall (east to west).
    eastSashes:[[.16,.78],[.43,.8],[.55,.8],[.67,.72]],
    southSashes:[[.35,1],[.72,.53],[.85,.53]],
    eastTrim:[.29,.36,.77,.89]
   }
  });
 }
 if(hero==='shamrock-building')Object.assign(treatment,{baseWall:'plaster',archedLowerWindows:true,cornice:true});
 if(isInn&&['osm-way-560095892','osm-way-560095898'].includes(f.id))Object.assign(treatment,{wall:'plaster',roofStyle:'flat',tint:[1,.96,.8],annex:true});
 // Hand-authored heroes and the Inn keep their curated treatments.
 const evidence=isInn||hero?null:evidenceTreatment(f,seed);
 if(evidence)Object.assign(treatment,evidence.out);
 // Keep all rings, including inner courtyards. Local anchors do not quantize them.
 const polygons=f.geometry.coordinates;
 output.push({id:f.id,kind:'building',sourceIds:[f.id],anchor:a,bounds:expand(f.bounds,.5),polygons,treatment,seed,collisionPolicy:'retain-source-walls',solids:[{kind:'polygon',polygons}],replacesSourceIds:[f.id],provenance:{footprint:f.county?'grid-generalized county sketch placed on its 2018 lidar roof (reference/county-buildings.json); original geographicGeometry retained':'grid-generalized-osm; original geographicGeometry retained',treatment:isInn?'observed-group-palette-inferred-details':['donnelly-house','former-depot'].includes(hero)?'observed-typology-inferred-details':'inferred-local-typology',height:isInn?'two-native-storey-approximation-city-documents-2-to-3-storey-complex':hero==='donnelly-house'?'native-two-storey-queen-anne-approximation':f.nativeProxy.storiesSource,details:'Repeated windows, roof form and facade divisions are approximations; no surveyed doors or interiors.',sourceRefs:isInn?['city-historic-sites','lakeside-owner','lakeside-history']:['city-preservation','city-historic-sites']}});
 if(evidence)output.at(-1).provenance.evidence={...evidence.why,colour:'seeded placeholder until surveyed'};
 if(hero==='former-depot'){
  const provenance=output.at(-1).provenance;
  provenance.sourceRefs.push('depot-street-view-2025','depot-national-register','depot-chamber');
  provenance.treatment='observed-street-and-south-facades';
  provenance.details='Window spacing, eave projection and chimney position are visual approximations fitted to the snapped plan. Roof pitch uses the 2018 lidar estimate. Street entrances are recorded separately for an operational-door pass.';
 }
 if(hero||isInn){const p=output.at(-1);p.provenance.sourceRefs.push('city-design-standards-2025');p.provenance.observedFeatures=hero==='donnelly-house'?'PDF76: yellow siding, white decorative veranda, silver stamped-tin roof, polygonal tower and multiple gables':hero==='shamrock-building'?'PDF84 historical image: brick upper facade, pale pilasters, arched lower windows, cornice; current three floors derive from OSM':hero==='former-depot'?'Street View May 2025: white lap siding, dark fascia and vertical trim, bright stamped-metal hip roof, brick chimney, tall east sashes and grouped south windows':isInn?'PDF84 historical veranda/arched supports; current owner yellow/white group':'Facade remains inferred; no individual photo matched.';}
}
const feature=n=>{const f=byId.get('osm-way-'+n);if(!f)throw Error('Missing source '+n);return f;};
function polygonRecord(id,kind,points,sourceIds,treatment,provenance={}){const bounds=bound(points),a=centre(bounds);const p={id,kind,sourceIds,anchor:a,bounds:expand(bounds,.15),points,treatment,collisionPolicy:'additional-solids',solids:[],replacesSourceIds:[],provenance};output.push(p);return p;}
const light={id:'md:lighthouse',kind:'lighthouse',sourceIds:['osm-node-2704687214'],anchor:[500.2877,1169.7989],bounds:[498.7877,1168.2989,501.7877,1171.2989],height:10.6,collisionPolicy:'additional-solids',solids:[{kind:'circle',centre:[500.2877,1169.7989],radius:1.45}],replacesSourceIds:[],provenance:{position:'retained-osm-named-point',shape:'map-owned-static-approximation',sourceRefs:['city-lighthouse','chamber-history'],height:'Native 2.12 m proportions, approximately the documented 35 feet; not surveyed.'}};output.push(light);
// Actual shelter contours, with inferred roof and support details. No filled pavilion solid.
for(const n of [557154683,557154684,557051211]){
 const f=feature(n),plan=structures.get('md:shelter:'+n),p=polygonRecord(plan.id,'pavilion',plan.geometry.coordinates[0][0],[f.id],{roof:'green-metal',roofStyle:'hip',pitch:25},{position:'grid-generalized-mapped-shelter',details:'inferred-native-posts-and-hip-roof',sourceRefs:['city-parks','city-palm']});
 p.collisionPolicy='replace-source-walls';p.replacesSourceIds=[f.id];
 const c=p.anchor;p.posts=p.points.slice(0,-1).map(q=>{const d=Math.hypot(q[0]-c[0],q[1]-c[1]);return q.map((v,i)=>r(v+(c[i]-v)*.22/d));});
 p.solids=p.posts.map(centre=>({kind:'circle',centre,radius:.15}));
}
// City confirms these facilities, but their exact contemporary positions are not surveyed.
for(const [id,c,w,d,parent,kind]of [['md:donnelly-stage',[478,484.75],13,5,468920884,'stage'],['md:evans-pavilion',[470,1005],8,6,486656245,'pavilion']]){
 const f=feature(parent),points=structures.get(id).geometry.coordinates[0][0],p=polygonRecord(id,kind,points,[f.id],{roof:'green-metal',roofStyle:'hip',pitch:22},{position:'inferred-within-mapped-park',footprint:'authored-grid',uncertaintyBounds:f.bounds,sourceRefs:['city-parks'],details:'Approximate review placement, not a surveyed facility footprint.'});
 p.posts=kind==='stage'?points.slice(0,2):points.slice(0,4);p.solids=p.posts.map(centre=>({kind:'circle',centre,radius:.15}));p.bounds=expand(bound(points),.2);
}
for(const n of [557051180,557051194,561136643,561136644,1215493446]){
 const f=feature(n);if(f.geometry.type!=='MultiPolygon'||f.geometry.coordinates.length!==1||f.geometry.coordinates[0].length!==1)throw Error('Review changed court topology '+f.id);polygonRecord('md:court:'+n,'court',f.geometry.coordinates[0][0],[f.id],{sport:f.tags.sport},{position:'retained-osm',details:'Historical overlapping sport polygons retained; not a current court count.',sourceRefs:['city-parks']});
}
// Split along the ORIGINAL polylines into bounded pieces; no end caps. Rails lie
// just outside the same two-metre support corridor used by the base generator.
for(const n of [548471563,688219167]){
 const f=feature(n),points=f.geometry.coordinates;
 for(let j=1;j<points.length;j++){
  const a=points[j-1],b=points[j],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),parts=Math.ceil(length/8),normal=[-dy/length,dx/length];
  for(let k=0;k<parts;k++){
   const ends=[k/parts,(k+1)/parts].map(t=>[r(a[0]+dx*t),r(a[1]+dy*t)]),anchor=centre(bound(ends)),segments=[-1,1].map(sign=>ends.map(p=>p.map((v,i)=>r(v+normal[i]*1.12*sign))));
   const p={id:`md:boardwalk:${n}:${j}:${k}`,kind:'boardwalk',sourceIds:[f.id],anchor,bounds:expand(bound(ends),1.2),ends,width:2,rails:segments,collisionPolicy:'additional-solids',solids:segments.map(([a,b])=>({kind:'segment',a,b,radius:.055})),replacesSourceIds:[],provenance:{position:'original-polyline-subdivision',width:'unsurveyed-2m-base-terrain-proxy',height:'flat-supported-ground-no-invented-layer-elevation',sourceRefs:['city-palm']}};
   // Preserve pavilion access through the side nearest the mapped shelter.
   const shelter=output.find(p=>p.id==='md:shelter:557051211');
   if(shelter&&near(anchor,shelter.anchor,12)){p.rails=[];p.solids=[];p.provenance.railGap='Open approach near mapped pavilion; no invented route support.';}
   output.push(p);
  }
 }
}
// Mapped piers draw the boardwalk's deck, raised to the generator's deck height
// on AFT's timber trellis, along each of the generator's deck lines
// (nativePier.lines; the last ones may come from reviewed observations). No
// railing is mapped or surveyed.
// - At a joint (nativePier.joints) the decks run on past it as pier-joints.mjs says
//   (deck.extend): the straightest pair by the mitre length, so their outer corners
//   meet; a T's stem not at all. The generator rounds the walkable cells at every joint.
// - Trellis caps close only free ends: not joints, and not ends standing on
//   another deck (a stem meeting its crossbar).
// - Decks that overlap by more than 1 cm stand at different 2 mm levels: each line
//   takes the lowest level no overlapping line already has (greedy colouring of
//   the overlap graph).
const deckLines=[];
for(const f of source.features.filter(f=>f.nativePier)){
 const pier=f.nativePier;
 if(pier.shape!=='deck-lines'){polygonRecord('md:pier:'+f.id.replace(/^osm-way-/,''),'pier-deck',f.geometry.coordinates[0][0],[f.id],{surface:'wood'},{position:'retained-osm-outline',details:'Mapped platform outline; no surveyed railing.',sourceRefs:['osm']}).deck={heightM:pier.heightM,topM:pier.heightM};continue;}
 const observed=pier.observations||[],firstObserved=pier.lines.length-observed.length,joints=new Set((pier.joints||[]).map(p=>p.join(',')));
 for(const [i,[a,b]]of pier.lines.entries())deckLines.push({f,pier,i,a,b,joints,position:i<firstObserved?'original-polyline-subdivision':'reviewed-observation:'+observed[i-firstObserved].id});
}
const toLine=(p,a,b)=>{const d=[b[0]-a[0],b[1]-a[1]],t=Math.max(0,Math.min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/(d[0]**2+d[1]**2)));return Math.hypot(p[0]-a[0]-d[0]*t,p[1]-a[1]-d[1]*t);};
for(const line of deckLines){
 const {a,b,pier,joints}=line,len=Math.hypot(b[0]-a[0],b[1]-a[1]),u=[(b[0]-a[0])/len,(b[1]-a[1])/len];
 const end=p=>{
  const joint=joints.has(p.join(','));let extend=0;
  if(joint){
   const at=deckLines.filter(o=>o.pier===pier&&[o.a,o.b].some(q=>q[0]===p[0]&&q[1]===p[1]));
   extend=runOns(p,at.map(o=>[o.a,o.b]),pier.widthM,line.f.id)[at.indexOf(line)];
  }
  const onDeck=!joint&&deckLines.some(o=>o!==line&&toLine(p,o.a,o.b)<pier.widthM/2);
  return {joint,extend:r(extend),cap:!joint&&!onDeck};};
 line.ends=[end(a),end(b)];
 line.footprint=[[-line.ends[0].extend,-pier.widthM/2],[len+line.ends[1].extend,-pier.widthM/2],[len+line.ends[1].extend,pier.widthM/2],[-line.ends[0].extend,pier.widthM/2]].map(([s,t])=>[a[0]+u[0]*s-u[1]*t,a[1]+u[1]*s+u[0]*t]);
}
// Two convex footprints overlap if no edge normal separates them by more than a centimetre.
const overlaps=(p,q)=>[p,q].every(poly=>poly.every((c,k)=>{const d=poly[(k+1)%poly.length],n=[d[1]-c[1],c[0]-d[0]],l=Math.hypot(...n),proj=s=>s.map(v=>(v[0]*n[0]+v[1]*n[1])/l),[pa,qa]=[proj(p),proj(q)];return Math.min(Math.max(...pa),Math.max(...qa))-Math.max(Math.min(...pa),Math.min(...qa))>.01;}));
for(const line of deckLines){const taken=new Set(deckLines.filter(o=>o.level!==undefined&&overlaps(o.footprint,line.footprint)).map(o=>o.level));line.level=0;while(taken.has(line.level))line.level++;}
for(const {f,pier,i,a,b,ends:lineEnds,level,position}of deckLines){
 const n=f.id.replace(/^osm-way-/,''),dx=b[0]-a[0],dy=b[1]-a[1],parts=Math.ceil(Math.hypot(dx,dy)/8),topM=r(pier.heightM+.002*level);
 for(let k=0;k<parts;k++){
  const ends=[k/parts,(k+1)/parts].map(t=>[r(a[0]+dx*t),r(a[1]+dy*t)]),first=k===0,last=k===parts-1,extend=[first?lineEnds[0].extend:0,last?lineEnds[1].extend:0];
  output.push({id:`md:pier:${n}:${i}:${k}`,kind:'pier',sourceIds:[f.id],anchor:centre(bound(ends)),bounds:expand(bound(ends),1.2+Math.max(...extend)),ends,width:pier.widthM,rails:[],deck:{heightM:pier.heightM,topM,level,extend,joints:[first&&lineEnds[0].joint,last&&lineEnds[1].joint]},trellis:{caps:[first&&lineEnds[0].cap,last&&lineEnds[1].cap]},collisionPolicy:'additional-solids',solids:[],replacesSourceIds:[],provenance:{position,width:'unsurveyed-2m-boardwalk-proxy',railing:'none mapped or surveyed',height:pier.heightSource,trellis:'AFT wall-wood-trellis beams (dist/aft/tactics/bridge-trellis.js), cut down beneath the deck',sourceRefs:['osm']}});
 }
}
// Railways whose rails remain: Nautilus railway:track-straight pieces along the
// generator's track runs (nativeRailway.runs, which stop short of every road).
// Each run is cut into equal chords of about 2 m, one piece each, at the run's
// true angle; twelve pieces make one placement.
function chords(run,step){
 const lengths=[0];for(let i=1;i<run.length;i++)lengths.push(lengths[i-1]+Math.hypot(run[i][0]-run[i-1][0],run[i][1]-run[i-1][1]));
 const total=lengths.at(-1),count=Math.max(1,Math.round(total/step));
 const at=s=>{let i=1;while(i<run.length-1&&lengths[i]<s)i++;const a=run[i-1],b=run[i],span=lengths[i]-lengths[i-1],t=span?(s-lengths[i-1])/span:0;return [r(a[0]+(b[0]-a[0])*t),r(a[1]+(b[1]-a[1])*t)];};
 return Array.from({length:count},(_,k)=>[at(total*k/count),at(total*(k+1)/count)]);
}
for(const f of source.features.filter(f=>f.nativeRailway)){
 const n=f.id.replace(/^osm-way-/,'');
 for(const [i,run]of f.nativeRailway.runs.entries()){
  const pieces=chords(run,2);
  for(let k=0;k<pieces.length;k+=12){
   const part=pieces.slice(k,k+12),points=part.flat();
   output.push({id:`md:railway:${n}:${i}:${k/12}`,kind:'railway',sourceIds:[f.id],anchor:centre(bound(points)),bounds:expand(bound(points),1.5),asset:'railway:track-straight',pieces:part,collisionPolicy:'additional-solids',solids:[],replacesSourceIds:[],provenance:{position:'osm-centreline-moved-with-town',track:'Nautilus railway-visuals branch-line profile (source/packages/railway-visuals)',crossings:'Runs stop short of every road, so level crossings and bridges over roads show the road; no turnout, crossing panel or bridge structure.',sourceRefs:['osm']}});
  }
 }
}
// Roofs the 2018 lidar sees over Lake Dora where no OSM or county outline exists:
// boathouses and covered slips (reference/lidar/water-roofs.json, from
// tools/maps/lidar/water-roofs.mjs), one placement per roof. boathouse.mjs holds the rules:
// each piece a roof at its own measured eave above the lake, in the lidar's form where
// that is confident and flat otherwise; posts at its corners and along its sides, none on
// a pier deck. Walls and cover are unknown: drawn open on posts, under the metal the
// county records draw (COVERS.metal), as covered slips commonly are.
const waterRoofsBytes=fs.readFileSync(path.join(repo,'maps/mount-dora/reference/lidar/water-roofs.json')),waterRoofs=JSON.parse(waterRoofsBytes);
// On a drawn pier deck (boathouse.mjs onPierDeck), or within `margin` of a mapped platform outline.
const fromRing=(q,ring)=>Math.min(...ring.slice(1).map((b,i)=>{const a=ring[i],d=[b[0]-a[0],b[1]-a[1]],t=Math.max(0,Math.min(1,((q[0]-a[0])*d[0]+(q[1]-a[1])*d[1])/(d[0]**2+d[1]**2||1)));return Math.hypot(q[0]-a[0]-d[0]*t,q[1]-a[1]-d[1]*t);}));
const onAnyDeck=(q,margin)=>output.some(p=>p.kind==='pier-deck'?pointInside(q,p.points)||fromRing(q,p.points)<=margin:p.kind==='pier'&&onPierDeck(q,p,margin));
for(const roof of waterRoofs.roofs){
 const id='md:water-roof:'+roof.id.replace(/^lidar-water-roof-/,''),points=roof.pieces.flatMap(pc=>pc.outline);
 const pieces=roof.pieces.map(pc=>{const {style,pitch,ridgeBearingDeg}=pieceRoof(pc),out={points:pc.outline.map(q=>q.map(r)),eave:pc.eaveM,style,pitch,form:pc.form,confidence:pc.confidence,lakeShare:pc.lakeShare,nearBar:pc.nearBar};if(ridgeBearingDeg!==undefined)out.ridgeBearingDeg=ridgeBearingDeg;return out;});
 const {posts,moved,leftOff}=boathousePosts(roof.pieces,q=>onAnyDeck(q,BOATHOUSE_POSTS.radiusM),BOATHOUSE_POSTS,r);
 output.push({id,kind:'boathouse',sourceIds:[roof.id],anchor:centre(bound(points)),bounds:expand(bound(points),.3),pieces,posts,
  treatment:{...COVERS.metal,wall:'dark-wood'},seed:hash(id),collisionPolicy:'additional-solids',solids:posts.map(([x,y])=>({kind:'circle',centre:[x,y],radius:BOATHOUSE_POSTS.radiusM})),replacesSourceIds:[],
  provenance:{position:'lidar-water-roof',source:'maps/mount-dora/reference/lidar/water-roofs.json, USGS 3DEP '+waterRoofs.collection.dataset+' flown '+waterRoofs.collection.acquired.join(' to '),
   footprint:'rectangles around the roof\'s own building returns, in the town frame (the outline registration taken out); about a lidar cell (0.5 m) uncertain',
   height:'eave per piece above the lake\'s lidar level ('+waterRoofs.lakeLevelM+' m); posts stand on the game\'s ground level',
   ground:'unchanged: the game paints water inside Lake Dora\'s OSM outline (each piece\'s lakeShare) and land where the lidar\'s water runs past that outline',
   roof:'form from the lidar where confident (0.7), flat otherwise; cover unknown, drawn as metal',walls:'unknown; drawn open',posts:'inferred: corners and at most '+BOATHOUSE_POSTS.gapM+' m apart'+(moved?'; '+moved+' moved off a mapped pier deck':'')+(leftOff?'; '+leftOff+' left off one':''),
   notSeen:'Boathouses built or removed since December 2018',sourceRefs:['usgs-3dep-2018']}});
}
output.sort((a,b)=>a.id.localeCompare(b.id));
for(const p of output)if(!p.bounds.every(Number.isFinite)||p.bounds[0]>p.bounds[2]||p.bounds[1]>p.bounds[3])throw Error('Invalid production bounds '+p.id);
// Exact shared outline edges have one visual owner. Do not modify any ring or
// the simulation's multi-owner wall records to obtain this draw reduction.
const edgeOwners=new Map();
for(const p of output.filter(p=>p.kind==='building')){p.suppressedWallEdges=[];for(const [pi,poly]of p.polygons.entries())for(const [ri,ring]of poly.entries())for(let i=1;i<ring.length;i++){const key=[ring[i-1].join(','),ring[i].join(',')].sort().join('|');if(edgeOwners.has(key))p.suppressedWallEdges.push([pi,ri,i-1]);else edgeOwners.set(key,p.id);}}
const digest=createHash('sha256').update(JSON.stringify(output)).digest('hex'),sourceHash=createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(target,{recursive:true});
fs.writeFileSync(path.join(target,'placements.js'),`// Generated by maps/mount-dora/art/tools/build-playable.mjs.\nexport const ART_REVISION='${digest}';\nexport const SOURCE_FEATURES_SHA256='${sourceHash}';\nexport const AUTHORED_LAYOUT_SHA256='${source.authoredLayoutSHA256}';\nexport const PLACEMENTS=${JSON.stringify(output)};\n`);
const files=[];
for(const rel of ['packages/building-catalog/three.js','packages/building-catalog/index.js','packages/building-catalog/designs.js','packages/roof-core/index.js','packages/roof-core/three.js',
 'packages/railway-visuals/catalogue.js','packages/railway-visuals/paint.js','packages/railway-visuals/route.js','packages/railway-visuals/three.js']){
 const b=fs.readFileSync(path.join(repo,'maps/mount-dora/art/source/nautilus',rel)),dest=path.join(target,'source',rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b);files.push({path:'source/'+rel,sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length});
}
const atlas=fs.readFileSync(path.join(repo,'maps/mount-dora/art/source/nautilus/assets/buildings/painted-materials-v2.png'));
fs.writeFileSync(path.join(target,'painted-materials-bbe33709.png'),atlas);
const railwaySource=JSON.parse(fs.readFileSync(path.join(repo,'maps/mount-dora/art/source/nautilus/packages/railway-visuals/SOURCE.json')));
fs.writeFileSync(path.join(target,'provenance.json'),JSON.stringify({schema:'mount-dora-production-art/1',waterRoofs:{file:'maps/mount-dora/reference/lidar/water-roofs.json',sha256:createHash('sha256').update(waterRoofsBytes).digest('hex'),roofs:waterRoofs.roofs.length},engineRevision:'2502646482218524fd5129641da769bb82462e4d',railwayRevision:railwaySource.commit,railwayBranch:railwaySource.branch,farmyardBase:'75a6b61a547a96edebdc456e9a42edb4f28185e4',featuresSHA256:sourceHash,artRevision:digest,files,atlasSHA256:createHash('sha256').update(atlas).digest('hex'),placements:output.length,buildingCount:950,coordinates:'town east/south metres; no half-cell transform',sourceNotice:'Geometry and painted materials copied unchanged from the retained fixed source; map data Ã‚Â© OpenStreetMap contributors, ODbL 1.0. Details and heights are explicit approximations.'},null,2)+'\n');
console.log(JSON.stringify({placements:output.length,buildings:output.filter(p=>p.kind==='building').length,boardwalkPieces:output.filter(p=>p.kind==='boardwalk').length,pierPieces:output.filter(p=>p.kind==='pier').length,railwayPlacements:output.filter(p=>p.kind==='railway').length,railwayPieces:output.filter(p=>p.kind==='railway').reduce((n,p)=>n+p.pieces.length,0),artRevision:digest}));
