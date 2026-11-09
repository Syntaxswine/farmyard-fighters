import {foliageDepth} from '../foliage-data.js';
import {terrainAt,levelOf,LEVELS} from './maps.js';

// Exact lengths through grid cells, including partial entry/exit cells. Woodland
// occupies the three-unit layer above its floor; elevated rays can pass above it.
export function woodlandDepth(s,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,az=levelOf(a),bz=levelOf(b),dz=(bz-az)*3;
 const length=Math.hypot(dx,dy,dz);if(!length)return 0;
 const cuts=[0,1];
 for(const [start,delta]of [[a.x,dx],[a.y,dy]])if(delta)for(let v=Math.floor(Math.min(start,start+delta)+.5)+.5;v<Math.max(start,start+delta);v++){const t=(v-start)/delta;if(t>0&&t<1)cuts.push(t);}
 if(dz)for(let z=1;z<LEVELS;z++){const t=(z*3-(az*3+1.5))/dz;if(t>0&&t<1)cuts.push(t);}
 cuts.sort((x,y)=>x-y);let depth=0;
 for(let i=1;i<cuts.length;i++){const t=(cuts[i-1]+cuts[i])/2,z=Math.floor((az*3+1.5+dz*t)/3);depth+=foliageDepth(s,Math.round(a.x+dx*t),Math.round(a.y+dy*t),z)*(cuts[i]-cuts[i-1])*length;}
 return depth;
}
