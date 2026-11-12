import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as game from '../dist/solo-game.js';
import {fuzzRun} from './neutral-fuzz.mjs';

// Seeded play on the other missions, hashed after every command. PR #21 recorded
// these runs from an unmodified origin/main checkout to show the Short Measure art
// changed nothing beyond its props; the guard approach search (docs/guard-approach.md)
// then changed play on every mission on purpose, so they were re-recorded from that
// change and now pin it. Seeds were picked where a guard fallback widened beyond
// props diverged within 44 commands. It samples play rather than proving anything:
// a global cover-radius change (0.9 -> 0.8 m) first shows at Night Ledger seed 8,
// command 188, so that run is 200 long. The global movement revision re-records
// the same six seeds and full-state hashes for 2x base pace and stamina off.
// No command, collision preview, resource field or scenery check is omitted.
// Targetable explosive barrels intentionally revise Road Checkpoint's two rows:
// native drum height, physical ray contacts and AFT-style fuel detonations.
test('seeded play on Night Ledger and Road Checkpoint matches the recorded baseline after every command',()=>{
  const baseline=JSON.parse(fs.readFileSync(new URL('./scenery-neutrality-baseline.json',import.meta.url),'utf8'));
  assert.equal(baseline.rows.length,6);
  for(const row of baseline.rows)assert.equal(fuzzRun(game,row.missionId,row.seed,row.steps),row.hash,`${row.missionId} seed ${row.seed}`);
});
