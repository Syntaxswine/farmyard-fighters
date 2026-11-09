import {blankMap} from './core/maps.js';
export function wallBreachFixture({material='brick',count=1,layout='straight',axis='s',level=0}={}){
 const family=['brick','concrete','corrugated'].includes(material)?material:'brick',z=level===1?1:0,n=Math.max(0,Math.min(5,Number(count)||0));
 const state={map:Array.from({length:17},()=>Array(17).fill('yard')),upper:[{},{}],edges:{},props:[],stairs:[],units:[],visible:new Set(),seen:new Set()};
 const path=layout==='corner'?[...Array.from({length:6},(_,i)=>['s',3+i,6]),...Array.from({length:6},(_,i)=>['e',8,7+i])]:Array.from({length:12},(_,i)=>['s',2+i,6]);
 const name=([a,x,y])=>{if(axis==='e')[a,x,y]=[a==='e'?'s':'e',y,x];return `${a}:${x}:${y}`+(z?':'+z:'');};
 path.forEach((p,i)=>state.edges[name(p)]=(layout==='window'&&i===4?'window-':'wall-')+family);
 state.definition={edges:{...state.edges}};
 const indices=layout==='separated'?[4,6,8,5,7].slice(0,n):Array.from({length:n},(_,i)=>(layout==='corner'?4:5)+i);
 for(const i of indices)if(path[i])delete state.edges[name(path[i])];
 if(z)for(let y=2;y<15;y++)for(let x=1;x<15;x++)state.upper[0][`${x},${y}`]='floor';
 for(let y=0;y<17;y++)for(let x=0;x<17;x++)for(let level=0;level<3;level++){const k=`${x},${y}`+(level?','+level:'');state.visible.add(k);state.seen.add(k);}
 return {state,level:z,removed:indices.map(i=>path[i]).filter(Boolean).map(name),original:{...state.definition.edges}};
}
export function wallBreachBattleFixture(){
 const m=blankMap('Wall breaches · rough ends and joined openings');m.starts=['horse','goat','pig-director','hen'].map((species,i)=>({x:20+i*2,y:25,z:0,species,weapon:i%2?'launcher':'rpg',stats:{strength:50,agility:50,dexterity:90,explosives:90}}));m.exits=[{x:18,y:27,z:0}];
 for(const [row,material]of [[20,'brick'],[14,'concrete'],[8,'corrugated']])for(let x=14;x<30;x++)m.edges[`s:${x}:${row}`]='wall-'+material;
 return m;
}
