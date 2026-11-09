// Orthogonal tile connectivity. Map Y becomes world Z; elevation never connects across levels.
export const CONVEYOR_PORTS=Object.freeze([{name:'north',bit:1,dx:0,dy:-1},{name:'east',bit:2,dx:1,dy:0},{name:'south',bit:4,dx:0,dy:1},{name:'west',bit:8,dx:-1,dy:0}].map(Object.freeze));
export function conveyorKey(x,y,level=0){if(![x,y,level].every(Number.isInteger))throw Error('Conveyor coordinates must be integers');return [x,y,level].join(',');}
export function conveyorMask(tiles,x,y,level=0){if(!tiles.has(conveyorKey(x,y,level)))return null;return CONVEYOR_PORTS.reduce((mask,p)=>mask|(tiles.has(conveyorKey(x+p.dx,y+p.dy,level))?p.bit:0),0);}
export function conveyorVariant(mask){if(!Number.isInteger(mask)||mask<0||mask>15)throw Error('Invalid conveyor mask');const ports=CONVEYOR_PORTS.filter(p=>mask&p.bit);let kind=ports.length===0?'isolated':ports.length===1?'end':ports.length===3?'tee':ports.length===4?'cross':(mask===5||mask===10)?'straight':'corner';return {mask,kind,ports:ports.map(p=>p.name)};}
export function changedConveyorCells(x,y,level=0){return [[x,y,level],...CONVEYOR_PORTS.map(p=>[x+p.dx,y+p.dy,level])];}
