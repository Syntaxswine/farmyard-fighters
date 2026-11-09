export const WINDOW_VERSION='industrial-windows/2';
export const BORDERLESS_WINDOW_ID='window.full.borderless';
export const WINDOW_METRICS=Object.freeze({tile:1,wallHeight:2,storeyHeight:2.12,wallThickness:.16,frameDepth:.20,post:.055,mullion:.035,glassThickness:.008});
export const WINDOW_HEIGHTS=Object.freeze([
 Object.freeze({id:'full',name:'Full-height',sill:.055,head:1.945}),
 Object.freeze({id:'waist',name:'Waist-up',sill:.90,head:1.945}),
]);
export const WINDOW_PATTERNS=Object.freeze([
 Object.freeze({id:'borderless',name:'Borderless glass',columns:1,rows:1,borderless:true}),
 Object.freeze({id:'clear',name:'Framed clear glass',columns:1,rows:1}),
 Object.freeze({id:'vertical-2',name:'Two vertical lights',columns:2,rows:1}),
 Object.freeze({id:'vertical-3',name:'Three vertical lights',columns:3,rows:1}),
 Object.freeze({id:'horizontal-2',name:'Two horizontal bands',columns:1,rows:2}),
 Object.freeze({id:'grid-2x2',name:'Four-pane grid',columns:2,rows:2}),
 Object.freeze({id:'grid-3x2',name:'Six-pane grid',columns:3,rows:2}),
]);
export const WINDOW_SPANS=Object.freeze([1,2,3]);
export const WINDOW_FINISHES=Object.freeze([
 Object.freeze({id:'steel',name:'Oiled factory steel',color:0x514f3c,edge:0x9a9c83}),
 Object.freeze({id:'sage',name:'Sage enamel',color:0x65765c,edge:0xa5b093}),
 Object.freeze({id:'ivory',name:'Aged ivory enamel',color:0xc7c1a7,edge:0xf0e5c8}),
]);
export const WINDOW_WALLS=Object.freeze(['brick','concrete','corrugated']);
export const WINDOW_DEFINITIONS=Object.freeze(WINDOW_HEIGHTS.flatMap(height=>WINDOW_SPANS.flatMap(span=>WINDOW_PATTERNS.filter(pattern=>!pattern.borderless||height.id==='full').map(pattern=>Object.freeze({
 id:`window.${height.id}.${pattern.id}.${span}m`,name:pattern.borderless?'Full-storey · Borderless glass':`${height.name} · ${pattern.name}`,heightId:height.id,patternId:pattern.id,span,
 borderless:!!pattern.borderless,height:pattern.borderless?WINDOW_METRICS.storeyHeight:WINDOW_METRICS.wallHeight,
 sill:pattern.borderless?0:height.sill,head:pattern.borderless?WINDOW_METRICS.storeyHeight:height.head,columns:pattern.columns,rows:pattern.rows,
})))));
export const WINDOW_IDS=Object.freeze(WINDOW_DEFINITIONS.map(d=>d.id));
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const bounds=(x0,y0,z0,x1,y1,z1)=>({min:[x0,y0,z0],max:[x1,y1,z1]});

