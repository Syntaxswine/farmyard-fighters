// This small, independent script can report a failed application import even
// when none of the modules behind app.js have executed.
(() => {
  const startup=document.getElementById('game-startup');
  const heading=document.getElementById('startup-heading');
  const copy=document.getElementById('startup-copy');
  const retry=document.getElementById('startup-retry');
  const retryURL=new URL(location.href);
  retryURL.searchParams.set('reload',String(Date.now()));
  retry.href=retryURL.href;
  let finished=false;
  const stop=()=>{finished=true;clearTimeout(slow);window.removeEventListener('error',failed,true);window.removeEventListener('load',loaded,true);};
  function failed(event){
    if(finished||document.body.dataset.gameReady==='true')return;
    // An optional image failing is not an application startup failure.
    if(event.target!==window&&event.target?.id!=='game-entry')return;
    stop();startup.dataset.state='failed';
    heading.textContent='The game could not load.';
    copy.textContent='Retry to download the game files again. Your operation and loadout choices are kept.';
  }
  function loaded(event){
    if(event.target?.id!=='game-entry')return;
    if(document.body.dataset.gameReady!=='true'){failed(event);return;}
    stop();
  }
  const slow=setTimeout(()=>{
    if(finished||document.body.dataset.gameReady==='true')return;
    startup.dataset.state='slow';
    heading.textContent='Loading is taking longer than expected.';
    copy.textContent='You can keep waiting, or retry downloading the game files.';
  },15000);
  window.addEventListener('error',failed,true);
  window.addEventListener('load',loaded,true);
})();
