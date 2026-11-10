# Mount Dora production art contract

This pass turns the detached studies into a map-owned production kit on
`codex/mount-dora-landmarks-playable`, based on published Farmyard
`75a6b61a547a96edebdc456e9a42edb4f28185e4`. It supplies the artist's rendering
and solid records; the coder's adapter and architect's integration supply the
playable tour. No raw geography, sector, main branch, engine pin or Pages release
is changed by this branch.

## Integration

Import `createMountDoraArt` and optional `loadMountDoraAtlas` from
`sites/tactical-animal/dist/mission-art/mount-dora/kit.js`. Import
`ATLAS_URL`, `ART_REVISION`, `SOURCE_FEATURES_SHA256`, `PLACEMENTS`,
`REPLACEMENT_SOURCE_IDS`, `placementsForBounds` and `solidsForBounds` from the
adjacent `manifest.js`.

```js
const textureOwner = loadMountDoraAtlas({THREE, signal});
const atlas = await textureOwner.ready;
const art = createMountDoraArt({THREE, atlas});
// Every art/solid coordinate is town east/south metres. The host applies
// game = town - (.5,.5) exactly once on its common adapter/root.
gameArtRoot.add(art.root);
art.updateResident([west, north, east, south]);
art.setFocus([animalTownX, animalTownY], {camera, eyeHeight: 1.2});
// At teardown: stop callbacks, dispose art, then the owner of its borrowed image.
art.dispose();
textureOwner.dispose();
```

The kit has no fetches, animation loop, private Three copy or document access.
The optional texture owner has cancellation and disposes late completions. The
factory borrows the image, owns one sampler clone, and pools its materials.
Sampler UVs keep mip footprints within their painted cell to prevent neighboring
atlas colors bleeding into distant roofs. It never disposes the borrowed image
texture or modifies its filtering settings.

`updateResident(bounds)` uses a 24 m index of **complete visual bounds**, including
objects anchored outside the rectangle. Each global placement appears once.
Eviction disposes that placement's geometry immediately; material and sampler
resources are shared until factory teardown. Static parts batch by material
within each placement, retaining independent residency and source ownership.
There is no full-town mesh allocation. The full-data sweep rendered 1,030 records
sequentially, with 1,082 creations/1,081 evictions before final teardown.

`setFocus(townPoint,{camera,eyeHeight=1.2,opacity=.22}={})` keeps a walking
character legible. Camera coordinates come from the host Three camera; the
target is transformed through the art root, honoring its common parent offset.
Ray hits fade an occluding closed building/lighthouse; an open shelter fades
only its roof/skirt batches, preserving supports and deck. Without a camera,
only the roof of a shelter containing the town focus fades. Geometry and solids
stay fixed. Unchanged 0.1 m quantized focus/camera poses skip repeated raycasts.
The native `setView` visibility mechanism cannot directly survive per-material
static batching, so this narrow adapter retains explicit roof/body roles.
Per-placement alpha variants copy the painted shader hooks; pooled materials
stay opaque. Clearing with `setFocus(null)`, eviction or teardown restores the
original material and disposes its variants. Final actor/phone legibility is
still checked in the actual integrated game, not inferred from kit images.

## Geometry and collision

There are 950 exact source MultiPolygons, including holes, ten separate Inn
records, five historical court records, three actual mapped shelter contours,
the named lighthouse point, two explicitly approximate park structures,
69 pieces along the two complete source boardwalk polylines, 106 raised deck
pieces along the 19 mapped piers, and 89 railway placements holding 992
Nautilus track pieces along the railway's track runs.

The original building renderer receives compiled geographic wall runs without
half-metre cell snapping, floor cells, rooms, stairs or invented entrances. Its
2 m walls and 2.12 m floor spacing remain at scale one. Render-only direction
normalization puts the native painted facade outside both outer and hole rings;
the saved source rings do not change. Identical shared wall edges have one
visual owner. Native roof surfaces are clipped against footprint triangles,
preserving concavities and courtyard holes. Rectangular prefab roof/floor plans
never replace actual footprints. Broad or degenerate roof envelopes use an
explicit exact-outline flat cap.

`REPLACEMENT_SOURCE_IDS` covers source **wall AND upper/roof proxy visuals**.
Keep ground/deck support. There are 953 replacement source IDs, including the
three mapped open shelters. Suppress a shared wall only when none of its retained
owners still needs it.

Each placement and returned solid carries `collisionPolicy`:

| Policy | Host action |
| --- | --- |
| `retain-source-walls` | Keep native closed-house collision; avoid registering the optional footprint again. |
| `replace-source-walls` | Remove only the mapped shelter's closed wall/cap owners; use its post circles and retain walkable ground. |
| `additional-solids` | Add lighthouse, boardwalk rail or approximate structure posts; courts, piers and railway track supply no solids. |

`solidsForBounds(bounds)` returns `{id, placementId, sourceIds, collisionPolicy,
...shape}`. Shapes are `{kind:'polygon',polygons}` (MultiPolygon coordinates,
outer ring then holes), `{kind:'circle',centre:[east,south],radius}`, or
`{kind:'segment',a:[east,south],b:[east,south],radius}` (capsule). They come from
the same placement records used by rendering. Facade decoration adds no solids.

The lighthouse stays exactly at town `(500.2877,1169.7989)`. Its 10.6 m native
proportions are approximate. Mapped pavilion posts follow their contours; the
Evans pavilion and Donnelly stage carry `inferred-within-mapped-park` provenance
and explicit park uncertainty bounds. Boardwalk deck width is the same inferred
2 m support corridor as the base generator; rails sit 1.12 m either side, radius
0.055 m. Ends stay open, with an open side approach near the mapped Palm shelter.
This does not manufacture connecting ground or an elevated multi-floor route.

