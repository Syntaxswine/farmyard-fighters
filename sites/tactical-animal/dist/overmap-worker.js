import {generateOvermap} from './overmap-generator.js';
self.onmessage=event=>{
  const {id,seed,settings}=event.data;
  try{
    const map=generateOvermap(seed,settings,progress=>self.postMessage({id,progress}));
    self.postMessage({id,map});
  }catch(error){self.postMessage({id,error:error.message});}
};
