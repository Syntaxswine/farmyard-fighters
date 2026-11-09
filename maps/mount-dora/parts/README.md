# Mount Dora house parts

One file per building, so each house can be reused in another map or game:
1,076 files covering the 950 OpenStreetMap footprints and the 126 county-sketched
buildings OSM lacks. Each `<id>.json` is a self-contained `house-part`, version 1,
that a reader can use without the rest of the town. `index.json` lists them with
their size, storeys, roof form, whether they fit a workshop block and their
SHA-256.

A part is the house alone on its own 1 m grid. It moves as one rigid unit: by
quarter turns on any grid, or at any angle and position in a host that is not
on a grid, such as a house set along a curved street.

## What a part holds

| Field | Meaning |
| --- | --- |
| `kind`, `version`, `id` | `house-part`, `1`, and the town's building id (an OSM way or relation, or `county-…`) |
| `name`, `address` | The OSM name. The address is from OSM, else the county parcel joined to the building, with its join method. Either may be null. |
| `rights` | The licence (ODbL 1.0, as part of the town's derived feature database) and the credits a copy must carry: OpenStreetMap, the county where its records were used, and USGS lidar |
| `frame` | The coordinate conventions, repeated in every file so it stands alone: units, axes, origin, cells, levels, wall centring, the rotation rule, angles and the latitude datum |
| `size` | `[width, depth]` of the outline in metres |
| `outline` | GeoJSON-style MultiPolygon on the 1 m grid, origin at its minimum corner, holes kept |
| `floorCells` | The 1 m cells inside the outline, as rows `[y, x0, x1]` covering `x0` to `x1 - 1` |
| `walls` | Exterior wall centrelines as integer segments that trace the outline exactly once. `sharedWith` names a neighbour across a party wall; `sourceWallId` is the generator's wall id. |
| `storeys` | The count and the evidence that set it: survey, then the OSM `building:levels` tag, then county, then the lidar eave, then a one-storey default |
| `material` | The wall material (wood, brick or concrete) and its evidence: survey, then the OSM `building:material` tag, then county, then a brick default |
| `kit` | Native dimensions: 2.12 m storey pitch, 2 m walls, 0.12 m slabs, 0.16 m wall thickness centred on the line. Interiors are not surveyed. |
| `roof` | The lidar roof: form, confidence, pitch, the ridge's axis in the part frame, eave, upper-eave and ridge heights above the ground, the ground in NAVD88 metres, coverage, and the dataset and flight date (2018-12-06) |
| `appearance` | The production art kit's treatment, seed and provenance, with its points in the part frame. On its own a part draws every facade. |
| `entrances` | `not-surveyed`, with no records. Doors come only from a person's survey (AGENTS.md); none are inferred from an address, outline or facade. |
| `placements` | The pivot, the grid pose (where the house sits in the town) and the true pose (its measured angle, latitude and longitude), each with its fit to the measured footprint |
| `evidence` | County, lidar and survey values and their disagreements, as in `features.json` |
| `source` | The OSM element's id, version, timestamp and tags, or the county sketches |
| `provenance` | Layout digest, shared-wall component, sectors, the grid fit's derivation and metrics, and the measured footprint in the part frame of the true pose |

Every level from 0 to `storeys` has floor on `floorCells`. Level 0 is the ground
floor and level `storeys` is the roof deck, as in the town's sector maps.

## Placing a part

```
world = at + R(rotationDeg) · (p − pivot)        R(θ) = [[cos θ, −sin θ], [sin θ, cos θ]]
```

`p` is a point in the part frame. `R` turns +x toward +y, which is clockwise on
a north-up map because +y is south. The pivot is the centre of the outline's
bounds, so `at` is where the house's centre lands. `placePoint` and `placePart`
in `tools/maps/house-parts/house-parts.mjs` are the reference implementation.

- **Grid pose** (`placements.grid`): `rotationDeg` 0. It puts the house back
  exactly where the town has it. `suppressedWallEdges` lists the outline edges
  `[polygon, ring, edge]` whose facade the art kit leaves to a neighbour in the
  town. 10 parts have any.
- **True pose** (`placements.true`): the angle the grid fit removed when it
  squared the house to the town grid, with the latitude and longitude of the
  centre of its bounds. Most Mount Dora houses are within a few degrees of the
  grid, and for them the two poses fit about equally: on 235 the grid pose is
  better, by at most 0.024. For the 52 turned more than 5°, the true pose
  covers the measured footprint at a median IoU of 0.91, against 0.66 squared
  to the grid and 0.58 turned the wrong way about the same centre. It wins on
  all 52.
- **Reviewed overrides:** the review moved three plans by hand, so their grid
  fit does not invert (`placements.true.basis`). Their true pose sets the plan's
  centroid on the measured centroid at the measured angle. The Chamber of
  Commerce fits at 0.947 that way, against 0.334 on the grid.
- **Any pose**: pick `at` and `rotationDeg`. The walls, floor and roof turn
  together. The ridge's compass bearing is `90 + rotationDeg + roof.ridgeAxisDeg`.

`provenance.geographicOutline` is the measured footprint in the part frame of
the true pose: placed with the true pose it lands on the real house, and its
IoU with `outline` is the true pose's `fitIoU`.

## In the Nautilus workshop

807 parts fit a block. A block is 24 × 24 m and keeps at least 1 m of yard on
every side, so a house fits only up to 22 × 22 m and 5 storeys. The engine
treats a wall touching a block's edge as crossing into the next block, and
then refuses to place or capture that neighbour (`wallsInSector` in
`packages/map-core/wall-runs.js`). The other 269 parts are larger, up to
88 × 61 m. Export blocks on demand. They are not committed:

```powershell
node tools/maps/house-parts/export-block.mjs osm-way-1240415865
node tools/maps/house-parts/export-block.mjs --all
```

They land in `artifacts/house-parts/blocks/`. To use one in the workshop:

1. Open **Settings** and **Import** the `.block.json` file.
2. Click **Save** to keep it in the browser's design library.
3. Switch **Workspace** to the map. Pick the house under **Saved designs**, set the
   sector, and click **Place selected block**.

A block replaces its whole 24 m square and lands only on the 24 m grid. The house
sits centred in it; `housePart.offset` records where.

`workshop.json` is the receipt for the pinned workshop at Nautilus `2502646`:
- **Every block:** validates, imports with no value changed, places into a valid
  map and extracts back unchanged. Copies then go into the four slots around it,
  every slot captures back unchanged, and four quarter turns restore it. "Valid"
  is the engine's validation with connectivity off, as when placing by hand: a
  closed house dropped on the default squad starts (sector 1,1 of a new map)
  can cut them off, which a full validation reports.
- **A control:** a house moved flush against its block's edge passes every step
  up to the neighbours, then the engine refuses it, as it did 67 blocks before
  the margin.
- **Five houses through the real controls:** Import, Save, Place selected block
  in a slot and its four neighbours, Export. They include a party-wall house, a
  four-storey house and one that crosses sectors in the town.

The receipt pins a digest of each block's geometry, with the engine commit. A
part's name, look, address, evidence or place in the town can change without
staling it; a change to the cells, levels or walls of a block-sized part does,
and so does a new engine pin. The test names the block. Then rerun it (the
commands are in `maps/mount-dora/workshop/README.md`):

```powershell
node tools/prepare-mount-dora-workshop.mjs --source artifacts/mount-dora-workshop/nautilus-2502646 --git-source <read-only Nautilus repository> --project maps/mount-dora/project.json
node tools/maps/house-parts/review-house-part-blocks.mjs --source artifacts/mount-dora-workshop/nautilus-2502646 --git-source <read-only Nautilus repository> --browser
```

Without `--browser` the review keeps the earlier browser evidence only while
the engine pin and those five blocks are unchanged. The browser drives the
built workshop in `dist/`; the source check covers the tracked files it is
built from.

## Regenerating and checking

```powershell
node tools/maps/house-parts/build-house-parts.mjs          # after the town, evidence or art kit changes
node tools/maps/house-parts/build-house-parts.mjs --check
node --test tests/maps/house-parts.test.mjs
```

Generation refuses to write unless three things hold:
- every part validates;
- stamping all parts back into the 42 sector maps reproduces them byte for byte,
  with the generator's rules mirrored in `house-parts.mjs`;
- every art placement rebuilds exactly from its part.

`--check` fails while any part is stale. A change to a field the parts do not
read, such as a survey camera or a boardwalk in the art kit, leaves them
current.

The round trip can fail two ways:
- **The town's inputs changed** (a building, an outline, a storey count). The
  parts are stale; regenerate them.
- **The generator's rules changed**, for example a new field on every wall run.
  Regenerating cannot help, because the parts are rebuilt from the same town.
  The refusal names the first sector and JSON field that differ. Update the
  mirrors in `house-parts.mjs` (`deduplicatedWalls`, `splitWalls`,
  `polygonSpans` and `stampSectors`, after `deduplicated_walls`, `split_walls`,
  `polygon_spans` and the sector writer in `tools/maps/build-mount-dora.py`),
  then regenerate.

The round trip rebuilds each sector's building layers from the parts: floor
terrain, upper floors, levels, building ids and wall runs. It copies the rest
of the sector, including the props, starts and exits that the generator also
places around walls. So it proves the parts hold the town's buildings, not
that a changed part would leave those other layers valid.

## Limits

- **Exterior shells only.** There are no interiors, stairs or doors, because none
  have been surveyed.
- **The roof is measured data, not geometry.** The game draws roofs from the art
  kit. Nautilus's sloped-roof contract takes rectangles only.
- **Walls follow the grid plan, not the survey.** The measured footprint is kept
  in `provenance.geographicOutline`.
- **No Farmyard operation map can play a part yet.** The operation loader
  (`adaptAftSector`) refuses upper floors and ignores wall runs. Only the Mount
  Dora tour reads them.
- **Two known disagreements with the art kit**, recorded in `index.json`
  `checks`:
  - It draws the ridge of one square house (`osm-way-1241962342`) along y,
    while lidar measures it along x.
  - It draws four Lakeside Inn buildings with two storeys. The native plan has
    1, 1, 1 and 3 from the county records.

## Sources

Footprints and tags © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
ODbL 1.0; see [../source/NOTICE.txt](../source/NOTICE.txt). Every part file
repeats its licence and credits in `rights`, so a copy used alone keeps them.
County records are Lake County Property Appraiser public data. Roofs and
heights are from USGS 3DEP lidar, which is public domain. The same sources and
caveats as [../reference/](../reference/README.md) apply.
