const BLOCK=24,BYTES=72;
const encode=bytes=>{let text='';for(const b of bytes)text+=String.fromCharCode(b);return btoa(text);};
const decode=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const popcount=n=>{n-=n>>1&85;n=(n&51)+(n>>2&51);return n+(n>>4)&15;};
// At most 4200 x 72 bytes for a completely explored town, not millions of strings.
export class TownExplored{
  constructor(width=1440,height=1680){this.width=width;this.height=height;this.columns=Math.ceil(width/BLOCK);this.rows=Math.ceil(height/BLOCK);this.chunks=new Map();this.encoded=new Map();this.size=0;this.version=0;}
  cell(key){if(typeof key!=='string'||!/^\d+,\d+$/.test(key))return null;const [x,y]=key.split(',').map(Number);if(x>=this.width||y>=this.height)return null;return {id:Math.floor(y/BLOCK)*this.columns+Math.floor(x/BLOCK),bit:y%BLOCK*BLOCK+x%BLOCK};}
  has(key){const p=this.cell(key);return !!p&&!!(this.chunks.get(p.id)?.[p.bit>>3]&(1<<(p.bit&7)));}
  add(key){const p=this.cell(key);if(!p)return this;let bytes=this.chunks.get(p.id);if(!bytes){bytes=new Uint8Array(BYTES);this.chunks.set(p.id,bytes);}const index=p.bit>>3,mask=1<<(p.bit&7);if(!(bytes[index]&mask)){bytes[index]|=mask;this.encoded.delete(p.id);this.size++;this.version++;}return this;}
  clear(){this.chunks.clear();this.encoded.clear();this.size=0;this.version++;}
  snapshot(){const chunks=[];for(const [id,bytes]of this.chunks){if(!this.encoded.has(id))this.encoded.set(id,encode(bytes));chunks.push([id,this.encoded.get(id)]);}return {version:1,width:this.width,height:this.height,blockSize:BLOCK,chunks};}
  static restore(data,width=1440,height=1680){
    const seen=new TownExplored(width,height);
    if(data?.version!==1||data.width!==width||data.height!==height||data.blockSize!==BLOCK||!Array.isArray(data.chunks)||data.chunks.length>seen.columns*seen.rows)throw Error('Unsupported town exploration save.');
    for(const row of data.chunks){
      if(!Array.isArray(row)||row.length!==2||!Number.isInteger(row[0])||row[0]<0||row[0]>=seen.columns*seen.rows||seen.chunks.has(row[0])||typeof row[1]!=='string'||!/^[A-Za-z0-9+/]{96}$/.test(row[1]))throw Error('Unsupported town exploration block.');
      const bytes=decode(row[1]);if(bytes.length!==BYTES)throw Error('Invalid exploration bits.');
      const bx=row[0]%seen.columns,by=Math.floor(row[0]/seen.columns);
      for(let bit=0;bit<576;bit++)if((bytes[bit>>3]&(1<<(bit&7)))&&(bx*BLOCK+bit%24>=width||by*BLOCK+Math.floor(bit/24)>=height))throw Error('Exploration lies outside town.');
      seen.chunks.set(row[0],bytes);seen.encoded.set(row[0],row[1]);seen.size+=bytes.reduce((n,b)=>n+popcount(b),0);
    }return seen;
  }
  *[Symbol.iterator](){for(const [id,bytes]of this.chunks){const bx=id%this.columns,by=Math.floor(id/this.columns);for(let bit=0;bit<576;bit++)if(bytes[bit>>3]&(1<<(bit&7)))yield bx*BLOCK+bit%24+','+(by*BLOCK+Math.floor(bit/24));}}
}
export const TOUR_SAVE='farmyard-mount-dora-tour-v1';
const townPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-.27&&p.x<=1439.27&&p.y>=-.27&&p.y<=1679.27;
const resourceCounts=data=>data&&typeof data==='object'&&!Array.isArray(data)&&Object.values(data).every(n=>Number.isFinite(n)&&n>=0&&n<=100000);
function validUnit(u){
  return townPoint(u)&&(!u.lastKnown||townPoint(u.lastKnown))&&
    (u.level===undefined||Number.isInteger(u.level)&&u.level>=0&&u.level<=4)&&(u.elevation===undefined||Number.isFinite(u.elevation)&&u.elevation>=0&&u.elevation<=8.48)&&(u.stairId===undefined||typeof u.stairId==='string'&&u.stairId.length<160)&&
    [[u.hp,u.maxHp],[u.stamina,u.maxStamina],[u.ap,u.maxAp]].every(([n,max])=>Number.isFinite(n)&&Number.isFinite(max)&&n>=0&&n<=max&&max<=10000)&&
    resourceCounts(u.ammo)&&resourceCounts(u.ammoPouch)&&Array.isArray(u.pack)&&u.pack.length<=128&&Array.isArray(u.slots)&&u.slots.length<=16&&
    ['standing','kneeling','prone'].includes(u.stance);
}
export function encodeTourProgress(state,world){
  const u=state.units.find(u=>u.team==='squad');
  return JSON.stringify({kind:'farmyard-mount-dora-tour',version:1,sourceRevision:world.sourceRevision,sourceDigest:world.project.generation.sourceDigest,artRevision:world.artRevision,
    build:{...state.solo.build},player:{...u,isMoving:false},dressings:state.solo.dressings,distance:state.solo.distance,elapsed:state.elapsed,explored:world.exploredSnapshot?.()??state.seen.snapshot(),...(world.upperExploredSnapshot?.().length?{upperExplored:world.upperExploredSnapshot()}:{}),log:state.log.slice(0,20),
    runtime:{realtime:state.realtime,phase:state.phase,round:state.round,seed:state.seed,engaged:!!state.engaged,status:state.solo.status,enemyIndex:state.enemyIndex,enemyDelay:state.enemyDelay,panicDelay:state.panicDelay,fires:state.fires||[],areaWeapon:state.solo.areaWeapon,
      guardRosterVersion:world.guardRosterVersion,guards:state.units.filter(v=>v.team==='guard').map(({patrol,...v})=>({...v,isMoving:false})),
      objects:world.savedObjects?.(state)??state.interactables.map(({id,open,searched,inventory})=>({id,open,searched,inventory}))}});
}
export function readTourProgress(text){
  if(typeof text!=='string'||text.length>5_000_000)throw Error('Town save is too large.');
  const p=JSON.parse(text),u=p?.player;
  if(p?.kind!=='farmyard-mount-dora-tour'||p.version!==1||!/^[a-f0-9]{64}$/.test(p.sourceRevision)||!/^[a-f0-9]{64}$/.test(p.artRevision)||u?.id!==0||u.team!=='squad'||!validUnit(u)||
    ![p.dressings,p.distance,p.elapsed].every(n=>Number.isFinite(n)&&n>=0)||p.dressings>1000)throw Error('Unsupported town progress.');
  const r=p.runtime;
  if(r&&(!['explore','player','enemy','lost','won'].includes(r.phase)||!['active','lost'].includes(r.status)||typeof r.engaged!=='boolean'||(r.phase==='lost')!==(r.status==='lost')||!Number.isSafeInteger(r.round)||r.round<0||!Number.isSafeInteger(r.seed)||r.seed<0||r.seed>0xffffffff||!Number.isInteger(r.enemyIndex)||r.enemyIndex<1||r.enemyIndex>129||!Number.isFinite(r.enemyDelay)||r.enemyDelay<0||r.enemyDelay>60||!Array.isArray(r.fires)||r.fires.length>1000||!Array.isArray(r.objects)||r.objects.length>20000||r.areaWeapon!==undefined&&!['grenade','flamethrower'].includes(r.areaWeapon)))throw Error('Unsupported town gameplay progress.');
  if((u.hp===0)!==(r?.status==='lost'))throw Error('Unsupported town casualty progress.');
  if(r?.guardRosterVersion!==undefined&&r.guardRosterVersion!==1)throw Error('Unsupported town guard roster.');
  if(r?.guards!==undefined&&(!Array.isArray(r.guards)||r.guards.length>42||r.guards.some(g=>!validUnit(g)||g.team!=='guard'||!Number.isInteger(g.id)||g.id<1||g.id>45||
    g.patrolIndex!==undefined&&(!Number.isInteger(g.patrolIndex)||g.patrolIndex<0||g.patrolIndex>=128)||
    g.patrolWaitUntil!==undefined&&(!Number.isFinite(g.patrolWaitUntil)||g.patrolWaitUntil<0))||
    new Set(r.guards.map(g=>g.id)).size!==r.guards.length))throw Error('Unsupported town guard progress.');
  if(p.upperExplored!==undefined&&(!Array.isArray(p.upperExplored)||p.upperExplored.length>4||new Set(p.upperExplored.map(row=>row?.[0])).size!==p.upperExplored.length))throw Error('Unsupported upper-floor exploration.');
  for(const row of p.upperExplored||[]){if(!Array.isArray(row)||row.length!==2||!Number.isInteger(row[0])||row[0]<1||row[0]>4)throw Error('Unsupported explored floor.');TownExplored.restore(row[1]);}
  p.status=r?.status||'active';p.seen=TownExplored.restore(p.explored);return p;
}
