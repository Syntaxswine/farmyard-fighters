# Golden contour halo for Nautilus Engine

The user approved Farmyard Commando's animated searchable-object halo and requested it for Nautilus Engine. The chest profile is the approved baseline. Bodies use a 1.75× wider rim and spill, with the same gold palette, light drift and distance emphasis.

## Reusable renderer

Source: `dist/search-halo.js`, class `SearchHalo` and its local shader strings. Rendering uses the project's Three.js r180 vendor module and WebGL2. The engine adapter supplies:

```js
const halo = new SearchHalo({ reducedMotion: () => prefersReducedMotion });
halo.render(renderer, scene, camera, [
  { root: chestSprite, strength: 1, width: 1 },
  { root: posedBodyRoot, strength: 0.55, width: 1.75 },
], presentationTimeMs);
// Dispose before the source rigs/scene resources retire.
halo.dispose();
```

`root` is the actual visible sprite/mesh hierarchy. Mask proxies borrow geometry, textures, skeletons and morph state; the renderer owns its proxy materials and render targets. It releases obsolete proxies, reuses its targets, and resizes with viewport/device-pixel-ratio changes. The engine should supply its own selection/knowledge adapter in place of the Farmyard imports and exported `searchHaloCandidates` / `searchHaloTarget` functions.

## Appearance and passes

The base scene is rendered once with depth. A silhouette pass preserves source alpha and current skinned poses, clipping against that scene depth. The edge pass combines eight directions at radii 1.8, 4.6 and 8 CSS pixels, scaled by the target's width. Bodies and props use separate width buckets so widening a body preserves the approved chest profile. Buckets reuse one mask/light target and accumulate light additively; use a small set of width presets. One width needs four rendering passes; the current two presets need six. No additional texture allocation is needed for the wider body preset.

Two slow, spatial sine fields create uneven moving pools of light. Their hue moves between honey amber and pale gold. The source painting stays intact. Reduced motion freezes the light field at time zero. Edge computation runs at 0.75× CSS resolution; scene color retains the normal device resolution. Depth rejection also suppresses spill across foreground occluders. Shader texture reads use explicit LOD zero in the edge loop.

## Game-owned policy

Farmyard highlights chests and fallen guards only while they contain loot and are currently visible, in line of sight and resident in the camera window. The glow strengthens within interaction reach. It never changes discovery, AP, simulation RNG or saves. Burned bodies resolve to their visible ash painting, avoiding hidden dissolved geometry and flame cards. The engine should expose this as a reusable rendering effect and let each game decide eligibility, visibility and remaining contents. The user's separate design direction reserves exclamation marks for scenario items found through LOS plus a passed perception check, and flags for extraction points.

## Verification and references

`tests/search-halo.test.mjs` covers visibility, residency, exhaustion, body/ash selection, pose/resource ownership, independent width passes, motion timing, reduced motion, and renderer-state restoration on failure. Browser evidence is stored beside this chat under `halo-body-refinement/`, including the revised pig, the approved chest comparison and foreground occlusion. The preceding baseline evidence is under `animated-search-halo/`. The local diagnostic `halo-review.html` uses explicit controls and an unsaved mission; it is excluded from the shipped build.
