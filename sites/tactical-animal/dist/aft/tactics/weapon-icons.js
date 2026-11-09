// Painted bitmap sprites shared by the HUD and Inventory. World loot keeps its art.
// Frames exclude empty source-canvas margins; PNG pixels and alpha stay unchanged.
export const WEAPON_FRAMES=Object.freeze({
 "assault": {
  "size": [
   2007,
   784
  ],
  "frame": [
   27,
   112,
   1955,
   588
  ]
 },
 "flamethrower": {
  "size": [
   1979,
   795
  ],
  "frame": [
   29,
   48,
   1927,
   700
  ]
 },
 "grenade": {
  "size": [
   1223,
   1286
  ],
  "frame": [
   189,
   35,
   871,
   1235
  ]
 },
 "hands": {
  "size": [
   1774,
   887
  ],
  "frame": [
   81,
   138,
   1613,
   664
  ]
 },
 "hmg": {
  "size": [
   2172,
   724
  ],
  "frame": [
   18,
   120,
   2139,
   486
  ]
 },
 "knife": {
  "size": [
   2172,
   724
  ],
  "frame": [
   57,
   171,
   2060,
   422
  ]
 },
 "launcher": {
  "size": [
   1774,
   887
  ],
  "frame": [
   40,
   168,
   1711,
   567
  ]
 },
 "pistol": {
  "size": [
   1774,
   887
  ],
  "frame": [
   189,
   34,
   1492,
   830
  ]
 },
 "rifle": {
  "size": [
   2172,
   724
  ],
  "frame": [
   38,
   191,
   2097,
   387
  ]
 },
 "rpg": {
  "size": [
   2172,
   724
  ],
  "frame": [
   44,
   177,
   2100,
   407
  ]
 },
 "shotgun": {
  "size": [
   2172,
   724
  ],
  "frame": [
   37,
   181,
   2099,
   403
  ]
 },
 "smg": {
  "size": [
   2172,
   724
  ],
  "frame": [
   49,
   128,
   2076,
   477
  ]
 },
 "sniper": {
  "size": [
   2172,
   724
  ],
  "frame": [
   36,
   147,
   2116,
   469
  ]
 }
});
export const WEAPON_ICONS=Object.freeze(Object.fromEntries(Object.keys(WEAPON_FRAMES).map(kind=>[kind,'../assets/equipment/painted-ui/'+kind+'.png'])));
export const weaponIcon=kind=>WEAPON_ICONS[kind==='pistol-offhand'?'pistol':kind]||null;

// A CSS viewport fits the visible painting without stretching or rewriting it.
// The outer box preserves the same hit target and row height for every weapon.
export function createWeaponSprite(kind=null,{height=34,source=null}={}){
 const host=document.createElement('span');host.className='weapon-sprite';host.setAttribute('aria-hidden','true');
 host.style.cssText='display:flex;align-items:center;justify-content:center;width:100%;min-width:0;height:var(--weapon-sprite-height,'+height+'px)';
 host.dataset.height=height;setWeaponSprite(host,kind,source);return host;
}
export function setWeaponSprite(host,kind,source=null){
 if(kind==='pistol-offhand')kind='pistol';
 const src=weaponIcon(kind)||source;
 if(host.dataset.source===(src||''))return;
 host.dataset.source=src||'';host.replaceChildren();if(!src)return;
 const image=document.createElement('img');image.src=src;image.alt='';image.draggable=false;
 const bounds=WEAPON_FRAMES[kind];
 if(!bounds){image.style.cssText='width:100%;height:100%;object-fit:contain';host.append(image);return;}
 const [iw,ih]=bounds.size,[x,y,w,h]=bounds.frame,frame=document.createElement('span');
 frame.className='weapon-sprite-frame';
 const limit='var(--weapon-sprite-height,'+host.dataset.height+'px)';
 frame.style.cssText='display:block;position:relative;overflow:hidden;flex:none;aspect-ratio:'+w+'/'+h+';width:min(100%,calc('+limit+' * '+w/h+'))';
 image.style.cssText='position:absolute;display:block;max-width:none;object-fit:fill;image-rendering:auto;filter:none;width:'+100*iw/w+'%;height:'+100*ih/h+'%;left:'+(-100*x/w)+'%;top:'+(-100*y/h)+'%';
 frame.append(image);host.append(frame);
}
