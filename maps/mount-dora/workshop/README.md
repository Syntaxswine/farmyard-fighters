# Mount Dora authoring atlas

This is a consumer of the existing Nautilus map workshop at commit
`2502646482218524fd5129641da769bb82462e4d`. It does not change the game,
engine pins, native map format, renderer, geographic generator or final sector files.

The overview places project sectors over the geographic SVG by column and row,
north up. This lightweight underlay shows the whole town without loading its 3D
geometry. Selection shows
town bounds, geometric neighbors and recorded landmarks. Selection never opens a
map. Direct opening uses the existing `window.nautilus.open(input)` bridge in a
same-origin iframe. The workshop keeps its own tools, folders, browser saves,
Import, Export, Undo and Redo. The atlas can also download the current workshop
document without changing it.

Only one sector is opened at a time. The overview has no 3D geometry and does not
render the 42 sectors. This limits the atlas's contribution to rendering cost.
It does **not** retrofit moving-window residency into the inherited workshop.
The game already has a separate 72 m presentation window. Keeping authoritative
world state, collision, visibility and save data independent of resident graphics
remains the intended runtime model.

## Review an immutable workshop

Use Node 24 and the locked Playwright dependency already provided by the project:

```powershell
npm ci --ignore-scripts --prefix sites/tactical-animal/browser-tests
```

Place an immutable Nautilus checkout **inside this checkout's artifacts directory**,
at the reviewed commit. Never build an active sibling/worker checkout. The prepare
tool verifies every source blob against that exact Git tree before building its
own `dist`, and audits import/history/export using the public headless API.

```powershell
node tools/prepare-mount-dora-workshop.mjs --source artifacts/mount-dora-workshop/nautilus-2502646 --fixtures
node tools/test-mount-dora-workshop.mjs --source artifacts/mount-dora-workshop/nautilus-2502646 --fixtures
```

For a temporary manual preview, run the same arguments with
`node tools/serve-mount-dora-workshop.mjs`; it prints a loopback atlas URL and
stops its in-process server after 15 minutes (or Ctrl+C). This is a deliberate
user restart, not a retained helper started by the coding task.

For a Git archive rather than a checkout, add `--git-source <read-only Nautilus repository>`.
This reads fixed Git objects; it does not import files from that repository's
moving working directory. For final town data replace `--fixtures` with
`--project <path-to-project.json>`. The fixtures are explicitly synthetic and
are not replacements for Mount Dora geography. CI runs both when final project
data is present, and always runs the fixture bridge/edge cases.

The native reviewer uses an isolated headless browser and ephemeral loopback port.
On Windows, `WORKSHOP_BROWSER_CHANNEL=msedge` uses installed Edge without a user
profile. CI installs its locked Chromium, captures video, and uses software WebGL.
Screenshots, full exported JSON, provenance, validation results and cleanup
receipts go to ignored `artifacts/mount-dora-workshop`. No service is retained.
There is a 14-minute browser close deadline and a 15-minute server close deadline.

## Hosting behavior and edit safety

The temporary review server mounts the tracked atlas, a selected project and the
actual built Nautilus distribution. Its `host.json` records the fixed commit.
Only this matching host enables the button named **Open in workshop**.
The tracked static host descriptor explicitly selects download/import mode and
avoids a missing configuration request. A normal static copy offers JSON download and native Import
instructions. No placeholder button claims to load an editor.

Native readiness is tied to the SHA-256 of each exact sector file and reviewed
engine revision. Missing or stale evidence leaves direct opening disabled.
The report distinguishes a readable geographic file from a native-import-ready
document. All-water sectors remain water. Import errors are displayed, without
adding islands, dropping geometry or changing the validator.

The atlas checks the native document's dirty flag before replacement. Canceling
leaves it untouched; export/save remains available in the native workshop.
Edits live in the workshop until saved or exported. The atlas never writes
geographic source files or silently saves a modified sector over them.

## Checks and practical limits

`node --test maps/mount-dora/workshop/model.test.mjs` checks geographic placement,
path confinement, stale validation handling and unknown nested-data loss detection.
The public API review compares **every original source value**, records all native
added fields, then checks a real supported terrain edit, Undo, Redo and export/reopen.
There is no whitelist that discards unfamiliar source fields to make a pass.

The native test separately uses the real file input, terrain selector/canvas
gesture, Undo/Redo buttons and Export, then imports the exported file. It checks
every original source value, native-added fields, exact normalized document equality after edits, shader diagnostics, selection/replacement
safety, phone-width layout and port release. It is not a real-phone benchmark or
a claim of game adoption. See the feedback JSON for measured vs unverified findings.

Import normalization note: unspecified preview-anchor character identities receive new
native IDs on each initial import. The review records native-added paths and preserves
all original values. After the first native export, the entire document, including
those IDs, must survive editing, Undo/Redo and export/reopen byte for byte.
