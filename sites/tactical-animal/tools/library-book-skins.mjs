import fs from 'node:fs';
import {SKINS,BOOK_SKIN_ATLAS as atlas} from '../dist/art/library/catalog.js';

// Original vector skin: four shelf arrangements per finish. The upper 96 px
// of each cell paint spines; its lower 32 px paint the top/side page surfaces.
const hex=n=>'#'+n.toString(16).padStart(6,'0');
const mix=(color,t)=>{const rgb=[color>>16&255,color>>8&255,color&255].map(c=>Math.round(c*t));return '#'+rgb.map(c=>c.toString(16).padStart(2,'0')).join('');};
const output=[`<svg xmlns="http://www.w3.org/2000/svg" width="${atlas.width}" height="${atlas.height}" viewBox="0 0 ${atlas.width} ${atlas.height}">`,
 '<title>Farmyard Commando — painted book-row skins</title>',
 '<desc>Original vector textures. Six finish palettes, four shelf arrangements each. Spines, bands, blank labels and page edges are painted into a shared atlas.</desc>'];
for(const [s,skin] of SKINS.entries())for(let variant=0;variant<4;variant++){
 const count=8,widths=Array.from({length:count},(_,i)=>19+(i*13+variant*7)%15),total=widths.reduce((a,b)=>a+b),scale=248/total;
 output.push(`<g id="${skin.id}-${variant}" transform="translate(${variant*256} ${s*128})"><rect width="256" height="128" fill="#302d26"/>`);
 let x=4;
 for(let i=0;i<count;i++){
  const w=widths[i]*scale-1.5,top=8+(i*7+variant*11)%17,h=94-top,color=skin.books[(i+variant*2)%skin.books.length];
  const label=i%3===1?'#cfc5a5':'#b9ad88';
  output.push(`<g><rect x="${x.toFixed(2)}" y="${top}" width="${w.toFixed(2)}" height="${h}" fill="${hex(color)}"/>`,
   `<rect x="${x.toFixed(2)}" y="${top}" width="2" height="${h}" fill="${mix(color,.62)}"/>`,
   `<path d="M${(x+3).toFixed(2)} ${top+1}h${(w-5).toFixed(2)}" stroke="${mix(color,1.15)}" stroke-width="2"/>`,
   `<path d="M${(x+3).toFixed(2)} ${top+12}h${(w-6).toFixed(2)}M${(x+3).toFixed(2)} 82h${(w-6).toFixed(2)}" stroke="#b7a06b" stroke-width="2" opacity=".8"/>`,
   `<rect x="${(x+4).toFixed(2)}" y="${top+22}" width="${(w-8).toFixed(2)}" height="${i%2?13:19}" rx=".5" fill="${label}"/>`,
   `<path d="M${(x+6).toFixed(2)} ${top+27}h${(w-12).toFixed(2)}M${(x+6).toFixed(2)} ${top+31}h${(w-12).toFixed(2)}" stroke="#665f4f" stroke-width=".8" opacity=".65"/>`,
   `<rect x="${x.toFixed(2)}" y="98" width="${w.toFixed(2)}" height="27" fill="${hex(color)}"/>`,
   `<rect x="${(x+2).toFixed(2)}" y="100" width="${(w-4).toFixed(2)}" height="23" fill="#cfc5a5"/>`,
   `<path d="M${(x+3).toFixed(2)} 105h${(w-6).toFixed(2)}M${(x+3).toFixed(2)} 111h${(w-6).toFixed(2)}M${(x+3).toFixed(2)} 117h${(w-6).toFixed(2)}" stroke="#a49c81" stroke-width=".7"/></g>`);
  x+=widths[i]*scale;
 }
 output.push('</g>');
}
output.push('</svg>');
fs.writeFileSync('sites/tactical-animal/dist/art/library/book-spines.svg',output.join('\n')+'\n');
console.log('Wrote 24 vector book-row skins in one 1024 × 768 atlas.');
