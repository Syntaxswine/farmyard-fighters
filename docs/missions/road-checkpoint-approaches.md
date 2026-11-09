# Road Checkpoint: choosing the approach

Fresh Road Checkpoint operations use layout 2. The first streaming milestone
spawned the player at (2,118), only 11 metres from the nearest guard, with all six
guards in the same small encounter. This layout uses the surrounding sector to
create room to observe, choose a route and disengage.

## Spatial plan

The sector remains 240 × 240 metres. The renderer still retains a moving 3 × 3
window of 24 × 24 blocks; that window does not activate or deactivate enemies.
Arrival is at (48,120), the office at (117,112), and extraction at (192,90).
The preparation map frames the operating area rather than shrinking the whole
sector into the briefing picture.

| Approach | Readable landmarks | Tactical choice |
| --- | --- | --- |
| Valley road | Asphalt, paired road guards, barrier stacks | Shortest line to the front door; exposed to the first sentry. Scout from outside its identification range, or commit to combat. |
| North service lane | Gravel behind a continuous brick screen, tool stacks, rear office door | Longer, protected approach. Read the distant picket's facing and skirt the courier on departure; the entire objective can be completed without combat. |
| South freight yard | Southern screen wall, cargo stacks, confiscation bay and supplies | Detour for ammunition, medicine and a grenade. Low cargo offers firing cover; the brick bay breaks sightlines. Converges on the front entrance from the guard's flank. |

The staging cache and worker route marker give the player useful information
before exposure. The freight-yard tally and outbound diversion sign explain
what the checkpoint does: confiscating workers' supplies and diverting wagons to
Reserve 7. The orders are evidence to retrieve, not a reward for clearing enemies.

## Encounter rules

All six animals and all primary loadouts begin in real-time exploration, with
no alerted guards. The road pair, orders courier, north picket, freight sentry
and east-road sentry occupy separate posts. They use the existing authoritative
species sight, heading, wall obstruction, weapon noise, AP and pursuit rules.
There is no spawn invulnerability, scripted alarm suppression or culling-based
AI suspension. Louder weapons and moving into an occupied post can still draw
more attention. The first road contact leaves the distant posts unalerted.

The imported AFT foundation remains byte-for-byte preserved. The operation
derives a copy with the office, sandbags and barrel shifted 96 metres east,
adds the approach screens and cargo, and provides a second working office door.
Walls remain two metres high. The barrel is still static cover, as in the first
milestone. This remains a flat ground-level sector.

## Save compatibility

New saves record `solo.layoutVersion`. A Road Checkpoint save without that field
resolves to layout 1, including its original office, objectives, extraction,
props, guards, door and played state. Resume clearly identifies the previous
checkpoint; Deploy Solo starts the redesigned operation. Unknown layout
versions are rejected instead of mixing geometry from different missions.

## Acceptance

The public-command controllers in `tests/checkpoint-routes.mjs` exercise three
approaches without editing coordinates, HP, AP, ammunition or objective flags.
The northern route retrieves the orders, saves and resumes inside the office,
closes the rear door and extracts with all six guards alive, no rounds fired,
full health and zero combat rounds. The southern route loots its supplies and
uses the front entrance. The road route completes with actual combat. Existing
imported-sector collision, door, pursuit and renderer tests stay pinned to the
original fixture; both layouts remain under regression coverage.
