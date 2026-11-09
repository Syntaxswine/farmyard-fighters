# Mount Dora house reference

Per-building facts for the 950 game buildings, so houses can be built to the
right height, material and porch rather than the generator's default. Today
`building_style()` in `tools/maps/build-mount-dora.py` makes every building
without a `building:levels` tag a **one-storey brick box**. Only 13 of the 950
have that tag, and none has an OSM material, roof shape or colour.

This folder adds two layers on top of the OSM geography, without editing it:

1. **County records, automatic.** Lake County publishes a building record for
   every parcel (storeys, exterior wall, roof cover, year built, porches,
   garage). `house-reference.json` ties each game building to its record.
2. **A person's eyes, fast.** The [survey page](survey/) opens Google Street View
   at each building in turn, already aimed at it, and records what a person
   sees: roof shape, colours, wall finish, porch. Answers export to
   `house-survey.json`.

These files feed the generator and, through it, the sectors, `features.json`
and the art kit ([below](#use-in-the-generator-and-the-art-kit)). A committed
`house-survey.json` does too, so regenerate after changing it
([Surveying](#surveying)). The Pages build does not publish this folder
(`build.mjs` copies an explicit file list).

## What the county records add

| Measure (950 game buildings) | Before | With county records |
| --- | ---: | ---: |
| Storey count from a source | 13 | 910 (798 one, 107 two, 4 three, 1 four) |
| Two storeys or more | 10 | 112 |
| Rooms in the roof (county 1.25–1.75 or 2.25–2.75) | 0 | 89 |
| Wall material from a source | 0 | 759 (265 wood frame) |
| Roof cover known | 0 | 729: 519 shingle, 176 metal, 18 tar-and-gravel (flat), 10 rolled, 6 tile |
| Porch recorded | 0 | 638 |
| Planned Street View camera | 0 | 950 (873 on the addressed street; median 24 m away) |

How each building was matched (`match.method`):

| Method | Buildings | Meaning |
| --- | ---: | --- |
| `footprint` | 684 | The appraiser's building sketch overlaps the game outline, IoU ≥ 0.5 |
| `footprint-partial` | 90 | Most of a sketch lies inside the game outline, but the outlines differ |
| `parcel-single` | 135 | No sketch (commercial or unsketched); the only building on the lot |
| `parcel-area` | 23 | Several buildings on the lot; picked by ground-floor area |
| `none` | 18 | No record: the high-school campus and a few outbuildings |

**The county also has buildings OpenStreetMap lacks.** 247 appraiser sketches
inside the town are claimed by no game building. They are listed under
`countyOnly`, with their outline in town metres, `coveredByGame`, and the same
county facts (`county`, `suggested`) a game building gets.

## County buildings the game lacked

`county-buildings.json` (written by `tools/maps/lidar/build-lidar.mjs`, logic in
`county-buildings.mjs`) turns those sketches into buildings, and the generator
adds them to the town. A sketch is not always a missing building: many are
offset drawings of a house the game has, or one condo unit per floor. The 2018
lidar's building returns (class 6) tell them apart:

1. Each sketch moves, within 4 m, onto the building returns under it (median
   1.4 m). One with less than half its area on a roof stays where it was drawn.
2. Sketches that overlap or come within 0.5 m are one structure: stacked condo
   units, attached units, a house drawn twice. Its outline is their union.
3. A structure already in the game is kept out, and listed under
   `represented`, with the game building it matches.
4. Every other structure is added, minus any part a game building covers.

| Of 247 county-only sketches | Sketches | Outcome |
| --- | ---: | --- |
| On a roof, or kept on the county record | 206 | **126 buildings**, 22,814 m²: 80 houses, 16 condo buildings (from 89 unit sketches), 7 offices, 4 stores, 4 duplexes and 15 others |
| No roof, drawn over a game building | 31 | Already in the game: Dora Villa's units, drawn south of the building over open ground |
| Record held by a game building it overlaps | 6 | Already in the game: the same house, drawn a few metres off |
| On a mapped structure | 5 | Already in the game: the History Museum, the Lakeside Inn, a store, the lakefront pavilion, and the parking garage (OSM's multi-storey car park) |

- **Lidar reading:** 120 of the 126 stand on a building-class roof. The other
  six say what the lidar saw instead (`lidarSaw`):
  - four have raised returns without the building class, a roof under trees;
  - one (1475627/1, a 1935 house) shows open ground in December 2018 and is
    placed on the county record alone;
  - one has too few returns to tell.
- **Heights:** storeys follow the county record where it has one, otherwise the
  lidar eave, measured as for the game buildings. Where both exist they agree
  for 88 of 109.
- **The lakeside houses:** six lie partly inside OpenStreetMap's Lake Dora
  polygon, though the lidar puts roofs there. The generator lets them stand over
  that mapped water, as it does for any mapped footprint.
- **Pieces:** a native outline is one connected footprint, so a sketch of two
  parts meeting at a corner becomes two buildings (`-part2`).
- **Survey:** each building takes the lot and address of its largest sketch
  with a record (its first sketch, if none has one). It gets a Street View
  camera planned as for the game buildings
  (`tools/maps/house-reference/viewpoint.mjs`), except that the camera's pitch
  may follow the lidar storeys where the county has none: the game buildings'
  cameras are planned before the lidar, from county storeys alone. 111 of 126
  stand on the addressed street, median 26 m away. All 126 are in the survey's
  queue. A piece (`-part2`) keeps the lead sketch's lot even where it lies on
  another member's; no current structure has one that does.

## Caveats, checked on real buildings

- County codes are a strong prior, not ground truth. The Donnelly House
  (1893, wooden Queen Anne, already hand-built yellow siding in the art kit) is
  recorded as `CONCRETE BLOCK PLAIN`. Commercial records often leave wall and
  roof blank. The survey exists to confirm or correct them.
- `BRICK/BLOCK STUCCO OR SIDING` is one county code for three finishes. It maps
  to the kit's `concrete` with `finishUnknown`, and the survey decides.
- `STORIES` 1.25–1.75 means usable rooms under the roof. It maps to
  `stories: 1, halfStory: true` (a steep roof with dormers), not to two floors.
- The sketch layer is residential only and "only the portion of the county
  completed to this point" (the appraiser's caveat). Commercial buildings join
  through their parcel.
- `basement: true` (75 game buildings) usually marks a sloping lot. The town is
  still flat in the game; this is a lead for terrain, not used yet.

## Lidar: roof shape, heights and terrain

USGS 3DEP lidar (flown 6 December 2018, 29.6 returns per m²) adds what county
records lack: a roof form for every building (569 gable, 118 hip, 104 flat,
155 other, 4 too sparse to tell), eave and ridge heights, ground elevation,
and a 1 m bare-earth grid with 36 m of relief. It agrees with the county's
storeys (AUC 0.88, κ 0.54), and the same pipeline on footprints shifted 30 m
fails. It also puts the Grantham Point lighthouse at 7.0 m, not 35 ft. Method,
validation and files are in [lidar/README.md](lidar/README.md).

## Why Street View is a link and not a download

Automating Street View captures would break Google's terms. The Google Maps
Additional Terms (modified 2026-01-27) forbid users to "mass download or create
bulk feeds of the content". The Maps Platform terms (the paid API route) add
"Customer will not create content based on Google Maps Content". This
repository is also public, and the art kit's
[source policy](../../../docs/art/mount-dora/production-sources.json) already
rules out Street View tracing, extraction or caching. So the tool plans the
camera (`streetView.url`, a keyless
[Maps URL](https://developers.google.com/maps/documentation/urls/get-started)),
Google shows the panorama in its own viewer, and a person writes down what they
see. No pixels are requested, stored or traced.

Openly licensed street photos exist on Mapillary (CC BY-SA), but in November
2026 it covers only a few downtown streets, so it is not used here.

## Files

| File | Written by | Contents |
| --- | --- | --- |
| `county/footprints.geojson` | `fetch-county.mjs` | Appraiser building sketches in the town box (AltKey, building number, outline) |
| `county/parcels.geojson` | `fetch-county.mjs` | Parcels: situs address, land use, building count. No owner fields |
| `county/buildings.csv` | `fetch-county.mjs` | Building records: style, wall, roof cover, storeys, year built, areas |
| `county/subareas.csv` | `fetch-county.mjs` | Sub-areas per building in sq ft (living, upper storey, porches, garage…) |
| `county/extra-features.csv` | `fetch-county.mjs` | Lot features: detached garages, pools, docks, sheds |
| `county/source.json` | `fetch-county.mjs` | URLs, retrieval times, bytes and SHA-256 of every input and kept file |
| `house-reference.json` | `build-house-reference.mjs` | One record per game building, plus `countyOnly` |
| `survey/` | hand-written | The survey page |
| `house-survey.json` | the survey's Export | A person's answers, keyed by game building id (not created yet) |
| `lidar-roofs.json` | `tools/maps/lidar/build-lidar.mjs` | Lidar roof form, eave and ridge heights and ground per game building |
| `county-buildings.json` | `tools/maps/lidar/build-lidar.mjs` | County-sketched buildings OSM lacks, placed on their lidar roofs with a planned Street View camera each, and the sketches already in the game |
| `lidar/` | `tools/maps/lidar/` | Lidar provenance and the 1 m bare-earth grid ([details](lidar/README.md)) |

Owner names and mailing addresses, sale prices, appraised values, exemptions,
bedrooms and bathrooms are never requested or written. A test enforces this.

## Running it

From the repository root, with Node 22 or later (no dependencies):

```powershell
node tools/maps/house-reference/fetch-county.mjs          # monthly county release; ~110 MB cached in artifacts/
node tools/maps/house-reference/build-house-reference.mjs # writes house-reference.json
node tools/maps/house-reference/build-house-reference.mjs --check
node --test tests/maps/house-reference.test.mjs
node tools/maps/house-reference/serve.mjs                 # http://127.0.0.1:4597/reference/survey/
```

The county replaces its files each month (`Bldg_MMDDYY.txt`). The fetch picks
the newest release; `--release 100626` pins one. A re-fetch changes
`county/source.json` and usually a few records; rerun the build after it.

## Surveying

Open the survey, pick a sector or keep the whole town, and work down the queue.
It runs street by street through all 1,076 game buildings: the 950 OSM ones
(`house-reference.json`) and the 126 county-sketched ones OSM lacks
(`county-buildings.json`). The latter are marked *county* in the queue, and
typing `county-` in Find lists only them. Since OSM lacks them, check that each
stands as drawn; the six with no 2018 lidar roof say so. If Street View shows no
building, flag *Changed since the record*. For each building:

1. Press **V**. Street View opens in a second tab, always the same one, at the
   nearest panorama, facing the building. Pan if it is off-centre. **A** opens
   the satellite view, where the roof shape is easiest to read.
2. Tap what you see. Buttons marked *county* show what the record says.
3. If you can see a door, click the dashed game outline on the mini-map where it
   is. That marks one 1 m wall edge; click it again to remove it.
4. Type the panorama's "Image capture" month (`2024-03`) and pick a confidence.
5. Press **Enter** for the next building. Answers save in the browser as you go:
   a button as you click it, a note or a date when you leave the field (or the
   page).

Export whenever you stop. To commit:
1. Import the committed `maps/mount-dora/reference/house-survey.json`, so the
   export includes everyone's answers, not only those in your browser.
2. Export, and put the export in its place.
3. Regenerate what it feeds:
   - `python -B tools/maps/build-mount-dora.py` (storeys, walls and the sectors);
   - `node maps/mount-dora/art/tools/build-playable.mjs` (the art kit);
   - `node tools/maps/review-mount-dora-routes.mjs` (the route pin);
   - the workshop review in [workshop/README.md](../workshop/README.md).
4. Commit them together.

Import merges by the newest copy per building, keeping the newer copy whole
rather than merging fields. So two people can split the town by sector, but a
building on a sector edge is listed under both sectors, and only one of them
should answer it.

Clearing an answer, or dropping one, leaves a dated mark that the export carries
under `cleared`, so importing an older file never brings it back.

Every change first takes the newest copy of each building from the browser's
storage, and the page redraws when another tab saves. So a second tab builds on
the first tab's answers instead of writing over them. Each change is dated after
the copy it replaces.

Import reads every stamp as a date, in whatever form it comes, and treats
anything else as undated. A copy dated more than a minute ahead of this
browser's clock comes from a clock running fast (or this one runs slow).
- It never replaces an answer here.
- Where there is none, it lands with its own stamp. An edit made on top of it is
  then dated after it, and keeps its order on every machine.
- A stamp more than a day ahead means a broken clock, and is read as undated.
- If import keeps the copy here against a copy dated ahead, set whichever clock
  is off, then import again.

Import names what it replaced, what it did not take because the copy here is
newer, and what it kept here against a copy dated ahead: up to 20 buildings per
list, then a count. An identical copy, such as one in the file you just
exported, changes nothing and is not mentioned.

Until the reference files load, nothing saves, imports or exports.

An answer can name a building id this queue lacks: the town no longer has the
building, its id changed (a county building's can when the county data does), or
a teammate made it with other files. Import keeps it, Export keeps it, and the
queue panel lists it with what it holds and a **Drop** button. The generator
applies it to nothing and lists it as lost in `project.json`. To re-key one:
1. Export, and rename its id in the file to the building's current id.
2. Import that file. It must report the answer taken. If it says the copy here is
   newer, the building already has an answer, and dropping the old id would lose
   whatever only the old one holds. Copy that across by hand first.
3. Drop the old id.

If a building's outline changes after you marked its doors, the page warns. Each
marked edge that no longer lies on the outline can still be clicked to remove it.

### Evidence rules

The repository's `AGENTS.md` (from PR #39) says geographic details, doors above
all, go "only where source data or reviewed observations establish them", and
keep "the source, coordinates, observation date and uncertainty". A survey
answer is such a reviewed observation, and its export says so in an `evidence`
block. Version 3 pins the files the exporting page had loaded, which an answer
it imported may predate: the two the queue came from (`reference`,
`countyBuildings`), and `outlines`, the building outlines its entrance edges
lie on. The outlines pin hashes each building's id and authored geometry rather
than `features.json`'s bytes, because the generator rewrites that file with
every survey answer it applies. Import names whatever has changed since.
Version 2 exports, from before the county buildings joined the queue, still
import.

| Rule | Where it lives in `house-survey.json` |
| --- | --- |
| Source | `evidence.source`: a person viewing Google Maps; no imagery stored |
| Coordinates | the game building id (an OSM id, or a `county-` id); each entrance is a 1 m edge of the game's grid outline, in town metres |
| Observation date | `imageryDate` (Google's capture month) and `at` (when the answer was recorded) |
| Uncertainty | `confidence`: sure, likely or unsure. An unanswered field is unknown, not absent |

Entrances are only doors a person saw. None are inferred from an address, an
outline or a facade, so a building with no marked entrance keeps none. All 1,076
authored outlines lie on the 1 m grid (a test checks this), so any wall can take
an entrance. Editor doors are grid edges too (`e:x:y` / `s:x:y` in a sector), so
converting a marked edge to a door record is a sector offset away. That
conversion, and a playtest through the real game path, belong to the wiring
step. That step must also check that each marked edge still lies on the
building's current outline. The generator copies entrances into `nativeProxy`
as given, and the page warns of a stale one only when that building is opened.

`tools/maps/house-reference/test-survey-page.mjs` drives the page headlessly in
Chromium, through its own controls, and the workshop CI job runs it. It covers:
- the status line and the Show filter;
- Clear, the note, the image date, a storey key, Import and Export, which write
  nothing before the reference files load, whether the load fails or is slow;
- a cleared and a dropped answer surviving an import;
- two tabs, on different buildings and on one, and a tab that hears no storage
  events;
- stamps dated ahead, without milliseconds, as epoch numbers, or not dates at
  all;
- real clicks right after typing a date or a note;
- focus resting in a field while another tab saves or clears;
- a door marked and removed on the mini-map with real clicks;
- re-keying, with the whole export and one id renamed;
- unknown answers.

Any uncaught page error fails it.

## Use in the generator and the art kit

`building_style(feature)` in `tools/maps/build-mount-dora.py` takes storeys, in
this order:

1. the survey answer (`house-survey.json`);
2. the mapped `building:levels` tag;
3. the county suggestion (`house-reference.json` → `suggested`);
4. lidar (`lidar-roofs.json` → `storeysFromLidar`, from the eave height);
5. the one-storey kit default.

The tag outranks the county because county `STORIES` is wrong for some
commercial records. The three-storey Shamrock Building is recorded as 1, while
OSM says 3 and lidar measures a 10.5 m eave. Materials follow the survey, then
the `building:material` tag, then the county wall code, then the brick default.
Survey `wall` maps to the kit as follows: `wood-siding` and `other-siding` →
`wood`, `brick` → `brick`, and `stucco`, `block` and `stone` → `concrete`.

Each building records its sources in `nativeProxy` (`storiesSource`,
`materialSource`, `evidence`). Where county and lidar give different storeys
(135 buildings: 114 OSM, 21 county), `evidence.storiesDisagreement` keeps both
for a survey to settle.
A county building's answer (a `county-` id) joins its county and lidar evidence
the same way. An answer whose id matches no building applies to nothing. The
generator still builds, so that the regenerated house reference lets the survey
page show the answer for re-keying. It lists such ids under the survey's `lost`
in `project.json`'s `evidenceInputs` and prints a warning. That catches only an
id that vanishes. A county id comes from its structure's first sketch by key,
and a `-part2` suffix from the pieces' area order, so a regeneration that hands
an id to a different structure or piece would re-target its answers silently.
The evidence files are pinned in `project.json`, as is the survey
export once it exists. The reference and lidar files pin only the OSM-sourced
fields of `features.json` they read
(`tools/maps/house-reference/features-digest.mjs`), so a regeneration never
invalidates its own inputs.

The art kit (`maps/mount-dora/art/tools/build-playable.mjs`) then sets the
following from the same evidence:

- the wall class: frame → one of the siding textures, masonry → plaster, brick → brick;
- the roof cover: metal → silver metal, tile → terracotta, tar-and-gravel → flat;
- the roof form, pitch and ridge axis, from lidar at confidence ≥ 0.7, or from a survey answer.

Colours stay seeded placeholders until a survey records them. Hand-authored
landmarks (Donnelly House, museum, depot, Shamrock, Lakeside Inn) keep their
curated treatments. Each placement's `provenance.evidence` names the source of
every evidence-driven field.
