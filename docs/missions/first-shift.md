# Farmyard Commando mission arc: The First Shift

Six small locations expose one connected system. A worker steals a wage ledger, follows its missing money through the factory district, and helps the workers make the evidence public. The animal and equipment remain the player's choices. The locations carry the story through their layout, abandoned work, altered signs, and usable objects.

This is the shared narrative and spatial brief for the artist and coder. The accompanying [map blockouts](first-shift.maps.json) and [map atlas](first-shift-atlas.svg) describe all six locations. They are authoring references; they are not designer exports or runtime solo maps. The Night Ledger and Short Measure form the first playable slice. The later four missions are fully scripted design targets, with their additional mechanics called out below.

## Story and play rules

- Each location answers the question raised by the previous one and leaves a concrete lead to the next. Reserve 7 is a destination code before it becomes the name of the foremen's private estate.
- Each map has a recognizable arrival view, two useful approaches, a place where the story changes, and a deliberate departure. Cover comes from the work performed there: sack bays, pipe galleries, freight, and bunks.
- Major revelations appear in both the environment and a required objective. Optional clues add individual lives; the main story never depends on finding a tiny prop.
- Use short notes and brief reactions. Keep the player in control; no camera lock, mandatory voiced exchange, or cutscene is needed.
- Neutral and friendly workers are never kill objectives. Mission success requires the stated work and extraction, not eliminating every guard. Species does not determine loyalty.
- Design for one animal, one floor, continuous metre-based movement, the existing AP rules, and the contextual hand. No ability or weapon class is required to solve a mission.
- Aim initially for 6–12 minutes per mission; these are playtest targets. Keep mandatory interactions few. Any longer reading lives in Options → Mission, not over the play field.
- Keep all six maps within the current 40 × 30 backing array and 38 × 28 playable area. The diagrams show structural blockouts, not a visible movement grid. Standard walls remain 2 m high.

## The connected district

| Mission | Place | What the player first believes | What the place reveals |
| --- | --- | --- | --- |
| 1. The Night Ledger | Mill 04 records yard | The wages have been delayed. | Money is being transferred to Reserve 7 while the accounts report worker debt. |
| 2. Short Measure | East feed mill | The district is short of grain. | The grain is present. Full loads leave while workers receive empty sacks. |
| 3. A Town Gone Dry | Pump Station 3 | The old pumps have failed. | A working bypass supplies Reserve 7 while the workers' main is shut. |
| 4. The Last Wagon | East Spur freight yard | Reserve 7 is an emergency store. | Its freight is furnishing a private estate; workers are another scheduled delivery. |
| 5. Beds Still Warm | Dormitory B | The absent workers have been evacuated. | Their belongings remain, their exit is locked, and they have organized their own escape. |
| 6. The People's Hour | Factory radio relay | The daily bulletin speaks for everyone. | The bulletin is a script. The workers can interrupt it with the records and their own statement. |

## 1. The Night Ledger

**Location and intention.** Keep the current Mill 04 operation as the opening and preserve its layout for existing saves. The worker arrives from the southwest, crosses the warehouse yard, takes the ledger in the northeast records office, and returns to the original extraction. Teach the hand, cover, and the change from free exploration to AP combat.

**Arrival view.** A wage queue ends at a locked pay window. A clean production banner hangs above a patched warehouse. The important visual contrast is between constant output and an empty pay tray.

**Map.** Existing 38 × 28 m playable area, spawn/extraction at (5,24), ledger at (31,6). The warehouse and central divider form two approaches: a short exposed crossing through the divider gap, or a longer route around its northern end. Preserve the three live guards, supply chest, fallen guard, and warehouse door.

**Script.**

1. Briefing: “The pay window has been closed for three weeks. The books are still inside Mill 04. Bring back the ledger.”
2. Optional pay-window inspection: “A handwritten date has been crossed out three times. The collection tray is empty.”
3. Collect ledger: “Every worker owes money. Every missing payment has the same destination: RESERVE 7.”
4. Objective after collection: “Return with the wage ledger.”
5. Extraction: “The totals do not balance. The delivery references point to the east feed mill.”

**Story props.** Closed pay hatch, rubbed-out pay dates, empty tray, ledger with a seven-in-a-square stamp. Reuse the existing office, brick, timber, and cargo assets. These additions must not alter the legacy collision layout.

**Optional human detail.** A worker has calculated the missed wages on the back of a family photograph. It has no stat reward and is not a mandatory pickup.

## 2. Short Measure

**Location and intention.** The east feed mill is a new, separately selectable mission. Cross the mill, secure the shipping manifest in the dispatch office, and leave by the east loading gate. The player sees the destination before reaching it; the interesting decision is how to cross the working yard.

