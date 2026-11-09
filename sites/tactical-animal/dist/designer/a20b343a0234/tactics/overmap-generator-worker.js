import {generateWorld} from './overmap-generator.js';
self.onmessage=({data})=>{
 try{const map=generateWorld(data.seed,data.options,progress=>self.postMessage({progress}));self.postMessage({map});}
 catch(e){self.postMessage({error:e.message});}
};
