import {foliageModel} from './foliage-models.js';
import {BIOME_PLANTS} from './biome-foliage-data.js';
export function biomePlantParts(id,variant=0){
 if(!BIOME_PLANTS[id])throw Error('Unknown biome plant: '+id);
 if(!Number.isInteger(variant)||variant<0||variant>2)throw Error('Plant variant must be 0, 1 or 2');
 const parts=[],add=(shape,paint,position,size,rotation=[0,0,0])=>parts.push({shape,paint,position,size,rotation}),branch=(a,b,w,paint='bark')=>parts.push({shape:'taper',paint,a,b,size:[w,Math.hypot(...b.map((x,i)=>x-a[i])),w]}),phase=variant*.71;
 const crown=(p,s,paint='leaves')=>add('biome-crown',paint,p,s,[0,phase+.3,0]);
 const base=(height=1.6,width=.22)=>{branch([0,.05,0],[.06,height,0],width);for(let i=0;i<4;i++){const a=i*Math.PI/2+phase;if(['jungle-canopy','wetland-cypress'].includes(id))add('biome-buttress','bark',[0,0,0],[.16,id==='jungle-canopy'?.75:.48,.48],[0,a,0]);else branch([0,.24,0],[Math.cos(a)*.36,.03,Math.sin(a)*.36],width*.58);}};
 const leaf=(p,length,width,angle,paint='frond',frond=false,tilt=0)=>add(frond?'biome-frond':'biome-leaf',paint,p,[width,length,length],[tilt,angle,0]);
 const tuft=(paint='blade',height=.55,count=9)=>{for(let i=0;i<count;i++){const a=i*2.399+phase,h=height*(.7+(i%4)*.1);leaf([Math.cos(a)*.1,0,Math.sin(a)*.1],h,.10,a,paint,false,-.9-(i%3)*.18);}};
 if(id.startsWith('temperate-')&&BIOME_PLANTS[id].category==='tree'){
  const kind=id==='temperate-pine'?'tree-pine':'tree-broadleaf';
  for(const p of foliageModel(kind))parts.push({shape:p.shape,paint:p.material==='bark'?'bark':p.material==='pine'?'pine':'leaves',position:p.center,size:p.size,rotation:p.rotation});
 }else if(id==='jungle-canopy'){
  base(2.1,.32);for(let i=0;i<4;i++){const a=i*1.57+phase,tip=[Math.cos(a)*.76,2.25+(i%2)*.17,Math.sin(a)*.62];branch([.04,1.3,0],tip,.15);crown([tip[0],tip[1]+.16,tip[2]],[1.55,.72,1.42],'jungle');}
  crown([0,2.65,0],[1.85,.70,1.65],'jungle');for(const a of [.4,2.7])branch([Math.cos(a)*.95,2.4,Math.sin(a)*.7],[Math.cos(a)*.98,1.5,Math.sin(a)*.73],.025,'moss');
 }else if(id==='jungle-palm'){
  const points=[[0,0,0],[.05,.7,0],[.19,1.5,.04],[.29,2.35,.06]];for(let i=0;i<3;i++)branch(points[i],points[i+1],.20-i*.025);
  crown([.29,2.34,.06],[.3,.35,.3],'jungle');for(let i=0;i<10;i++)leaf([.29,2.35+(i%2)*.1,.06],1.5+(i%3)*.1,.60,i*Math.PI/5+phase,'frond',true,(i%3-1)*.12);
 }else if(id==='snow-spruce'){
  base(2.8,.18);for(let i=0;i<5;i++){const width=1.50-i*.25;add('pine-tier','snowPine',[0,.8+i*.49,0],[width,.93,width*.92],[0,phase+i*.6,0]);}
 }else if(id==='snow-alpine-pine'){
  base(2.4,.18);for(let i=0;i<7;i++){const a=i*2.4+phase,r=.72-i*.065,tip=[Math.cos(a)*r,.8+i*.24,Math.sin(a)*r];branch([.03,tip[1]-.27,0],tip,.075);crown(tip,[.9-i*.045,.33,.72-i*.025],'snowPine');crown([tip[0],tip[1]+.13,tip[2]],[.58-i*.022,.13,.48],'snow');}add('pine-tier','snowPine',[0,2.45,0],[.52,.58,.48],[0,phase,0]);
 }else if(id==='dry-acacia'){
  base(1.2,.20);for(let i=0;i<4;i++){const a=i*1.6+phase,tip=[Math.cos(a)*.85,1.95+(i%2)*.08,Math.sin(a)*.65];branch([.02,.9,0],tip,.1);crown([tip[0],tip[1]+.04,tip[2]],[1.55,.33,1.20],'dry');}crown([0,2.16,0],[1.45,.28,1.25],'dry');
 }else if(id==='dry-scrub-tree'){
  branch([0,0,0],[-.16,.7,.05],.22);branch([-.16,.7,.05],[.12,1.32,0],.15);for(let i=0;i<5;i++){const a=i*2.4+phase,tip=[Math.cos(a)*.55,1.25+(i%3)*.2,Math.sin(a)*.45];branch([-.08,.65,0],tip,.09);crown(tip,[.75,.56,.66],'dry');}
 }else if(id==='wetland-cypress'){
  base(2.6,.24);add('taper','bark',[0,.25,0],[.44,.5,.4]);for(let i=0;i<3;i++)crown([.03,1.8+i*.43,0],[.88-i*.19,.95,.80-i*.16],'cypress');for(let i=0;i<7;i++){const a=i*2.4+phase,r=.60-i*.045,tip=[Math.cos(a)*r,1.0+i*.23,Math.sin(a)*r];branch([0,tip[1]-.13,0],tip,.065);crown(tip,[.64,.62,.52],'cypress');}
 }else if(id==='wetland-willow'){
  base(1.95,.28);for(let i=0;i<7;i++){const a=i*Math.PI*2/7+phase,tip=[Math.cos(a)*.86,2.0+(i%2)*.1,Math.sin(a)*.73];branch([.04,1.25,0],tip,.08);crown([tip[0],1.52+(i%3)*.08,tip[2]],[.62,1.48,.60],'wet');}crown([0,2.24,0],[2.15,.58,1.92],'wet');
 }else if(id==='jungle-broadleaf'||id==='wetland-marsh-leaves'){
  for(let i=0;i<8;i++){const a=i*2.4+phase;leaf([0,.02,0],.66+(i%3)*.13,id==='jungle-broadleaf'?.52:.65,a,id==='jungle-broadleaf'?'jungle':'wet',false,-.7-(i%3)*.2);}
 }else if(id==='jungle-fern'){
  for(let i=0;i<9;i++)leaf([0,.03,0],.70+(i%3)*.1,.34,i*2.4+phase,'frond',true,-.55);
 }else if(id==='temperate-shrub'||id==='dry-shrub'||id==='snow-scrub'){
  const paint=id==='dry-shrub'?'dry':id==='snow-scrub'?'snowPine':'leaves';
  for(let i=0;i<3;i++){const a=i*2.1+phase;branch([0,0,0],[Math.cos(a)*.2,.37,Math.sin(a)*.2],.025);crown([Math.cos(a)*.18,.36,Math.sin(a)*.18],[.6,.56,.55],paint);if(id==='snow-scrub')crown([Math.cos(a)*.18,.61,Math.sin(a)*.18],[.4,.10,.38],'snow');}
 }else if(id==='wetland-reeds'){
  tuft('blade',.70,9);for(let i=0;i<5;i++){const a=i*2.4+phase,x=Math.cos(a)*.2,z=Math.sin(a)*.2,h=.65+(i%3)*.14;branch([x,0,z],[x+.02,h,z],.018,'moss');add('cylinder','bark',[x+.02,h,z],[.05,.16,.05]);}
 }else tuft(id==='dry-tussock'||id==='snow-grass'?'straw':'blade',id==='dry-tussock'?.72:.50,id==='snow-grass'?5:12);
 return parts;
}


// Baked vertex-grounding offsets; checked against the rendered factory in tests.
export const BIOME_TREE_GROUNDING={
 "jungle-canopy": [
  0,
  0,
  0
 ],
 "jungle-palm": [
  0.007124704998790976,
  0.007124704998790976,
  0.007124704998790976
 ],
 "temperate-broadleaf": [
  0.06500000000000011,
  0.06500000000000011,
  0.06500000000000011
 ],
 "temperate-pine": [
  0.06500000000000011,
  0.06500000000000011,
  0.06500000000000011
 ],
 "snow-spruce": [
  -0.002385690772163551,
  -0.0019530525280349043,
  -0.001287605841928663
 ],
 "snow-alpine-pine": [
  -0.002385690772163551,
  -0.0019530525280349043,
  -0.0012876058419284409
 ],
 "dry-acacia": [
  0.0006825658087072917,
  0.0011632749688501587,
  0.001902660175634896
 ],
 "dry-scrub-tree": [
  0.02558206648613165,
  0.02558206648613165,
  0.02558206648613165
 ],
 "wetland-cypress": [
  0,
  0,
  0
 ],
 "wetland-willow": [
  0.012955592132190219,
  0.013628584956390188,
  0.01466372424588891
 ]
};