Pier pieces (`kind: 'pier'`) draw the same deck along each of a pier's
`nativePier.lines`, in pieces of at most 8 m, with no rails and no solids: no
railing is mapped or surveyed. The deck stands at `deck.heightM` (0.4 m, the
owner's choice of a low deck; the 2018 lidar puts the real decks a median
0.43 m over the lake).

Where another of a pier's lines leaves a joint more than 1° off a line's axis,
that line's deck runs on half its width past the joint (`deck.extend`), so the
bend's outer corner is covered. Within 1° of straight it stops square, and the
two square ends leave a hairline wedge (under 2 cm) on the outside of the joint.

Decks that overlap by more than a centimetre stand at different levels, 2 mm
apart (`deck.level`), so no two overlapping tops share a plane. Each line takes
the lowest level that no overlapping line already has: a greedy colouring of the
overlap graph, over all piers.

Beneath each deck, AFT's timber trellis panel stands under both long edges: the
`TRELLIS_BEAMS` of the game's vendored `aft/tactics/bridge-trellis.js`, built by
`trellisBoxes` in `kit.js`. There is one panel per metre, with heights scaled
to the space under the deck and beam sections at 0.4 of AFT's, so they still
read. Caps close only free ends: not joints, and not an end that stands on
another deck, such as a stem meeting its crossbar.

A walker stands at deck height wherever the drawn deck covers the centre of
their cell, and within half the deck's width of a joint (which closes the
hairline wedge). `deckHeightAt` in `manifest.js` answers from the same records
(`deckCovers`), and the town view asks it about the walker's cell
(`surfaceHeight`). That lifts a walker on the 11 path cells (6 ways, one of
them the wooden footbridge 508450238) the deck covers where paths meet piers,
and on land cells beside the walkable band but under the deck.

The generator paints walkable deck cells only where a cell's centre lies within
0.75 m of a deck line: not past its free ends, round at its joints. A walker in
such a cell stands at most 0.25 m (square decks) to 0.46 m (diagonal ones)
beyond the deck's edge. Those stepped cell edges show their wood texture at
water level beside the raised deck.

Shots and sight still treat a walker on a deck at ground height, and the shore
end is a single 0.4 m step. A `pier-deck` kind draws a mapped platform outline;
Mount Dora has none today.

Railway placements (`kind: 'railway'`) draw the Nautilus `railway:track-straight`
piece, retained unchanged in `source/packages/railway-visuals` from Nautilus
`ed951ba` (branch `codex/railway-route-tool`, not yet on Nautilus main). The
kit's route planner accepts only cardinal and 45° legs, which the mapped line
does not follow, so the builder cuts each of the generator's track runs into
equal chords of about 2 m and the adapter sets one piece on each chord at its
true angle, scaled to the chord. Each placement holds up to twelve pieces and
draws one `InstancedMesh` per part of the piece (bed, two rails, ties, plates):
five draw calls whatever its length. The meshes borrow the kit's geometry and
materials, which eviction never disposes; teardown disposes the kit. Pieces meet
with small wedges at bends. Track adds no solids: the bed is walkable ground.

## Sources and limits

[Source records](production-sources.json) distinguish facts read from primary
city/property sources and unavailable leads. The city documents local frame and
masonry vernacular, the Donnelly House and former depot; the Inn owner describes
the yellow/white group and veranda. Individual repeated windows, colors and
dimensions remain approximate. For ordinary buildings, the wall class (siding,
plaster or brick), roof cover, roof form, pitch and ridge axis follow the county
record and 2018 lidar where those are recorded
([maps/mount-dora/reference](../../../maps/mount-dora/reference/README.md)). Each
placement's `provenance.evidence` names the source, and colors stay seeded
placeholders until surveyed. The 126 county-sketched buildings OpenStreetMap
lacks (`county-` ids) have no OSM tags. Their county use decides the kit type: a
store, office, shop or professional building is commercial, and the rest are
vernacular. The Gables/Terrace treatments suggest
the documented stucco annex typology. Source names, tags and all ten footprints
remain separate, without claiming ten historically independent hotels.

The city design guide (PDF pages 76, 77, 82 and 84) was subsequently inspected.
Donnelly House now has yellow siding, silver metal roof treatment, native
polygonal corner tower, intersecting clipped gables and white veranda arches/rail
detail. The turret position, dimensions and cross-gable arrangement are bounded
inferences inside the unchanged footprint. The depot uses white siding and a
low gray hip roof. Shamrock has pale lower pilasters, arched window trim and a
strong cornice based on the historical photograph; its three levels still come
from the mapped source, not that photograph. The Inn receives veranda arches;
the historical corner gazebo is not assigned an invented current footprint.
Museum and surrounding assignments remain inferred local treatments. The scene is flat and has no
surveyed interiors, elevation, precise facade inventory or reconstructed historic
ornament. This is not a claim that all 950 buildings have been photographed or
surveyed. No Street View imagery was traced, extracted, cached or shipped.

## Verification

Run `node maps/mount-dora/art/tools/build-playable.mjs` to regenerate the scoped
bindings/copies. It refuses invalid bounds and changed court topology. Exact
source/atlas hashes are in the production `provenance.json`.

The focused test checks geography fidelity, source hashes, replacement policies,
complete-bound queries, real native geometry bounds, source winding, roof holes,
boardwalk continuity/clearance, eviction and texture cancellation/ownership.
The production browser review uses the game's existing Three and renderer,
with one 72 m resident window at a time. Native frames show geometry and
placements; they are not evidence of completed in-game travel or phone GPU
performance. Final route/camera/save testing belongs to the integration pass.
