import {TREE_VARIANTS} from './environment.js';
// Low-poly catalog silhouettes, expressed in the same boxes used by world queries.
// Local coordinates are measured from the prop footprint center, at floor height.
export function propParts(kind,w,d,height){
 const variant=TREE_VARIANTS[kind];
 if(variant)return propParts(variant.base,w,d,height).map(p=>({...p,center:p.center.map(v=>v*variant.scale),size:p.size.map(v=>v*variant.scale)}));
 const parts=[],add=(name,material,x,y,z,a,b,c,solid=true)=>parts.push({name,material,center:[x,y,z],size:[a,b,c],solid});
 const legs=()=>{for(const x of [-w*.35,w*.35])for(const z of [-d*.35,d*.35])add(`leg:${x}:${z}`,'metal',x,height*.45,z,.09,height*.9,.09);};
 if(kind.startsWith('tree-')){
  add('trunk','wood',0,.65,0,.22,1.3,.22);
  const pine=kind==='tree-pine';for(let i=0;i<3;i++)add('canopy:'+i,'foliage',0,1.1+i*.32,0,(pine?1.2:1.4)-i*.25,.5,(pine?1.2:1.4)-i*.25);
 }else if(kind==='bush'||kind==='reeds'){
  for(let i=0;i<5;i++)add('leaf:'+i,'foliage',(i%3-1)*.23,height/2,(Math.floor(i/3)-.5)*.3,kind==='reeds'?.06:.4,height*(.7+(i%3)*.15),kind==='reeds'?.06:.45,false);
 }else if(/table|bench|hospital-bed|stretcher|scrub-sink/.test(kind)){
  legs();add('top',/wood/.test(kind)?'wood':'metal',0,height-.07,0,w,.14,d);
  if(/bed|stretcher|medical/.test(kind))add('cushion','linen',0,height+.05,0,w*.8,.1,d*.8);
  if(/vise/.test(kind))add('vise','dark-metal',w*.3,height+.16,0,.25,.3,.25);
  if(kind==='scrub-sink'){for(const x of [-w*.45,w*.45])add('rim:'+x,'metal',x,height+.1,0,.1,.2,d);add('tap','metal',0,height+.25,-d*.35,.08,.5,.08);}
 }else if(/barrel/.test(kind)){
  const count=kind==='barrels-cluster'?3:1;
  for(let i=0;i<count;i++){const x=count===1?0:(i%2-.5)*.43,z=count===1?0:(Math.floor(i/2)-.5)*.4,a=count===1?.65:.4;add('drum:'+i,'rust',x,height/2,z,a,height,a);for(const y of [height*.2,height*.8])add('band:'+i+':'+y,'dark-metal',x,y,z,a+.025,.055,a+.025);}
 }else if(kind==='sandbags'){
  for(let row=0;row<3;row++)for(let i=0;i<2;i++)add(`bag:${row}:${i}`,'sand',(i-.5)*.45+(row%2)*.06,(row+.5)*height/3,0,.43,height/3-.015,.7);
 }else if(kind==='pallet'){
  for(let i=0;i<4;i++)add('slat:'+i,'wood',0,.12,(i-1.5)*.24,.95,.08,.18,false);
  for(const x of [-.3,.3])add('runner:'+x,'wood',x,.04,0,.1,.08,.95,false);
 }else if(kind==='iv-stand'){
  add('pole','metal',0,height/2,0,.05,height,.05,false);add('base','metal',0,.05,0,.6,.08,.6,false);add('hook','metal',0,height-.1,0,.4,.05,.05,false);add('bag','linen',.16,height-.32,0,.16,.3,.08,false);
 }else if(/monitor|console|botanical-chamber/.test(kind)){
  add('case','metal',0,height/2,0,w*.8,height,d*.75);add('screen','screen',0,height*.7,d*.39,w*.62,height*.35,.035);
 }else if(/cabinet|crate|chest|toolbox|trolley/.test(kind)){
  const material=/wood|crate(?!-steel)/.test(kind)?'wood':'metal',open=kind.endsWith('-open');
  add('case',material,0,height/2,0,w*.85,height,d*.85);
  if(open){add('inside','dark-metal',0,height+.006,0,w*.7,.012,d*.7);add('lid',material,0,height+.25,-d*.4,w*.85,.5,.08);}
  else for(const y of [height*.22,height*.75])add('strap:'+y,'dark-metal',0,y,d*.435,w*.88,.06,.025);
  if(/stack/.test(kind))add('seam','dark-metal',0,height/2,0,w*.87,.025,d*.87);
 }else if(/first-aid|medicine/.test(kind)){
  add('kit','linen',0,.12,0,.5,.24,.36,false);add('cross-x','red',0,.247,0,.3,.02,.09,false);add('cross-z','red',0,.248,0,.09,.02,.27,false);
 }else if(kind.startsWith('gun-')){
  add('barrel','dark-metal',.05,.1,0,.65,.08,.09,false);add('stock','wood',-.23,.08,.08,.2,.12,.18,false);
 }else if(kind.startsWith('ammo-')){add('box','olive',0,.12,0,.4,.24,.3,false);add('stripe','sand',0,.247,0,.06,.02,.3,false);
 }else if(kind==='wire-cutters'||kind==='spare-parts'){
  for(const x of [-.13,.13])add('tool:'+x,'metal',x,.06,0,.07,.12,.5,false);
 }else throw Error('Missing hybrid prop silhouette: '+kind);
 return parts;
}
