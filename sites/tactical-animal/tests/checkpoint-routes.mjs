// Walkable routes used by both acceptance tests and local browser checkpoints.
// These are examples, not route locks: the entire 240 m sector remains open.
export const CHECKPOINT_NORTH_ENTRY=[
  {x:51,y:118},{id:'approach-marker',action:'inspect'},
  {x:54,y:102},{x:78,y:102},{x:106,y:102},{x:117,y:107.2},
  {id:'checkpoint-service-door',action:'open'},{x:117,y:112},
  {id:'travel-orders',action:'collect'},
];
export const CHECKPOINT_NORTH_EXIT=[
  {x:117,y:107.2},{id:'checkpoint-service-door',action:'close'},
  {x:117,y:102},{x:120,y:99},{x:148,y:99},{x:166,y:94},
  {x:192,y:90},{id:'extraction',action:'extract'},
];
export const CHECKPOINT_SOUTH_ENTRY=[
  {x:54,y:139},{x:94,y:139},{x:105,y:142.5},
  {id:'freight-supplies',action:'open'},{id:'freight-supplies',action:'take-all'},
  {x:114,y:138},{x:117,y:116.8},
  {id:'checkpoint-front-door',action:'open'},{x:117,y:112},
  {id:'travel-orders',action:'collect'},
];
export const CHECKPOINT_ROAD_ENTRY=[
  {x:53,y:123.5},{id:'supply-chest',action:'open'},{id:'supply-chest',action:'take-all'},
  {x:74,y:120},{x:101,y:119},{x:117,y:116.8},
  {id:'checkpoint-front-door',action:'open'},{x:117,y:112},
  {id:'travel-orders',action:'collect'},
];
