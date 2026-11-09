// Per-renderer requests, including character preparation after texture fetches.
// This does not use the global Three manager or infer progress from elapsed time.
export class LoadingTracker {
 constructor(){this.started=0;this.finished=0;this.errors=[];this.optionalErrors=[];this.waiters=[];}
 get pending(){return this.started-this.finished;}
 start(){this.started++;}
 fail(error){this.errors.push(error instanceof Error?error:Error(String(error)));}
 end(){this.finished++;if(!this.pending)for(const done of this.waiters.splice(0))done();}
 async wait(){if(this.pending)await new Promise(resolve=>this.waiters.push(resolve));if(this.errors.length)throw this.errors[0];}
}
export function trackLoadingManager(manager,tracker,{required=true}={}){
 const start=manager.itemStart.bind(manager),end=manager.itemEnd.bind(manager),error=manager.itemError.bind(manager);
 manager.itemStart=url=>{tracker.start();start(url);};
 manager.itemEnd=url=>{end(url);tracker.end();};
 manager.itemError=url=>{if(required)tracker.fail('Could not load sector artwork: '+url);else if(!tracker.optionalErrors.includes(String(url)))tracker.optionalErrors.push(String(url));error(url);};
 return manager;
}

export async function prepareSectorView(renderer,draw,{paint=()=>new Promise(resolve=>requestAnimationFrame(resolve)),status=()=>{}}={}){
 // A finished asset can invalidate the scene or reveal a second set of assets.
 // Render until a complete pass starts no requests and leaves a built world.
 for(let pass=0;pass<12;pass++){
  const before=renderer.loading.started;status('Preparing terrain and squad');draw();
  const n=renderer.loading.pending;if(n)status('Loading sector artwork · '+n+' pending');
  await renderer.loading.wait();
  await Promise.all((renderer.biomes?.terrains||[]).map(t=>t.groundSkin?.whenReady()));
  await paint();
  if(before===renderer.loading.started&&renderer.world)return;
 }
 throw Error('Sector artwork did not finish preparing. Please retry.');
}
