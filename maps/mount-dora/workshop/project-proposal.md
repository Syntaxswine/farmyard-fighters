# Draft atlas/project contract proposals

These are consumer proposals for architect review, not changes to the native
`aft-map-v2` format or mandates for the geographic generator.

The agreed project minimum is version/id/projection, extent 1440 × 1680,
sectorSize 240, columns 6, rows 7, and 42 sector records with
`id,column,row,origin:{x,y},file,neighbors`. Origin is column/row × 240
in canonical town metres (east/south); north is up. Files are relative JSON paths.
The atlas computes its navigation neighbors from row/column so that it need not
invent an incompatible serialization of the root's neighbor references.
Optional sector `name` and `landmarks:[string | {id,name}]` improve discovery.

Proposed additions for the authoring project:

- `authoringPreviewAnchors` with purpose, coordinates and a statement that the
  four starts/travel marker are native editor aids, not combat mission content.
  Do not use these to claim all-water sectors are natively valid.
- Stable `sourceFeatureIds`, projection/georeference and source attribution at
  project and sector level. Preserve unknown bounded metadata in the native file.
- Cross-boundary source feature ID plus original geometry/reference, separate
  from each sector's clipped presentation geometry. Do not infer whole-building
  identity only from a local tile position.
- A separate generated audit receipt keyed by exact file SHA-256 and engine
  revision. Native import readiness is derived evidence, not geographic truth.

The atlas adds no unknown fields to the root's final files. Its generated
`audit.json` contains per-sector source hash, public API errors, feature counts,
changed source values, native-added paths, and history/export-reopen results.

Missing engine capability proposals, for a separate engine change:

1. An authoring document profile that can open terrain-only sectors without
   mandatory squad/travel markers; preserve game-specific mission validation.
2. A public project/georeference contract and safe sector-switch API with a dirty
   document result, rather than requiring hosts to inspect the editor controller.
3. A scene residency/metrics contract: visible bounds plus a small padded block
   ring, selected floor band, and disposal/cancellation semantics. Preserve
   authoritative map state outside those bounds. A 240 m side and six layers cap
   address space; geometry density still needs its own measured GPU budget.
4. Cross-sector feature references and shared boundary ownership, without merging
   the entire town into one 3D scene.
5. A georeferenced raster underlay/curve survey workflow, elevation datum and
   explicit bridge/boardwalk support. Survey source availability and editor
   capability are separate; this content task must not flatten unsupported data.

Choice: a lightweight atlas and native editor bridge. It preserves the existing
format/tools and makes import failures visible. A single combined 42-sector scene
would defeat the requested visible-area budget. A second editor would duplicate
history/storage/geometry behavior and conceal native workshop gaps. Arithmetic
only: one 240 × 240 terrain grid has 57,600 cells; 42 grids have 2,419,200 before
extra floors, geometry and assets. These counts are not GPU timing measurements.
