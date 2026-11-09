// Same record/transaction layout as design-store.js, with an isolated database.
// Version 1 starts empty; no automatic migration from the sprite editor's store.
const DB='farmyard-commando-3d-designs-v1',TABLE='designs';
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(TABLE,{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Close other 3D editor tabs and retry.'));});}
async function transaction(mode,work){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(TABLE,mode);let result;const req=work(tx.objectStore(TABLE));req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Save cancelled.'));});}finally{db.close();}}
export const listDesigns=()=>transaction('readonly',s=>s.getAll());
export const getDesign=id=>transaction('readonly',s=>s.get(id));
export const saveDesign=record=>transaction('readwrite',s=>s.put(record));
