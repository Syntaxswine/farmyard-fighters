# Mount Dora lidar: roofs and bare earth

Roof form, eave and ridge heights and ground elevation for each of the 950
game buildings, and a 1 m bare-earth grid of the whole map, measured from USGS
3DEP lidar (public domain). County records ([house-reference.json](../house-reference.json))
give storeys and materials but never the roof shape; this fills that gap and
puts a measured height on every building.

Nothing here changes the generator, the sectors, `features.json` or the art kit.
The Pages build does not publish `maps/mount-dora/reference/`.

## Source

The National Map lists two lidar collections over the town box:

| Collection | Tiles | Size | Used |
| --- | ---: | ---: | --- |
| FL_LAKECO_2007 | 4 | 210 MB | No: eleven years older, legacy delivery |
| FL_Peninsular_2018_D18 (Lake County block, FL_Peninsular_Lake_2018) | 4 | 1.38 GB | Yes |

The 2018 collection was flown on **6 December 2018** (6 flight lines, one day,
from the points' GPS times) with a Riegl VQ-1560 and a Leica ALS80. The
original CRS is NAD83(2011) / Florida East (US feet) with NAVD88 heights
(GEOID12B). Over the game extent it holds:

| Returns per m² | |
| --- | ---: |
| All returns | 29.6 |
| Usable (not withheld, not noise) | 26.5 |
| First returns | 22.3 |
| Ground (class 2) | 8.5 |
| Building (class 6) | 2.4 |

rockyweb.usgs.gov serves the four tiles but answers every download with HTTP
429, so [fetch-lidar.mjs](../../../../tools/maps/lidar/fetch-lidar.mjs) reads
the same points from their Entwine copy on AWS Open Data
(`s3://usgs-lidar-public/FL_Peninsular_Lake_2018`). It takes only the octree
nodes that meet the game extent plus 60 m, at full density: 1,724 nodes,
90,878,212 points, 448 MB, cached in the gitignored `artifacts/lidar/`.
[source.json](source.json) records the coverage query, the four original tiles
and every node's size and SHA-256.

**Decoding without a dependency.** Entwine stores the nodes as LAZ (LAS 1.2,
point format 1, LASzip pointwise v2). [laz.mjs](../../../../tools/maps/lidar/laz.mjs)
decodes them in plain JavaScript. It was checked once against laz-perf 0.0.7,
Hobu's WebAssembly build of LASzip, installed outside the repository: all
1,724 nodes, all 90,878,212 points, identical in every field read here
(coordinates, returns, class byte, flight line, GPS time, class flags).
Every node is also checked against its own header and octree cube. One quirk
was found: Entwine writes LAS 1.4's 4-bit return numbers into the 3-bit fields
(8 becomes 0, 9 becomes 1) while its header counts the originals. That affects
only late noise returns.

## Registration

Points go EPSG:3857 → WGS84 latitude/longitude → town metres through
[projection.mjs](../../../../tools/maps/house-reference/projection.mjs), the
port of the generator's own projection. The outlines are each building's
`geographicGeometry`.

The lidar's building returns sit **0.84 m south and 0.04 m west** of the OSM
outlines. Shifting the outlines that way raises the share of outline cells
over class-6 returns from 0.909 to 0.925. The 30 sectors with ten or more
buildings agree with that shift to within 0.22 m (median) and 0.71 m (worst).
All sampling below uses the shifted outlines.

## Per building

| Field | Meaning |
| --- | --- |
| `groundM` | NAVD88 metres: median of the ground returns within 4 m outside the outline (all 950 had enough) |
| `groundRangeM` | 10th–90th percentile of that ring; 235 buildings have 1 m or more (sloping lots) |
| `heightM` | Percentiles of all roof returns above `groundM` |
| `eaveM` | Where the roof over most of the outline meets the walls: the area-weighted median of the roof planes' low edges. For a flat roof, its deck |
| `ridgeM` | 98th percentile of roof heights |
| `upperEaveM`, `upperShare` | Set when a taller roof stands 1.5 m or more above `eaveM` (37 buildings): its eave, and its share of the plane area |
| `storeysFromLidar` | One storey below a 4.6 m eave, then one more every 3.2 m |
| `roof.form` | `flat`, `gable`, `hip`, `other` or `unknown` (see below), with `confidence` 0–1 |
| `roof.ridgeBearingDeg` | Gable and hip only: 0–180°, clockwise from north |
| `roof.pitchDeg`, `roof.pitch12` | Median slope of the pitched planes, in degrees and as rise per 12 run |
| `planes` | Up to six largest planes: area m², slope °, downslope bearing °, fit rms m, low edge m, top m |
| `coverage` | Share of the outline with roof returns |

Roof returns are the vendor's class 6 (building) inside the outline. Where
class 6 covers under 30% of an outline (13 buildings: sheds and carports), the
unclassified last returns 1.5 m or more above the ground are added.

## Roof form

Returns are binned to 0.5 m cells, each cell keeping a robust centroid. A
least-squares plane is fitted to each cell's 5×5 neighbourhood. Planar cells,
best first, grow into roof planes. The rules, fixed before the town was run:

- **flat**: at least 75% of the plane area slopes under 10°.
- **gable**: pitched, and the roof runs parallel to part of the outline along
  at least 12% of the sampled edge length. A gable end shows as such a rake.
- **hip**: pitched, with eaves on every side.
- **other**: mixed flat and pitched roof, a roof that rises to an edge (shed or
  complex), or one less than half explained by planes.
- **unknown**: under 4 m² of roof returns, or under a quarter of the outline covered.

| Form | Buildings | Confidence ≥ 0.7 |
| --- | ---: | ---: |
| gable | 569 | 529 |
| other | 155 | 99 |
| hip | 118 | 88 |
| flat | 104 | 101 |
| unknown | 4 | — |

Ridge bearings were checked against the walls: 98.9% of gable ridges and 98.3%
of hip ridges lie within 5° of an outline wall direction (median 1°). Random
bearings fall within 10° only 26.5% and 20.3% of the time. Median pitch is 22°
(quartiles 18° and 26°, about 4.9:12). The county's roof cover agrees with the
forms: 13 of 18 tar-and-gravel roofs read flat, and only 11 of 698 shingle,
metal or tile roofs do.

## Validation

**County storeys.** The gate was fixed before the first run. It needs at least
80% of the outlines of 20 m² or more to be half covered, a ROC AUC of at least
0.8 for the eave height separating county two-storey from one-storey buildings,
and Cohen's κ of at least 0.4 between county and lidar storeys (1 / 2 / 3+).
The negative controls repeat the whole pipeline with every outline shifted
30 m east, then 30 m north. They must fail.

| Run | Covered | AUC | κ | Gate |
| --- | ---: | ---: | ---: | --- |
| Outlines as registered | 0.989 | 0.883 | 0.541 | pass |
| Control: 30 m east | 0.622 | 0.577 | 0.064 | fail |
| Control: 30 m north | 0.631 | 0.566 | 0.029 | fail |
| Pre-registered wall measure (5th-percentile height) | 0.989 | 0.733 | 0.283 | fail |

The pre-registered measure failed. Porch, carport and wing roofs inside an
outline set its low percentile, so two-storey houses read as one (73 of 106).
It was replaced by the plane-based eave; the thresholds and the gate did not
change. A third variant, the eave of the tallest roof, was also tried: AUC
0.894, κ 0.491. It latched onto small upper roofs and is kept only as
`upperEaveM`. The table above is therefore not a blind test. The controls are
what show the agreement comes from the right buildings.

| County storeys | Buildings | Eave, quartiles (m) |
| --- | ---: | --- |
| 1 | 796 | 2.73 / 3.06 / 3.56 |
| 2 | 106 | 5.01 / 5.80 / 6.46 |
| 3+ | 5 | 10.17 / 10.89 / 11.29 |

Lidar agrees with the county on 87.8% of buildings. Most disagreements are
measured correctly but sit on a boundary of the storey rule:

- tall one-storey churches, halls, warehouses and stores (decks or eaves at
  4.8–5.6 m) read as two storeys;
- 1½-storey bungalows with dormers fall between the classes;
- the county record was joined by ground-floor area (`parcel-area`), the
  weakest join.

**Built after the flight.** The county dates 10 game buildings 2019 or later.
6 of them have under half their outline covered, and those 6 make up 6 of the
10 under-half-covered buildings. Three of the four `unknown` buildings are 2020–2021 builds.

**Landmarks.**

| Building | County | Lidar | Eave / ridge (m) | Form |
| --- | ---: | ---: | --- | --- |
| Lakeside Inn: Gables | 2 | 2 | 6.47 / 11.26 | hip (low confidence) |
| Lakeside Inn: Terrace | 2 | 2 | 7.55 / 11.65 | gable (low confidence) |
| Lakeside Inn: Gatehouse | 2 | 2 | 7.56 / 9.95 | gable |
| Lakeside Inn: Sunset | 3 | 3 | 8.15 / 12.06 | gable |
| Lakeside Inn: Grand Lobby | 2 | 3 | 8.03 / 11.21 | gable |
| Lakeside Inn: Fisherman's Tavern | 2 | 3 | 7.95 / 12.83 | other |
| Lakeside Inn: Alexander | 1 | 2 | 7.24 / 9.64 | gable |
| Lakeside Inn: Beauclaire | 2 | 1 | 3.68 / 4.00 | flat |
| Lakeside Inn: "Lakeside Inn" outline | 1 | 1 | 1.56 / 1.86 | flat |
| Donnelly House | 2 | 1 | 3.96 / 12.08; upper eave 7.88 (43%) | other |

The inn's two-storey wings that the county joined by outline (Gables, Terrace,
Gatehouse, Sunset) all agree. The four disagreements are all `parcel-area`
joins. The Grand Lobby and Fisherman's Tavern have 8 m eaves: two tall hotel
storeys, read as three. The Donnelly House's wraparound porch roof sets its
eave at 3.96 m. Its main roof, two planes at 50° (14.5:12), starts at 7.88 m:
two tall Victorian storeys, which `upperEaveM` carries.

