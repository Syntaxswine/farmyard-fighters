import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GrenadeAim,FIELD_CAMERA,screenToGround,grenadeCameraFrame} from '../dist/grenade-controls.js';
import {Core,createSoloGame,DEFAULT_BUILD,hero,encodeSave} from '../dist/solo-game.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} differs from ${b}`);

test('arming has no landing point, ignores the dead zone, and cancellation spends no resources',()=>{
  const s=createSoloGame({...DEFAULT_BUILD,utility:'grenade'}),before=encodeSave(s),aim=new GrenadeAim();
  aim.start();assert.equal(aim.point,null);assert.equal(aim.aim(hero(s),{x:.05,y:.05},10),null);
  aim.aim(hero(s),{x:1,y:0},10);aim.cancel();
  assert.equal(aim.active,false);assert.equal(aim.point,null);assert.equal(encodeSave(s),before);
});
test('the stick reaches exactly maximum range in every direction, without a diagonal bonus',()=>{
  const aim=new GrenadeAim(),origin={x:19,y:14};aim.start();
  for(const offset of [{x:1,y:0},{x:0,y:-1},{x:1,y:1},{x:-2,y:3}])near(Math.hypot(aim.aim(origin,offset,10).x-origin.x,aim.point.y-origin.y),10);
  const close=aim.aim(origin,{x:.56,y:0},10);near(Math.hypot(close.x-origin.x,close.y-origin.y),5);
});
test('neutral input holds the target and changing aim never moves the thrower',()=>{
  const aim=new GrenadeAim(),origin={x:5.25,y:24.1},before={...origin};aim.start();
  const target=aim.aim(origin,{x:.7,y:-.4},10);assert.deepEqual(aim.aim(origin,{x:0,y:0},10),target);
  assert.deepEqual(origin,before);aim.cancel();assert.equal(aim.aim(origin,{x:1,y:0},10),null);
  aim.start();assert.equal(aim.point,null);
});
test('keyboard aim supports short throws, freezes on release, and clamps at maximum range',()=>{
  const aim=new GrenadeAim(),origin={x:19,y:14};aim.start();
  for(let i=0;i<12;i++)aim.nudge(origin,{x:1,y:-1},10,.05);
  const target={...aim.point},distance=Math.hypot(target.x-origin.x,target.y-origin.y);assert.ok(distance>1&&distance<10);
  aim.nudge(origin,{x:0,y:0},10,1);assert.deepEqual(aim.point,target);
  for(let i=0;i<100;i++)aim.nudge(origin,{x:1,y:-1},10,.05);
  near(Math.hypot(aim.point.x-origin.x,aim.point.y-origin.y),10);
});
test('screen directions stay fixed and movement and aiming use the same orientation',()=>{
  const right=screenToGround(1,0),down=screenToGround(0,1);
  near(Math.hypot(right.x,right.y),1);near(Math.hypot(down.x,down.y),1);near(right.x*down.x+right.y*down.y,0);
  assert.ok(right.x>0&&right.y<0&&down.x>0&&down.y>0);
});
test('camera framing keeps the thrower, high arc, and entire blast inside portrait and landscape safe areas',()=>{
  const a={x:19,y:14},b={x:26,y:7},points=Core.grenadeTrajectory(a,b);
  for(let i=0;i<32;i++)points.push({x:b.x+Math.cos(i/32*Math.PI*2)*5,y:b.y+Math.sin(i/32*Math.PI*2)*5,z:0});
  const h=Math.hypot(FIELD_CAMERA.x,FIELD_CAMERA.z),length=Math.hypot(h,FIELD_CAMERA.y);
  for(const viewport of [{width:390,height:844,left:16,right:374,top:130,bottom:450},{width:844,height:390,left:16,right:828,top:120,bottom:190}]){
    const frame=grenadeCameraFrame(points,viewport,13);
    for(const p of points){
      const dx=p.x-frame.target.x,dy=p.y-frame.target.y;
      const sx=viewport.width/2+(dx*FIELD_CAMERA.z/h-dy*FIELD_CAMERA.x/h)/frame.span*viewport.height;
      const sy=viewport.height/2-(-dx*FIELD_CAMERA.x*FIELD_CAMERA.y/(h*length)-dy*FIELD_CAMERA.z*FIELD_CAMERA.y/(h*length)+(p.z||0)*h/length)/frame.span*viewport.height;
      assert.ok(sx>=viewport.left&&sx<=viewport.right,`x ${sx} outside safe area`);assert.ok(sy>=viewport.top&&sy<=viewport.bottom,`y ${sy} outside safe area`);
    }
  }
});