**Arrival view.** An empty ration collection lane sits beside full sack bays. Two scales show the same official seal. One faces the workers; the other faces the outbound loading lane.

**Map.** Enter at (4,25), manifest at (32,7), extract at (35,25). The central packing hall occupies (14,8) to (24,17). A ration shed to its southwest and dispatch office to its northeast create three distinct spaces. The direct route passes through the packing hall's south and east doors. The quieter alternative skirts its west and north walls, using stacked sacks to break views before approaching the office's west door. Both exits of the dispatch office remain usable. Exact structural rectangles, door gaps, cover, and suggested route waypoints are in the blockout file.

**Required actions.** Collect the shipping manifest, then extract. Three guards hold separate yard, hall, and office approaches; they do not all begin with sight of the spawn. The supply chest offers the existing types of loot. Opening it or a door follows the established AP costs. A full-clear win condition must never replace extraction.

**Script.**

1. Briefing: “The ledger calls the grain a loss. Check the mill's dispatch records. The east loading gate is your way out.”
2. Free inspection at the ration scale: “The worker's scale has a stop welded under its beam. The official weight cannot be reached.”
3. Free inspection at the sealed sacks: “Full sacks. Today's date. The seven-in-a-square seal is unbroken.”
4. Collect manifest: “The grain was never missing. These loads went to Reserve 7. Their release was signed at Pump Station 3.”
5. Objective after collection: “Take the manifest to the east loading gate.”
6. Extraction: “The same office approves the district's water. Follow the service main to Pump Station 3.”

**Story props.** Two visually related weighing stations, collapsed empty sacks in the worker lane, full sealed stacks in the freight lane, directional floor paint, and the stamped manifest. The optional scale clue should also be understandable from a bent beam and welded stop. Ordinary cargo provides the collision for the first playable blockout; a painted sack must never conceal a different invisible wall.

**First-slice acceptance.** This mission and the original mission can be selected, started with any supported animal/loadout, saved, resumed, restarted, and completed. The original mission's older saves still open in the original yard. A scene change updates the renderer, minimap, objective pins, hand, and mission copy together.

## 3. A Town Gone Dry

**Location and intention.** A linear pump compound makes the player follow a physical water system. Inspect the control record, open the workers' service main, then leave through the service gate. Releasing water is a discrete validated interaction in the first version; a moving fluid simulation is unnecessary.

**Arrival view.** A dry public trough fills the foreground. Beyond it, a large pipe has fresh condensation and a new Reserve 7 plate. Someone has set a cup under the public tap.

**Map.** Enter west at (4,24). Pump house west, valve gallery center, clean bypass control room east. A low maintenance route runs along the south; a shorter northern crossing passes the central control position. The control record is at (29,7), workers' valve at (20,13), departure at (35,24). Pipe and tank footprints must be authored as scenery collision; the illustrated water channels are not traversable terrain until explicitly implemented.

**Required sequence.** Collect the pressure/shift record → restore the worker main → extract. Restoring the main changes the valve indicator and public tap appearance and unlocks the service gate. Order is visible in the mission menu. The hero cannot be trapped by operating the valve from either side.

**Script.**

1. Briefing: “The pumps still run. Find where the pressure goes, then reopen the workers' main.”
2. Dry tap inspection: “Fresh tool marks. The tap was shut recently; it did not wear out.”
3. Collect record: “Full pressure to Reserve 7. Zero to the dormitories. The maintenance crew's names were transferred to the East Spur roster.”
4. Restore main: “The needle climbs. Behind the wall, water reaches an empty pipe.”
5. Extraction: “The transfer order names a rail siding. The workers left through East Spur.”

**Story props.** Cup, dry trough, wet bypass pipe, paired pressure gauges, bolted-shut worker valve, and the transfer entry. Persistent state for the valve and a cosmetic before/after are additional work beyond the first two-mission slice.

## 4. The Last Wagon

**Location and intention.** Long freight lanes create a different combat rhythm. Obtain the routing sheet and inspect the last wagon's cargo seal, then leave by the maintenance exit. Cars are stationary cover throughout this version.

**Arrival view.** A departure board says “EMERGENCY RESERVE.” An open crate beneath it contains polished stone for a fountain. A worker's chalk mark continues underneath the official cargo label.

**Map.** Spawn (4,25), dispatch sheet (9,6), last wagon (31,12), extract (35,25). Two staggered freight rows create alternating long views and cross passages. The direct central lane is exposed; the southern maintenance alley has more cover and one crossing. The dispatch hut has two exits. A west-to-east bypass must remain open if every wagon stays shut.

