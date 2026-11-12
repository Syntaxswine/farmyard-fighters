// The boathouse rules (maps/mount-dora/art/tools/boathouse.mjs) on made-up pieces: which
// roof a piece takes, and where its posts stand, slide or are left off.
import test from 'node:test';
import assert from 'node:assert/strict';
import {BOATHOUSE_POSTS, BOATHOUSE_ROOF, boathousePosts, pieceRoof} from '../../maps/mount-dora/art/tools/boathouse.mjs';

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const piece = (outline, more = {}) => ({outline, eaveM: 3, form: 'gable', confidence: 1, pitchDeg: 20, ridgeBearingDeg: null, ...more});

test('the rules are the ones the docs give', () => {
  assert.deepEqual(BOATHOUSE_ROOF, {forms: ['gable', 'hip', 'flat'], confidence: .7, pitchDeg: [12, 40], fallbackPitchDeg: 20});
  assert.deepEqual(BOATHOUSE_POSTS, {gapM: 6, radiusM: .15, insetM: .2, mergeM: 1, slideM: 3, stepM: .1});
});

test('a piece takes the lidar form where it is confident, and is flat otherwise', () => {
  const east = rect(0, 0, 10, 4);
  assert.deepEqual(pieceRoof(piece(east, {confidence: .7})), {style: 'gable', pitch: 20});
  assert.deepEqual(pieceRoof(piece(east, {confidence: .69})), {style: 'flat', pitch: 0});
  assert.deepEqual(pieceRoof(piece(east, {form: 'hip', pitchDeg: 25.4})), {style: 'hip', pitch: 25});
  for (const form of ['other', 'unknown']) assert.deepEqual(pieceRoof(piece(east, {form, ridgeBearingDeg: 90})), {style: 'flat', pitch: 0});
  assert.deepEqual(pieceRoof(piece(east, {form: 'flat', pitchDeg: null})), {style: 'flat', pitch: 0});
  // Pitch held to 12-40 degrees; a missing pitch takes 20.
  assert.equal(pieceRoof(piece(east, {pitchDeg: 10.4})).pitch, 12);
  assert.equal(pieceRoof(piece(east, {pitchDeg: 47})).pitch, 40);
  assert.equal(pieceRoof(piece(east, {pitchDeg: null})).pitch, 20);
});

test('a gable carries the lidar ridge bearing to the kit; a hip or a flat roof none', () => {
  const east = rect(0, 0, 10, 4);
  assert.equal(pieceRoof(piece(east, {ridgeBearingDeg: 78.7})).ridgeBearingDeg, 78.7);
  // A hip's ridge runs along its long side: across the short side roof-core draws a point.
  assert.equal('ridgeBearingDeg' in pieceRoof(piece(east, {form: 'hip', ridgeBearingDeg: 0})), false);
  assert.equal(pieceRoof(piece(east, {ridgeBearingDeg: 0})).ridgeBearingDeg, 0);
  assert.equal('ridgeBearingDeg' in pieceRoof(piece(east)), false, 'no bearing: the kit runs the ridge along the longer side');
  assert.equal('ridgeBearingDeg' in pieceRoof(piece(east, {form: 'other', ridgeBearingDeg: 90})), false);
  assert.equal('ridgeBearingDeg' in pieceRoof(piece(east, {confidence: .5, ridgeBearingDeg: 90})), false);
});

const near = (a, b, tol = 1e-6) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

test('posts stand at the corners, 0.2 m in, and at most 6 m apart along each side', () => {
  const {posts, moved, leftOff} = boathousePosts([piece(rect(0, 0, 12.4, 4.4), {eaveM: 3.2})], () => false);
  assert.equal(moved, 0); assert.equal(leftOff, 0);
  // Each corner moves 0.2 m toward the centre along its diagonal.
  const d = Math.hypot(6.2, 2.2), inset = [6.2 * .2 / d, 2.2 * .2 / d];
  for (const corner of [[inset[0], inset[1]], [12.4 - inset[0], inset[1]], [12.4 - inset[0], 4.4 - inset[1]], [inset[0], 4.4 - inset[1]]]) assert.ok(posts.some(p => near(p, corner)), `${corner}`);
  // The long sides (12.02 m) take three posts each, 4.01 m apart; the short sides none between their corners.
  assert.equal(posts.length, 8);
  for (const p of posts) assert.equal(p[2], 3.2);
  const along = posts.filter(p => near([0, p[1]], [0, inset[1]])).map(p => p[0]).sort((a, b) => a - b);
  assert.equal(along.length, 4);
  for (let i = 1; i < along.length; i++) assert.ok(along[i] - along[i - 1] <= BOATHOUSE_POSTS.gapM && along[i] - along[i - 1] > 3.9);
});

test('posts within a metre are one post, as tall as the highest eave it serves', () => {
  const {posts} = boathousePosts([piece(rect(0, 0, 6, 4), {eaveM: 3}), piece(rect(6, 0, 12, 4), {eaveM: 3.5})], () => false);
  // The shared edge's two pairs of corner posts (0.4 m apart) merge, at the higher eave.
  const shared = posts.filter(p => Math.abs(p[0] - 6) < 1);
  assert.equal(shared.length, 2);
  for (const p of shared) assert.equal(p[2], 3.5);
  assert.equal(posts.length, 6);
  for (const [i, a] of posts.entries()) for (const b of posts.slice(i + 1)) assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= BOATHOUSE_POSTS.mergeM);
});

test('a post on a pier deck slides off it, forward first, or is left off past 3 m', () => {
  // A 12 x 4 m piece: its long sides (11.62 m) take posts at their ends and middle, x 6.0.
  const outline = rect(0, 0, 12, 4);
  const deck = q => q[0] > 5.05 && q[0] < 6.95;
  const slid = boathousePosts([piece(outline)], deck);
  assert.equal(slid.moved, 2); assert.equal(slid.leftOff, 0);
  // A metre forward along its side, ahead of the equal step back: the ring runs east
  // along the north side and west along the south side.
  assert.ok(slid.posts.some(p => Math.abs(p[0] - 7) < 1e-6 && p[1] < 1), 'north side: east to x 7');
  assert.ok(slid.posts.some(p => Math.abs(p[0] - 5) < 1e-6 && p[1] > 3), 'south side: west to x 5');
  assert.ok(slid.posts.every(p => !deck(p)));
  // A deck 9 m wide leaves the middle posts nowhere within 3 m.
  const wide = q => q[0] > 2 && q[0] < 11;
  const left = boathousePosts([piece(outline)], wide);
  assert.equal(left.leftOff, 2); assert.equal(left.moved, 0);
  assert.ok(left.posts.every(p => !wide(p)));
  // A corner post may slide along either side meeting at it: the north-west corner east
  // along the north side it starts; the south-west one starts the west side, wholly on this
  // deck, so slides back east along the south side that ends at it.
  const corner = q => q[0] < 1;
  const cornered = boathousePosts([piece(outline)], corner);
  assert.equal(cornered.moved, 2); assert.equal(cornered.leftOff, 0);
  assert.ok(cornered.posts.every(p => !corner(p)));
  assert.ok(cornered.posts.some(p => Math.abs(p[0] - 1.09) < .01 && p[1] < 1));
  assert.ok(cornered.posts.some(p => Math.abs(p[0] - 1.09) < .01 && p[1] > 3));
  // A middle post never slides past its own side's start.
  const strip = q => q[0] > 5.05 && q[0] < 6.95 || q[0] < 1;
  assert.ok(boathousePosts([piece(outline)], strip).posts.every(p => !strip(p)));
});
