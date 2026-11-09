// The pinned editor selects while its async changed() is still busy. Refresh
// once more after its promise continuations release that busy flag.
export function bindWindowEditorControls(scene,update,{schedule=setTimeout,cancel=clearTimeout}={}){
  const original={select:scene.select,changed:scene.changed};let timer=null,disposed=false;
  function refresh(){if(disposed)return;update();if(timer!==null)cancel(timer);timer=schedule(()=>{timer=null;if(!disposed)update();},0);}
  const wrappers={};for(const name of ['select','changed']){
    wrappers[name]=function(...args){const result=original[name].apply(this,args);refresh();return result;};scene[name]=wrappers[name];
  }
  return ()=>{if(disposed)return;disposed=true;if(timer!==null)cancel(timer);timer=null;for(const name of ['select','changed'])if(scene[name]===wrappers[name])scene[name]=original[name];};
}
