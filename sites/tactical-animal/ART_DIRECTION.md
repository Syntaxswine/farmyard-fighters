# Farmyard Commando: inherited visual direction

Farmyard Commando is the single-player phone version of **Animal Factory Tactics 3D**. The parent game supplies the visual identity and the original art. New graphics should extend that work consistently.

## Source library

The source is `AnimalFactory3D/game/dist`, recorded at revision `a20b343a0234b5d8b365a4e1668961ca1bf37653`. `aft-provenance.json` records each borrowed file's SHA-256, byte count and relative path. The `dist/aft/` snapshot holds 1,181 files: 949 art assets and their manifests plus the associated model data, rendering modules and original styles. The original checkout is read only during import. Source-control metadata is excluded so the imported bytes remain stable across Git checkouts.

| Category | Original assets | Includes |
| --- | ---: | --- |
| Characters | 704 | Painted portraits, species models, clothing, pose art, references and texture atlases |
| Environment | 173 | Ground, brick, metal, timber, cargo, furniture, foliage, factory equipment and vehicles |
| Equipment | 25 | Painted weapon inventory images and equipment surfaces |
| Effects | 22 | Painted fire, blast, blood and related visual atlases |
| Machines | 17 | Factory machine paintings and visual elements |
| Interface | 8 | Original interface artwork |

The accompanying modules preserve the parent game's cargo and furniture builders, scenery and biome libraries, character animation, lighting, equipment and effects. The phone adaptation keeps its existing solo mission and controls. Catalog availability does not add an object or its gameplay to that mission.

Run `node sites/tactical-animal/tools/snapshot-aft.mjs <original-dist-directory>` from the repository root to deliberately refresh the snapshot. Review changes and run `npm run check` afterward. The `.gitattributes` entry preserves the imported bytes on Windows as well as other platforms; edit mobile adapters rather than borrowed files.

## Art already connected to the mobile game

- Character selection uses the original worker portraits. The battlefield uses the existing original species models, paint, equipment and movement rigs.
- Loadout buttons use the original painted weapon images and their original crop frames. The mobile adapter resolves project-relative URLs before loading, versions them with the release, and keeps loaded images mounted during selection. Stance controls use the parent game's silhouette symbols.
- `original-art.js` renders the mission with the original brick, concrete, gravel and grass textures, the original two-metre wall height and the parent game's painted cargo renderer. Walls and cargo use instancing for repeated pieces.
- The original daylight rig supplies the morning light and shadows. Its mobile shadow map is 1024 pixels.
- The preparation screen follows the parent's cream paper, oxide red, ink-black lettering and diagonal poster composition. Battle controls follow its olive panels, cream labels and muted gold selection treatment. System fonts keep the phone version independent of external font downloads.

The full art bank stays on disk. The browser requests only the images and modules used by the current screens and mission.

## Industrial UI hardware

The interface should feel like warm, worn vintage machinery: industrial and retrofuturist, with painterly skins and textures. The standalone `dist/button-study.html` material study previews the button treatment before its game rollout. Its reusable styles are in `dist/industrial-switches.css`; the painted atlas, original control symbols and generation manifest are in `dist/assets/ui/industrial-switches/`.

- Green switches use chipped olive painted-metal housings around hazy, aged celluloid faces. The opaque mounting metal keeps its material identity while a warm internal lamp illuminates the inset face.
- Symbols, labels, stock counts and AP markings belong to one white painted legend. Their illumination must change together. Keep them inside the shared `.switch-legend` group so they inherit one paint color and one lighting filter.
- Red indicators retain the warm cherry-red and orange palette. Their translucent material has molded diamond prisms and ribs, like an old tail light or street lamp: variations in thickness break and diffuse the internal light into a pattern. The eye, count and label use the same white paint in both lighting states.
- Preserve readable phone-sized markings, clear on/off states and touch targets. Retain the original six control symbols and respect reduced-motion preferences.

The battlefield minimap and expanded tactical map share the buttons' chipped olive-metal housing through `dist/map-frame.css`. Their transparent, nine-slice `map-frame-v1.webp` border preserves the painted corners at different map sizes. Its generation prompt and provenance are recorded with the switch materials in `dist/assets/ui/industrial-switches/manifest.json`.

