# Short Measure runtime blockout

This is the first new playable operation in **The First Shift**. The Night Ledger remains separately selectable. Spatial and story source: design commit `5524d91b3971328f27ccc9bb50b41ce7d2a19482`, `docs/missions/first-shift.md` and `first-shift.maps.json` (design PR #7). The authoring JSON is not imported as a runtime save or map.

## Simulation and presentation

`missions.js` owns the two immutable runtime definitions. Simulation, hand targets, preparation, objective/extraction pins, minimap, assignment, results, restart, and saves resolve the selected definition. Arrival is `(4,25)`, the shipping manifest is `(32,7)`, and the east loading gate is `(35,25)` on the existing 40 × 30 backing grid. One controllable animal uses the existing loadouts, distance/AP rules, weapons, grenades, and interaction costs. Guard deaths alone do not complete either operation.

All nine new doors use the same 2 m wall height and the same solid footprint in rendering, collision, sight, pathfinding, and grenade checks. Each door has an independently persisted open state. Free inspections record notes; collection records the manifest; extraction requires collection. Both the direct packing-hall route and the alternate route around its west/north sides are playable.

## Art handoff

The following cargo cells are solid (inherited cargo art draws all of them except `sealed-load`, which the art kit now draws). Rectangles are `[x,y,width,height]`, including cells from the origin through `origin + size - 1`. Keep these footprints clear of additional collision unless the runtime definition is also deliberately updated.

| Placement ID | Rectangle | Purpose |
| --- | --- | --- |
| `west-sack-bay` | `[8,10,2,2]` | Western cover |
| `north-sack-bay` | `[11,5,3,1]` | Alternate route cover |
| `hall-sack-bay` | `[16,10,2,2]` | Packing hall cargo |
| `hall-packing-stack` | `[21,14,2,1]` | Packing hall cover |
| `sealed-load` | `[27,19,2,2]` | Inspectable Reserve 7 cargo |
| `loading-stack` | `[31,17,2,1]` | Dispatch-to-gate cover |
| `east-gate-stack` | `[34,21,2,1]` | Eastern cover |

The `sealed-load` clue at `(28,20)` belongs to the cargo rectangle above; reaching its face is sufficient to inspect it. Both clues use their stable interaction IDs and have a 1.7 m interaction range.

### Environment art in play

`mission-art-view.js` draws the [environment art kit](art/short-measure/README.md). `mission-scenery.js` registers the same solids with the simulation, so neither side can be accepted without the other. `tools/short-measure-art.mjs` regenerates the solid-part table (`mission-art/short-measure/solids.js`) from the kit's own models, and a test fails if the table drifts.

| Placement | Ground reservation `[w,n,e,s]` | Height | Notes |
| --- | --- | --- | --- |
| `worker-scale` | `[7.15,19.45,8.85,20.55]` | 1.72 m | Stands around the clue anchor `(8,20)`. Inspect it from beside, for example from `(8,21)`; its marker and hand float at 2 m. |
| `freight-scale` | `[9.85,23.45,11.55,24.55]` | 1.72 m | Outbound lane, south of the shed. |
| `sealed-load-arrival` | `[7.15,23.175,8.65,24.425]` | 0.95 m | Full sacks beside the arrival lane. They give crate cover. |
| `shipping-manifest` desk | `[31,5.6,33,6.6]` | 1.05 m | Behind the unchanged use point `(32,7)`. The paper hides once collected. |
| `sealed-load` | the four crate cells above | 0.92 m | The crate cells stay the collider and reservation. Its 24 parts sit inside that envelope; their one effect is to close the 4 cm seams between the cells to prone-to-prone sight, which were open before. |

The geometry rules:
- **Ground reservations** block walking, grenade landings and reach. They never block sight or projectiles.
- **Individual parts** (108 boxes, each with its own height span) block bullets, grenade arcs, flame and prone-to-prone sight only where they actually are. The air under the desk top and around the scale frames stays open.
- **Standing and kneeling sight** is still blocked by walls alone.
- **The cover rule** counts crates and the full-sack bay.

`tests/short-measure-scenery.test.mjs` runs the whole table.

Each part is an axis-aligned box around one primitive of the model. For the bent beam and the cylinders that box is a little larger than the visible piece: the tilted beam's box is 0.24 m tall where the beam is 0.10 m. That is conservative, but it is a known approximation.

A guard closing on an animal aims 0.75 m short of it, and beside a prop that spot is often inside the reservation. On main the guard then stood frozen until its alert lapsed, as it still did beside a crate or a wall on every mission. PR #21 first patched props alone, with three spots held per guard. The approach is now one search on every mission; [Guard approach](guard-approach.md) has the rule, its censuses and its costs.

Beside the props, PR #21's own censuses (the animal 0.24–0.74 m from a prop, the guard 2–9 m off) now count these approaches where the pre-prop main engaged and ours does not:

| Census | PR #21 | Now |
| --- | --- | --- |
| Tuning seed 77, 1,000 approaches | 2 | 0 |
| Held-out seed 9001, 800 approaches | 9 | 1 |

The one left is a door detour around the arrival bay, longer than the guard's alert lasts; main's guard, on another line, fired from 6.8 m.

Only the simulation's data modules (`mission-scenery.js`, `solids.js`) load in every mission. The kit, its inherited model modules and the paper art load for Short Measure alone. Before the kit's model is in the scene, the inherited cargo keeps drawing the sealed load's crates, so a failed or refused kit never leaves an invisible collider. The four new props have no inherited art at all. If the kit fails, the field shows an error banner, but the banner does not block input: play can continue with those four props solid and unseen until a reload. On main, a failed cargo atlas leaves every crate in the same state.

Known limitation, older than this change: the hit-chance preview ignores scenery that physically stops the round. Main shows 70% for a target directly behind a crate that no round can reach, and crates at least add the −20 cover hint. A shot whose line runs through a prop's solid part shows its full chance and then strikes the part.

A save written before these props existed may store an animal inside one. The clue marker at `(8,20)` had no collision, so players could stand on it. Decoding moves such an animal to the nearest clear point (about 0.8 m from the scale's centre). Every other played position is kept exactly.

| Room | Rectangle | Doors (center coordinates) |
| --- | --- | --- |
| Ration shed | `[6,17,6,6]` | `ration-west` `(5.5,20)`, `ration-south` `(9,22.5)`, `ration-east` `(11.5,20)` |
| Packing hall | `[14,8,11,10]` | `packing-west` `(13.5,13)`, `packing-south` `(19,17.5)`, `packing-east` `(24.5,13)`, `packing-north` `(19,7.5)` |
| Dispatch office | `[28,4,8,8]` | `dispatch-west` `(27.5,8)`, `dispatch-south` `(32,11.5)` |

West/east doors use `e` edges; north/south doors use `s` edges. Leaves swing inward and remain solid while open. The start chest is at `(4,22)`; guards start at `(13,20)`, `(21,12)`, and `(30,14)`.

## Save compatibility

Solo saves retain version 2 and add `solo.missionId`, `solo.objectives`, and `solo.inspected`. Missing mission IDs default to Night Ledger. Decoding preserves played coordinates, AP, terrain, doors, loot, units, and progress; it does not regenerate the map. The existing `solo.ledger` flag remains compatible.

Each operation owns a slot under `tactical-animal-operation-v3:<missionId>`. Before writing a different operation, an older single-slot save is preserved in its mission slot. Version 1 preparation/completion metadata uses the separate `tactical-animal-first-shift-v1` record. Browsing operations and changing loadouts never overwrite active states. Completion records do not gate either operation or create a campaign economy.

## Verification

`npm run check` includes original terrain/edge hashes and encounter, both legal Short Measure routes, both door orientations, all animal/primary combinations, objective/extraction gates, save round trips, legacy migration, independent save slots, application lifecycle handlers, minimap markers, and renderer disposal. Existing grenade, AP, chest, burst, and designer checks remain included. `npm run build` produces the static game.

Portrait browser QA uses the built game. Temporary, unshipped checkpoint controls load saves reached through the public simulation controller in `tests/operation-scenarios.mjs`; they never edit health, ammunition, AP, coordinates, doors, or quest flags to create checkpoints. Interaction and save/resume checks then run in the actual UI. Full simulation playthroughs independently cover both routes.
