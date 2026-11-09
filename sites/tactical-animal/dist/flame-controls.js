import {screenToGround} from './grenade-controls.js';

// A flame jet always uses its full reach; thumb displacement sets direction.
// Returning to centre or lifting the thumb holds the last deliberate heading.
export class FlameAim {
  constructor(){this.cancel();}
  start(heading){this.active=true;this.heading=Number.isFinite(heading)?heading:0;}
  cancel(){this.active=false;this.heading=null;}
  aim(offset,camera){
    if(!this.active||Math.hypot(offset.x,offset.y)<=.12)return this.heading;
    const direction=screenToGround(offset.x,offset.y,camera);
    this.heading=Math.atan2(direction.y,direction.x)*180/Math.PI;
    return this.heading;
  }
}
