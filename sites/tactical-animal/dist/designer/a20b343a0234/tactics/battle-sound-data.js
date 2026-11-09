const file=id=>new URL('../assets/audio/babble-sfx/'+id+'.wav',import.meta.url).href;
export const BATTLE_SOUNDS=Object.freeze(Object.fromEntries(['tt33','mosin-m38','ak47-shot','shotgun-fire','shotgun-pump','explosion-deep','explosion-large','rock-debris','metal','glass','tin'].map(id=>[id,file(id)])));
export const GUN_SOUND=Object.freeze({pistol:'tt33','pistol-offhand':'tt33',rifle:'mosin-m38',sniper:'mosin-m38',assault:'ak47-shot',smg:'ak47-shot',hmg:'ak47-shot',shotgun:'shotgun-fire'});
