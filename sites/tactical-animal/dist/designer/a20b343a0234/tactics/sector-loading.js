import {bindLoadingScreen} from './loading-screen.js';
const markup=`<img class="loading-art" src="../assets/ui/loading-screen/command-room-v1.png" alt="" fetchpriority="high">
 <div class="loading-shade" aria-hidden="true"></div>
 <header class="loading-masthead"><span class="loading-insignia" aria-hidden="true">AF</span><span>FIELD OPERATIONS<br><b>COMMAND NETWORK</b></span></header>
 <section class="loading-brand" aria-label="Animal Factory Tactics"><p class="loading-eyebrow">TACTICAL OPERATIONS</p><h1>ANIMAL<br>FACTORY<span>TACTICS</span></h1><p class="loading-caption">Stand by for deployment.</p></section>
 <section class="loading-readout" aria-label="Loading status"><div class="loading-status-row"><p class="loading-status" role="status" aria-live="polite">Receiving sector</p><span class="loading-percent" aria-hidden="true">—</span></div>
 <div class="loading-track" role="progressbar" aria-label="Sector loading" aria-valuemin="0" aria-valuemax="100"><div class="loading-fill"></div><div class="loading-ticks" aria-hidden="true"></div></div>
 <div class="loading-readout-footer"><span class="loading-phase">PREPARING THE FIELD</span><div class="loading-lights" aria-hidden="true"><span><i></i>PWR</span><span class="data-lamp"><i></i>DATA</span><span class="link-lamp"><i></i>LINK</span></div></div>
 <div class="loading-recovery" hidden><button type="button" data-loading-retry>Retry</button><button type="button" data-loading-back>Back</button></div></section>`;
export const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
let root,view,restore=[],focusBefore,running=false;
function initialize(){
 if(root)return;root=document.createElement('dialog');root.id='sector-loading';root.className='loading-screen';root.hidden=true;root.tabIndex=-1;root.setAttribute('aria-label','Loading sector');root.innerHTML=markup;document.body.append(root);view=bindLoadingScreen(root);root.addEventListener('cancel',event=>event.preventDefault());
 document.addEventListener('visibilitychange',()=>view.setPaused(document.hidden));
}
function hide(){root.close();root.hidden=true;for(const [el,inert]of restore)el.inert=inert;restore=[];document.documentElement.classList.remove('sector-loading-active');if(focusBefore?.isConnected)focusBefore.focus({preventScroll:true});document.dispatchEvent(new Event('sector-ready'));}
export const sectorLoading={
 get active(){return !!root&&!root.hidden;},
 status(message){view?.setProgress(null,message);},
 async run(operation,{message='Receiving sector',keepOpen=false,back=()=>{location.href='../../../index.html';},backLabel='Main menu'}={}){
  if(running)throw Error('A sector is already loading.');initialize();running=true;
  if(root.hidden){focusBefore=document.activeElement;restore=[...document.body.children].filter(el=>el!==root&&!['SCRIPT','LINK','STYLE'].includes(el.tagName)).map(el=>[el,el.inert]);for(const [el]of restore)el.inert=true;}
  root.hidden=false;if(!root.open)root.showModal();document.documentElement.classList.add('sector-loading-active');root.querySelector('.loading-recovery').hidden=true;view.setProgress(null,message);view.setPaused(document.hidden);root.focus({preventScroll:true});
  try{await nextPaint();const result=await operation();view.ready();await nextPaint();if(!keepOpen)hide();return result;}
  catch(error){view.error(error.message||'This sector could not load.');const actions=root.querySelector('.loading-recovery');actions.hidden=false;actions.querySelector('[data-loading-retry]').onclick=()=>this.run(operation,{message,keepOpen,back,backLabel}).catch(()=>{});const exit=actions.querySelector('[data-loading-back]');exit.textContent=backLabel;exit.onclick=()=>{hide();back();};throw error;}
  finally{running=false;}
 }
};
