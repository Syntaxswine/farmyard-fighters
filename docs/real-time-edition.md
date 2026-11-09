# Farmyard Commando Real Time

These source notes describe the real-time rules inherited by [Farmyard Fighters](../README.md).

The complete source game was copied at upstream commit
`9104d55a7638bf60efd6618265e07db1faea46da` (4,109 tracked files), with its
Git ancestry, assets, three operations, Mount Dora, editor, library, map tools,
source observations and provenance. Nothing was removed. `fork-provenance.json`
records the baseline; `docs/turn-based-upstream.md` preserves its README.
The original repository and Pages deployment are not modified.

## First encounter

Choose **Quiet Shift**, an additional encounter using the existing Mill 04
warehouse/records-office map and art. Start unseen at the southwest arrival
point. Two guards watch the loading yard and records office. The warehouse and
its working door offer one approach; the narrow eastern yard offers another.
Take the shift orders from the records office and return to arrival. Clearing
the guards is optional. The original three operations and Mount Dora remain in
the operation selector and use real-time rules in this edition.

## Controls and rules

- The former End Turn switch toggles **Hold Fire / Fire at Will**. Space does
  the same. Fire starts off. Hold the switch, or open Options → Fire control,
  for nearest, weakest (lowest current HP) and biggest-threat target priorities.
- Automatic fire supports ordinary firearms and the flamethrower. Targets must be living detected
  hostiles in range, with a clear physical projectile path to the selected body
  location. Crates, desks, door leaves, glass and prop parts use the same impact
  query as the shot. Glass can be deliberately broken with point targeting.
- Automatic flame uses the production 10 m, 48° cone and its exposure check,
  rather than a bullet torso ray. It fires immediately when ready, then at most
  one cone every three seconds, consuming one fuel charge per cone. Aim levels
  and body locations do not apply. The aim control shows AREA FIRE; your firearm
  aim setting is retained for weapon swaps. Empty tanks reload from carried fuel.
  Manual cone aiming suspends automatic fire until you leave that aiming mode.
- Keep the valid current target unless another improves the selected metric by
  20%. Tap an opponent to pin it and open the inherited green CRT controls.
  Release a pin from Fire control. A hidden/unreachable pinned target cannot be
  shot; another eligible opponent can be selected in the meantime.
- The aim switch above the joystick cycles hip → aimed → full. Q also cycles.
  Aim persists across shots. The weapon's base interval is multiplied by
  1 / 1.5 / 2. Initial acquisition takes that interval too; changing target,
  weapon, body location or aim requires reacquisition. Switching settings cannot
  shorten recovery from a committed shot. Burst uses 1.5 times the base interval
  before the aim multiplier. A partial magazine can fire a partial burst.
- Each weapon has its own seconds-based firing and reload timing in
  `realtime-combat.js`. Empty magazines reload automatically from finite reserve;
  R or Options reloads early. Rounds transfer only at completion. Move while
  reloading. Swapping weapons cancels a reload without consuming reserve.
- Standing runs at 14.4 m/s; kneeling moves at 7.2 and crawling at 3.6. Sneak
  halves the current posture's pace. Stance switches remain free and bounce
  through kneeling. Stamina remains disabled. Moving reduces shooting accuracy.
- An opening hit while sneaking against an unaware opponent deals 1.5 times
  damage. That hit alerts the victim; later hits do not regain the bonus merely
  by toggling Sneak. Explosive and flame damage do not get the gun/melee bonus.
- Grenades, RPGs and point shots remain deliberate. Grenade action
  recovery takes 1.2 seconds, halved with an equipped pistol or SMG. Area aiming
  suspends the player's automatic firearm, while enemies continue on the clock.
  Release aim input before confirming. Existing arc, blast, fuel, tank-explosion,
  collision, damage, health, hand, door-swing, loot and extraction rules remain.
- Guards fire, reload and move continuously. Sight and noise update last-known
  positions. Friendly gunfire shares the shooter's last-known opponent rather
  than pulling every guard to the shooter. Guards search for eight seconds on
  arrival or after an unreachable route; alert does not expire mid-route.
- The existing three-stage fire/panic lifecycle advances on three-second hazard
  ticks. Fire state, shot recovery, reloads, target settings and RNG persist.
- Options, inventory, CRT targeting and choice dialogs pause everyone. Hiding,
  freezing or leaving the game also pauses; returning does not simulate the
  time spent away. The inherited bounded timestep handles active slow frames.

## RPG persistence

Kills contribute to firearms, heavy weapons, explosives or dexterity according
to the weapon used. A stealth kill also contributes to Sneak. The first skill
point requires three qualifying kills; subsequent points require 5, 7, 9, etc.
Skills cap at 100. Each animal has its own career, carried to later operations.
Career checkpoints merge monotonic totals per run, so resuming an older save
does not award the same run's kills again. Operation inventory remains local to
that operation. Careers and active saves have separate names from the original
edition, even when both are played on the same GitHub Pages origin.

## Retained tools and verification

The editor's Farmyard Playtest and proving yard default to the production
real-time Core. The explicit `map-designer.html?rules=turn-based` comparison
retains the imported browser regression suite's original full combat rules.
The frozen AFT editor's own internal playtest is retained as its original tool;
the outer **Playtest map** button uses Farmyard's production implementation.
No entrances were added to geographic maps.

`npm run check` includes inherited turn-based regression coverage and new
real-time integration, resource, collision, save, career and storage checks.
`npm run build` retains all static game assets and the geographic authoring
atlas. `node tools/test-realtime.mjs` checks the built game through native
desktop and 390×844 touch controls, rendering, firing, reloads, movement,
grenades, pause and resume. It owns its temporary HTTP server and browser,
has a ten-minute deadline, and writes cleanup/port receipts in artifacts.
The Pages workflow requires these checks before deploying this fork.

Initial timings and damage remain prototype tuning. This is the first
real-time encounter, with the full inherited content available for later work.
