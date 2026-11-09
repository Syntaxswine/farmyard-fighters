# Large sector milestone

Farmyard Commando keeps a complete AFT sector in world coordinates and renders a moving neighbourhood of at most nine 24×24 blocks. Tiles have integer-centred metre coordinates; the seam between blocks 0 and 1 is at 23.5 m. Rendering residency is never used as a collision, sight, pursuit, inventory or save boundary. At sector edges the neighbourhood shifts inward. A one-block move through the interior retains six blocks and replaces three.

## First playable sector

This section records the original layout 1 foundation. Fresh operations now use
the [Road Checkpoint approach redesign](road-checkpoint-approaches.md); saved
layout 1 operations still resume the original encounter described here.

**Road Checkpoint** adapts the original `opening-checkpoint/foundation-1.json`, pinned at AFT revision `a20b343a0234b5d8b365a4e1668961ca1bf37653`. This is an in-progress foundation sector, not a claim that the original campaign/tutorial is complete. All 57,600 terrain cells, the office footprint, six guard placements and three prop placements are retained. Farmyard adds travel orders, a supply chest, a diversion-sign clue and an east rally point beyond the first two block seams. The existing Night Ledger and Short Measure missions remain available in their existing save slots.

The source is preserved in the designer snapshot. `node sites/tactical-animal/tools/import-aft-sector.mjs` losslessly packs that export into `aft-checkpoint-data.js`; `--check` verifies reproduction. The generated module records the original path, commit, byte length and SHA-256. `aft-sector.js` accepts supported flat version-2 maps and rejects unsupported terrain, props or vertical traversal explicitly. The editor's portable JSON format remains the authoring source; the packed module is a deployment representation.

## Deliberate first-pass adaptations

- The wooden office door uses Farmyard's persistent open/close, reach, AP and collision rules.
- Brick windows use the existing conservative opaque two-metre wall treatment. Shooting through windows needs a separate rules and artwork pass.
- Sandbags and the red barrel retain their one-tile physical footprints. The barrel is static cover in this milestone; chain explosions are not enabled.
- The source's upper layers are empty. Sectors that require stairs, climbing, upper floors or water are rejected until their rules and rendering are implemented.
- The source is mostly open country around a compact checkpoint. Populating the remaining countryside is a later authored-content task; streaming must not invent buildings or guards.
- Pathfinding uses a stable heap and an 8,192-node work budget. An unusually complex long detour can return no route; shorter waypoints remain available. A hierarchical planner is a later step for densely built sectors.

Acceptance includes continuous seam crossing with unchanged distance/AP accounting, whole-world shot obstruction beyond the rendered window, local visibility work, pursuit, persistent doors/loot/objectives after leaving and returning, legacy and sector save round trips, and bounded/disposed renderer resources. Camera focus may change scenery residency; it cannot reveal unidentified opponents or discard simulation state.
