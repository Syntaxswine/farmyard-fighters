// The run-on rule at pier joints (maps/mount-dora/art/tools/pier-joints.mjs), on declared
// synthetic joints: mitre lengths, the T, the ear past a square turn and the guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runOns,turnBetween,earFor,MAX_EAR_M,MAX_THROUGH_TURN} from '../../maps/mount-dora/art/tools/pier-joints.mjs';

const J=[10,10],at=(degrees,length=5)=>{const r=degrees*Math.PI/180;return [J,[J[0]+length*Math.cos(r),J[1]+length*Math.sin(r)]];};
// A line arriving along +x and leaving at `turn` degrees off straight on.
const bend=turn=>[[[J[0]-6,J[1]],J],at(turn)];
const close=(a,b,tolerance=1e-9)=>Math.abs(a-b)<=tolerance;

test('two lines mitre: each runs on half the width times tan(turn / 2)',()=>{
 for(const turn of [0,.16,1.1,5.16,45,64.62,90,90.22,91.41]){
  const runs=runOns(J,bend(turn),2),expected=Math.tan(turn/2*Math.PI/180);
  assert.equal(runs.length,2);assert.ok(close(runs[0],expected)&&close(runs[1],expected),turn+': '+runs);
 }
 assert.ok(close(runOns(J,bend(0),2)[0],0));assert.ok(close(runOns(J,bend(90),4)[0],2));
 // The order of the lines, and which end of each meets the joint, does not matter.
 const [a,b]=bend(64.62);assert.deepEqual(runOns(J,[b,a],2),runOns(J,[a,b],2));assert.deepEqual(runOns(J,[[a[1],a[0]],[b[1],b[0]]],2),runOns(J,[a,b],2));
});

test('the two outer corners meet exactly, and past a square turn the inner corner pokes out by width |cos turn|',()=>{
 for(const turn of [10,64.62,90,91.41,92.5]){
  const [incoming,outgoing]=bend(turn),[run]=runOns(J,[incoming,outgoing],2),h=1,r=turn*Math.PI/180,v=[Math.cos(r),Math.sin(r)],n=[-v[1],v[0]];
  // Incoming runs on along +x to J+(run,0); its corners at y = +-1; the turn is to +y, so -1 is the outside.
  const outer=[J[0]+run,J[1]-h],inner=[J[0]+run,J[1]+h],outgoingOuter=[J[0]-v[0]*run+n[0]*-h,J[1]-v[1]*run+n[1]*-h];
  assert.ok(Math.hypot(outer[0]-outgoingOuter[0],outer[1]-outgoingOuter[1])<1e-9,turn+': outer corners meet');
  const across=(inner[0]-J[0])*n[0]+(inner[1]-J[1])*n[1],poke=Math.max(0,-across-h);
  assert.ok(close(poke,earFor(r,2),1e-9),turn+': '+poke);assert.equal(poke>0,turn>90,turn);
 }
 assert.equal(earFor(Math.PI/2,2),0);assert.ok(close(earFor(91.41*Math.PI/180,2),2*Math.abs(Math.cos(91.41*Math.PI/180))));
});

test('a turn whose ear would exceed the limit stops the build, at a sharper turn than any on the map',()=>{
 assert.equal(MAX_EAR_M,.1);
 const limit=90+Math.asin(MAX_EAR_M/2)*180/Math.PI;
 assert.ok(limit>91.41&&limit<93,String(limit));
 assert.doesNotThrow(()=>runOns(J,bend(limit-.01),2));
 assert.throws(()=>runOns(J,bend(limit+.01),2),/stick out .* add a cut mitre/);
 assert.throws(()=>runOns(J,bend(120),2),/turns 120\.0 degrees/);
});

test('at a T the straight pair mitres and the stem ends at the joint; a junction with no straight pair stops',()=>{
 const crossbar=[[J[0]-5,J[1]],J],other=[J,[J[0]+5,J[1]]],stem=[J,[J[0],J[1]+5]];
 assert.deepEqual(runOns(J,[crossbar,stem,other],2),[0,0,0]);
 const bent=[J,[J[0]+5*Math.cos(.004),J[1]+5*Math.sin(.004)]],runs=runOns(J,[crossbar,stem,bent],2);
 assert.ok(runs[0]>0&&close(runs[0],runs[2])&&runs[1]===0,String(runs));
 assert.equal(MAX_THROUGH_TURN,Math.PI/6);
 const y=[at(0),at(120),at(240)];assert.throws(()=>runOns(J,y,2),/no pair of lines within 30 degrees/);
 const within=[[[J[0]-5,J[1]],J],at(29),at(90)];assert.doesNotThrow(()=>runOns(J,within,2));
 const beyond=[[[J[0]-5,J[1]],J],at(31),at(90)];assert.throws(()=>runOns(J,beyond,2),/straightest turns 31\.0/);
});

test('a joint takes lines that end there, two or more, each at least a deck width long, and names its pier',()=>{
 assert.throws(()=>runOns(J,[at(0)],2),/two or more/);assert.throws(()=>runOns(J,[at(0),[[0,0],[1,1]]],2),/end at the joint/);
 // Shorter than the deck is wide, a line would show the other deck's run-on past its end.
 assert.throws(()=>runOns(J,[[[J[0]-6,J[1]],J],at(90,1.9)],2),/shorter than the deck is wide/);assert.doesNotThrow(()=>runOns(J,[[[J[0]-6,J[1]],J],at(90,2)],2));
 assert.throws(()=>runOns(J,bend(120),2,'osm-way-1'),/^Error: osm-way-1 turns 120\.0 degrees/);
 assert.ok(close(turnBetween([1,0],[-1,0]),0));assert.ok(close(turnBetween([1,0],[0,1]),Math.PI/2));assert.ok(close(turnBetween([1,0],[1,0]),Math.PI));
});