**Required sequence.** Collect routing sheet → inspect last wagon → extract. Opening the wagon is an interaction/state change; no train movement, climbing, or timed departure is required. The sheet and the seal both reference Dormitory B.

**Script.**

1. Briefing: “Find the transfer wagon. The manifest will tell us where the workers were taken.”
2. Luxury crate inspection: “Fountain stone. Brass railings. Not one item on the emergency ration list.”
3. Collect routing sheet: “RESERVE 7: RESIDENCE WORKS. Labor allocation: Dormitory B.”
4. Inspect last wagon: “Bunk numbers are chalked inside the door. Someone scratched: WE ARE STILL HERE.”
5. Extraction: “Reserve 7 is a residence for the foremen. Dormitory B is its workforce.”

**Story props.** Staggered cargo types, tall stationary wagon silhouettes, chalk marks, departure board, tile crate, and a routing sheet. Long wagon footprints and their visibility behavior need explicit support before this map is promoted.

## 5. Beds Still Warm

**Location and intention.** A quiet, close interior reveals what the logistics have done to individual lives. Secure the workers' statement and open the courtyard exit. The workers handle their departure after the hero opens it; an escort system is not required for the initial version.

**Arrival view.** Washing hangs over an empty exercise yard. A kettle, boots, and a half-finished repair establish that the residents were here recently. The official “EVACUATED” notice has been nailed over a list of room numbers.

**Map.** Enter at (4,25), statement in the west common room at (10,9), exit control in the east office at (31,8), courtyard exit at (35,24). Two bunk wings face a central yard. Interior doors offer short, narrow approaches; the yard offers a longer view with washing screens as authored cover. Every locked route has a second route or an accessible release on the near side.

**Required sequence.** Collect the statement → release the courtyard exit → extract. A short departure text confirms the workers leave through the opened gate. Do not display static civilians and then imply they have followed an unimplemented escort route.

**Script.**

1. Briefing: “Their rooms are still assigned. Find the people behind the transfer numbers and open their way out.”
2. Bunk inspection: “A boot has been resoled with belt leather. The pair is set neatly under the bed.”
3. Collect statement: “We kept our own accounts. Get these to the relay. Open the courtyard gate. We'll do the rest.”
4. Release exit: “The courtyard latch falls back. A reply comes from the rooms: two knocks, then three.”
5. Extraction: “The workers have a route out and a statement to read. Tomorrow's production bulletin airs from the factory relay.”

**Story props.** Distinct lived-in bunks, washing, repair bench, paper statement, reversed door hardware, and a repeated two/three chalk mark. Friendly NPC behavior and on-screen evacuation remain a separate later feature.

## 6. The People's Hour

**Location and intention.** Bring the campaign's evidence to the district relay. Disable the official feed, transmit the workers' statement with the collected records, and leave. The conclusion is a breach in the foremen's control of information; the workers' larger struggle continues.

**Arrival view.** The relay's reception room repeats the opening mission's production banner. Behind the glass is a bulletin already dated for tomorrow: “EVERY QUOTA MET. EVERY WORKER PAID.” The player now has physical evidence against both claims.

**Map.** Enter (4,25). The western service building and eastern studio surround an antenna court. A covered southern cable route is longer; a short central crossing faces the studio. Disconnect the official feed at (10,9), transmit at (30,7), extract at (35,25). The studio has two ground-level doors. The transmitter is not elevated or reached by a ladder.

**Required sequence.** Isolate official feed → transmit records → extract. Before transmission, validate that campaign progression supplies the records. In a separately unlocked replay, give the mission a briefing-defined evidence packet rather than requiring the player to repeat five missions. Never start an unavoidable global alarm or spawn enemies on top of the player. Initial guards and any later alert change must be explicitly defined and tested.

**Script.**

1. Briefing: “The morning bulletin is ready. Replace it with the accounts the workers kept.”
2. Official script inspection: “Tomorrow's pay figures were typed before today's shift began.”
3. Isolate feed: “The studio's red tally lamp goes dark. The district line is still connected.”
4. Transmit: “This is the factory district. These are our wages, our loads, our water records, and our names. We have kept the originals.”
5. Objective after transmission: “Leave through the service yard.”
6. Extraction: “The relay falls behind you. Across the district, a receiver repeats the statement. A shift whistle sounds at the wrong hour.”

**Story props.** Reused opening banner, script pages, spool recorder, patch panel, dark/on-air tally lamp, and a modest mast. A multi-step objective state and transmitter visual/audio change are needed. Do not make a loud new audio cue mandatory for understanding completion.

## Shared visual language

