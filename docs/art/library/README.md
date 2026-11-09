# District library furniture

**96 reusable assets:** eight forms × six skins × two contents states. This is an additive native Three.js furniture library, based on public Farmyard Commando commit `60aeeed`. No mission placements or existing AFT snapshot files are changed.

![Full-tile double bookcases: plain and ornate](fulltile-comparison.jpg)

| Form ID | Tile reservation | Body width × depth | Height |
| --- | --- | --- | --- |
| `bookcase-tall` | 1 × 1 | 0.94 × 0.46 m | 1.90 m |
| `bookcase-wide` | 2 × 1 | 1.94 × 0.46 m | 1.90 m |
| `bookcase-low` | 2 × 1 | 1.94 × 0.46 m | 0.98 m |
| `bookcase-double` | 2 × 1 | 1.94 × 0.88 m | 1.90 m |
| `bookcase-double-thick` | **1 × 2** | **0.98 × 1.98 m** | 1.90 m |
| `bookcase-double-ornate` | **1 × 2** | **0.98 × 1.98 m** | 1.98 m |
| `library-table` | **1 × 2** | **0.94 × 1.94 m** | 0.84 m empty; ≤1.18 m with books |
| `library-table-large` | **2 × 4** | **1.94 × 3.94 m** | 0.84 m empty; ≤1.18 m with books |

Every form has `empty` and `books` states. Bookcases now use simple box frames and one textured block per shelf bay. Book spines, blank labels, bands and page edges are painted into skins; individual books are not modeled on the shelves. Double-sided cases use the skins on both faces. Tables retain their horizontal stacks, upright books and open volumes. The 2 × 4 communal table has six legs, extra braces and four reading places. Geometry stays identical across finishes.

The two full-tile forms fill a 1 × 2 reservation with one centimetre of clearance on each edge. Each joins two cabinet backs, with four shelf levels and two bays on both long faces. The plain form has paired roof panels and a centre seam. The ornate form adds a stepped cornice, pilasters, capitals, dentils and a repeating diamond-relief frieze on both faces. The ornament stays inside the same footprint. The catalog's **Compare full-tile bookcases · 1 × 2** filter shows the pair together.

![Both stocked rear faces](fulltile-back.jpg)

![Full-tile overhead footprint](fulltile-top.jpg)

The original [vector atlas](../../../sites/tactical-animal/dist/art/library/book-spines.svg) contains four shelf arrangements in each of the six finish palettes. It is 1024 × 768 pixels when loaded, with padded cells and separate spine/page regions. The same small box geometry serves every shelf arrangement. The original four stocked cabinets use 216–528 triangles, compared with 3,640–11,984 in the previous model. The new full-tile models use 600 triangles for the plain case and 1,560 for the frieze case, both stocked. Both use nine material batches.

| Bookcase | Previous triangles | Current triangles | Reduction |
| --- | ---: | ---: | ---: |
| Tall | 3,916 | 252 | 93.6% |
| Wide | 6,360 | 312 | 95.1% |
| Low | 3,640 | 216 | 94.1% |
| Double-sided | 11,984 | 528 | 95.6% |

The six finish IDs are `oak`, `walnut`, `sage`, `ivory`, `oxblood`, and `graphite`. Oak/walnut expose the wood grain; sage, ivory and oxblood use painted frames with timber shelves and reading surfaces. Graphite uses steel surfaces. Clothbound books share muted red, blue, green, ochre and ivory palettes, with broad spine bands and labels.

![Bookcase finishes](bookcase-skins.jpg)

![Ivory, oxblood and graphite bookcase finishes](bookcase-skins-bottom.jpg)

![Simplified bookcase on a phone](phone-bookcase.jpg)

![Full-tile frieze bookcase on a phone](fulltile-phone.jpg)

![One-by-two table finishes](table-skins.jpg)

![Two-by-four communal table finishes](large-table-skins.jpg)

## Reuse

The asset source is [furniture.js](../../../sites/tactical-animal/dist/art/library/furniture.js); forms, skins and stable IDs are in [catalog.js](../../../sites/tactical-animal/dist/art/library/catalog.js). The generated [catalog.json](../../../sites/tactical-animal/dist/art/library/catalog.json) contains all 96 variants, base dimensions and placement offsets, source hashes and rights notes. `specification()` computes the rotated dimensions and reservations for each quarter-turn.

