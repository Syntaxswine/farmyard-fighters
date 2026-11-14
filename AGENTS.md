# Farmyard Fighters

- Publish Farmyard Fighters from `main` in `Syntaxswine/farmyard-fighters`.
  Both Farmyard Commando repositories are reference sources. Preserve the
  inherited content and its provenance until the user requests cuts.
- Builders, artists, and UI contributors work on task branches. The architect
  reviews their changes in the production game before they land on `main`.
- The player controls one soldier in real time. Hold Fire and Fire at Will let
  the player choose when to break concealment. Keep the explicit
  `rules=turn-based` proving-yard option for inherited regression comparisons.
  Keep character, operation, town and tool storage isolated from both
  Farmyard Commando releases.
- Adopt Nautilus Engine components at a pinned version through explicit game
  adapters. Verify their effects on the production game and existing saves.
- Previews, demos and test maps use the production game bootstrap, controls,
  renderer, simulation, equipment, ammunition, reload, grenade/flamethrower,
  health/fire, interaction and save systems. Do not silently disable gameplay
  for a test scene. A reduced mode requires an explicit user request.
- Every placed door is operational. Bind its visible leaf and hand interaction
  to the production open/close state, movement and sight/projectile collision,
  normal action costs, blocked-swing checks and save/resume. A decorative door
  mesh or an always-passable door gap does not satisfy this rule.
- Geographic maps follow evidence. Place doors/entrances and other real-world
  details only where source data or reviewed observations establish them.
  Preserve the source, coordinates, observation date and uncertainty. Unknown
  interiors and entrances remain unknown; do not invent them for testing.
- The user authorized fictional Mount Dora gameplay interiors and entrances on
  2026-11-13, including simpler houses within the same footprints. Keep that
  overlay explicitly fictional and separate from the reviewed geographic data.
- Upper floors are playable to the source storey count. Keep their stair
  openings, physical elevation, floor slabs, doors, visibility, weapon effects
  and navigation in the production path; stairs must walk rather than teleport.
- Verify placed objects through the actual game path, including import/editor
  playtest where applicable. Test fixtures may supply declared synthetic data,
  but must exercise the same production implementation as the shipped game.
