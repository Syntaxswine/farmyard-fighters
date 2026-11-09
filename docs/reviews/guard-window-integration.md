# Guard approach and released windows

Draft integration candidate for architect review. No merge or deployment is part of this work. The native check uses the existing isolated pull-request workflow; its exact tested head and retained evidence are recorded in the integration PR.

## Sources and conflict resolution

- Released main: `a853525d39c7375a8a4eaa4e58a1da151b0fe516`, including window PR #25.
- [PR #21](https://github.com/Syntaxswine/farmyard-commando/pull/21): `13a9013598ebd2987d731de429a5393f18ef4267`, Short Measure art hand-off, stale-deploy digest and legacy-save rescue.
- [PR #22](https://github.com/Syntaxswine/farmyard-commando/pull/22): `3a557bf743e5c5bb9728a3bee835ce85765c721a`, whose ancestry includes that PR #21 head. Its stable quarry goal set, one multi-goal search, live unit blocking, nearest walking route, sealed-pocket bound and narrow-strip escapes are retained.

Only `field-view.js` and `solo-game.js` conflicted. Field setup/disposal retains window art, picking, timed break/audio effects and cleanup while adopting deferred mission-art loading and retaining inherited cargo until accepted art enters the scene. The geometry query keeps PR #22's explicit layer requirement and the released glass-aware flame layer. Window heights, saved instance identity and cache-versioned modules remain intact. The artist window files, pinned AFT/designer snapshots, build versioning and CI workflow are unchanged.

## Reproduced incompatibility and limited fix

The compatibility regression was run against the resolved merge before editing the approach predicates. A guard at `(20,25)` closes on the remembered point `(20,21)`. A real `window.full.clear.3m` sits at `(20,21.5)`. Normal `lineClear` already sees through its aperture, and the pane's walking reservation prevents crossing it.

| Result | Imported two-dimensional sight helper | Height-aware compatibility adapter |
| --- | --- | --- |
| Waypoints | `(18,22)`, `(18,21)` | `(20,23)` |
| Walking AP | `7.211102550927979 + 2` | `4` |
| Reason | Sill/head footprints reject every nearer goal behind glass | Sill/head heights are outside standing sight; the nearest reachable goal survives |

The failing test expected `(20,23)` and received `(18,21)` before the fix. It now also drives actual enemy ticks and verifies straight closing movement on the guard's side of the window.

The second predicate reproduces separately: put a `crate-wood` at `(20,21)`, covering the remembered point, beside a `window.full.vertical-2.3m` at `(20,21.5)`. The imported `standIns().seesPast` returns only `(20.75,21)`. The corrected predicate also retains `(19.65558491087142,21.83149157926016)`, a clear stand-in through the adjacent pane. The two views remain separated by the real mullion. This uses the actual window/cargo geometry, rather than a substitute wall shape.

The fix is limited to the approach's two wall predicates. It preserves window member height metadata while expanding only horizontal footprints by the existing 8 cm. Remembered ground points keep standing sight, independent of current unit posture. No goal radius, search ordering, movement cost, dead-strip escape or live unit policy is changed. Ordinary walls retain their existing opacity rule.

## Validation

`npm run check`: **390 tests pass**. `npm run build` and `git diff --check` pass. The seven integration tests cover:

- nearest visible approach and actual enemy movement through the framed sightline;
- waist-wall prone obstruction and full-height mullion obstruction;
- a ray that narrowly misses a mullion but fails the full 8 cm stopping margin;
- the cargo-covered remembered point's additional pane-side stand-in;
- accepted bullet damage invalidating geometry/stand-in tables, continued glass transparency, retained walking reservation and live unit blocking;
- an actual warehouse door invalidating the same shared tables with placed windows present;
- a save taken during approach beside broken glass, followed by identical guard position/AP, RNG and phase over 100 ticks.

All original PR #22 guard regressions pass, including the three-mission census, door sides/leaf faces, nearest walking route, narrow strips, live blockers, bounded sealed searches and mid-turn saves. The source PR's six seeded full-state replay hashes pass **without changing `scenery-neutrality-baseline.json` or its replay driver**. No seeded baseline was regenerated for this integration.

The existing native window check exercises the actual editor and FieldView via visible controls, picking, high-pane damage, divided cells, burst continuation, saves/revisits and phone controls. It uses fresh Chromium with real Three/WebGL shaders through process-local SwiftShader, and retains native screenshots, video, trace, audio execution receipts and digital output. Physical speaker playback remains outside that automated check. Browser/context disposal and temporary server-port release are required for a successful CI result. No local preview or browser helper is retained.
