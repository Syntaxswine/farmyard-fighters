import assert from 'node:assert/strict';
// Read the actual canvas pixels at a separately projected simulation position.
// Checks use displayed pixels, including the HUD canvas's contain letterboxing.
export async function assertMapLocation(page,player,{expanded=false,town=true,bounds=null}={}){
  assert([player.x,player.y,player.heading].every(Number.isFinite),'Map pixel checks need an authoritative position and heading');
  const result=await page.evaluate(({player,expanded,town,bounds})=>{
    const c=document.getElementById(expanded?'large-map':'minimap'),ctx=c.getContext('2d'),r=c.getBoundingClientRect(),style=getComputedStyle(c),fit=style.objectFit==='contain',sx=fit?Math.min(r.width/c.width,r.height/c.height):r.width/c.width,sy=fit?sx:r.height/c.height;
    const b=town?{x:0,y:0,w:1440,h:1680}:bounds,scale=Math.min((c.width-12)/b.w,(c.height-12)/b.h),x=(c.width-b.w*scale)/2+(player.x+(town ? .5 : 0)-b.x)*scale,y=(c.height-b.h*scale)/2+(player.y+(town ? .5 : 0)-b.y)*scale,heading=player.heading*Math.PI/180;
    const pixel=offset=>{const px=Math.round(x-Math.sin(heading)*offset/sx-.5),py=Math.round(y+Math.cos(heading)*offset/sy-.5);return [...ctx.getImageData(px,py,1,1).data];};
    return {backing:{width:c.width,height:c.height},display:{width:r.width,height:r.height,scaleX:sx,scaleY:sy},position:{x,y},center:pixel(0),brightCore:pixel(expanded?3:2.5),darkHalo:pixel(expanded?6:5),aria:c.getAttribute('aria-label'),role:c.getAttribute('role'),legend:expanded?document.getElementById('overlay-content').textContent:null};
  },{player,expanded,town,bounds});
  const color=(pixel,expected)=>pixel.slice(0,3).every((v,i)=>Math.abs(v-expected[i])<=12)&&pixel[3]===255;
  assert(color(result.center,[255,243,209]),'Current location must have a bright center: '+JSON.stringify(result));assert(color(result.brightCore,[255,243,209]),'Marker must retain a visible CSS-pixel bright core: '+JSON.stringify(result));assert(color(result.darkHalo,[16,24,15]),'Marker must retain its dark CSS-pixel halo: '+JSON.stringify(result));assert.equal(result.role,'img');assert.match(result.aria,/current location/);if(expanded){assert.match(result.aria,/YOU ARE HERE/);assert.match(result.legend,/YOU ARE HERE/);}return result;
}