**Grantham Point lighthouse.** 296 returns within 3 m of the named point form
a 3 m tapered tower. Its top is **7.03 m (23.1 ft)** above the surrounding
ground (19.55 m) and 7.8 m above the lake. The published figure is 35 ft
(10.67 m), and the art kit's proxy is 10.6 m. With 22 first returns per m²
the lidar cannot miss 3.6 m of a solid tower, so the published height (or
what it measures) is the doubtful number. The proxy is about 3.6 m too tall.

## Bare earth

[bare-earth.png](bare-earth.png) is the game's 1 m grid: 1,440 × 1,680 cells,
origin town (0, 0), x east, y south. Row 0 is the northern edge; cell (i, j)
covers x ∈ [i, i+1), y ∈ [j, j+1). Each 16-bit sample is the elevation in
centimetres above NAVD88. [bare-earth-source.png](bare-earth-source.png) says
how each cell was made:

| Value | Cells | Meaning |
| ---: | ---: | --- |
| 0 | 65.9% | Mean of the ground returns in the cell |
| 1 | 15.5% | Filled: push-pull interpolation under buildings, trees and gaps |
| 2 | 18.6% | Lake Dora, at the lidar water level 18.82 m (61.75 ft) |

The ground runs from 18.53 m at the shore to 54.72 m on the downtown ridge, a
36 m relief the game does not have yet. [bare-earth.json](bare-earth.json)
holds the grid definition and the SHA-256 of both sample arrays. A PNG's bytes
depend on the zlib build, so checks compare the decoded samples.