// IDs stay fixed within a definition. Borderless sheets fill an entire storey,
// including the slab band, and contribute no post even when joins are requested.
export function describeWindow(id,joins={},dimensions){
 const preset=WINDOW_DEFINITIONS.find(d=>d.id===id)||(id===BORDERLESS_WINDOW_ID?{...WINDOW_DEFINITIONS.find(d=>d.patternId==='borderless'),id,name:'Borderless glass'}:undefined);
 if(!preset)throw Error('Unknown window definition: '+id);
 if(dimensions!==undefined&&(!preset.borderless||!dimensions||typeof dimensions!=='object'||Array.isArray(dimensions)||Object.keys(dimensions).some(k=>!['width','height'].includes(k))||![dimensions.width,dimensions.height].every(n=>Number.isFinite(n)&&n>0)))throw Error('Borderless dimensions requires positive finite width and height in metres');
 const definition=dimensions?{...preset,name:'Borderless glass',span:dimensions.width,height:dimensions.height,head:dimensions.height}:preset;
 if(!joins||typeof joins!=='object'||Array.isArray(joins)||Object.keys(joins).some(k=>!['left','right'].includes(k))||['left','right'].some(k=>joins[k]!==undefined&&typeof joins[k]!=='boolean'))throw Error('Window joins must contain optional boolean left/right flags');
 const joined={left:joins.left??false,right:joins.right??false},m=WINDOW_METRICS,w=definition.span,borderless=definition.borderless;
 const leftPost=borderless?0:m.post/(joined.left?2:1),rightPost=borderless?0:m.post/(joined.right?2:1),x0=-w/2+leftPost,x1=w/2-rightPost,y0=definition.sill,y1=definition.head;
 const depth=borderless?m.glassThickness:m.frameDepth;
 const solids=[],panes=[],solid=(id,role,box,material='frame')=>solids.push({id,role,material,bounds:box});
 if(!borderless){
  solid('frame.left','frame',bounds(-w/2,y0-m.post,-m.frameDepth/2,x0,m.wallHeight,m.frameDepth/2));
  solid('frame.right','frame',bounds(x1,y0-m.post,-m.frameDepth/2,w/2,m.wallHeight,m.frameDepth/2));
  solid('frame.sill','sill',bounds(x0,y0-m.post,-m.frameDepth/2,x1,y0,m.frameDepth/2));
  solid('frame.head','frame',bounds(x0,y1,-m.frameDepth/2,x1,m.wallHeight,m.frameDepth/2));
 }
 if(definition.heightId==='waist')solid('wall.lower','lower-wall',bounds(-w/2,0,-m.wallThickness/2,w/2,y0-m.post,m.wallThickness/2),'wall');
 const cellWidth=(x1-x0-(definition.columns-1)*m.mullion)/definition.columns,cellHeight=(y1-y0-(definition.rows-1)*m.mullion)/definition.rows;
 for(let c=1;c<definition.columns;c++){
  const x=x0+c*cellWidth+(c-1)*m.mullion;
  solid('mullion.v'+c,'mullion',bounds(x,y0,-m.frameDepth/2,x+m.mullion,y1,m.frameDepth/2));
 }
 for(let r=1;r<definition.rows;r++){
  const y=y0+r*cellHeight+(r-1)*m.mullion;
  solid('mullion.h'+r,'mullion',bounds(x0,y,-m.frameDepth/2,x1,y+m.mullion,m.frameDepth/2));
 }
 for(let r=0;r<definition.rows;r++)for(let c=0;c<definition.columns;c++){
  const x=x0+c*(cellWidth+m.mullion),y=y0+r*(cellHeight+m.mullion);
  panes.push({id:`r${r}c${c}`,row:r,column:c,bounds:bounds(x,y,-m.glassThickness/2,x+cellWidth,y+cellHeight,m.glassThickness/2),center:[x+cellWidth/2,y+cellHeight/2,0],width:cellWidth,height:cellHeight,normal:[0,0,1]});
 }
 return freeze({...definition,version:WINDOW_VERSION,joins:joined,cacheKey:`${id}${borderless?`:W${w}H${definition.height}`:''}:L${+joined.left}R${+joined.right}`,units:'metres',
  origin:'span centre on X, floor Y=0, glass centre plane Z=0, front normal +Z; rotations are Three +Y degrees',
  bounds:bounds(-w/2,0,-depth/2,w/2,definition.height,depth/2),aperture:bounds(x0,y0,-m.glassThickness/2,x1,y1,m.glassThickness/2),
  ...(borderless?{dimensions:{width:w,height:definition.height}}:{}),
  wallHeight:m.wallHeight,wallThickness:m.wallThickness,frameDepth:borderless?0:m.frameDepth,depth,panes,solids,
 });
}
