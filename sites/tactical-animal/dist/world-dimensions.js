// Shared by scenery rendering and collision/action previews. Preserve AFT's
// two-metre wall appearance while keeping the solo world's continuous positions.
export const WALL_DIMENSIONS=Object.freeze({height:2,thickness:.16,length:1.12});
// One cargo cell's collider: a 0.96 m square centred on its tile, AFT's crate height.
export const CRATE_DIMENSIONS=Object.freeze({half:.48,height:.92});