## Files

| File | Written by | Contents |
| --- | --- | --- |
| `source.json` | `fetch-lidar.mjs` | Coverage query, the original tiles, every cached node with its SHA-256 |
| `../lidar-roofs.json` | `build-lidar.mjs` | One record per game building, metrics and validation |
| `bare-earth.png` | `build-lidar.mjs` | 1 m terrain, centimetres above NAVD88 |
| `bare-earth-source.png` | `build-lidar.mjs` | Per cell: measured, filled or water |
| `bare-earth.json` | `build-lidar.mjs` | Grid definition, encoding, statistics |

## Running it

From the repository root, with Node 22 or later and no dependencies:

```powershell
node tools/maps/lidar/fetch-lidar.mjs          # 448 MB of Entwine nodes into artifacts/lidar/, a few minutes
node tools/maps/lidar/build-lidar.mjs          # ~45 s on 12 worker threads
node tools/maps/lidar/build-lidar.mjs --check  # needs the cache; re-derives everything
node --test tests/maps/lidar.test.mjs          # no cache needed
```

The test decodes one committed node
(`tests/maps/fixtures/lidar-ept-11-1070-1042-1017.laz`, 63 KB). It checks the
roof rules on synthetic roofs and the committed outputs against their inputs,
and it recomputes the gate. Mutation testing killed all 14 mutants of the
decoder, roof rules, raster helpers and statistics.

## Caveats

- The lidar shows December 2018. Buildings built or demolished since then do
  not match it; `coverage` flags them.
- Class 6 is the vendor's automatic building class. A roof under a tree keeps
  the part the vendor classified.
- `storeysFromLidar` is a coarse rule. Tall one-storey commercial buildings
  read high. Prefer the county's storeys where a record exists.
- OSM outlines merge porches with houses. `eaveM` is the eave over most of the
  outline; `planes` and `upperEaveM` show the parts.

## Proposed use in the generator (not applied)

- Base each building at `groundM` on the bare-earth grid, and give Mount Dora
  its terrain.
- Take wall height from `eaveM`, and roof shape from `roof.form`,
  `ridgeBearingDeg` and `pitchDeg` where the form is flat, gable or hip with
  `confidence` ≥ 0.7. That covers 718 of 950 buildings.
- Take storeys in this order: survey, then county, then `storeysFromLidar`.

As with the county reference, adopting this regenerates the owned outputs, so
the map's owner should make that change. AGENTS.md applies to it: verify the
result through the real game path (import and editor playtest), and keep each
value's source, observation date (6 December 2018) and uncertainty
(`confidence`, `coverage`) alongside it.
