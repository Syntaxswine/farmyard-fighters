// Gameplay proportions for the upright cast, shared with the carry animation.
export const BODY_MASS={horse:80,goat:60,bull:110,cow:80,donkey:75,sheep:65,skunk:55,'pig-foreman':95,'pig-director':115,rabbit:50,dog:75,hen:50};
export const bodyMass=u=>BODY_MASS[u?.species]??80;
