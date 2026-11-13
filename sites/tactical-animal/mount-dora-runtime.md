# Mount Dora walking-tour runtime

The regular game can load the full 1440 × 1680 metre town as a free walking tour.
Open `game.html?activity=mount-dora`, choose an animal and equipment, then deploy.
The link selects preparation only. Walking, joystick, keyboard, stance and camera
controls and gameplay use the existing game. Firearms, grenades, flamethrowers,
AP turns, injuries and fire are enabled. The town has 42 fictional guards with
authored posts and patrols. It has no extraction objective.

## Reviewed Mount Dora import

The town map and artwork come from Farmyard Commando Real Time commit
`8395204ce6b60aa20cc8936fc89fe4a40192920c`. The source pin, reviewed content
hashes and Fighters adaptations are recorded in `mount-dora-import.json`.
This import includes the revised street/building fit, depot treatment, railway,
19 raised piers, 13 LiDAR-derived boathouse roofs and 17,171 trees. All 106
retained mature specimens keep the positions and variants in
`maps/mount-dora/source/retained-mature-trees.json`; historical moves in that
file are provenance and must not be applied again.

Town actors stand on the drawn 0.4 m pier decks. The same height is applied to
Fighters' animated grenade release origin, and roof focus uses the raised eye
height. The shared simulation body radius remains 0.23 m. Mature broadleaf
models and stable plant-shadow flags are town-specific additions. The pine
model shared with Pinewire Prison is byte-identical to the previous release.

Fighters keeps its enemy-contact camera framing, object height/cover collision
properties, combat rules, controls, startup recovery and prison content. Tour
and operation storage continue to use the `farmyard-fighters:` namespace; the
walking acceptance seeds both Commando releases' foreign keys to verify that
they are neither offered for Resume nor changed.

## Coordinate and source contract

The grid-generalized building plans have integer town edges. Native walls,
floor masks, artwork and collision share `authored-buildings.json`; original
geographic geometry is retained separately in features. The loader rejects
different authored-layout digests before opening a mixed map/art generation.

The adapter preserves Farmyard's integer-centred gameplay coordinates. Town/art
coordinates are metres east/south; game x/y equal town east/south minus 0.5 exactly
once. Three coordinates are `(game x, height, game y)`, without scaling.
Native tile centres add the sector origin. Native wall endpoints already contain
the minus-half shift and add the sector origin only. Artist roots, movement
solids, visits and minimap markers receive the same single transform.

The lighthouse at town `(500.2877,1169.7989)` is game
`(499.7877,1169.2989)`. The outer edges become
`[-0.5,1439.5] × [-0.5,1679.5]`; the animal's radius must fit inside them.

`TownWorld` reads `project.json` and the 42 native 240 metre sectors directly.
Each sector is SHA-256 verified against the project before decoding. The runtime
source revision includes projection, generator version and all sector hashes.
Feature bytes must match the artist manifest's source hash. Unsupported native
geometry fails explicitly. Authoring squad starts/exits never become gameplay
objectives or markers. Upper masks represent exterior height/roof proxies, with
no invented building interiors, doors or extra gameplay floors.

The unchanged Nautilus wall helper, its immutable source commit and SHA-256 are
recorded in `dist/mount-dora-source/`. Movement uses its oriented wall slabs,
plus the kit's polygon, circle and capsule solids; AABBs are broad-phase queries
only. A shared wall remains solid whenever any native owner remains. Water and
unknown ground block movement. Mapped bridge/wood tiles support walking.

## Production art and ownership

The reviewed production kit is consumed through its manifest and
`createMountDoraArt({THREE,atlas})` factory. Runtime never edits the artist-owned
`dist/mission-art/mount-dora/`, `maps/mount-dora/art/` or `docs/art/mount-dora/`.

The manifest supplies stable source IDs, complete bounds, `ART_REVISION` and
explicit collision policy. `retain-source-walls` replaces visual proxies while
keeping native physical walls. `replace-source-walls` removes only named native
owners and uses the model's actual supports. `additional-solids` supplies parts
such as the lighthouse and boardwalk rails. All native building proxies in the
current kit are replaced. Whole objects are selected by bounds intersection,
including objects spanning blocks or sectors; no seam caps are added.

