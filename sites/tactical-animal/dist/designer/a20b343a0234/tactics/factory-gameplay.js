import {FACTORY_PACKED} from './factory-gameplay-data.js';
import {isMachine,sceneryRule} from './scenery-catalog.js';
const decoded=new Map();
function floats(text){const bytes=Uint8Array.from(atob(text),c=>c.charCodeAt(0));return new Float32Array(bytes.buffer);}
// Decode each family once, on first physical use. Headless and browser agree.
export function factoryData(p){
 if(!isMachine(p))return null;const form=sceneryRule(p).form;if(decoded.has(form))return decoded.get(form);
 const record=FACTORY_PACKED[form],flat=floats(record.nodes),nodes=Array.from({length:flat.length/8},(_,i)=>flat.subarray(i*8,i*8+8));
 const data={...record,nodes,triangles:floats(record.triangles)};decoded.set(form,data);return data;
}
