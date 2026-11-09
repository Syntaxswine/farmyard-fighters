import {HEDGE_PROPS} from '../hedge-data.js';
import {BIOME_TERRAIN} from '../biome-gameplay-data.js';
import {SceneryIndex} from '../scenery-index.js';
import {SCENERY_PROPS,isScenery,scenerySize} from '../scenery-catalog.js';
import {sceneryBlockedAt} from '../scenery-rules.js';
export const FOLIAGE_TERRAINS=['woodland','woodland-dense'];
export const isWoodland=t=>FOLIAGE_TERRAINS.includes(t);
import {SITE_PROPS,isStrategicSite,siteBlocked} from '../strategic-site-rules.js';
import {EXPLOSIVE_BARREL,EXPLOSIVE_BARREL_RULE} from '../explosive-barrels.js';
import {ROOF_KINDS,GAP_ROOF_KINDS,climbableRoofKind} from '../climbable-roofs.js';
import {BANK_PROPS} from '../ramp-banks.js';
import {RAMP_PROPS} from '../cliff-ramps.js';
import {DIAGONAL_ROADS} from '../diagonal-roads.js';
import {CLIFF_PROPS} from '../cliff-map.js';
import {LIGHT_PROPS} from '../light-sources.js';
// Explicit game rules for the supplied environment art. Manifest prose is not executable.
export const GROUNDS=['ground-dirt','ground-gravel','ground-grass','ground-concrete','ground-asphalt','ground-tiles','ground-wood-planks',...DIAGONAL_ROADS];
GROUNDS.push(...Object.keys(BIOME_TERRAIN));
export const PROPS={
 'crate-wood':{w:1,h:1,cover:25,solid:true},'crate-steel':{w:1,h:1,cover:25,solid:true},'crate-stack':{w:1,h:1,cover:25,solid:true,tall:true},
 'table-wood':{w:2,h:1,cover:25,solid:true},'table-steel':{w:2,h:1,cover:25,solid:true},'workbench-vise':{w:2,h:1,cover:25,solid:true},'workbench-metal':{w:2,h:1,cover:25,solid:true},
 'barrel-single':{w:1,h:1,cover:25,solid:true},'barrels-cluster':{w:1,h:1,cover:25,solid:true},sandbags:{w:1,h:1,cover:25,solid:true},pallet:{w:1,h:1,cover:0,solid:false}
};
export const EDGES={'fence-cut':{solid:false,opaque:false,cover:0},wall:{solid:true,opaque:true,cover:25,art:'wall-concrete'},door:{solid:false,opaque:false,cover:0},'wall-concrete':{solid:true,opaque:true,cover:25,art:'wall-concrete'},'wall-corrugated':{solid:true,opaque:true,cover:25,art:'wall-corrugated'},'wall-brick':{solid:true,opaque:true,cover:25,art:'wall-brick'},'fence-chainlink':{solid:true,opaque:false,cover:0,art:'fence-chainlink'},'fence-railing':{solid:true,opaque:false,cover:0,art:'fence-railing'}};
// Explicit occupancy and combat rules shared by editor, validation and game.
for(const kind of ['lab-bench','medical-exam-table','medical-surgical-table'])PROPS[kind]={w:2,h:1,cover:25,solid:true};
for(const kind of ['hospital-bed','wheeled-stretcher','scrub-sink'])PROPS[kind]={w:1,h:2,cover:25,solid:true};
for(const kind of ['lab-control-console','bedside-monitor','instrument-trolley'])PROPS[kind]={w:1,h:1,cover:25,solid:true};
for(const kind of ['botanical-chamber','medicine-cabinet'])PROPS[kind]={w:1,h:1,cover:25,solid:true,tall:true};
PROPS['iv-stand']={w:1,h:1,cover:0,solid:true,visualHeight:60};
// Trees occupy one trunk tile; their canopies overhang neighboring tiles.
for(const kind of ['tree-broadleaf','tree-pine'])PROPS[kind]={w:1,h:1,cover:25,solid:true,tall:true,visualWidth:100,visualHeight:130};
export const TREE_VARIANTS={
 'tree-broadleaf-large':{base:'tree-broadleaf',scale:1.8},
 'tree-pine-large':{base:'tree-pine',scale:1.8}
};
for(const [kind,{base,scale}]of Object.entries(TREE_VARIANTS))PROPS[kind]={...PROPS[base],visualWidth:100*scale,visualHeight:130*scale};
PROPS.bush={w:1,h:1,cover:25,solid:false,visualHeight:32};
PROPS.reeds={w:1,h:1,cover:0,solid:false,visualHeight:48};
// Whole walkable roof modules, drawn underneath actors on an existing supported level.
for(const kind of [...ROOF_KINDS,...ROOF_KINDS.map(climbableRoofKind),...GAP_ROOF_KINDS])PROPS[kind]={w:2,h:2,cover:kind.endsWith('flat-parapet')?25:0,solid:false,groundLayer:true};
for(const kind of ['wooden-crate','supply-chest','medicine-cabinet','toolbox'])for(const state of ['closed','open'])PROPS[kind+'-'+state]={w:1,h:1,cover:kind==='toolbox'?0:25,solid:true,tall:kind==='medicine-cabinet'};
for(const kind of ['first-aid-kit','wire-cutters','spare-parts','gun-pistol','gun-rifle','gun-assault','ammo-pistol','ammo-rifle','ammo-assault'])PROPS[kind]={w:1,h:1,cover:0,solid:false,visualHeight:12};
EDGES['fence-cut'].art='fence-cut';
for(const kind of ['jail-bars','jail-door-closed'])EDGES[kind]={solid:true,opaque:false,cover:0,art:kind};
Object.assign(EDGES,{
 'window-concrete':{solid:true,opaque:true,window:true,cover:25,art:'window-concrete'},'window-brick':{solid:true,opaque:true,window:true,cover:25,art:'window-brick'},'window-corrugated':{solid:true,opaque:true,window:true,cover:25,art:'window-corrugated'},
 'door-steel-closed':{solid:true,opaque:true,cover:25,art:'door-steel-closed'},'door-wood-closed':{solid:true,opaque:true,cover:25,art:'door-wood-closed'},'doorway-concrete-open':{solid:false,opaque:false,cover:0,art:'doorway-concrete-open'}
});
export const floorTerrain=t=>['floor','yard','bridge','woodland',...GROUNDS].includes(t);
Object.assign(PROPS,RAMP_PROPS,BANK_PROPS);
export function propCells(p){const rule=PROPS[p.kind];if(!rule)return [];const {w,h}=isScenery(p)?scenerySize(p):{w:p.rotated?rule.h:rule.w,h:p.rotated?rule.w:rule.h};return Array.from({length:w*h},(_,i)=>({x:p.x+i%w,y:p.y+Math.floor(i/w),z:p.z??0}));}
const indexes=new SceneryIndex(props=>{const index=new Map();for(const p of props)for(const q of propCells(p))index.set(`${q.x},${q.y},${q.z}`,p);return index;});
export function propAt(m,x,y,z=0){const props=m.props;if(!props)return undefined;const index=indexes.get(m);return index.get(`${x},${y},${z}`);}
export const propBlocks=(m,x,y,z=0)=>sceneryBlockedAt(m,{x,y,z})?true:isStrategicSite(propAt(m,x,y,z))?siteBlocked(propAt(m,x,y,z),{x,y,z}):!!PROPS[propAt(m,x,y,z)?.kind]?.solid;
export const propTall=(m,x,y,z=0)=>!!PROPS[propAt(m,x,y,z)?.kind]?.tall;

// Unlocked doors stay solid to shots until a character opens them while crossing.
for(const kind of ['door-steel-closed','door-wood-closed','jail-door-closed'])EDGES[kind].opensTo='doorway-concrete-open';

Object.assign(PROPS,LIGHT_PROPS,CLIFF_PROPS);

EDGES['wall-wood-trellis']={solid:true,opaque:false,cover:25,art:'wall-wood-trellis'};
EDGES['wall-wood-trellis-arch']={solid:false,opaque:false,cover:0,art:'wall-wood-trellis-arch'};

PROPS[EXPLOSIVE_BARREL]={...EXPLOSIVE_BARREL_RULE};

Object.assign(PROPS,SITE_PROPS);

Object.assign(PROPS,SCENERY_PROPS);

Object.assign(PROPS,HEDGE_PROPS);
