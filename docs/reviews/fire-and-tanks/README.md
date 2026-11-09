# Fire lifecycle and fuel tanks — review candidate

Implemented sequentially from main `b2f2b6b`. The first checkpoint, `4413022`, restores lethal fire and victim playback; the next commit adds tank detonation. This branch is for architect review before Pages promotion.

Direct spray permanently kills exposed victims, including allies and 1000-HP targets, without resistance or damage falloff. Scenery is checked against head, torso and leg heights: a standing head can remain exposed over low cover while a prone body is protected. Ground fire and outer fuel blasts instead force standing, zero AP and three panic turns. Each round accepts at most three swept, collision-checked metre offsets from the actual fractional position. Walls, doors, occupied space and world bounds remain solid; panic never opens doors or snaps to tiles. Seeded randomness chooses direction. Reignition does not reset the countdown. Fire keeps combat turns active; a burning solo player automatically advances after a three-second presentation interval, with End Turn also available.

Tank chances are conditional on confirmed impacts: torso 25% for a loaded carried or stowed flamethrower; weapon 90% only while holding it. Other zones, misses, melee, reserve-only fuel and destroyed tanks never consume a tank roll. Ranged traces resolve the actual intercepted actor and zone before testing eligibility. Burst rounds resolve in order, charge AP once, and consume only emitted ammunition; a dead or ignited shooter cannot emit the remaining rounds. The destroyed weapon, loaded fuel, spare fuel and slots are removed before ordinary casualty loot is created. Other equipment is preserved.

## Continuous fuel footprint

AFT's central three-by-three cells represent a physical three-metre square. Farmyard centres that square on the actual fractional wearer position and immediately kills actor centres with `abs(dx) <= 1.5` and `abs(dy) <= 1.5`, on the same level. It does not round actors or use a grenade's radial falloff. Other living actors within five metres ignite. Scenery does not block this fuel blast. Integer-centred, dry, in-bounds ground cells within five metres burn for three completed rounds. Water and void are excluded. Existing fire cells may refresh, while an already burning actor's countdown remains unchanged.

## Presentation and persistence

The simulation commits deaths, accepted routes, equipment destruction, fire cells and causal presentation receipts. The renderer reuses the pinned AFT engulfing, fitted panic, collapse, dissolution, ash and tank-rupture modules/artwork. Standing worn tanks use the measured cylinder midpoint, including late actor loads; stowed tanks retain their actual held weapon and use a body-centred burst. Each receipt is associated with its emitted shot. No animation callback moves or damages a character. The approved standing rigs animate; unsupported postures or failed artwork retain the selectable casualty fallback. Ash uses the original body-loot pick and interaction.

Saves keep positions, burn turns, per-round panic bookkeeping, destroyed equipment and ground-fire duration. They omit transient attack/playback receipts. Loading reconstructs ongoing fire and settled remains without another shot, step, charge or RNG roll. Transient effects retire when hidden or expired; ground fire follows currently visible simulation cells. Reduced motion skips transient rupture and freezes ongoing fire. Shared textures and per-actor effects are disposed through the owning view.

The pinned AFT/designer snapshot bytes are unchanged. The adapter reads the verified `core/engine.js`, `fuel-blast.js`, `fire-events.js`, roster fire modules and tank modules from `designer/a20b343a0234/tactics/`; game.html maps their Three.js vendor imports onto Farmyard's existing renderer runtime. The original 3D live integration notes supplied with the task govern lethal spray, rather than the older damage-falloff paragraph in RULES.md.

## Verification

- `npm run check`: 264 tests pass, including mission/layout-version save compatibility, Road Checkpoint approach playthroughs and the published Reload shortcut.
- `npm run build`: passes, including snapshot provenance and packaging checks.
- Deterministic gameplay tests cover the chance/eligibility matrix, intercepted actors, scenery-intercepted rays, delayed burst detonation, interrupted bursts, central fatalities, ignition through walls, destroyed-equipment loot, mid-burn saves and malformed saves.
- Native roster/effect tests cover fitted tank origins, stowed equipment, legal route corners, stationary fatal playback, fog, reduced motion, missing textures, late loads and disposal.
- Real 390×844 in-app browser review: shared cone control and native weapon targeting; selectable ash opens Boris's ordinary loot window; a solo burning player advances to permanent death without input; worn/stowed blasts; save/reload retains AP, ammunition, destruction and fire; three rounds reduce the countdown 3→2→1→0 and extinguish all 73 fixture fire cells. No browser errors or warnings on the final candidate. Review tabs and disposable previews were closed, and port 4514 was released.

The browser fixtures deliberately isolate combat setup, including high-HP victims. All attacks, movement, panic, saves and imagery use production commands and rendering. The study pages pause only the presentation clock to capture animation phases reproducibly; the native game UI was checked separately. These are not claims of a full mission playthrough under fixture conditions.

To reproduce, run `npm run build`, then `node sites/tactical-animal/tools/prepare-fire-review.mjs`. Serve the generated root `dist/` using the existing preview server with `PREVIEW_BUILD=1`. Open `/qa/fire.html` for native spray/panic checks, `/qa/tank-game.html` for native targeting, or `/qa/tanks.html` for a fixed-clock worn/stowed, save and round-expiration study. Generated QA pages are not part of the production source build.

## Mobile evidence

| Check | Capture |
| --- | --- |
| Victim engulfing | [Spray and engulfing](fire-mobile-engulf.png) |
| Collapse | [Committed stationary collapse](fire-mobile-collapse.png) |
| Selectable ash | [Native body loot opened from Boris's ash](fire-mobile-ash-loot.png) |
| Solo burn | [Zero-AP player burning](fire-mobile-solo-burning.png), [automatic fatal outcome](fire-mobile-solo-expired.png) |
| Worn tank | [Measured worn-pack rupture](tank-mobile-worn.png) |
| Stowed tank | [Held rifle before impact](tank-mobile-stowed-before.png), [body-centred blast retaining rifle](tank-mobile-stowed.png) |
| Persistence | [Restored fire without a replayed blast](tank-mobile-resume.png), [three-round expiration](tank-mobile-expired.png) |
| Native targeting | [Weapon selected in the published menu](tank-mobile-normal-targeting.png), [gameplay aftermath](tank-mobile-normal-aftermath.png) |