The seven-in-a-square Reserve 7 stamp progresses from ledger ink, to sack seal, to enamel pipe plate, to freight stencil, to dormitory allocation sheet, to evidence on the radio desk. It is legible at interaction distance and repeated in the required text.

The district changes through occupation and maintenance, not six unrelated art styles. Keep original AFT brick, gravel, concrete, timber, painted cargo, species models, and weathering scale. Warm worn worker spaces contrast with newly painted restricted infrastructure. Use still-life details sparingly: one strong human detail at each main decision point is more useful than clutter everywhere.

Keep the user's latest control direction intact: square illuminated switches with light through the symbols, and a dark red eye lens that glows diffuse orange-red when opponents are present. Environment work does not authorize rolling out the draft switch study or reverting it to the earlier field-radio treatment.

## Implementation contract for the coder

### First playable delivery

Deliver the original Night Ledger and new Short Measure as two selectable, independently restartable operations. Use the existing Farmyard worktree and a new `codex/` branch based on current public `origin/main`. Do not branch from the separate Animal Factory Tactics tutorial work or pending art/guard-alert PRs.

Replace fixed global mission assumptions with a validated mission definition owned by state. At minimum the definition supplies a stable ID, title, briefing, objective/extraction positions, terrain/edges, spawn, guards, interactables, and result copy. Reuse the current map size and rendering vocabulary. Keep the original public imports/API behavior where existing callers depend on them, or update every caller together.

All consumers must use the selected mission: simulation, hand validation, target positions, renderer, minimap, mission menu, result screen, restart, save/resume, and extraction. A room on a diagram is not automatically a solid runtime object. Author the same closed and open door geometry for collision, line of sight, grenades, and rendering. Keep actual path movement continuous.

Migrate saves that lack a mission ID to Night Ledger without teleporting units, respawning loot, closing a previously open door, or resetting progress. Campaign progress uses a distinct storage record with a version; do not overwrite a currently active operation when browsing another mission. A fresh player can try both missions for this content slice. Full sequential campaign unlocking follows after the later missions are playable.

Keep the current per-mission loadout selection. No persistent ammunition economy, injury carryover, skill progression, new weapon rebalance, UI button redesign, or designer overhaul belongs to this first slice. Reusable mission definitions are the immediate integration path. A general designer-to-solo adapter remains an explicit follow-up.

### Meaningful acceptance checks

- Both definitions have reachable spawn → objective → extraction routes with legal door actions, and no guard or solid prop occupies a mandatory use position.
- The mission cannot complete before the required objective. Eliminating guards cannot complete it or suppress the hand/extraction.
- Each mission starts, saves, resumes, restarts, and completes with the correct map and text. A legacy save still resumes Night Ledger. Unknown mission IDs fail clearly or migrate explicitly; they must not silently reinterpret another map.
- Switching missions disposes scene resources and cancels old movement, grenade aiming, effects, and interaction focus. The minimap and pins match the active mission.
- Existing movement/AP, grenade discount/obstruction, Take all, stance/mode, opponent cycling, and burst effects checks continue to pass.
- Browser-check the built game at portrait phone dimensions: select each operation, use a door/chest, collect the objective, extract, and reload a saved new mission. Report console errors, the exact commit, and screenshots before requesting architect promotion.

### Later implementation slices

1. Pump Station 3: a short ordered objective chain, persistent valve/gate state, new prop footprints, and cosmetic water state.
2. East Spur: long scenery footprints, two evidence interactions, and clean sight lines around stationary freight.
3. Dormitory B: interior readability and persistent exit state, with text-confirmed off-screen departure.
4. Radio relay: transmission state, campaign evidence handoff, and the campaign ending. No timer or reinforcement system is required for the first version.

## Assignment for the artist

Start with Short Measure's environment treatment and a top-down readable placement proposal using the supplied blockout. Work on a separate `codex/` branch in the Farmyard art worktree. Preserve the current switch-study work on its existing branch.

First deliverables: a reusable Reserve 7 decal; paired ration/freight weighing stations; empty and full sack treatments using inherited cargo; a manifest/dispatch-desk focal point; and a list of each new prop's dimensions, orientation, intended footprint, occlusion behavior, source asset, and any missing runtime integration. Show the arrival view and the office approach at portrait gameplay scale. Asset availability in the AFT catalog does not mean that its renderer or collision is connected to solo play.

The coder owns runtime state and mission navigation; the artist owns environment materials, models, decals, and placement advice. Agree on named placement IDs and dimensions before either side depends on a new object. The first playable blockout must remain complete with inherited cargo while bespoke props are reviewed. Submit focused PRs and browser evidence. The architect reviews before promotion; neither branch should merge itself to the public game.
