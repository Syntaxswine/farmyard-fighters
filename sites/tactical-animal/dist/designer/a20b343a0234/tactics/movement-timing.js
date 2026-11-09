// A reference standing walker spends a full baseline AP budget on cardinal steps.
// Keep this independent of the engine: the pinned engine imports the game clock.
export const WALK_TILE_MS=500;
export const REFERENCE_ROUND_AP=12,REFERENCE_WALK_AP=2;
export const WALK_ROUND_MS=REFERENCE_ROUND_AP/REFERENCE_WALK_AP*WALK_TILE_MS;