```js
import {loadLibraryTextures, createLibraryFurniture} from './art/library/furniture.js';

const textures = await loadLibraryTextures();
const library = createLibraryFurniture(textures);
const asset = library.build('library-table', 'sage', 'books', {rotation: 0});
scene.add(asset.root);

// Asset IDs use library.<form>.<skin>.<empty|books>.
// Register matching gameplay geometry before placing a solid in a live map.
const solidParts = asset.solidParts();

// On removal: unregister collision first, release this asset's instance buffers.
asset.dispose();
// On unloading the furniture set: release shared buffers/maps, then borrowed inputs.
library.dispose();
textures.dispose();
```

`build()` returns `root`, `spec`, local `parts`, build-time `bounds`, `solidParts()` and idempotent `dispose()`. `rotation` accepts 0/90/180/270 degrees about renderer +Y. Front faces +Z at zero for the original forms; the two new full-tile cases face +X, with their long axis along Z. This orientation is already included in their part matrices and declared in `spec.origin`. Roots are centered on their footprint, with ground at Y=0. To place at the first occupied tile's cell center, add `spec.placementOffset` to that cell coordinate. The new cases and the 1 × 2 table use `(0,0.5)` at zero rotation; the 2 × 4 table uses `(0.5,1.5)`. When translating or rotating a root later, call `solidParts()` again to obtain current world transforms.

Tile reservations describe editor spacing. Navigation uses the actual body footprint in `spec.navigationFootprint`, not an opaque full-tile box. Sight and projectiles use returned solid geometry with copied world matrices, preserving the gaps under tables and the headroom above stocked shelf rows. A painted book row has a simple rectangular collision volume; painted gaps between individual spines are not holes. Cabinet labels, table spine bands and trim are decorative. `solidParts()` borrows the library's geometry; consumers must not dispose those buffers or retain registrations after unloading the library.

Each root batches identical geometry/materials into instanced meshes. Stocked cabinets use eight or nine material batches. Individual roots own their instance buffers; the library owns three shared geometries, finish materials and cropped texture clones. All three source atlases remain owned by the caller. `library-furniture/3` extends the forms while retaining the `bookSkins` texture bundle added in version 2. No lights, timers, animation loops or image requests are created by importing the furniture module. The explicit loader releases successful partial loads if any of its three inputs fail.

This pack does not register entries in the frozen AFT designer or place furniture in gameplay. A consuming editor/mission should use the supplied IDs, placement offsets and body geometry, convert its angle convention to renderer +Y, and include this owned module namespace in its normal cache-versioning path. These are integration hooks, not additional art dependencies.

## Catalog review

After `npm run build`, serve the project and open `/art/library/index.html`. Select any form and finish, or compare all six skins. Each card shows empty on the left and stocked on the right; front, back and overhead views are available. Floor squares are one metre. PNG links expose browser image downloads, which were not verified in this session; the reusable models are the native factory and its catalog.

The catalog normally uses WebGL. This session's in-app browser could not create a WebGL context, so evidence uses the built-in software snapshot renderer. It projects the **same actual model triangles** and samples the **same inherited and original atlases**, with per-pixel depth for correct overlap of large cabinet faces. Lighting is approximate and shadows differ from the game. WebGL shading has not been visually verified in this session. Geometry, tile dimensions, contents, material assignments and front/back orientation were reviewed through the software path. The catalog identifies the active preview mode. Screenshots of the earlier cabinet and table forms are retained from their preceding passes; those model geometries are unchanged.

![Phone catalog](phone-table.jpg)

## Sources and validation

The painted wood/metal atlases and bevel helper come from the user-supplied AFT snapshot at `a20b343a0234b5d8b365a4e1668961ca1bf37653`. The inherited `dining-table` provides the four-board top, legs, apron language and 0.84 m table height. New bookcase, table and book layouts are project contributions. Inherited files remain untouched. The repository does not declare an upstream art license or a project-wide license for the new art; the manifest records this status without relabeling art as MIT. Three.js retains its separate MIT notice.

Regenerate the skins with `node sites/tactical-animal/tools/library-book-skins.mjs`, then the manifest with `node sites/tactical-animal/tools/library-catalog.mjs`. Tests cover all 96 variants at four rotations, bounds, equal geometry across skins, empty contents, both stocked faces, the 600/1,800-triangle budgets, full-tile placement and joined backs, skin coordinates, table sight gaps, communal-table supports and reading places, disposal/ownership, partial load failures, source hashes and per-pixel preview depth. Browser evidence, performance measurements and source hashes are recorded in [review.json](review.json). Temporary preview helpers are stopped after QA.
