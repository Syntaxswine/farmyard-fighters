import {foliageStrokePreview} from './editor-foliage-preview.js';
import {buildFoliageObstacles} from './foliage-obstacles.js';
let map,size,trees,population;
self.onmessage=({data})=>{
 if(data.map){map=data.map;size=data.size;trees=buildFoliageObstacles(map,{treesOnly:true}).trees;population=null;return;}
 try{
  if(data.command.options?.foliageMode==='tree-cover'&&!population)population={trees:buildFoliageObstacles(map,{treesOnly:true,denseTreeMix:'trees'}).trees,baseline:new Set(buildFoliageObstacles(map,{treesOnly:true,denseTreeMix:'current'}).trees.map(t=>`${t.x},${t.y},${t.z}`))};
  self.postMessage({id:data.id,result:foliageStrokePreview(map,data.command,size,trees,population)});
 }
 catch(error){self.postMessage({id:data.id,result:{ok:false,error:error.message}});}
};
