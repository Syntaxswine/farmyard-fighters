import {TARGET_SPRITES} from './target-sprites.js';

const release=new URL(import.meta.url).search;
let monitorSequence=0;
const label={torso:'TORSO',head:'HEAD',weapon:'WEAPON',legs:'LEGS'};
const references={dog:'model-references/dog-woman-turnaround-v1.png',rabbit:'model-references/rabbit-woman-turnaround-v1.png',bull:'lowpoly-proof/bull-worker-model-paint-v2.png'};
export function spriteCandidates(target){
  const species=target.species,stance=['kneeling','prone'].includes(target.stance)?target.stance:'standing',weapon={'pistol-offhand':'pistol',launcher:'grenade-launcher'}[target.weapon]||target.weapon;
  const candidates=[
    [`weapon-expansion/normal/${species}-${weapon}-${stance}.png`,stance,false],
    [stance==='standing'?`armed/${species}-${weapon}.png`:`stances/${species}-${weapon}-${stance}.png`,stance,false],
    [`armed/${species}-${weapon}.png`,'standing',stance!=='standing'],
    [`${species}-idle.png`,'standing',true],
    [references[species],'standing',true],
  ];
  return candidates.filter(([file],i,all)=>file&&TARGET_SPRITES[file]&&all.findIndex(candidate=>candidate[0]===file)===i).map(([file,pose,reference])=>({file,pose,reference,frame:TARGET_SPRITES[file],url:new URL('./aft/assets/characters/'+file+release,import.meta.url).href}));
}

// Normalized regions inside the actual sprite's measured nontransparent bounds.
// Pose-specific coordinates keep the reticle on the body after kneeling/prone.
export function targetRegion(sprite,zone){
  const regions=sprite.pose==='prone'?{
    head:[.59,.08,.18,.37],torso:[.35,.27,.28,.53],weapon:[.69,.48,.29,.24],legs:[.02,.19,.36,.65],
  }:sprite.pose==='kneeling'?{
    head:[.32,.03,.26,.29],torso:[.22,.31,.35,.38],weapon:[.52,.22,.44,.24],legs:[.17,.65,.54,.32],
  }:{
    head:[.25,.02,.35,.25],torso:[.2,.29,.43,.28],weapon:[.51,.24,.45,.24],legs:[.21,.61,.55,.36],
  };
  const [x,y,w,h]=regions[zone]||regions.torso,[,,fx,fy,fw,fh]=sprite.frame;
  return {x:fx+x*fw,y:fy+y*fh,width:w*fw,height:h*fh};
}

export function createTargetMonitor(state,target,preview,zone='torso',document=globalThis.document){
  if(!target||target.hp<=0||target.team!=='guard'||!state.detected.has(target.id))return null;
  const candidates=spriteCandidates(target),figure=document.createElement('figure'),id='target-monitor-'+(++monitorSequence);figure.className='target-monitor';figure.dataset.zone=zone;figure.dataset.chance=String(preview.chance??0);
  figure.setAttribute('aria-label',`${target.name}. ${label[zone]||label.torso} highlighted. ${preview.chance??0}% hit chance.`);
  const glass=document.createElement('div');glass.className='target-glass';
  const glow=document.createElement('span');glow.className='target-center-light';glow.setAttribute('aria-hidden','true');
  const caption=document.createElement('figcaption');caption.className='target-monitor-caption';
  const name=document.createElement('strong');name.textContent=`${target.name} · ${Math.ceil(target.hp)} HP${Number.isFinite(preview.distance)?` · ${preview.distance.toFixed(1)} m`:''}`;
  const status=document.createElement('span');status.className='target-signal-status';
  caption.append(name,status);figure.append(glass,caption);
  const svg=(tag,attrs={})=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
  function draw(index){
    const sprite=candidates[index];
    if(!sprite){
      glass.replaceChildren();const unavailable=document.createElement('span');unavailable.className='target-no-signal';unavailable.textContent='TARGET IMAGE UNAVAILABLE';glass.append(unavailable);
      status.textContent=`${label[zone]||label.torso} · ${preview.chance??0}% HIT`;figure.dataset.signal='unavailable';return;
    }
    figure.dataset.sprite=sprite.file;figure.dataset.pose=sprite.pose;figure.dataset.signal='loading';
    const frame=svg('svg',{viewBox:'0 0 340 210',class:'target-scan',role:'img','aria-label':`${target.name}, ${target.species.replaceAll('-',' ')}. ${sprite.reference?'Standing reference':sprite.pose} sprite. ${label[zone]||label.torso} ${preview.chance??0} percent.`});
    const defs=svg('defs'),filter=svg('filter',{id:id+'-phosphor'});
    filter.append(svg('feColorMatrix',{type:'matrix',values:'.08 .16 .03 0 0 .22 .56 .08 0 .05 .08 .16 .03 0 0 0 0 0 1 0'}));defs.append(filter);frame.append(defs);
    const [iw,ih,fx,fy,fw,fh]=sprite.frame,wide=sprite.pose==='prone',slot={x:16,y:wide?67:13,width:wide?308:190,height:wide?130:184};
    const scale=Math.min(slot.width/fw,slot.height/fh),offsetX=slot.x+(slot.width-fw*scale)/2-fx*scale,offsetY=slot.y+(slot.height-fh*scale)/2-fy*scale;
    const clip=svg('clipPath',{id:id+'-crop'});clip.append(svg('rect',{x:offsetX+fx*scale,y:offsetY+fy*scale,width:fw*scale,height:fh*scale}));defs.append(clip);
    const art=svg('g',{'clip-path':`url(#${id}-crop)`}),image=svg('image',{href:sprite.url,width:iw,height:ih,transform:`translate(${offsetX} ${offsetY}) scale(${scale})`,filter:`url(#${id}-phosphor)`});
    image.onload=()=>{if(figure.dataset.sprite===sprite.file){figure.dataset.signal='ready';status.textContent=sprite.reference?'POSE REFERENCE':'LIVE TARGET';}};
    image.onerror=()=>{if(figure.dataset.sprite===sprite.file)draw(index+1);};art.append(image);frame.append(art);
    const region=targetRegion(sprite,zone),x=offsetX+region.x*scale,y=offsetY+region.y*scale,w=region.width*scale,h=region.height*scale,cy=wide?34:Math.max(31,Math.min(175,y+h/2));
    frame.append(svg('rect',{x,y,width:w,height:h,rx:3,class:'target-body-highlight','data-zone':zone}));
    frame.append(svg('path',{d:wide?`M${x+w/2} ${y}V${cy}H226`:`M${x+w} ${y+h/2}H218V${cy}H226`,class:'target-hit-leader'}));
    const chance=svg('text',{x:230,y:cy,class:'target-hit-percent'});chance.textContent=`${preview.chance??0}%`;
    const body=svg('text',{x:231,y:cy+18,class:'target-hit-location'});body.textContent=label[zone]||label.torso;
    frame.append(chance,body);glass.replaceChildren(frame,glow);status.textContent=sprite.reference?'POSE REFERENCE':'ACQUIRING TARGET';
  }
  draw(0);return figure;
}
