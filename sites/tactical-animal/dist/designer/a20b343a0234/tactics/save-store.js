export const SAVE_SLOTS=[['slot-1','Slot 1'],['slot-2','Slot 2'],['slot-3','Slot 3'],['quick','Quicksave'],['auto','Autosave']];
const valid=id=>{if(!SAVE_SLOTS.some(([key])=>key===id))throw Error('Choose a valid save slot.');};
const DB='farmyard-commando-designer-playtests-v1',TABLE='saves';
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(TABLE,{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('Browser storage is unavailable.'));r.onblocked=()=>reject(Error('Close other game tabs and try again.'));});}
async function transaction(mode,work){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(TABLE,mode),req=work(tx.objectStore(TABLE));let result;req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||Error('Could not write the save.'));tx.onabort=()=>reject(tx.error||Error('Save cancelled.'));});}finally{db.close();}}
export const listSaves=()=>transaction('readonly',s=>s.getAll());
export const getSave=id=>{valid(id);return transaction('readonly',s=>s.get(id));};
export const saveToken=record=>record?record.checkpointToken||JSON.stringify([record.savedAt,record.version,record.mapName,record.state?.seed,record.state?.revision]):null;
export const putSave=async(id,record)=>{valid(id);const next={...record,id,checkpointToken:crypto.randomUUID()};await transaction('readwrite',s=>s.put(next));return next;};
// Read/compare/write in ONE transaction; a read followed by putSave is not CAS.
export async function checkpointSave(id,record,expected){
 valid(id);const db=await database(),next={...record,id,checkpointToken:crypto.randomUUID()};
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction(TABLE,'readwrite'),s=tx.objectStore(TABLE);let error;const r=s.get(id);r.onsuccess=()=>{if(saveToken(r.result)!==expected){error=Error('Another tab changed this encounter. Load the latest Autosave before continuing.');error.code='SAVE_CONFLICT';tx.abort();return;}s.put(next);};tx.oncomplete=()=>resolve(next);tx.onerror=tx.onabort=()=>reject(error||tx.error||Error('Dialogue checkpoint failed. Nothing was committed.'));});}finally{db.close();}
}
