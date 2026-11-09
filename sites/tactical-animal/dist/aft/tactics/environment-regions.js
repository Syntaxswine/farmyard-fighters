// World-space environment fields. Geometry, movement and difficulty stay separate.
export const ENVIRONMENT_VERSION=1;
export const ENVIRONMENTS=Object.freeze({
 jungle:{name:'Jungle',color:'#718951',ground:'#738440',foliage:'#426738'},
 temperate:{name:'Temperate',color:'#adbc81',ground:'#87904d',foliage:'#687d3f'},
 snow:{name:'Snow',color:'#e2e7e5',ground:'#ced9db',foliage:'#a5bbb4'},
 'dry-grassland':{name:'Dry grassland',color:'#d6bb79',ground:'#b69b5b',foliage:'#969052'},
 wetlands:{name:'Wetlands',color:'#79aaa2',ground:'#667f59',foliage:'#4f7361'}
});
export const ENVIRONMENT_IDS=Object.keys(ENVIRONMENTS);
function random(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function shuffle(a,r){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// This stream is independent of geographic retries: neither a rejected road nor
// the requested family count can consume the river/settlement random sequence.
export function environmentSelection(seed){
 const r=random((seed^0x6be4a21d)>>>0),count=1+Math.floor(r()*5);
 return shuffle(ENVIRONMENT_IDS,r).slice(0,count);
}
export function generateEnvironments(map,seed){
 const families=environmentSelection(seed),r=random((seed^0x947ad102)>>>0),width=map.width,height=map.height;
 const candidates=Array.from({length:width*height},(_,i)=>({x:i%width+.5,y:Math.floor(i/width)+.5}));
 const rivers=candidates.filter((p,i)=>map.sectors[i].routes.some(q=>q.kind==='river'));
 const regions=[],requests=[...families];
 if(families.length>1)for(const family of families)if(r()<.55)requests.push(family);
 for(const family of requests){
  let best,score=-Infinity;
  for(const p of candidates){
   const spacing=regions.length?Math.min(...regions.map(q=>distance(p,q))):4;
   if(spacing<3.5)continue;
   const wet=family==='wetlands'&&rivers.length?1/(1+Math.min(...rivers.map(q=>distance(p,q)))):0;
   const value=spacing*(.65+r()*.7)+wet*6;
   if(value>score){best=p;score=value;}
  }
  if(best)regions.push({family,...best,scale:.85+r()*.65});
 }
 return {version:ENVIRONMENT_VERSION,seed,width,height,families,regions};
}
export function environmentErrors(field){
 if(field===undefined)return [];
 const fail=['Invalid environment regions. Regenerate the environment map or restore its saved data.'];
 if(!field||field.version!==ENVIRONMENT_VERSION||!Number.isInteger(field.seed)||field.seed<0||field.seed>4294967295||field.width!==30||field.height!==15)return fail;
 if(!Array.isArray(field.families)||field.families.length<1||field.families.length>5||new Set(field.families).size!==field.families.length||field.families.some(f=>!ENVIRONMENT_IDS.includes(f)))return fail;
 if(!Array.isArray(field.regions)||field.regions.length<field.families.length||field.regions.length>10)return fail;
 if(field.regions.some(p=>!p||!field.families.includes(p.family)||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>field.width||p.y>field.height||!Number.isFinite(p.scale)||p.scale<.5||p.scale>2))return fail;
 if(field.families.some(f=>!field.regions.some(p=>p.family===f)))return fail;
 return [];
}
// Continuous warping creates broad bends, rather than independent sector tiles.
export function environmentMix(field,x,y){
 if(!field)return [{family:'temperate',weight:1}];
 if(field.families.length===1)return [{family:field.families[0],weight:1}];
 const phase=(field.seed%6283)/1000;
 const px=x+.42*Math.sin(y*.69+phase)+.16*Math.sin(x*1.1+y*.83+phase);
 const py=y+.42*Math.sin(x*.51-phase)+.16*Math.sin(y*1.05-x*.77);
 const scores=new Map();
 for(const p of field.regions){const d=Math.hypot(px-p.x,py-p.y)/p.scale;scores.set(p.family,Math.min(scores.get(p.family)??Infinity,d));}
 const ranked=[...scores].sort((a,b)=>a[1]-b[1]),first=ranked[0][1];
 const weights=ranked.map(([family,d])=>({family,weight:Math.max(0,1-(d-first)/.65)})).filter(p=>p.weight>0),total=weights.reduce((n,p)=>n+p.weight,0);
 return weights.map(p=>({...p,weight:p.weight/total}));
}
export function environmentFamily(field,x,y){return environmentMix(field,x,y)[0].family;}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
export function environmentColor(mix,kind='color'){
 return [0,1,2].map(c=>Math.round(mix.reduce((n,p)=>n+rgb(ENVIRONMENTS[p.family][kind])[c]*p.weight,0)));
}
export function environmentSummary(field,x=0,y=0,width=field?.width||30,height=field?.height||15,resolution=4){
 if(!field)return [];
 const counts=Object.fromEntries(field.families.map(f=>[f,0])),stepsX=Math.ceil(width*resolution),stepsY=Math.ceil(height*resolution);
 for(let j=0;j<stepsY;j++)for(let i=0;i<stepsX;i++)for(const p of environmentMix(field,x+(i+.5)/stepsX*width,y+(j+.5)/stepsY*height))counts[p.family]+=p.weight;
 return Object.entries(counts).filter(([,n])=>n>0).map(([family,n])=>({family,percent:n/(stepsX*stepsY)*100})).sort((a,b)=>b.percent-a.percent);
}
export function localEnvironmentProfile(field,index){
 if(!field)return undefined;
 const errors=environmentErrors(field);if(errors.length)throw Error(errors[0]);
 if(!Number.isInteger(index)||index<0||index>=field.width*field.height)throw Error('Invalid environment sector.');
 return {version:1,field:structuredClone(field),origin:[index%field.width,Math.floor(index/field.width)],size:240};
}
export function localEnvironmentErrors(map){
 const p=map.environment;if(p===undefined)return [];
 if(!p||p.version!==1||p.size!==240||!Array.isArray(p.origin)||p.origin.length!==2||p.origin.some((v,i)=>!Number.isInteger(v)||v<0||v>=(i?15:30)))return ['Invalid local environment placement.'];
 return p.field===undefined?['Missing local environment regions.']:environmentErrors(p.field);
}
// x/y are tile coordinates, including fractional points on a common sector edge.
export function localEnvironmentMix(profile,x,y){return environmentMix(profile.field,profile.origin[0]+x/profile.size,profile.origin[1]+y/profile.size);}
export function localEnvironmentFamily(profile,x,y){return localEnvironmentMix(profile,x,y)[0].family;}
export function environmentCoverageErrors(field){
 if(!field)return [];
 const counts=Object.fromEntries(field.families.map(f=>[f,0]));
 for(let y=0;y<field.height;y++)for(let x=0;x<field.width;x++)counts[environmentFamily(field,x+.5,y+.5)]++;
 return field.families.filter(f=>!counts[f]).map(f=>ENVIRONMENTS[f].name+' has no environment region.');
}
