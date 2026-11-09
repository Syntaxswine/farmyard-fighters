import * as T from './vendor/three.module.js';

// Far views exceed the atlas inset's safe mip level. Fade toward the panel's
// own linear-light average instead of sampling neighboring panels or aliasing.
export function meanLinearRGB(rgba){
 const sum=[0,0,0];let weight=0;const linear=n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;};
 for(let i=0;i<rgba.length;i+=4){const a=rgba[i+3]/255;for(let c=0;c<3;c++)sum[c]+=linear(rgba[i+c])*a;weight+=a;}
 return sum.map(n=>weight?n/weight:0);
}
export function panelAverage(texture,[column,row,columns,rows]){
 const image=texture?.image;
 if(!image||typeof document==='undefined')return new T.Vector3(.2,.2,.2);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=image.width/columns,h=image.height/rows;
 ctx.drawImage(image,(column+.04)*w,(row+.04)*h,w*.92,h*.92,0,0,64,64);
 return new T.Vector3(...meanLinearRGB(ctx.getImageData(0,0,64,64).data));
}
