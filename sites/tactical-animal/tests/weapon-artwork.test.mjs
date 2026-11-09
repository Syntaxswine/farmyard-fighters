import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WEAPON_FRAMES} from '../dist/aft/tactics/weapon-icons.js';

test('every painted weapon starts with its final project URL, release version and original crop',async()=>{
  const previous=globalThis.document,requests=[];
  globalThis.document={createElement(tag){return {tag,style:{},children:[],setAttribute(){},append(...children){this.children.push(...children);},set src(value){requests.push(value);this.source=value;}};}};
  try{
    const {weaponArtwork}=await import('../dist/weapon-artwork.js?v=phone-artwork');
    for(const [kind,{size:[iw,ih],frame:[x,y,w,h]}]of Object.entries(WEAPON_FRAMES)){
      const sprite=weaponArtwork(kind,35),frame=sprite.children[0],image=frame.children[1];
      assert.equal(requests.length,1,kind+' must not request a transient document-relative URL');
      const source=new URL(requests.pop());
      assert.ok(source.pathname.endsWith('/dist/aft/assets/equipment/painted-ui/'+kind+'.png'));
      assert.equal(source.search,'?v=phone-artwork');
      assert.ok(frame.style.cssText.includes(`width:${35*w/h}px`));
      assert.equal(frame.children[0].style.cssText,`display:block;padding-top:${100*h/w}%`);
      for(const declaration of [`width:${100*iw/w}%`,`height:${100*ih/h}%`,`left:${-100*x/w}%`,`top:${-100*y/h}%`])assert.ok(image.style.cssText.includes(declaration),kind+': '+declaration);
    }
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
