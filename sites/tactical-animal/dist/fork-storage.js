// Synchronous adapter for retained editor/tool pages. The Fighters namespace
// keeps designs separate from both Commando releases on the same Pages origin.
(()=>{
  const prefix='farmyard-fighters:tools:';
  for(const name of ['localStorage','sessionStorage']){
    try{
      const raw=window[name],keys=()=>Array.from({length:raw.length},(_,i)=>raw.key(i)).filter(k=>k?.startsWith(prefix));
      const api={getItem:key=>raw.getItem(prefix+String(key)),setItem:(key,value)=>raw.setItem(prefix+String(key),String(value)),removeItem:key=>raw.removeItem(prefix+String(key)),clear:()=>keys().forEach(k=>raw.removeItem(k)),key:index=>keys()[Number(index)]?.slice(prefix.length)??null};
      const view=new Proxy(api,{
        get:(_target,key)=>key==='length'?keys().length:typeof key==='symbol'?undefined:Object.hasOwn(api,key)?api[key]:api.getItem(key)??undefined,
        set:(_target,key,value)=>{api.setItem(key,value);return true;},
        deleteProperty:(_target,key)=>{api.removeItem(key);return true;},
        ownKeys:()=>keys().map(k=>k.slice(prefix.length)),
        getOwnPropertyDescriptor:(_target,key)=>api.getItem(key)===null?undefined:{configurable:true,enumerable:true,writable:true,value:api.getItem(key)},
        has:(_target,key)=>key==='length'||Object.hasOwn(api,key)||api.getItem(key)!==null,
      });
      Object.defineProperty(window,name,{configurable:true,get:()=>view});
    }catch{/* The original tool handles denied browser storage through its normal UI. */}
  }
  if(window.indexedDB){
    const db=window.indexedDB,open=db.open.bind(db),remove=db.deleteDatabase.bind(db),list=db.databases?.bind(db);
    db.open=(name,...args)=>open(prefix+name,...args);db.deleteDatabase=(name,...args)=>remove(prefix+name,...args);
    if(list)db.databases=async()=>((await list()).filter(r=>r.name?.startsWith(prefix)).map(r=>({...r,name:r.name.slice(prefix.length)})));
  }
})();
