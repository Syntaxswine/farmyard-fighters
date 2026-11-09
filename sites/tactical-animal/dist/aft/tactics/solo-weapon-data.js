export const WEAPONS={
 hands:{name:'Workers’ fists',short:'Hands',cost:3,range:1,damage:16,mag:0},
 knife:{name:'NR-40 knife',short:'NR-40',cost:3,range:1,damage:27,mag:0},
 pistol:{name:'TT-33 pistol',short:'TT-33',cost:4,range:12,damage:27,mag:8,penetrationClass:'pistol',accuracy:-20,rangeLoss:35},
 'pistol-offhand':{name:'TT-33 pistol · second',short:'TT-33 II',cost:4,range:12,damage:27,mag:8,penetrationClass:'pistol',accuracy:-20,rangeLoss:35},
 rifle:{name:'Mosin-Nagant',short:'Mosin',cost:6,range:24,damage:48,mag:5,accuracy:5,rangeLoss:18},
 assault:{name:'AK-47',short:'AK-47',cost:4,range:24,damage:26,mag:30,burstRounds:3,rangeLoss:26},
 smg:{name:'PPSh submachine gun',short:'SMG',cost:4,range:20,damage:27,mag:35,burstRounds:3,penetrationClass:'pistol',rangeLoss:30},
 hmg:{name:'Heavy machine gun',short:'HMG',cost:6,range:28,damage:48,mag:50,burstRounds:3,rangeLoss:24},
 shotgun:{name:'Pump-action shotgun',short:'Shotgun',cost:5,range:12,damage:27,mag:6,penetrationClass:'pistol',pellets:6,rangeLoss:15},
 sniper:{name:'Sniper rifle',short:'Sniper',cost:8,range:36,damage:75,mag:5,accuracy:10,rangeLoss:12},
 grenade:{name:'Fragmentation grenade',short:'Grenade',cost:5,range:10,damage:120,mag:3,blast:5,arc:true,thrown:true},
 launcher:{name:'Grenade launcher',short:'Launcher',cost:6,range:22,damage:140,mag:1,blast:3,arc:true},
 rpg:{name:'RPG',short:'RPG',cost:7,range:40,damage:220,mag:1,blast:4},
 flamethrower:{name:'Backpack flamethrower',short:'Flamer',cost:6,range:10,damage:180,mag:4,rangeLoss:15,incendiary:true}
};
export const AIM_ZONES={head:{label:'Head',accuracy:-25,damage:1.5},weapon:{label:'Weapon',accuracy:-15,damage:.75},torso:{label:'Torso',accuracy:0,damage:1},legs:{label:'Legs',accuracy:-10,damage:.85}};
