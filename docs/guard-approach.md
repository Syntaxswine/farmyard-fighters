# Guard approach

How an alert guard closes on an animal it cannot yet fire on, on every mission. The rule is `approachPath` and `enemyStep` in `sites/tactical-animal/dist/solo-game.js`. Its tests are in `sites/tactical-animal/tests/guard-approach.test.mjs`. [`tools/guard-census.mjs`](../sites/tactical-animal/tools/guard-census.mjs) reproduces the census table and the `props`, `doorway`, `doorshot` and `play` figures below; the other counts were measured with one-off scripts during review.

## The rule

A guard that cannot fire walks toward where it last saw or heard the animal, and stops 0.75 m short of it. It plans again every tick:

1. **Straight walk.** If it can walk straight to the spot 0.75 m short on its own line, and that spot sees the animal past the walls, it walks straight there. This is main's move; only the sight test is new. Of main's straight walks in a census, 108 of 2,589 (4%) now take the search instead. In 93 the spot could not see the animal at all, so main walked there and stood blind. In 15 it saw the animal only past a wall edge closer than the 8 cm margin in rule 3.
2. **Search.** Otherwise one A* search takes it to the nearest grid node, by walking distance, that stands within `QUARRY_REACH` (2 m) of the animal and sees it. From that node the straight walk usually opens. Where it never does, the guard stops at the node, up to 2 m from the animal.
3. **Sight with a margin.** A goal's line to the animal must clear every wall grown by 8 cm. That is `ARRIVED`, the distance at which a guard counts as arrived, so the view holds wherever the guard actually stops.
4. **A last-seen point inside scenery.** A door may have been shut over the point, a leaf swung onto it, or a prop placed on it that an old save predates. No animal could stand there, and close to it nothing can see it. The point gets stand-ins instead: clear points that would see it but for what covers it (the boxes within a body's radius of it), scanned in 5 cm rings out to 0.7 m beyond the first ring that has one (at most 1.5 m). There is one stand-in for each group of those points that see one another past the walls, the innermost of each. So a shut door gets one on each side and an open leaf one on each face; near the leaf's free end, where the two faces see each other round it, there is one. No point behind a wall gets one. The straight walk tries the stand-ins nearest first, and the search takes goals round every stand-in, so the guard walks to whichever side of the door it reaches first, by walking distance. The stand-ins depend on the point and the scenery alone: units are left out, and they are kept with the scenery table.
5. **Sealed pockets.** After 256 expansions without reaching a goal, the search floods back from the goals. If that flood runs dry within 128 nodes without meeting the guard's search, the animal is shut away and the search stops. This changes no outcome, only the cost.
6. **A route opening at the guard's feet.** When a route's first waypoint lies within 8 cm of the guard, it walks on to the next one instead of ending its turn there.
7. **A strip no grid node is a straight walk from.** Between Short Measure's ration room and the sealed-load-arrival prop runs a strip 13 cm wide for a body's centre, and from most of it no grid node is a straight walk. It is the only such place on the three maps. A route smoothed along it leads a guard in, and the guard's next plan has no node to start from. The guard may then leave along any of 32 bearings. On each, the first point 10 cm to 1.5 m out from which a node is a straight walk starts the search, at the cost of walking there and on to the node. So the guard leaves by the way that is shortest to walk, as it takes the side of a door. PR #21's tip ended the guard's turn there every round until its alert lapsed.

Nothing about the approach is held between ticks, so a resumed save plans exactly the same route.

### Placed windows

The integration with the released window system keeps this standing sight policy for remembered ground points. A frame member blocks the approach's sight test only when its `[z0,height]` crosses the 1.1 m standing eye line. Its footprint still grows by the full 8 cm stopping margin. Heads and sills therefore do not turn a clear aperture into a solid wall; full-height mullions and the appropriate lower walls still obstruct sight. The same height check applies when finding stand-ins past scenery covering a remembered point. This does not infer the quarry's current stance from its last-seen coordinates. Ordinary wall behavior and the released standing/kneeling/prone perception rules remain unchanged.

Glass stays transparent to sight before and after a break. Its saved hole does not remove the window's walking reservation. The geometry-keyed walk and stand-in tables rebuild after accepted glass damage or door changes, and bodies remain live blockers. See [combined integration review](reviews/guard-window-integration.md) for the reproduced before/after routes and validation.

**Why one goal set.** The goals depend on the animal alone, or on its stand-ins, never on where the guard stands. Only the straight walk depends on the guard's position: it takes the nearest stand-in it can walk straight to. A first version kept main's route to the 0.75 m spot whenever that spot saw the animal, and searched only otherwise. Beside the ration scale the spot sits on the edge of the scale's clearance, so it flipped between free and solid with each 18 cm step. The two plans ran east and west, and the guard walked back and forth on the spot.

**Why the margin.** In Short Measure, node (34, 12) sees an animal past a wall end by a hair. A guard stopping 6 cm off that node could not, and froze there.

## What main did

Main's guard aimed at the 0.75 m spot and ended its turn whenever no route reached it:
- the spot was inside a crate, a prop, a wall or a door leaf;
- the spot was boxed into a strip no route ends in, or cut off;
- the route opened within 8 cm of the guard.

It also walked to a spot on the far side of a wall from the animal and stood there blind. In every case its alert lapsed after three rounds. PR #21 patched props alone with three spots held per guard; walls and crates kept main's freeze on every mission.

## Censuses

One alert guard plays four rounds; every other guard is down. The animal stands 0.24–0.74 m from a random walk-blocking box: a wall, a shut door, a crate, a prop or a chest, taken from the doors-shut geometry. The guard starts 2–9 m away at any bearing and heading, and doors are open in 70% of cases. Positions are checked against the doors as the case sets them, because an open leaf is solid.

- **Frozen:** the guard never fires, and its alert lapses.
- **Stalled:** a turn ends with AP left, no shot, no step and no sight of the animal.
- **Reachable:** the grid graph has a walk from the guard to a node with a wall-clear line to the animal within weapon range.

"Spot solid" keeps only the cases whose 0.75 m spot is solid; "any spot" keeps them all. Before is the PR #21 tip (13a9013). Each row is 300 approaches.

| Mission, cases | Seed | Engaged | Frozen | Stalled with a firing node reachable |
| --- | --- | --- | --- | --- |
| Night Ledger, spot solid | 1 / 2 | 49 → 229 / 57 → 243 | 251 → 71 / 243 → 57 | 251 → 0 / 243 → 0 |
| Night Ledger, any spot | 1 / 2 | 179 → 254 / 168 → 256 | 121 → 46 / 132 → 44 | 117 → 0 / 122 → 0 |
| Road Checkpoint, spot solid | 1 / 2 | 75 → 192 / 88 → 188 | 225 → 108 / 212 → 112 | 212 → 0 / 202 → 0 |
| Road Checkpoint, any spot | 1 / 2 | 194 → 244 / 200 → 246 | 106 → 56 / 100 → 54 | 95 → 0 / 92 → 0 |
| Short Measure, spot solid | 1 / 2 | 60 → 229 / 57 → 222 | 240 → 71 / 243 → 78 | 184 → 0 / 177 → 0 |
| Short Measure, any spot | 1 / 2 | 169 → 248 / 170 → 248 | 131 → 52 / 130 → 52 | 84 → 0 / 82 → 0 |

The guards that still freeze fall into two groups:
- **The animal is shut away,** behind closed doors or in a pocket no route reaches. The guard stalls, correctly.
- **The route is longer than the alert lasts.** These are door detours: the guard walks its full 3.5 m every round and its alert lapses on the way. In 8 of the 3,600 approaches a firing node lay within a 10 m walk. The guard heads for the animal, not for the nearest spot it could shoot from.

No guard turned back on its own steps more than three times in any approach.

Where both versions engage, they engage alike. Shots fired match within one in every census (675 against 674 in Night Ledger, any spot, seed 1), and only one approach in 3,600 engaged before and not now. In that Night Ledger case both guards walk the same route; the new one stops 0.2 m further on, where a wall corner hides the animal, a round before it would fire.

**Beside the Short Measure props,** PR #21's own censuses count the approaches where the pre-prop main (fb386a5) engaged and the props version does not. That figure is now 0 of 1,000 on the tuning seed (PR #21: 2) and 1 of 800 on the held-out seed (PR #21: 9). [Short Measure in play](short-measure-runtime.md#environment-art-in-play) explains the one left.

## How play changes

- **Straight approaches keep main's move to the same spot,** except where the spot cannot see the animal (93 of 2,589 in a census: main stood there blind) or sees it only past a wall edge closer than 8 cm (15); those take the search.
- **Routed approaches change.** A routed approach now heads for the nearest node that sees the animal, where main headed for its 0.75 m spot; from there it usually walks straight to that spot. The guard ends in the same place by a different route, or reaches the animal where main froze. Where no straight walk opens from the goal node, it stops at the node, up to 2 m away.
- **A guard whose animal was last seen in a doorway shut since** walks to whichever side of the door it reaches first. Two census modes cover it, at 150 and 200 cases a mission, with the other doors shut:
  - `doorway` (seed 2): the guard watches the animal walk through a door, which the animal then shuts. On Short Measure 149 guards reach the door and 1 stops elsewhere on its side; on Road Checkpoint all 150 reach it. PR #21's tip left 128 and 120 where they started.
  - `doorshot` (seed 1): the animal is heard from inside a doorway, steps 0.6 m out and shuts it, with guards anywhere 2–15 m off. No guard now stays put while a side of the door is a walk away: Night Ledger 0 (PR #21's tip 75), Road Checkpoint 0 (86), Short Measure 0 (95). On Short Measure 13 guards with no side reachable stay put in both.
- **A guard whose animal was last seen where a leaf has since swung open** ends looking at one of the leaf's faces. On Night Ledger, for two points under the warehouse door's leaf beside its hinge, guards were started on a 1 m grid 1.5–7 m off and played three rounds. All 245 ended seeing a face of the leaf, though only 38 could see the point itself: the jamb or the leaf hides it from most of the doorway. PR #21's tip left 89 where they started and 50 where they saw neither face. A version that gave the point a stand-in behind the warehouse wall left 124 beside the doorway seeing neither face.

## Known limits

- **Other guards in the way.** Planning treats other living units as solid, as main's did. A guard standing in a doorway or passage, or beside an open leaf where the gap left is narrower than a body, closes that way to every other guard's plan for as long as it stands there, however far off they are. In whole-mission play (`play` mode: every guard plays while the animal roams, fires and works doors; seeds 11 and 23, 30 runs of 12 rounds each), another guard left a guard with no plan in 40 of 7,093 turns: Night Ledger 6 of 1,996, Road Checkpoint 10 of 3,048 and Short Measure 24 of 2,049. It sent 95 more on a plan over a metre longer. On Road Checkpoint one guard, holding a firing position 0.75 m outside the open front door beside its leaf, left another guard 30 m away without a plan in four rounds. PR #21's tip plans the same way.
- **The player in the strip.** The way out of Short Measure's strip is the guards'. The player's own click-to-move from inside it still finds no route to most destinations (3 of 4 in a check), as on PR #21's tip.
- **`doorway` mode places no case on Night Ledger:** the crates beside the warehouse door block its 1 m walk. `doorshot` covers Night Ledger.

## Cost

Guards plan every tick, so consecutive searches ask the same questions about the same nodes. Scenery alone decides whether a grid node is clear and whether a straight walk to a neighbouring node is. Those answers live in one table per geometry (`sceneryGrid`: ten bytes a node, 576 KB on the 240 × 240 sector). A door changing rebuilds the geometry and so starts a fresh table. Units are checked on every call. The table changes no result (lockstep fuzz, 3 missions × 8 seeds × 300 commands).

Wall clock, desktop, each version in its own process, census "any spot", seed 1:

| Census | PR #21 tip p99 / p999 / max (ms) | Now |
| --- | --- | --- |
| Night Ledger | 0.58 / 1.41 / 2.9 | 0.58 / 1.13 / 5.9 |
| Road Checkpoint | 0.24 / 3.75 / 65.4 | 2.60 / 4.50 / 8.4 |
| Short Measure | 0.34 / 3.33 / 4.8 | 0.33 / 1.11 / 2.8 |
| PR #21's prop census, 1,000 approaches | 0.88 / 13.02 / 18.5 | 0.28 / 1.07 / 2.5 |

On Road Checkpoint the p99 stays higher because far more guards now walk: 4,857 ticks with a step, against 577. A step costs about what main's did (p99 4.2 ms, against 4.6–5.3). What is left per tick is mostly the A*'s own bookkeeping (string keys, maps, the heap) and route smoothing; those are the next costs to take if phones stutter.

Costs the census misses:
- **Stand-ins.** For a last-seen point inside scenery, the stand-in scan costs 0.4–0.9 ms, once per point and geometry; the scenery table keeps the answer.
- **A guard with no grid node a straight walk away.** Its scan follows each of 32 bearings to the first way out or the first blocked point. A plan from inside Short Measure's strip costs 0.6–1.8 ms, and only while a guard stands in it. Boxed in by other guards, it gives up in about 0.1 ms, once a turn.
- **Long routes.** A guard's first tick round Road Checkpoint's 47 m wall (the animal at 88, 106, the guard at 88, 102.5) costs about 15 ms on a cold table. PR #21's tip spent 14 ms on the same route.
- **Pockets over the flood budget.** `SEALED_BUDGET` (128 nodes) covers every pocket that closed doors make on today's maps. The largest are Short Measure's packing hall (104 nodes) and Road Checkpoint's office (56). A larger pocket would fall back to the full search: about 19 ms with a warm table and 35 ms cold, once a round for each guard whose animal is inside. A budget of 256 cost long routes about 5% on Road Checkpoint, so it stays at 128.

## Re-running

From the repository root, with another checkout to compare against:

```text
node sites/tactical-animal/tools/guard-census.mjs night-ledger near 1 300 before=../other-checkout after=.
node sites/tactical-animal/tools/guard-census.mjs short-measure props 77 250 after=. main=../pre-prop-checkout
```

Modes are `blocked` (the spot solid), `near` (any spot), `props` (PR #21's census beside the Short Measure props), `doorway` (the guard saw the animal go through a door it then shut), `doorshot` (the animal heard from inside a doorway it then shut) and `play` (whole-mission play with every guard; the cases argument is the number of 12-round runs, and only the first checkout named plays). The first checkout named places the cases and runs the reachability check, so for `props` it must be one with the props. `ROWS=1` prints every frozen case.
