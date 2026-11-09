# Farmyard Fighters

Control one soldier against a larger force in real time. Use cover and sneak
past patrols on Hold Fire, then switch to Fire at Will when you have the shot.

[Play Farmyard Fighters](https://syntaxswine.github.io/farmyard-fighters/) ·
[Deploy to Mount Dora](https://syntaxswine.github.io/farmyard-fighters/game.html?activity=mount-dora)

Mount Dora starts with 42 sentries across streets and wooded approaches.
**Quiet Shift** is a smaller infiltration at the Mill 04 warehouse. Space or
the fire-control switch toggles Hold Fire and Fire at Will. Q cycles aim, R
reloads, and crouching or crawling through brush helps you stay concealed.

## Project baseline

The starting point is the full [Farmyard Commando Real Time deployment at
`993eb90`](https://github.com/Syntaxswine/farmyard-commando-realtime/commit/993eb90ce2f1bd51c5caa1ec27dab0e7b83e5ee5),
including its operations, Mount Dora map sources, art, designer and tests.
The import verified all 4,141 tracked files against source tree
`edbd6405a0d267d4a09da877c2776f6f34cbdcd3` before adapting the project identity.
[Fork provenance](fork-provenance.json) records the earlier Commando lineage.

- `sites/tactical-animal/dist/` is the tracked browser source. `solo-game.js`
  and `realtime-combat.js` drive simulation and combat. `app.js`, `game.html`
  and `field-view.js` connect player controls and rendering to the simulation.
- `maps/mount-dora/` holds authored town data, source evidence and workshop
  documents. The game streams the town through `mount-dora-entry.js` and its
  supporting modules. See the [inherited real-time rules](docs/real-time-edition.md).
- The map designer and proving yard retain their existing playtest paths.
  Fighters has separate browser saves and tool storage from both Commando
  releases. Start a new operation or tour here to create a Fighters save.
- Mount Dora already has [Nautilus Engine](https://github.com/Syntaxswine/nautilus-engine)
  workshop provenance. Additional components can be reviewed at pinned versions
  through game adapters as the project needs them.

## Run and verify

Use Node.js 24 for the browser suite and CI. Run these from the repository root.

```sh
npm run check
npm run build
npm ci --ignore-scripts --prefix sites/tactical-animal/browser-tests
npm exec --prefix sites/tactical-animal/browser-tests -- playwright install chromium
node tools/test-realtime.mjs
```

For manual play, run `PREVIEW_BUILD=1 npm run serve` in a POSIX shell or
`$env:PREVIEW_BUILD='1'; npm.cmd run serve` in PowerShell after building.
Open [localhost port 4495](http://127.0.0.1:4495). The preview stops after 30
minutes or on Ctrl+C. The automated suite starts and closes its own browser
and server and writes a cleanup receipt under `artifacts/realtime/native/`.

The Pages workflow publishes the generated root `dist/` from `main` after the
game checks and desktop and phone playtests pass.
