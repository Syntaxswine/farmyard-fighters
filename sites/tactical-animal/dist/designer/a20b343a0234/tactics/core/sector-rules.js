// Sector sockets describe the feature crossing the midpoint of each shared edge.
// Rotation maps north/east/south/west sockets and the matching 24x24 template together.
export const SECTOR_TYPES={yard:{ports:['land','land','land','land']},workshop:{ports:['land','land','land','land']},'river-ns':{ports:['water','land','water','land']},'bridge-ns':{ports:['water','road','water','road']},'road-ew':{ports:['land','road','land','road']}};
export const ports=t=>SECTOR_TYPES[t]?.ports;
export function validateSectorPlan(plan){
 if(!plan||plan.version!==1||!['ns','ew'].includes(plan.orientation)||!Array.isArray(plan.cells)||plan.cells.length!==10||plan.cells.some(r=>!Array.isArray(r)||r.length!==10||r.some(t=>!SECTOR_TYPES[t])))return ['Invalid 10 × 10 sector plan.'];
 const errors=[];let bridges=0;
 for(let y=0;y<10;y++)for(let x=0;x<10;x++){const t=plan.cells[y][x],p=ports(t);if(t==='bridge-ns')bridges++;if(x<9&&p[1]!==ports(plan.cells[y][x+1])[3])errors.push(`East/west socket mismatch at ${x+1},${y+1}.`);if(y<9&&p[2]!==ports(plan.cells[y+1][x])[0])errors.push(`North/south socket mismatch at ${x+1},${y+1}.`);}
 if(bridges!==2)errors.push('A river plan requires exactly two bridge sectors.');
 const rivers=plan.cells.flat().filter(t=>t==='river-ns'||t==='bridge-ns');if(rivers.length!==10)errors.push('River must span all ten rows.');
 return errors;
}
export function generateSectorPlan(seed=7,orientation='ns'){
 let state=Number(seed)>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const river=2+Math.floor(random()*6),first=1+Math.floor(random()*3),second=6+Math.floor(random()*3);
 const cells=Array.from({length:10},(_,y)=>Array.from({length:10},(_,x)=>x===river?(y===first||y===second?'bridge-ns':'river-ns'):y===first||y===second?'road-ew':random()<.55?'workshop':'yard'));
 return {version:1,orientation,cells};
}