`TownEnvironment` owns its native ground/plant textures, buffers, materials and
atlas load lifetime. The kit borrows the atlas, owns placement resources and is
disposed before its atlas owner. Its sampler/material ownership remains inside
the kit. `updateResident` instantiates intersecting placements only. `setFocus`
runs after actor/camera updates and fades actual occluding meshes without
changing collision. Pooled opaque materials remain available on exit from focus.

## Bounded residency and movement

Close views use nine 24 metre blocks (72m square); wider zoom uses at most 25
blocks (120m square). A one-block crossing retains 6/replaces 3 in a close view
and retains 20/replaces 5 in a wide view. Either window intersects at most four
240 metre source sectors. Camera-window sources and nearby actor collision
sources are pinned; neighboring sectors are prefetched subject to these caps:

| Resource | Cap |
| --- | --- |
| Render blocks | 9 near / 25 wide |
| Decoded sectors | 9 |
| Concurrent fetches | 2 |
| Pending fetches | 9 |
| Sector response bytes | 4,000,000 |
| Navigation nodes / links | 16,384 / 131,072 |
| Explored blocks | 4,200 × 72 bytes |
| Geographic overview | 180 × 210 pixels |

The terrain facade has metadata-only lazy rows. There is no full-town JavaScript
terrain matrix, per-move clone or scan, or eagerly instantiated building scene.
Loaded sector packets retain their native terrain arrays by reference; least
recently used unpinned packets retire before another packet is decoded. Movement
and bounded navigation query nearby geometry, while explored bits update locally.

Absent terrain stops the animal at its last clear position. Source failures are
visible with an explicit retry. `Visit landmark` is optional: it loads and
validates the destination before moving the animal. Failure leaves position
unchanged, and choosing that landmark again retries. Continuous travel across
seams remains available independently of visits. Disposal aborts source loads and
releases caches, listeners, navigation and resident rendering resources.

## Separate progress and verification

Tour progress uses `farmyard-mount-dora-tour-v1`, separate from operation slots.
It contains source/art revisions, global position, animal/equipment/resources,
distance, elapsed time and compact explored bits. Static map cells are never
serialized. A full explored-town bitset occupies 302,400 raw bytes. Resume validates
resources, equipment and position against the current loaded town before starting.
Recovery excludes the enclosed areas of closed buildings as well as their walls.
An enclosed old checkpoint moves to a clear nearby outdoor point or the validated
Donnelly Park spawn. Heading, equipment, resources, distance, elapsed time and
exploration are preserved, and the activity log explains the relocation.
Preparation preferences may remember the chosen activity; the operation writer
refuses tour state explicitly.

`npm run check` includes source/cache, coordinate, oriented-wall/shared-owner,
water/deck, compact-save, deep-link and production-kit travel regressions.
`tools/test-mount-dora-walkthrough.mjs` builds on the ordinary production route
and uses real browser clicks, keyboard and touch input with read-only diagnostics.
It covers a four-sector corner, a spanning building, landmark loading/failure and
retry, the original boardwalk entrance/join/over-water return, reload, operation
save preservation, source/render caps and exit cleanup on desktop and 390 × 844.
This viewport check is not a physical-phone performance benchmark. Browser/server
helpers have a fifteen-minute hard deadline and close in `finally`, recording
process identities and released ports. Evidence is written to ignored
`artifacts/mount-dora-walkthrough/` and retained by the dedicated CI workflow.

Farmyard Fighters publishes from `main` in `Syntaxswine/farmyard-fighters`.
The Architect reviews map updates on task branches through this production
game before promotion. Farmyard Commando Real Time is the pinned map source;
it is not the destination for Fighters application or gameplay changes.

Global pace, disabled stamina, elapsed stepping and visual cadence are described
in [movement-runtime.md](movement-runtime.md).

Playtests use production wiring by default (see `AGENTS.md`). The town save also retains active AP phase/round, RNG seed, fire state and authored object changes; transient effects are not replayed. Existing saves without this optional runtime section remain supported. No doors are inferred from an address, facade texture or building outline. Supported editor door records create real open/close interactions before scene construction.
