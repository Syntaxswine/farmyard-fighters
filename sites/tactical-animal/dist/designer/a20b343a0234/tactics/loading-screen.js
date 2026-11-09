// Presentation only. The caller supplies real progress; no simulated timer or
// navigation is part of the reusable loading screen.
export function bindLoadingScreen(root){
  const track=root.querySelector('.loading-track'),fill=root.querySelector('.loading-fill'),percent=root.querySelector('.loading-percent'),status=root.querySelector('.loading-status'),phase=root.querySelector('.loading-phase');
  let disposed=false;
  function update(value,message){
    if(disposed)return;
    if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)))throw new TypeError('Progress must be a finite percentage or null');
    const progress=value===null?null:Math.max(0,Math.min(100,value));
    root.dataset.state='loading';root.classList.toggle('is-indeterminate',progress===null);root.setAttribute('aria-busy','true');
    if(progress===null){track.removeAttribute('aria-valuenow');fill.style.width='20%';percent.textContent='—';}
    else{track.setAttribute('aria-valuenow',String(progress));fill.style.width=progress+'%';percent.textContent=Math.floor(progress).toString().padStart(2,'0')+'%';}
    if(message!==undefined)status.textContent=String(message);
    phase.textContent='PREPARING THE FIELD';
  }
  function ready(message='Deployment ready'){
    if(disposed)return;update(100,message);root.dataset.state='ready';root.setAttribute('aria-busy','false');phase.textContent='ALL SYSTEMS READY';
  }
  function error(message='Connection interrupted. Please try again.'){
    if(disposed)return;root.dataset.state='error';root.classList.remove('is-indeterminate');root.setAttribute('aria-busy','false');track.removeAttribute('aria-valuenow');status.textContent=String(message);percent.textContent='!';phase.textContent='LOADING INTERRUPTED';
  }
  update(null);
  return{setProgress:update,ready,error,setPaused(paused){if(!disposed)root.classList.toggle('is-paused',!!paused);},dispose(){if(disposed)return;disposed=true;root.classList.add('is-paused');root.setAttribute('aria-busy','false');}};
}
