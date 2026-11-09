// Art-side proposals. The integration agent owns the game's terrain registry.
export const BIOME_OBSTACLES=Object.freeze({
 jungle:{id:'jungle-root-tangle',label:'Root tangle',reason:'Interlocked roots and vines fill the ground beneath the leaves.',paint:'vines',ground:'peat'},
 temperate:{id:'temperate-bramble-deadfall',label:'Bramble deadfall',reason:'Fallen trunks are caught in a dense thorny hedge.',paint:'bramble',ground:'peat'},
 snow:{id:'snow-windthrow',label:'Snowbound windthrow',reason:'Interlocked fallen pines and packed drifts obstruct the ground.',paint:'snow',ground:'snow'},
 dry:{id:'dry-thorn-thicket',label:'Thorn thicket',reason:'Woody thorn scrub forms a dense barrier at leg and body height.',paint:'dryThorns',ground:'dryThorns'},
 wetlands:{id:'wetland-blackwater-bog',label:'Blackwater bog',reason:'Dark peat water and saturated margins offer no firm footing.',paint:'bogWater',ground:'bogWater'}
});
export const OBSTACLE_ATLAS='../assets/environment/biome-obstacles/paint-atlas-v1.png';
export const OBSTACLE_PAINT={bogWater:[0,0,3,2],peat:[1,0,3,2],vines:[2,0,3,2],bramble:[0,1,3,2],dryThorns:[1,1,3,2],brokenWood:[2,1,3,2]};
export const OBSTACLE_LAYOUTS=Object.freeze({
 patch:[[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]],
 bend:[[-1,-1],[0,-1],[1,-1],[-1,0],[-1,1]],
 strip:[[-2,0],[-1,0],[0,0],[1,0],[2,0]],
 passage:[[-1,-1],[-1,0],[-1,1],[1,-1],[1,0],[1,1]],
 single:[[0,0]]
});
export const CELL_EDGES=Object.freeze([
 {name:'north',dx:0,dz:-1,bit:1}, {name:'east',dx:1,dz:0,bit:2},
 {name:'south',dx:0,dz:1,bit:4}, {name:'west',dx:-1,dz:0,bit:8}
]);
export function obstacleCells(cells){
 if(!Array.isArray(cells)||!cells.length||cells.length>256)throw Error('Supply 1–256 obstacle cells');
 const seen=new Set(),result=[];
 for(const c of cells){if(!Array.isArray(c)||c.length!==2||!c.every(Number.isSafeInteger)||c.some(n=>Math.abs(n)>10000))throw Error('Obstacle cells need integer x,z coordinates');const key=c.join(',');if(seen.has(key))throw Error('Duplicate obstacle cell');seen.add(key);result.push([...c]);}
 return result.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
}
export function obstacleEdges(cells,{occupied}={}){
 const sorted=obstacleCells(cells),set=new Set(sorted.map(c=>c.join(',')));
 if(occupied!==undefined&&typeof occupied!=='function')throw Error('Obstacle adjacency must be a function');
 const contains=occupied??((x,z)=>set.has([x,z].join(',')));
 return sorted.map(([x,z])=>({x,z,exposed:CELL_EDGES.filter(e=>!contains(x+e.dx,z+e.dz)).map(e=>e.name),mask:CELL_EDGES.reduce((m,e)=>m|(!contains(x+e.dx,z+e.dz)?e.bit:0),0)}));
}
