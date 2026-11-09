import {WEAPON_FRAMES,weaponIcon} from './aft/tactics/weapon-icons.js';

const origin=new URL('./aft/tactics/',import.meta.url);
const release=new URL(import.meta.url).search;

// Set the final URL before attaching an image. The parent game's factory first
// requests a document-relative URL, which is outside this GitHub Pages project.
export function weaponArtwork(kind,height=34){
  if(kind==='pistol-offhand')kind='pistol';
  const sprite=document.createElement('span');
  sprite.className='weapon-sprite';sprite.setAttribute('aria-hidden','true');
  sprite.style.cssText=`display:flex;align-items:center;justify-content:center;width:100%;min-width:0;height:${height}px`;
  const source=weaponIcon(kind),bounds=WEAPON_FRAMES[kind];
  if(!source||!bounds)return sprite;
  const image=document.createElement('img'),url=new URL(source,origin);
  // A fresh module release also refreshes artwork cached by returning phones.
  url.search=release;image.src=url.href;image.alt='';image.draggable=false;
  const [iw,ih]=bounds.size,[x,y,w,h]=bounds.frame;
  const frame=document.createElement('span'),sizer=document.createElement('span');
  frame.className='weapon-sprite-frame';
  // Padding supplies real height even on WebKit versions with flex/aspect-ratio
  // sizing differences. The original painting and recorded crop stay untouched.
  frame.style.cssText=`display:block;position:relative;overflow:hidden;flex:0 1 auto;width:${height*w/h}px;max-width:100%`;
  sizer.style.cssText=`display:block;padding-top:${100*h/w}%`;
  image.style.cssText=`position:absolute;display:block;max-width:none;object-fit:fill;image-rendering:auto;filter:none;width:${100*iw/w}%;height:${100*ih/h}%;left:${-100*x/w}%;top:${-100*y/h}%`;
  frame.append(sizer,image);sprite.append(frame);return sprite;
}
