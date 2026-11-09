# Movement runtime

Movement uses the existing simulation, navigation, swept collision and native
character rigs. Base pace is doubled globally exactly once; Mount Dora applies
no extra multiplier. Standing walk/run/sneak are 7.2/14.4/3.6m/s; kneeling walk/run
are 3.6/7.2, and prone movement walk/run is 1.8/3.6. Combat AP cost per accepted
metre is unchanged. Walls, rails, water, unit spacing and outer bounds use the
same collision checks at steps no larger than 7cm.

Stamina is disabled game-wide for now. It does not gate or drain on movement,
including existing saves at zero. Existing stored values remain readable and idle
recovery remains available. Before stamina is re-enabled, the policy must allow
at least 300 seconds of uninterrupted running from full stamina, independent of
frame rate or the faster base pace, and recover while no movement is accepted.
This future policy is recorded here; there is no additional player setting.

`FrameClock` consumes real rendered-frame timestamps. The simulation divides up
to one second into at most twenty 50ms steps using the existing `tickStep` and
`travel`; longer active stalls are bounded. Pause, hidden, focus, page freeze and
art-loading transitions reset elapsed time. Catch-up stops on a phase/status
change before held input can spend AP or act in the new phase. Every newly emitted
attack receipt is preserved with its offset; delayed tracers begin on an actual
rendered frame rather than expiring unseen.

Quick movement/stance taps preserve held joystick/keyboard input and queued
routes. Secondary touch taps commit on pointer-up because a browser may omit their
compatibility click; any later click is suppressed once. Mouse/keyboard clicks,
long press, pointer cancellation and intentional picker pause/clear remain intact.

Camera follow, aim framing, zoom return and pose blends preserve their 60FPS
response using elapsed smoothing. Close views keep nine 24m blocks; wider zoom
uses at most twenty-five (120m square), still intersecting at most four 240m source
sectors. Decoded-sector/fetch limits remain 9/2. Actual fitted camera extent and
zoom-button availability agree, and zooming back retires wide-view geometry.

The original running cadence is the reference. New Walk 7.2m/s feeds the native
gait unchanged. New Run 14.4m/s advances a separate continuous visual-distance
cursor by half of accepted physical travel. The same copied presentation sample
goes to native locomotion and posture. Mode changes, idle, visits, warm actor
reuse and counter rewinds do not create phase jumps or saved-distance bursts.
Actual position, travelled distance, AP and saves remain physical values.

No native leg amplitudes or geometry are stretched. The native shared gait cycle
is approximately .83881m, pig foreman .74121m, hen .48m. The running-only presentation
cap keeps the liked cadence with intentional stylized drift. Native prone remains
a supported held pose, not a newly authored crawl loop. Frozen AFT source and
artwork remain byte-identical.

Verification includes frame-rate comparisons from 60 to 1FPS, normal-operation AP
and collision scenarios, exhausted save restoration, held controls and routes,
suspension/phase boundaries, native rig-transform comparisons, delayed attack cues,
actual projected frustum/residency checks and real orthographic zoom corners.
`tools/test-movement-runtime.mjs` adds production browser measurements against
real frame/wall timestamps, trusted secondary-touch events, desktop/phone zoom,
and lifecycle receipts. Its owned browser/server have a 15-minute hard retirement
and cleanup receipts; CI uses the existing locked browser installation.