All six field controls and both zoom keys use the painted switch atlas through `dist/field-hardware.css`. The red eye lights for visible contacts and briefly pulses for a newly discovered guard. End Turn lights throughout both combat phases, independently of whether it is currently clickable. Run/sneak, lowered stances, and armed grenades light their complete white legends; holding a mode button retains its expanded choice menu.

The live End Turn control uses the red prismatic lens. Its lamp indicates turn-based combat and stays illuminated during both player and guard turns, including when the action is temporarily disabled for grenade aiming. It stays dark outside combat. The upper-left Zoom arrows use the green painted-metal switches, illuminate on press, and retain 44-pixel touch targets. `dist/field-hardware.css` adapts the shared switch material to the field controls.

The targeting console places an olive-painted physical monitor above the switches, occupying roughly the top third of its phone layout. It reuses the unchanged inherited `aft/assets/ui/dialogue-terminal/field-terminal.webp` housing paint and `crt-green-v1.webp` glass: the glass is a 20% multiply layer over the target, with a center-light layer and separate subtle static scanlines. `targeting-monitor.js` displays the selected visible guard's original character sprite in green monochrome. A highlighted body region and adjacent hit percentage follow the authoritative attack preview. `target-sprites.js` records the inherited sprites' measured content bounds; stance-specific sprites are preferred, with same-species idle or explicitly labeled standing references when needed. A failed image gets a readable signal status, and hidden or dead targets never produce a preview.

Body locations are the left column and aim levels the right column of vertically stacked, labeled rectangular switches. These use warm orange-golden amber glass with molded diamond diffusion, dark honey-brown when unlit, inside the same worn olive-metal housing. The skin and its generation prompt are recorded in `dist/assets/ui/industrial-switches/shooting-switches-v1.json`. A wide painted-metal Fire bar sits immediately above the final Single/Burst/Exit row; Exit uses the same green switch housing and closes the selection without firing. Weapons without burst show Single and Exit. One switch per selection bank is illuminated. Reticles, silhouettes, cartridge marks, labels and numbers all use the shared white-painted legend and light. Dynamic SVG symbol URLs carry the current module release before the fragment, matching the field controls' cache behavior.

Aim switches show their actual AP price; body-location switches show their hit chance. A new target defaults to the highest affordable aim supported by the equipped weapon. Deliberate lower choices remain selected while affordable, and a more expensive burst mode falls back to the best affordable aim. Pressing a switch without enough AP flashes matching red glass three times, then returns to its normal face; the valid selection and resources remain unchanged. Opening the panel and choosing switches spend no AP or ammunition.

## Phone adaptation rules

Searchable chests and fallen guards with remaining contents have a soft golden contour halo. `search-halo.js` derives it from their actual painted alpha or posed 3D silhouette. Uneven brighter patches drift slowly along the contour, shifting subtly between honey amber and pale gold, like moving light behind the object. Keep the object's painting intact and avoid a uniform flashing outline. The glow is stronger within interaction reach, stops when contents are exhausted, and respects current visibility, line of sight, scene depth and chunk residency. It does not discover scenario items or change perception rolls. Reduced motion keeps a static gold contour. The renderer reuses a bounded set of masks, borrows source art/geometry, and releases its own resources at operation changes.

Keep the original painted silhouettes, material scale, weathering and species identity. Preserve transparent margins and use the recorded weapon crop frames rather than stretching weapon images. Retain readable touch targets, portrait framing and safe-area spacing.

The solo simulation owns collision, movement, AP, targeting and knowledge of the map. A scenery placement needs a matching gameplay footprint before becoming a solid visible object. Respect unexplored ground and hidden opponents; foreground walls may fade for camera readability without changing line of sight. The existing mission receives a material and model replacement; its layout and rules stay intact.

New missions can use the rest of the inherited catalog as their gameplay and placements are authored. Furniture, factories, vehicles and biome scenery are available without making the first phone mission load the entire library.
