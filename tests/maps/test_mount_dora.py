"""Meaningful geometry/provenance/reproduction checks for the native map source."""
import collections
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("mount_dora_builder", ROOT / "tools/maps/build-mount-dora.py")
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


def segment_distance(point, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy or 1)))
    return math.dist(point, [a[0] + t * dx, a[1] + t * dy])


# Street-facing fronts within FRONT_REACH of their neighbours' common line that
# stay off it because every move there is blocked (test_fronts_along_a_street...).
FRONT_MISSES = {"osm-way-556562396", "osm-way-556562397", "osm-way-556562399", "osm-way-556562400",
                "osm-way-556562408", "osm-way-558337882", "osm-way-558337885", "osm-way-558337891"}


class MountDoraGeneration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs, cls.project, cls.database, cls.grid = BUILDER.build_project()
        cls.features = {f["id"]: f for f in cls.database["features"]}
        cls.maps = {s["id"]: json.loads(cls.outputs[s["file"]]) for s in cls.project["sectors"]}

    def test_source_bytes_and_every_generated_output_reproduce_exactly(self):
        for item in self.project["sources"]:
            data = (BUILDER.PROJECT / item["file"]).read_bytes()
            self.assertEqual(len(data), item["bytes"])
            self.assertEqual(hashlib.sha256(data).hexdigest(), item["sha256"])
        # build_project regenerated in memory; committed bytes are the baseline.
        for filename, data in self.outputs.items():
            self.assertEqual((BUILDER.PROJECT / filename).read_bytes(), data, filename)
        self.assertEqual(len(self.outputs), 46)

    def test_wgs84_reference_and_named_source_lighthouse_have_agreed_metres(self):
        projection = BUILDER.Projection(self.project["projection"])
        reference = self.project["projection"]["reference"]
        self.assertEqual(projection(reference["lat"], reference["lon"]), [480, 480])
        self.assertEqual(projection(28.7948053, -81.6440151), [500.2877, 1169.7989])
        lighthouse = self.features["osm-node-2704687214"]
        self.assertEqual(lighthouse["tags"]["name"], "Mount Dora Lighthouse")
        self.assertEqual(lighthouse["geometry"]["coordinates"], [500.2877, 1169.7989])

    def test_authored_buildings_share_tile_edges_without_losing_source_holes_or_neighbours(self):
        authored = json.loads(self.outputs['authored-buildings.json'])
        self.assertEqual(len(authored['records']), 950 + 126)  # OSM outlines, then county buildings
        self.assertEqual(authored['metrics']['authoredHoles'], 2)
        self.assertEqual(authored['metrics']['sharedOwnerPairsRetained'], 30)
        digest = hashlib.sha256(self.outputs['authored-buildings.json']).hexdigest()
        self.assertEqual(digest, self.project['generation']['authoredLayoutSHA256'])
        self.assertEqual(digest, self.database['authoredLayoutSHA256'])
        originals = {f['id']: f for f in BUILDER.load_source()[3] + BUILDER.county_buildings()}
        occupied = set()
        for record in authored['records']:
            feature = self.features[record['id']]
            self.assertEqual(feature['geometry'], record['geometry'])
            self.assertEqual(feature['geographicGeometry'], originals[feature['id']]['geometry'])
            for polygon in record['geometry']['coordinates']:
                for ring in polygon:
                    self.assertEqual(ring[0], ring[-1])
                    self.assertTrue(all(isinstance(v, int) for p in ring for v in p))
                    self.assertTrue(all((a[0] == b[0]) != (a[1] == b[1]) for a,b in zip(ring,ring[1:])))
            cells = {(x,y) for y,a,b in BUILDER.polygon_spans(record['geometry']['coordinates'],1440,1680) for x in range(a,b)}
            self.assertFalse(occupied & cells, record['id'])
            occupied.update(cells)
            self.assertTrue(all(self.grid[y*1440+x] == BUILDER.CODE['floor'] for x,y in cells))
        self.assertEqual(len(occupied), self.project['metrics']['terrainCounts']['floor'])
        self.assertEqual(len(authored['structures']), 5)

    def test_42_sector_origins_neighbor_reciprocity_and_exact_global_slices(self):
        sectors = {s["id"]: s for s in self.project["sectors"]}
        self.assertEqual(len(sectors), 42)
        inverse = {"north": "south", "south": "north", "east": "west", "west": "east"}
        for sid, sector in sectors.items():
            ox, oy = sector["origin"]["x"], sector["origin"]["y"]
            self.assertEqual((ox, oy), (sector["column"] * 240, sector["row"] * 240))
            self.assertEqual(sid, BUILDER.sector_id(sector["column"], sector["row"]))
            for direction, neighbor in sector["neighbors"].items():
                if neighbor:
                    self.assertEqual(sectors[neighbor]["neighbors"][inverse[direction]], sid)
            mapping = self.maps[sid]
            for y, actual in enumerate(mapping["terrain"]):
                expected = [BUILDER.KINDS[v] for v in self.grid[(oy+y)*1440+ox:(oy+y)*1440+ox+240]]
                self.assertEqual(actual, expected, (sid, y))
            self.assertEqual(sector["metrics"]["sha256"], hashlib.sha256(self.outputs[sector["file"]]).hexdigest())
        self.assertEqual(hashlib.sha256(self.grid).hexdigest(), self.project["generation"]["globalTerrainSHA256"])

    def test_lake_joins_every_member_and_scanline_masks_preserve_holes(self):
        lake = self.features["osm-relation-1163258"]
        self.assertEqual({m["ref"] for m in lake["members"]}, {75897590, 508450231, 486653137, 75902888})
        self.assertEqual(len(lake["geometry"]["coordinates"]), 1)
        ring = lake["geometry"]["coordinates"][0][0]
        self.assertEqual(ring[0], ring[-1])
        raw_lake = json.loads((BUILDER.PROJECT / "source/osm-lake-dora-full.json").read_bytes())
        source_ways = {e["id"]: e for e in raw_lake["elements"] if e["type"] == "way"}
        # Joining four chains removes their three duplicate join endpoints.
        self.assertEqual(len(ring), sum(len(source_ways[m["ref"]]["nodes"]) for m in lake["members"]) - 3)
        # Synthetic scan conversion: 8x8 outer, with 4x4 courtyard excluded.
        polygon = [[[[0,0],[8,0],[8,8],[0,8],[0,0]], [[2,2],[2,6],[6,6],[6,2],[2,2]]]]
        spans = list(BUILDER.polygon_spans(polygon, 8, 8))
        self.assertEqual(sum(end-start for _,start,end in spans), 48)
        self.assertFalse(any(y == 3 and start <= 3 < end for y,start,end in spans))
        courtyards = [f for f in self.features.values() if f["category"] == "building" and any(len(p)>1 for p in f["geometry"]["coordinates"])]
        self.assertGreaterEqual(len(courtyards), 2)
        hole_cells = 0
        for feature in courtyards:
            for polygon in feature["geometry"]["coordinates"]:
                for hole in polygon[1:]:
                    for y, left, right in BUILDER.polygon_spans([[hole]], 1440, 1680):
                        for x in range(left, right):
                            self.assertNotEqual(self.grid[y*1440+x], BUILDER.CODE["floor"], feature["id"])
                            hole_cells += 1
        self.assertGreater(hole_cells, 10)

    def test_water_is_never_replaced_by_preview_platforms(self):
        refused = [s for s in self.project["sectors"] if not s["nativeImport"]["ready"]]
        self.assertEqual({s["id"] for s in refused}, {"A05", "A06", "A07"})
        for sector in refused:
            mapping = self.maps[sector["id"]]
            self.assertEqual(sector["metrics"]["terrainCounts"], {"water": 57600})
            self.assertEqual(mapping["starts"], [])
            self.assertEqual(mapping["exits"], [])
            self.assertEqual(mapping["props"], [])
            self.assertEqual(sector["nativeImport"]["validatorRefusal"], "Place exactly four valid squad starts.")
        self.assertEqual(self.grid[1100*1440+60], BUILDER.CODE["water"])
        self.assertNotEqual(self.grid[480*1440+480], BUILDER.CODE["water"])
        lake = self.features["osm-relation-1163258"]
        allowed = {BUILDER.WATER, BUILDER.CODE["bridge"], BUILDER.CODE["floor"]}
        for y, left, right in BUILDER.polygon_spans(lake["geometry"]["coordinates"], 1440, 1680):
            # Only source-backed deck/building support may replace lake cells;
            # park/wood polygons cannot create islands or preview platforms.
            self.assertTrue(set(self.grid[y*1440+left:y*1440+right]).issubset(allowed), (y,left,right))

    def test_shared_party_wall_is_deduplicated_with_both_source_owners(self):
        def building(name, ring):
            return {"id":name,"geometry":{"coordinates":[[ring]]},"nativeProxy":{"stories":1,"material":"brick"}}
        buildings = [building("one",[[0,0],[4,0],[4,4],[0,4],[0,0]]),
                     building("two",[[4,1],[8,1],[8,3],[4,3],[4,1]])]
        walls = BUILDER.deduplicated_walls(buildings)
        shared = [w for w in walls if w["owners"]==["one","two"]]
        self.assertEqual(len(shared),1)
        self.assertAlmostEqual(math.dist(shared[0]["a"],shared[0]["b"]),2)
        self.assertAlmostEqual(sum(math.dist(w["a"],w["b"]) for w in walls),26)

    def test_mapped_boardwalk_and_water_road_crossings_survive_sector_seams(self):
        wood = self.features["osm-way-688219167"]
        self.assertEqual(wood["tags"]["surface"], "wood")
        self.assertTrue(wood["nativeRoad"]["bridge"])
        self.assertGreater(self.project["metrics"]["terrainCounts"]["bridge"], 500)
        points = wood["geometry"]["coordinates"]
        for a, b in zip(points, points[1:]):
            x, y = ((a[0]+b[0])/2, (a[1]+b[1])/2)
            if 0 <= x < 1440 and 0 <= y < 1680:
                self.assertIn(self.grid[int(y)*1440+int(x)], (BUILDER.CODE["bridge"], BUILDER.CODE["ground-wood-planks"]))
        water_crossings, road_crossings = 0, 0
        road_codes = {BUILDER.CODE[k] for k in ("ground-asphalt", "ground-concrete", "ground-gravel", "ground-dirt", "ground-wood-planks", "bridge")}
        for x in range(240, 1440, 240):
            for y in range(1680):
                left, right = self.grid[y*1440+x-1], self.grid[y*1440+x]
                water_crossings += left == right == BUILDER.WATER
                road_crossings += left in road_codes and right in road_codes
        self.assertGreater(water_crossings, 500)
        self.assertGreater(road_crossings, 50)

    def test_building_identity_walls_stories_roofs_and_no_new_cut_face_walls(self):
        crossings, runs = 0, 0
        for feature in self.features.values():
            if feature["category"] != "building":
                continue
            crossings += len(feature["nativeSectors"]) > 1
            self.assertIn(feature["nativeProxy"]["stories"], range(1,6))
            for sid in feature["nativeSectors"]:
                self.assertIn(feature["id"], self.maps[sid]["mountDora"]["buildingIds"])
        self.assertGreater(crossings, 50)
        for sector in self.project["sectors"]:
            mapping = self.maps[sector["id"]]
            self.assertEqual(len(mapping["upper"]), mapping["levels"]-1)
            panels = 0
            segments = mapping.get("wallRuns", {}).get("segments", [])
            self.assertLessEqual(len(segments), 4096)
            ids = set()
            for run in segments:
                self.assertNotIn(run["id"], ids); ids.add(run["id"])
                length = math.dist(run["a"], run["b"])
                self.assertGreaterEqual(length, .1-1e-6)
                self.assertLessEqual(length, 64+1e-6)
                self.assertTrue(all(-.5-1e-6 <= n <= 239.5+1e-6 for n in run["a"]+run["b"]))
                self.assertLessEqual(run["stories"]+1, mapping["levels"])
                panels += math.ceil(length)*run["stories"]
                origin = sector["origin"]
                world = [[p[0]+origin["x"]+.5, p[1]+origin["y"]+.5] for p in (run["a"], run["b"])]
                for owner in run["sourceBuildingIds"]:
                    feature = self.features[owner]
                    original_edges = [(a,b) for poly in feature["geometry"]["coordinates"] for ring in poly for a,b in zip(ring,ring[1:])]
                    # Every endpoint AND midpoint belongs to one original edge;
                    # clipping never creates a wall along a sector's cut face.
                    midpoint = [(world[0][i]+world[1][i])/2 for i in (0,1)]
                    self.assertTrue(any(max(segment_distance(p,a,b) for p in (*world,midpoint)) < 2e-5 for a,b in original_edges), (run["id"],owner))
                runs += 1
            self.assertLessEqual(panels, 50000)
            self.assertLess(len(self.outputs[sector["file"]]), 4000000)
        self.assertEqual(runs,self.project["metrics"]["wallRuns"])
        slivers = [d for d in self.database["diagnostics"] if d["kind"]=="wall-sliver-below-native-minimum"]
        self.assertEqual(len(slivers),self.project["metrics"]["unrepresentedWallSlivers"])
        self.assertTrue(all(d["lengthM"] < .1 for d in slivers))

    def test_sports_pitches_exclude_seeded_trees_and_hard_courts_are_visible(self):
        pitches = [f for f in self.features.values() if f["tags"].get("leisure") == "pitch"]
        pitch_cells, courts = set(), []
        for feature in pitches:
            cells = {(x,y) for y,left,right in BUILDER.polygon_spans(feature["geometry"]["coordinates"],1440,1680) for x in range(left,right)}
            pitch_cells.update(cells)
            self.assertFalse(feature["nativeSportsSurface"]["proceduralGreenery"])
            if feature["tags"].get("sport") in ("tennis","pickleball"):
                courts.append(feature)
                self.assertEqual(feature["nativeSportsSurface"]["terrain"],"ground-asphalt")
                self.assertGreater(sum(self.grid[y*1440+x] == BUILDER.CODE["ground-asphalt"] for x,y in cells),len(cells)*.9)
        self.assertEqual(len(pitches),11)
        self.assertEqual(len(courts),6)
        for sector in self.project["sectors"]:
            ox,oy = sector["origin"]["x"],sector["origin"]["y"]
            for prop in self.maps[sector["id"]]["props"]:
                if prop["mountDora"]["placement"] == "declared-seeded-greenery":
                    self.assertNotIn((ox+prop["x"],oy+prop["y"]),pitch_cells)

    def test_streets_share_widths_and_keep_source_junctions(self):
        originals = {f["id"]: f for f in BUILDER.load_source()[3]}
        junctions = {}
        cardinal = segments = 0
        for feature in self.features.values():
            style = feature.get("nativeRoad")
            if not style or feature["geometry"]["type"] != "LineString":
                continue
            source = feature["geometry"]["coordinates"]
            self.assertEqual(source, originals[feature["id"]]["geometry"]["coordinates"])
            line = style.get("centerline", source)
            for before, after in zip(source, line, strict=True):
                self.assertEqual(after, junctions.setdefault(tuple(before), after))
                # Only points in town choose a street's line; a source line
                # running on past the crop follows that line out there.
                if 0 <= before[0] <= 1440 and 0 <= before[1] <= 1680:
                    self.assertLessEqual(max(abs(a - b) for a, b in zip(before, after)), BUILDER.STREET_SNAP_LIMIT)
                if style["bridge"] or style["woodSurface"]:
                    self.assertEqual(before, after)
            if feature["tags"]["highway"] in BUILDER.STREET_CLASSES:
                self.assertEqual((style["widthM"], style["sidewalk"], style["sidewalkWidthM"]), (6, "both", 2))
                for a, b in zip(line, line[1:]):
                    self.assertNotEqual(a, b)
                    segments += 1
                    cardinal += a[0] == b[0] or a[1] == b[1]
        self.assertGreater(cardinal, .7 * segments)

    def test_authored_outlines_have_no_one_tile_wall_steps(self):
        # rectify rounds each wall run on its own, which turned sub-metre jogs
        # in the measured outlines into one-tile steps (299 in 139 buildings on
        # main 57887f1, courtyards included). Every wall now runs at least two
        # tiles but one step on its own and one where two buildings meet:
        # county-1464994-2's two repairs would each take it further below its
        # measured area than the fit allows, and neither county-1469457-1 nor
        # osm-way-556562386 can move the step between them alone without
        # opening a one-tile slot or covering the other.
        grid = BUILDER._grid
        authored = json.loads(self.outputs["authored-buildings.json"])
        records = {record["id"]: record for record in authored["records"]}
        steps = [(record["id"], a, b) for record in authored["records"]
                 for polygon in record["geometry"]["coordinates"] for ring in polygon
                 for a, b in zip(ring, ring[1:]) if abs(b[0] - a[0]) + abs(b[1] - a[1]) == 1]
        self.assertEqual(sorted(ident for ident, _, _ in steps), ["county-1464994-2", "county-1469457-1", "osm-way-556562386"])
        self.assertEqual(len(authored["records"]), 1076)
        limit = json.loads((ROOT / "maps/mount-dora/source/authoring-config.json").read_text(encoding="utf-8"))["buildingGrid"]["maxAreaChangeFraction"]
        lonely = records["county-1464994-2"]
        repairs = [fix for step in grid._repairs(lonely["geometry"]["coordinates"]) for fix in step]
        self.assertEqual(len(repairs), 2)
        for fix in repairs:
            self.assertGreater(abs(grid.area(fix) / lonely["metrics"]["sourceAreaM2"] - 1), limit)
        (_, a, b), = [step for step in steps if step[0] == "county-1469457-1"]
        x, y = min(a[0], b[0]), min(a[1], b[1])
        sides = [(x - 1, y), (x, y)] if a[0] == b[0] else [(x, y - 1), (x, y)]
        owners = [{ident for ident in ("county-1469457-1", "osm-way-556562386")
                   if cell in grid.cells(records[ident]["geometry"]["coordinates"])} for cell in sides]
        self.assertEqual(sorted(map(sorted, owners)), [["county-1469457-1"], ["osm-way-556562386"]])
        # Every repair of either would cover the other, or part them or open a
        # slot between buildings (_keeps_neighbours).
        owner = {cell: record["id"] for record in authored["records"] for cell in grid.cells(record["geometry"]["coordinates"])}
        for ident in ("county-1469457-1", "osm-way-556562386"):
            old = grid.cells(records[ident]["geometry"]["coordinates"])
            repairs = [fix for step in grid._repairs(records[ident]["geometry"]["coordinates"]) for fix in step]
            self.assertTrue(repairs)
            for fix in repairs:
                new = grid.cells(fix)
                covers = any(owner.get(cell, ident) != ident for cell in new - old)

                def before(cell):
                    return {owner[cell]} if cell in owner else set()

                def after(cell):
                    return {ident} if cell in new else ({owner[cell]} - {ident} if cell in owner else set())
                self.assertTrue(covers or not grid._keeps_neighbours(ident, old, new, before, after), (ident, fix))

    def test_downtown_grid_streets_each_run_on_one_line(self):
        # The streets the 2026-27 visitor map shows downtown, over the lengths
        # where they are straight in reality: each sits on one tile line, with
        # no straight piece drawn as a diagonal anywhere along that length, and
        # a West/East avenue pair on the same line. Before the in-town snap and same-name bridges, Alexander
        # Street stepped 4 m between 5th and 4th Avenues, Tremain 2 m at 5th,
        # West 3rd 2 m at Alexander, 5th Avenue 4 m twice; West 4th Avenue's
        # pedestrian block between McDonald and Alexander Streets bent 3.4 m until it snapped
        # with the streets.
        streets = {"Alexander Street": (0, 0, 900), "McDonald Street": (0, 0, 740),
                   "North Donnelly Street": (0, 0, 815), "North Baker Street": (0, 0, 830),
                   "North Tremain Street": (0, 0, 900), "North Grandview Street": (0, 0, 935),
                   "North Clayton Street": (0, 0, 790),
                   "West 3rd Avenue": (1, 230, 433), "East 3rd Avenue": (1, 431, 1045),
                   "West 4th Avenue": (1, 180, 433), "East 4th Avenue": (1, 431, 635),
                   "West 5th Avenue": (1, 230, 433), "East 5th Avenue": (1, 431, 1440),
                   "West 6th Avenue": (1, 150, 433), "East 6th Avenue": (1, 431, 835),
                   "West 7th Avenue": (1, 128, 433), "East 7th Avenue": (1, 430, 1040),
                   "West 9th Avenue": (1, 62, 433), "East 9th Avenue": (1, 429, 1440)}
        lines = {name: set() for name in streets}
        for feature in self.features.values():
            name, style = feature["tags"].get("name"), feature.get("nativeRoad")
            if name not in streets or not style or feature["geometry"]["type"] != "LineString":
                continue
            axis, low, high = streets[name]
            source = feature["geometry"]["coordinates"]
            line = style.get("centerline", source)
            for a, b, p, q in zip(source, source[1:], line, line[1:]):
                # Every segment that runs straight along the street in the source
                # sits on the street's line; the mapped curves where McDonald,
                # Alexander and West 3rd meet the railway keep their shape.
                along, across = abs(b[1 - axis] - a[1 - axis]), abs(b[axis] - a[axis])
                if (low <= min(p[1 - axis], q[1 - axis]) and max(p[1 - axis], q[1 - axis]) <= high
                        and along and across <= along * .2):
                    self.assertEqual(p[axis], q[axis], (name, a, b, p, q))
                    lines[name].add(p[axis])
        for name, found in lines.items():
            self.assertEqual(len(found), 1, (name, sorted(found)))
        for avenue in ("3rd", "4th", "5th", "6th", "7th", "9th"):
            self.assertEqual(lines[f"West {avenue} Avenue"], lines[f"East {avenue} Avenue"], avenue)

    def test_fronts_along_a_street_share_one_line_where_a_move_is_free(self):
        # Every street-facing front (the generator's own _facades reading)
        # within FRONT_REACH of its neighbours' common gap sits on it, except
        # these, where the move is blocked by the generator's own rules: a new
        # cell on the street ribbon, protected ground or another building, or a
        # neighbour it touched parted, a slot opened, or a tile emptied between
        # two buildings (_keeps_neighbours). On main 57887f1, 46 of 255 fronts
        # were off their line.
        grid = BUILDER._grid
        authored = json.loads(self.outputs["authored-buildings.json"])
        roads = [f for f in self.features.values() if f.get("nativeRoad")]
        reserved = grid._reserved_rows(BUILDER.street_corridor(roads, 1440, 1680), 1440, 1680)
        faces = {}
        for record in authored["records"]:
            if record["derivation"]["method"] != "shared-component-dominant-axis":
                continue
            for axis, sign, ribbon, span, gap in grid._facades(grid.cells(record["geometry"]["coordinates"]), reserved, 1440, 1680):
                faces.setdefault((axis, sign, ribbon), []).append((span, gap, record["id"]))
        cells_of = {record["id"]: grid.cells(record["geometry"]["coordinates"]) for record in authored["records"]}
        owner = {cell: ident for ident, cells in cells_of.items() for cell in cells}
        protected = {BUILDER.CODE[kind] for kind in ("water", "ground-asphalt", "ground-concrete", "ground-dirt",
                                                     "ground-gravel", "ground-wood-planks", "bridge")}

        def blocked(ident, axis, step):
            dx, dy = (step, 0) if axis == 0 else (0, step)
            old = cells_of[ident]
            new = {(x + dx, y + dy) for x, y in old}
            if any(not (0 <= x < 1440 and 0 <= y < 1680) or reserved.get(y, 0) >> x & 1
                   or self.grid[y * 1440 + x] in protected or owner.get((x, y), ident) != ident for x, y in new - old):
                return True

            def before(cell):
                return {owner[cell]} if cell in owner else set()

            def after(cell):
                return {ident} if cell in new else ({owner[cell]} - {ident} if cell in owner else set())

            return not grid._keeps_neighbours(ident, old, new, before, after)

        misses = set()
        for (axis, sign, _), members in faces.items():
            for (low, high), gap, ident in members:
                weights = {}
                for (low2, high2), gap2, _ in members:
                    if low2 <= high + grid.FRONT_WINDOW and high2 >= low - grid.FRONT_WINDOW:
                        weights[gap2] = weights.get(gap2, 0) + high2 - low2 + 1
                target = min(weights, key=lambda value: (-weights[value], value))
                if 0 < abs(gap - target) <= grid.FRONT_REACH:
                    misses.add(ident)
                    self.assertTrue(blocked(ident, axis, sign * (gap - target)), (ident, gap, target))
        self.assertGreater(sum(map(len, faces.values())), 200)
        self.assertEqual(misses, FRONT_MISSES)

    def test_parks_and_car_parks_move_with_the_town_and_keep_their_measured_outline(self):
        # A park, pitch or car park moves vertex by vertex with the town, so its
        # edge stays on the paths and streets around it, and keeps its measured
        # outline as geographicGeometry. A block-sized park moves as one piece
        # (nativeShiftM), and the Donnelly stage with it, by whole metres.
        originals = {f["id"]: f for f in BUILDER.load_source()[3]}
        moved = 0
        for feature in self.features.values():
            if feature["category"] not in ("park", "parking") or feature["geometry"]["type"] != "MultiPolygon":
                continue
            source = originals[feature["id"]]
            if "geographicGeometry" not in feature:
                self.assertEqual(feature["geometry"], source["geometry"])
                continue
            moved += 1
            self.assertEqual((feature["geographicGeometry"], feature["geographicBounds"]), (source["geometry"], source["bounds"]))
            for old_polygon, new_polygon in zip(source["geometry"]["coordinates"], feature["geometry"]["coordinates"], strict=True):
                for old_ring, new_ring in zip(old_polygon, new_polygon, strict=True):
                    for old, new in zip(old_ring, new_ring, strict=True):
                        self.assertLessEqual(max(abs(a - b) for a, b in zip(old, new)), BUILDER.STREET_SNAP_LIMIT)
        self.assertGreater(moved, 20)
        donnelly = next(f for f in self.features.values() if f["category"] == "park" and f["tags"].get("name") == "Donnelly Park")
        dx, dy = (round(v) for v in donnelly["nativeShiftM"])
        stage = next(s for s in json.loads(self.outputs["authored-buildings.json"])["structures"] if s["id"] == "md:donnelly-stage")
        self.assertEqual(stage["geometry"]["coordinates"][0][0][0], [472 + dx, 482 + dy])
        self.assertEqual(stage.get("geographicGeometry", stage["geometry"])["coordinates"][0][0][0], [472, 482])

    def test_tour_approaches_keep_their_places_beside_their_landmarks(self):
        # The walking tour's approach points were reviewed on main 57887f1's map.
        # Each keeps its place beside its landmark: it moves as the landmark's
        # authored centre (or box, or the two streets at its corner) moved since
        # main, recomputed here from the generated files against main's
        # positions, spelled out. The game's spawn, the lighthouse and the moored
        # Palm Island boardwalk do not move. The game and the route review hold
        # the moved points, and no tour visit stands inside a building.
        moves = self.project["generation"]["approachMovesM"]
        self.assertEqual(set(moves), set(BUILDER.APPROACH_POINTS))
        authored = json.loads(self.outputs["authored-buildings.json"])
        records = {record["id"]: record for record in authored["records"]}
        boxes = {}
        for structure in authored["structures"]:
            points = [q for poly in structure["geometry"]["coordinates"] for ring in poly for q in ring]
            boxes[structure["id"]] = [min(q[0] for q in points), min(q[1] for q in points), max(q[0] for q in points), max(q[1] for q in points)]
        roads = [f for f in self.features.values() if f.get("nativeRoad")]
        on_main = {"donnelly-park": boxes, "elizabeth-evans": boxes, "evans-route": boxes, "gilbert-park": boxes}
        landmarks = {"lakeside-inn": ("osm-way-560095890", (346.5, 811.0)), "donnelly-house": ("osm-way-547799531", (398.5, 479.0)),
                     "history-museum": ("osm-way-556809468", (494.0, 598.0)), "former-depot": ("osm-way-557494933", (315.5, 679.0)),
                     "donnelly-park": ("md:donnelly-stage", (478.5, 484.5)), "elizabeth-evans": ("md:evans-pavilion", (470.0, 1005.0)),
                     "evans-route": ("md:evans-pavilion", (470.0, 1005.0)), "gilbert-park": ("md:shelter:557154684", (737.0, 1181.5))}
        for name in ("launch", "grantham-lighthouse", "palm-island", "palm-entrance"):
            self.assertEqual(moves[name], [0, 0], name)
        for name, (ident, then) in landmarks.items():
            box = boxes[ident] if name in on_main else records[ident]["bounds"]
            self.assertEqual(moves[name], [round((box[i] + box[i + 2]) / 2 - then[i]) for i in (0, 1)], name)
        corner = BUILDER.APPROACH_POINTS["historic-shopfronts"]
        self.assertEqual(moves["historic-shopfronts"], [BUILDER.street_line(roads, "North Donnelly Street", 0, corner[1]) - 430,
                                                         BUILDER.street_line(roads, "East 4th Avenue", 1, corner[0]) - 634])

        def moved(name):
            return [round(BUILDER.APPROACH_POINTS[name][axis] + moves[name][axis], 6) for axis in range(2)]

        entry = (ROOT / "sites/tactical-animal/dist/mount-dora-entry.js").read_text(encoding="utf-8")
        visits = re.findall(r"\{id:'([a-z-]+)',name:'[^']*',town:\[([-\d.]+),([-\d.]+)\]\}", entry)
        self.assertEqual(len(visits), 11)
        for name, x, y in visits:
            self.assertEqual([round(float(x), 6), round(float(y), 6)], moved(name), name)
            self.assertNotEqual(self.grid[int(float(y)) * 1440 + int(float(x))], BUILDER.CODE["floor"], name)
        routes = (ROOT / "tools/maps/review-mount-dora-routes.mjs").read_text(encoding="utf-8")
        targets = {name: [round(float(x), 6), round(float(y), 6)]
                   for name, x, y in re.findall(r"\['([a-z-]+)','[^']*',\[([-\d.]+),([-\d.]+)\],\['", routes)}
        for target, name in (("donnelly-park", "launch"), ("lakeside-inn", "lakeside-inn"), ("elizabeth-evans", "evans-route"),
                             ("grantham-lighthouse", "grantham-lighthouse"), ("gilbert-park", "gilbert-route"),
                             ("historic-shopfronts", "historic-shopfronts"), ("donnelly-house", "donnelly-house"),
                             ("history-museum", "history-museum"), ("former-depot", "former-depot")):
            self.assertEqual(targets[target], moved(name), target)
        spawn = re.search(r"const spawn=nearest\(\[([-\d.]+),([-\d.]+)\]\);", routes)
        self.assertEqual([float(spawn[1]), float(spawn[2])], moved("launch"))

    def test_a_moved_reviewed_plan_says_where_it_stands_and_asks_for_review(self):
        # A reviewed grid override records the review of the plan where it
        # stood. Each that moved with its street since says so in its record,
        # with its authored centre and distance from the geographic centre now,
        # and asks for a new review; the former depot also took a nudge clear of
        # its lane.
        authored = json.loads(self.outputs["authored-buildings.json"])
        moved = 0
        for record in authored["records"]:
            derivation = record["derivation"]
            if derivation["method"] != "reviewed-grid-override":
                continue
            translation = derivation["translationMetres"]
            if translation == [0, 0]:
                self.assertNotIn("needsReview", derivation)
                continue
            moved += 1
            b = record["bounds"]
            self.assertEqual((derivation["needsReview"], derivation["reviewedPlanMovedMetres"]), (True, translation))
            self.assertIn("authored centre %g,%g is %.3fm from the geographic centre. Re-review the moved plan."
                          % ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, record["metrics"]["centreShiftM"]), derivation["note"])
        self.assertEqual(moved, 3)
        depot = next(r for r in authored["records"] if r["id"] == "osm-way-557494933")["derivation"]
        self.assertIn("and a further (0,-1) clear of a road", depot["note"])
        self.assertIn("%.1f m from its geographic centre" % next(r for r in authored["records"] if r["id"] == "osm-way-557494933")["metrics"]["centreShiftM"],
                      " ".join(self.project["limitations"]))

    def test_the_town_moves_without_the_reported_tears(self):
        # Review round 1 found the first street-follow field tore the town where
        # one street's pull ended: a Grantham Point path ran through the
        # lighthouse's base, a footway tore 4.65 m across a 5.2 m segment, and
        # two houses 0.62 m apart slid 4.76 m past each other.
        light = (500.2877, 1169.7989)
        path = self.features["osm-way-508450232"]
        line = path["nativeRoad"].get("centerline", path["geometry"]["coordinates"])
        self.assertGreaterEqual(min(segment_distance(light, a, b) for a, b in zip(line, line[1:])), 2)
        footway = self.features["osm-way-508450237"]
        source = footway["geometry"]["coordinates"]
        line = footway["nativeRoad"].get("centerline", source)
        for a, b, p, q in zip(source, source[1:], line, line[1:]):
            self.assertLess(max(abs((q[i] - b[i]) - (p[i] - a[i])) for i in range(2)), .5 + .1 * math.dist(a, b), (a, b, p, q))
        authored = {r["id"]: r for r in json.loads(self.outputs["authored-buildings.json"])["records"]}
        one, two = (authored[i]["derivation"]["streetFollowMetres"] for i in ("osm-way-1240416239", "osm-way-1240419618"))
        self.assertEqual(one, two)

    def test_buildings_move_by_whole_metres_with_their_neighbours(self):
        # Every building moves with its street by whole metres, its cluster's
        # exact move rounded, so it keeps the shape the one-metre fit gives it
        # unmoved (a fractional move re-rounds every wall: the first version of
        # this change resized 582 buildings). Buildings within CLUSTER_GAP of
        # each other share a move, and buildings within CLUSTER_NEAR move apart
        # by a whole metre only where their exact moves differ by a metre or
        # more: rounding alone never closes a two-metre gap to a one-tile slot.
        # The Lake Dora shore keeps its place and pulls the town beside it toward
        # no move: none of the eleven buildings over the mapped water moves.
        # One-tile slots between buildings: 19 (main 57887f1 had 29).
        grid = BUILDER._grid
        authored = json.loads(self.outputs["authored-buildings.json"])
        records = {record["id"]: record for record in authored["records"]}
        for record in authored["records"]:
            whole, exact = record["derivation"]["streetFollowMetres"], record["derivation"]["streetFollowExactMetres"]
            self.assertTrue(all(isinstance(v, int) for v in whole), (record["id"], whole))
            self.assertEqual(whole, [round(v) for v in exact], record["id"])
        bounds = {f["id"]: f["geographicBounds"] for f in self.features.values() if f["category"] == "building"}

        def apart(a, b):
            (ax0, ay0, ax1, ay1), (bx0, by0, bx1, by1) = bounds[a], bounds[b]
            return math.hypot(max(0, bx0 - ax1, ax0 - bx1), max(0, by0 - ay1, ay0 - by1))
        ids = sorted(bounds)
        near = [(a, b) for i, a in enumerate(ids) for b in ids[i + 1:]
                if bounds[b][0] - grid.CLUSTER_NEAR <= bounds[a][2] and bounds[a][0] - grid.CLUSTER_NEAR <= bounds[b][2]
                and bounds[b][1] - grid.CLUSTER_NEAR <= bounds[a][3] and bounds[a][1] - grid.CLUSTER_NEAR <= bounds[b][3]
                and apart(a, b) <= grid.CLUSTER_NEAR]
        self.assertGreater(len(near), 150)
        for a, b in near:
            whole = [records[i]["derivation"]["streetFollowMetres"] for i in (a, b)]
            exact = [records[i]["derivation"]["streetFollowExactMetres"] for i in (a, b)]
            if apart(a, b) <= grid.CLUSTER_GAP:
                self.assertEqual(whole[0], whole[1], (a, b))
            for axis in range(2):
                if whole[0][axis] != whole[1][axis]:
                    self.assertGreaterEqual(abs(exact[0][axis] - exact[1][axis]), 1, (a, b, exact))
        owner = {cell: record["id"] for record in authored["records"] for cell in grid.cells(record["geometry"]["coordinates"])}
        lake = next(f for f in self.features.values() if f["category"] == "water")
        water = {(x, y) for y, left, right in BUILDER.polygon_spans(lake["geometry"]["coordinates"], 1440, 1680) for x in range(left, right)}
        over = {owner[cell] for cell in water & set(owner)}
        self.assertEqual(len(over), 11)
        for ident in over:
            self.assertEqual(records[ident]["derivation"]["streetFollowMetres"], [0, 0], ident)
        slots = {tuple(sorted((one, owner[(x + 2 * dx, y + 2 * dy)]))) for (x, y), one in owner.items()
                 for dx, dy in ((1, 0), (0, 1)) if (x + dx, y + dy) not in owner and owner.get((x + 2 * dx, y + 2 * dy), one) != one}
        self.assertLessEqual(len(slots), 19)

    def test_buildings_clear_the_full_road_and_sidewalk_ribbon(self):
        roads = [f for f in self.features.values() if f.get("nativeRoad")]
        corridor = BUILDER.street_corridor(roads, 1440, 1680)
        for index, kind in enumerate(self.grid):
            if kind == BUILDER.CODE["floor"]:
                x, y = index % 1440, index // 1440
                for yy in range(max(0, y - 1), min(1680, y + 2)):
                    first, last = yy * 1440 + max(0, x - 1), yy * 1440 + min(1440, x + 2)
                    self.assertFalse(any(corridor[first:last]), (x, y))

    def test_native_trees_and_foliage_brush_stay_on_mapped_green_ground(self):
        trees = 0
        brush_cells = 0
        for mapping in self.maps.values():
            for prop in mapping["props"]:
                trees += prop["kind"].startswith("tree-")
                self.assertIn(mapping["terrain"][prop["y"]][prop["x"]], ("ground-grass", "woodland"))
            for cell, brush in mapping.get("foliage", {}).items():
                x, y, _ = map(int, cell.split(","))
                self.assertIn(mapping["terrain"][y][x], ("ground-grass", "woodland"))
                self.assertEqual(brush[2], "woodland-v1")
                brush_cells += 1
        self.assertGreaterEqual(trees, 8150)
        self.assertEqual(trees, self.project["metrics"]["trees"])
        self.assertGreater(brush_cells, 0)
        self.assertEqual(brush_cells, self.project["metrics"]["foliageCells"])
        # The town refuses brush on a cell that holds a plant (mount-dora-world.js).
        for sector_id, mapping in self.maps.items():
            plants = {"%d,%d,0" % (p["x"], p["y"]) for p in mapping["props"]}
            self.assertFalse(plants & set(mapping.get("foliage", {})), sector_id)

    def test_each_lidar_tree_stands_in_its_crown_clear_of_the_sentries(self):
        record = self.project["generation"]["vegetation"]["lidarCrowns"]
        doc = json.loads((BUILDER.PROJECT / record["file"]).read_bytes())
        self.assertEqual(record["sha256"], hashlib.sha256((BUILDER.PROJECT / record["file"]).read_bytes()).hexdigest())
        areas = [dict(zip(doc["columns"], row))["areaM2"] for row in doc["crowns"]]
        line_cells = BUILDER.load_map_helper("mount_dora_patrols")._line_cells
        lidar, kinds, sources = [], collections.Counter(), set()
        for sector in self.project["sectors"]:
            ox, oy = sector["origin"]["x"], sector["origin"]["y"]
            for prop in self.maps[sector["id"]]["props"]:
                if prop["mountDora"]["placement"] != "lidar-crown":
                    continue
                crown, number = prop["mountDora"]["crown"], int(prop["mountDora"]["sourceId"].rsplit("-", 1)[1])
                x, y = ox + prop["x"], oy + prop["y"]
                reach = max(1.0, math.sqrt(areas[number] / math.pi) / 2)
                # The record keeps the top to 2 dp; planting measured from the exact top.
                self.assertLessEqual(math.hypot(x + .5 - crown["top"][0], y + .5 - crown["top"][1]), reach + .01, prop)
                pine = crown["heightM"] >= BUILDER.load_map_helper("mount_dora_foliage").CROWN_NARROW * crown["widthM"]
                self.assertEqual(prop["kind"], ("tree-pine" if pine else "tree-broadleaf") + ("-large" if crown["heightM"] >= 12 else ""))
                lidar.append((x, y)); kinds[prop["kind"]] += 1; sources.add(number)
        self.assertEqual(len(lidar), record["planted"])
        self.assertEqual(record["planted"] + record["notPlanted"]["held"] + record["notPlanted"]["noGround"], record["crowns"])
        # A mapped pitch keeps lidar trunks off it too.
        pitches = set()
        for feature in self.features.values():
            if feature["tags"].get("leisure") == "pitch" and feature["geometry"]["type"] == "MultiPolygon":
                for y, left, right in BUILDER.polygon_spans(feature["geometry"]["coordinates"], self.project["extent"]["widthM"], self.project["extent"]["depthM"]):
                    pitches.update((x, y) for x in range(left, right))
        self.assertTrue(pitches)
        self.assertFalse(pitches & set(lidar))
        self.assertEqual(len(sources), len(lidar), "one tree per crown")
        self.assertGreater(record["planted"], 3000)
        self.assertEqual(set(kinds), {"tree-pine", "tree-pine-large", "tree-broadleaf", "tree-broadleaf-large"})
        # 1.45 m from every post and every cell of its patrol route.
        route = set()
        for sector in self.project["sectors"]:
            ox, oy = sector["origin"]["x"], sector["origin"]["y"]
            for guard in sector["guards"]:
                points = [(guard["x"] + ox, guard["y"] + oy)] + [(p["x"] + ox, p["y"] + oy) for p in guard.get("patrol", [])]
                ring = points[1:] or points
                route |= {points[0]}.union(*(set(line_cells(a, b)) for a, b in zip(ring, ring[1:] + ring[:1])))
        for x, y in lidar:
            self.assertFalse(any(math.hypot(x - gx, y - gy) <= 1.45 for gx in range(x - 2, x + 3) for gy in range(y - 2, y + 3) if (gx, gy) in route), (x, y))

    def test_preview_anchors_and_sentries_are_on_existing_outdoor_cells(self):
        roster = []
        for sector in self.project["sectors"]:
            mapping = self.maps[sector["id"]]
            posts = sector["guards"]
            self.assertEqual(mapping["guards"], posts)
            self.assertEqual(mapping["stairs"],[])
            self.assertEqual(mapping["climbs"],[])
            if not sector["nativeImport"]["ready"]:
                self.assertFalse(posts)
                continue
            self.assertTrue(posts)
            roster.extend(posts)
            tree_cells = {(p["x"], p["y"]) for p in mapping["props"] if p["kind"].startswith("tree-")}
            for post in posts:
                for point in [post, *post.get("patrol", [])]:
                    x, y = point["x"], point["y"]
                    self.assertEqual(point["z"], 0)
                    self.assertNotIn(mapping["terrain"][y][x], ("water", "floor", "bridge"))
                    self.assertNotIn((x, y), tree_cells)
            points = mapping["starts"] + mapping["exits"]
            self.assertEqual(len(mapping["starts"]),4)
            self.assertEqual(len(mapping["exits"]),1)
            cells = {(p["x"],p["y"]) for p in points}
            self.assertEqual(len(cells),5)
            seen, todo = set(), [next(iter(cells))]
            while todo:
                x,y = todo.pop()
                if (x,y) in seen: continue
                seen.add((x,y))
                todo += [(x+dx,y+dy) for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)) if (x+dx,y+dy) in cells and (x+dx,y+dy) not in seen]
            self.assertEqual(seen,cells)
            # The validator walks within the sector from the first start to every
            # post: the markers lie in the first sentry's area (cells that are not water).
            area, todo = set(), [(posts[0]["x"], posts[0]["y"])]
            while todo:
                x, y = todo.pop()
                if (x, y) in area or not (0 <= x < 240 and 0 <= y < 240) or mapping["terrain"][y][x] == "water":
                    continue
                area.add((x, y))
                todo += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
            self.assertLessEqual(cells, area, sector["id"])
            for x,y in cells:
                self.assertNotIn(mapping["terrain"][y][x],("water","floor"))
                self.assertFalse(any(abs(p["x"]-x)<=1 and abs(p["y"]-y)<=1 for p in mapping["props"]))
                self.assertTrue(all(segment_distance([x,y],r["a"],r["b"]) > 1 for r in mapping.get("wallRuns",{}).get("segments",[])))
        self.assertEqual(len({g["id"] for g in roster}), len(roster))
        self.assertEqual(len(roster), 42)
        self.assertEqual({g["weapon"] for g in roster}, {"pistol", "smg", "rifle", "shotgun"})
        self.assertTrue(any(len(g.get("patrol", [])) == 2 for g in roster))
        self.assertTrue(any(len(g.get("patrol", [])) > 2 for g in roster))

    def test_every_mapped_pier_is_a_deck_at_its_source_place(self):
        piers = [f for f in self.features.values() if f["tags"].get("man_made") == "pier"]
        self.assertEqual(len(piers), 19)
        # None of the 19 encloses a deck: the five closed ways (0.04 to 1.86 m2) stay lines.
        self.assertEqual({f["geometry"]["type"] for f in piers}, {"LineString"})
        self.assertEqual(sum(f["geometry"]["coordinates"][0] == f["geometry"]["coordinates"][-1] for f in piers), 5)
        water = [f["geometry"]["coordinates"] for f in self.features.values()
                 if f["category"] == "water" and f["geometry"]["type"] == "MultiPolygon"]

        def mapped_water(x, y):
            return any(BUILDER.point_in_ring((x, y), polygon[0]) and not any(BUILDER.point_in_ring((x, y), hole) for hole in polygon[1:])
                       for polygons in water for polygon in polygons)
        over_water = 0
        for pier in piers:
            self.assertEqual(pier["category"], "pier")
            self.assertNotIn("geographicGeometry", pier)
            deck = pier["nativePier"]
            self.assertGreater(deck["bridgeCells"], 0, pier["id"])
            self.assertEqual(deck["heightM"], .4)
            for a, b in deck["lines"]:
                for k in range(1, 8):
                    x, y = a[0] + (b[0] - a[0]) * k / 8, a[1] + (b[1] - a[1]) * k / 8
                    if mapped_water(int(x) + .5, int(y) + .5):
                        over_water += 1
                        self.assertIn(self.grid[int(y) * 1440 + int(x)], (BUILDER.CODE["bridge"], BUILDER.CODE["floor"]), (pier["id"], x, y))
        self.assertGreater(over_water, 100)
        # A path that runs onto a pier keeps the vertex it shares with it, and the
        # pier leaves the path's own cells alone (it never takes a road cell).
        shared = {tuple(p) for f in piers for p in BUILDER.geometry_points(f["geometry"])}
        joined = kept = 0
        for road in self.features.values():
            if "nativeRoad" not in road or road["geometry"]["type"] != "LineString":
                continue
            source = road["geometry"]["coordinates"]
            for p, q in zip(source, road["nativeRoad"].get("centerline", source)):
                if tuple(p) in shared:
                    joined += 1
                    self.assertEqual(p, q, road["id"])
                    if not road["nativeRoad"]["woodSurface"] and road["nativeRoad"]["terrain"] == "ground-dirt":
                        kept += 1
                        self.assertEqual(self.grid[int(p[1]) * 1440 + int(p[0])], BUILDER.CODE["ground-dirt"], road["id"])
        self.assertGreaterEqual(joined, 5)
        self.assertEqual(kept, 3)
        # A cross-dock mapped out and back (A-B-C-A) is a line drawn once along its chord,
        # and so is a crossbar an open way walks three times.
        cross = self.features["osm-way-556100378"]
        self.assertEqual(cross["geometry"]["type"], "LineString")
        self.assertEqual(cross["nativePier"]["lines"], [[cross["geometry"]["coordinates"][1], cross["geometry"]["coordinates"][2]]])
        walked = self.features["osm-way-548471564"]["geometry"]["coordinates"]
        self.assertEqual(self.features["osm-way-548471564"]["nativePier"]["lines"], [walked[:2], [walked[2], walked[3]]])
        # Every deck cell joins land side to side: flood from the deck cells that touch
        # open walkable ground across bridge and plank cells, and reach them all.
        decks = {BUILDER.CODE["bridge"], BUILDER.CODE["ground-wood-planks"]}
        closed = {BUILDER.WATER, BUILDER.CODE["floor"]}
        cells = {i for i, code in enumerate(self.grid) if code in decks}
        neighbours = lambda i: (i + 1, i - 1, i + 1440, i - 1440)
        todo = [i for i in cells if any(0 <= n < len(self.grid) and self.grid[n] not in decks | closed for n in neighbours(i))]
        seen = set(todo)
        while todo:
            for n in neighbours(todo.pop()):
                if n in cells and n not in seen:
                    seen.add(n)
                    todo.append(n)
        self.assertEqual(sorted((i % 1440, i // 1440) for i in cells - seen)[:5], [])
        pier_cells = {index for f in piers for a, b in f["nativePier"]["lines"]
                      for index in BUILDER.line_cells([a, b], BUILDER.PIER_WALK_WIDTH, 1440, 1680, ends=False) if self.grid[index] in decks}
        self.assertGreater(len(pier_cells & seen), 1000)
        # Each bend is a recorded joint, rounded so it stays joined.
        self.assertEqual(self.features["osm-way-548471565"]["nativePier"]["joints"], [self.features["osm-way-548471565"]["geometry"]["coordinates"][1]])
        for f in piers:
            self.assertEqual((f["nativePier"]["walkWidthM"], f["nativePier"]["heightSource"]), (BUILDER.PIER_WALK_WIDTH, BUILDER.PIER_DECK_HEIGHT_SOURCE))

    def test_a_reviewed_observation_makes_the_rusty_anchor_dock_a_t(self):
        config = json.loads((BUILDER.PROJECT / "source" / "authoring-config.json").read_text("utf-8"))
        (record,) = config["pierObservations"]
        dock = self.features["osm-way-556100376"]["nativePier"]
        self.assertEqual(dock["observations"], [record])
        self.assertEqual(dock["lines"][-1], record["addLine"])
        # The added line carries the mapped north-south leg on south, past the shore walkway.
        leg = next(line for line in dock["lines"] if line[0] == record["addLine"][0] and line[1][1] < line[0][1])
        walkway = next(line for line in dock["lines"] if line[1] == record["addLine"][0] and abs(line[1][1] - line[0][1]) < 1)
        a, b = record["addLine"]
        up, down = (leg[1][0] - leg[0][0], leg[1][1] - leg[0][1]), (b[0] - a[0], b[1] - a[1])
        self.assertLess(abs(up[0] * down[1] - up[1] * down[0]) / (math.hypot(*up) * math.hypot(*down)), math.sin(math.radians(1)))
        self.assertLess(up[1] * down[1], 0)
        self.assertEqual((walkway[1], b[1]), (a, 647.0))
        for k in range(1, 6):
            x, y = a[0] + down[0] * k / 6, a[1] + down[1] * k / 6
            self.assertIn(BUILDER.KINDS[self.grid[int(y) * 1440 + int(x)]], ("bridge", "ground-wood-planks"), (x, y))

    def test_railways_lie_on_gravel_and_their_track_stops_short_of_every_road(self):
        rails = {f["id"]: f for f in self.features.values() if "nativeRailway" in f}
        self.assertEqual(sorted(rails), ["osm-way-146637672", "osm-way-146637673", "osm-way-146637676", "osm-way-508450239"])
        self.assertTrue(all(f["category"] == "railway" for f in rails.values()))
        gravel, runs = BUILDER.CODE["ground-gravel"], 0
        for rail in rails.values():
            for run in rail["nativeRailway"]["runs"]:
                runs += 1
                for a, b in zip(run, run[1:]):
                    steps = max(1, int(math.dist(a, b) / .5))
                    for k in range(steps + 1):
                        x, y = a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps
                        self.assertEqual(self.grid[int(y) * 1440 + int(x)], gravel, (rail["id"], x, y))
        self.assertGreaterEqual(runs, 10)
        # Every mapped level crossing (and the one path crossing) on a drawn line
        # is a gap: the track stops more than 2 m short of the crossing point.
        crossings = 0
        for node in self.features.values():
            if node["tags"].get("railway") not in ("level_crossing", "crossing"):
                continue
            for rail in rails.values():
                if node["osm"]["id"] not in rail.get("nodeRefs", []):
                    continue
                point = rail["nativeRailway"]["centerline"][rail["nodeRefs"].index(node["osm"]["id"])]
                crossings += 1
                for other in rails.values():
                    for run in other["nativeRailway"]["runs"]:
                        self.assertGreater(min(segment_distance(point, a, b) for a, b in zip(run, run[1:])), 2, (node["id"], other["id"]))
        self.assertEqual(crossings, 8)
        # The atlas draws every railway bed (and its ties) and every pier deck line.
        atlas = self.outputs["atlas.svg"].decode("utf-8")
        bed = f'fill="none" stroke="{BUILDER.PALETTE["ground-gravel"]}" stroke-width="{BUILDER.RAIL_BED_WIDTH}" stroke-linejoin="round"/>'
        self.assertEqual(atlas.count(bed), 4)
        for rail in rails.values():
            first = rail["nativeRailway"]["centerline"][0]
            self.assertEqual(atlas.count(f'<polyline points="{first[0]},{first[1]} '), 2, rail["id"])
        decks = [line for f in self.features.values() if "nativePier" in f for line in f["nativePier"]["lines"]]
        self.assertEqual(atlas.count(f'fill="none" stroke="{BUILDER.PALETTE["bridge"]}" stroke-width="{BUILDER.PIER_WIDTH}"/>'), len(decks))
        # The siding stops where its bed would meet the main line (no turnout is drawn).
        mains = [f["nativeRailway"]["centerline"] for f in rails.values() if not f["tags"].get("service")]
        siding = rails["osm-way-508450239"]
        self.assertEqual(siding["tags"]["service"], "siding")
        for run in siding["nativeRailway"]["runs"]:
            for p in run:
                self.assertGreaterEqual(min(segment_distance(p, a, b) for line in mains for a, b in zip(line, line[1:])), BUILDER.RAIL_BED_WIDTH - 1e-6)


class GridShapeUnits(unittest.TestCase):
    """The street snap, the street-follow field, the wall repair, party walls,
    block parks and bridge joints on small made-up inputs, without building the town."""

    def test_street_snap_lets_only_in_town_points_choose_a_line(self):
        # A straight street that drifts 0.5 degrees: 12 m over 1,200 m, of
        # which the 300 m beyond the crop's north edge hold 3 m. In town it
        # spans 9 m and fits one line; counting the outside points it would
        # not, and the street would split with a sideways jump.
        def road(points):
            return {"id": "test", "tags": {"highway": "residential", "name": "Test Street"},
                    "geometry": {"type": "LineString", "coordinates": points},
                    "nativeRoad": BUILDER.road_style({"tags": {"highway": "residential"}})}
        points = [[round(100 + .01 * y, 4), y] for y in range(-300, 901, 100)]
        street = road([p[:] for p in points])
        BUILDER.author_streets([street], 1440, 1680)
        town = {x for x, y in street["nativeRoad"]["centerline"] if 0 <= y <= 1680}
        self.assertEqual(len(town), 1, street["nativeRoad"]["centerline"])
        outside = road([p[:] for p in points])
        BUILDER.author_streets([outside])
        self.assertGreater(len({x for x, y in outside["nativeRoad"]["centerline"]}), 1)

    def test_street_follow_field_blends_a_block_and_fades_past_a_street_end(self):
        # The west street moved 2 m east and the east one 2 m west. On a street
        # the town takes its move; across the block the move blends, favouring
        # the nearer street; past the streets' ends it fades without a jump; and
        # beyond FOLLOW_REACH nothing moves.
        def street(x, move):
            style = BUILDER.road_style({"tags": {"highway": "residential"}})
            source = [[x, -1000], [x, 0], [x, 1000]]
            style.update(widthSource="standard-game-street", centerline=[[x + move, y] for _, y in source])
            return {"tags": {"highway": "residential"}, "nativeRoad": style,
                    "geometry": {"type": "LineString", "coordinates": source}}
        field = BUILDER.street_follow_field([street(100, 2), street(200, -2)])
        self.assertEqual(field([100, 50]), [2.0, 0.0])
        self.assertEqual(field([200, -50]), [-2.0, 0.0])
        across = [field([x, 50])[0] for x in range(100, 201)]
        self.assertTrue(all(b < a for a, b in zip(across, across[1:])))
        self.assertAlmostEqual(field([150, 50])[0], 0, places=9)
        self.assertTrue(1 < field([125, 50])[0] < 1.3, field([125, 50]))
        along = [field([125, y])[0] for y in range(900, 1300)]
        self.assertLess(max(abs(b - a) for a, b in zip(along, along[1:])), .05)
        self.assertEqual(field([125, 1250]), [0.0, 0.0])
        self.assertEqual(field([500, 0]), [0.0, 0.0])

    def test_buildings_within_a_metre_and_a_half_move_together_by_whole_metres(self):
        # The field moves x by a twentieth of x. Alone, the two buildings 1 m
        # apart would round apart (0.25 to 0 and 0.8 to 1) and open a slot; as
        # one cluster they both take the move at the cluster's centre, rounded.
        # The third stands 5 m off and keeps its own.
        def building(ident, x0, x1):
            return {"id": ident, "bounds": [x0, 0, x1, 10]}
        shifts, exact = BUILDER._grid.building_shifts([building("a", 0, 10), building("b", 11, 21), building("c", 26, 40)], [],
                                                      lambda point: [point[0] / 20, 0.0])
        self.assertEqual(shifts, {"a": [1, 0], "b": [1, 0], "c": [2, 0]})
        self.assertTrue(all(isinstance(v, int) for shift in shifts.values() for v in shift))
        self.assertEqual((exact["a"], exact["c"]), ([.525, 0.0], [1.65, 0.0]))
        # However steeply the town moves between them, buildings 1 m apart move
        # together: alone they would round to 0 and 2 and collide or part.
        shifts, _ = BUILDER._grid.building_shifts([building("a", 0, 10), building("b", 11, 21)], [],
                                                  lambda point: [.2 if point[0] < 10.5 else 1.6, 0.0])
        self.assertEqual(shifts["a"], shifts["b"])

    def test_rounding_alone_never_splits_two_near_buildings(self):
        # Two buildings 2 m apart: further than CLUSTER_GAP, within CLUSTER_NEAR.
        # Moves of 0.45 and 0.55 m round apart though they differ by a tenth,
        # which would close the gap to a one-tile slot, so they move as one;
        # moves of 0.4 and 1.6 m really differ, and stay apart.
        def building(ident, x0, x1):
            return {"id": ident, "bounds": [x0, 0, x1, 10]}
        pair = [building("d", 0, 9), building("e", 11, 20)]
        shifts, _ = BUILDER._grid.building_shifts(pair, [], lambda point: [.45 if point[0] < 10 else .55, 0.0])
        self.assertEqual(shifts["d"], shifts["e"])
        shifts, _ = BUILDER._grid.building_shifts(pair, [], lambda point: [.4 if point[0] < 10 else 1.6, 0.0])
        self.assertEqual((shifts["d"], shifts["e"]), ([0, 0], [2, 0]))

    def test_the_lake_shore_pulls_the_town_beside_it_toward_no_move(self):
        # A street 40 m from the shore moved 2 m east. On the shore the town does
        # not move; between them the move fades toward the shore, well below what
        # the same point would take with no lake.
        style = BUILDER.road_style({"tags": {"highway": "residential"}})
        style.update(widthSource="standard-game-street", centerline=[[102, -1000], [102, 0], [102, 1000]])
        street = {"tags": {"highway": "residential"}, "nativeRoad": style,
                  "geometry": {"type": "LineString", "coordinates": [[100, -1000], [100, 0], [100, 1000]]}}
        lake = {"category": "water", "geometry": {"type": "MultiPolygon", "coordinates": [[[[140, -1000], [400, -1000], [400, 1000], [140, 1000], [140, -1000]]]]}}
        shore = BUILDER.street_follow_field([street], [lake])
        open_land = BUILDER.street_follow_field([street])
        self.assertEqual(shore([140, 0])[0], 0.0)
        self.assertEqual(shore([100, 0])[0], 2.0)
        self.assertTrue(0 < shore([130, 0])[0] < .5 * open_land([130, 0])[0], (shore([130, 0]), open_land([130, 0])))

    def test_a_move_keeps_every_touching_neighbour_and_opens_no_slot(self):
        # A building touching a neighbour on its east may slide along it, not
        # away from it; nor may it move to a tile from another building.
        grid = BUILDER._grid

        def box(x0, y0, x1, y1):
            return {(x, y) for x in range(x0, x1) for y in range(y0, y1)}
        me, wall, far = box(0, 0, 4, 4), box(4, 0, 8, 4), box(-5, 0, -2, 4)

        def town(mine):
            return lambda cell: {"me"} if cell in mine else {"wall"} if cell in wall else {"far"} if cell in far else set()

        def moved(dx, dy):
            return {(x + dx, y + dy) for x, y in me}
        self.assertTrue(grid._keeps_neighbours("me", me, moved(0, 1), town(me), town(moved(0, 1))))
        self.assertFalse(grid._keeps_neighbours("me", me, moved(-1, 0), town(me), town(moved(-1, 0))))
        self.assertFalse(grid._keeps_neighbours("me", me, moved(-2, 0), town(me), town(moved(-2, 0))))

        # Without the wall, a metre west leaves one empty tile to `far`: a new slot.
        def alone(mine):
            return lambda cell: {"me"} if cell in mine else {"far"} if cell in far else set()
        self.assertTrue(grid._keeps_neighbours("me", me, moved(1, 0), alone(me), alone(moved(1, 0))))
        self.assertFalse(grid._keeps_neighbours("me", me, moved(-1, 0), alone(me), alone(moved(-1, 0))))

    def test_a_one_tile_wall_step_has_two_clean_repairs(self):
        grid = BUILDER._grid
        ring = [[0, 0], [5, 0], [5, 3], [3, 3], [3, 4], [0, 4], [0, 0]]
        variants = list(grid._jog_variants(ring))
        self.assertEqual(len(variants), 1)
        for repaired in variants[0]:
            self.assertTrue(grid.valid_ring(repaired), repaired)
            self.assertFalse(any(abs(b[0] - a[0]) + abs(b[1] - a[1]) == 1 for a, b in zip(repaired, repaired[1:])), repaired)
        self.assertEqual(sorted(abs(grid.signed_area(r)) for r in variants[0]), [15, 20])

    @staticmethod
    def straighten(shapes, members, neighbours=()):
        """Run _straighten_walls on one component; neighbours only occupy cells."""
        grid = BUILDER._grid

        def validate(shapes, ids, pairs):
            cells = {ident: grid.cells(shapes[ident]) for ident in ids}
            if any(cells[a] & cells[b] for a in ids for b in ids if a < b):
                raise ValueError("overlap")
            for a, b in pairs:
                if not any((x + dx, y + dy) in cells[b] for x, y in cells[a] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    raise ValueError("separated")
            return cells
        pairs = [(a, b) for a in members for b in members if a < b]
        cells = validate(shapes, members, pairs)
        group = {"ids": members, "pairs": pairs, "current": {"override": False, "shapes": dict(shapes), "cells": cells}}
        occupancy = collections.defaultdict(set)
        for ident, owned in [*cells.items(), *((name, grid.cells(polygons)) for name, polygons in neighbours)]:
            for cell in owned:
                occupancy[cell].add(ident)
        removed = grid._straighten_walls([group], validate, {}, set(), occupancy, 1440, 1680)
        return removed, cells, group["current"]

    def test_a_party_wall_step_moves_for_both_buildings(self):
        # Two attached Lakeside Inn buildings share a party wall with a one-tile
        # step, and their outer walls beyond it are a tile apart too. Neither
        # can straighten alone without opening a slot between them; together
        # the east one gives up a column and the west one takes the two tiles
        # beside it, so both walls run straight and nothing opens between them.
        grid = BUILDER._grid
        east = [[[[351, 787], [366, 787], [366, 770], [350, 770], [350, 777], [351, 777], [351, 787]]]]
        west = [[[[351, 800], [351, 777], [350, 777], [350, 775], [338, 775], [338, 800], [351, 800]]]]
        removed, before, after = self.straighten({"east": east, "west": west}, ["east", "west"])
        self.assertEqual(removed, 2)
        self.assertEqual(sum(grid._one_tile_edges(after["shapes"][ident]) for ident in ("east", "west")), 0)
        self.assertEqual(after["cells"]["west"] - before["west"], {(350, 775), (350, 776)})
        taken = after["cells"]["east"] | after["cells"]["west"]
        for x, y in (before["east"] | before["west"]) - taken:
            self.assertFalse((x - 1, y) in taken and (x + 1, y) in taken or (x, y - 1) in taken and (x, y + 1) in taken)

    def test_a_step_between_two_buildings_stays_rather_than_open_a_slot(self):
        # A building's east wall steps a tile where its neighbour's wall steps
        # too. Pulling the upper wall in would open a one-tile slot between
        # them; pushing the lower wall out would cover the neighbour. The step stays.
        building = [[[[0, 0], [5, 0], [5, 3], [4, 3], [4, 6], [0, 6], [0, 0]]]]
        neighbour = [[[[5, 0], [8, 0], [8, 6], [4, 6], [4, 3], [5, 3], [5, 0]]]]
        removed, before, after = self.straighten({"building": building}, ["building"], [("neighbour", neighbour)])
        self.assertEqual(removed, 0)
        self.assertEqual(after["cells"], before)

    def test_a_block_sized_park_moves_as_one_piece(self):
        # A field that moves each point a hundredth of its x stretches a 100 m
        # park by 1 m, the kind of stretch that closed the Donnelly stage's
        # approach. Deeper than BLOCK_PARK_BAND inside the park everything takes
        # the move at its centre; nearer the edge the two moves blend, so a path
        # crossing it stays joined; a hole in it, a park wider than
        # BLOCK_PARK_SPAN and the land outside keep the field's own move.
        def park(ident, x0, y0, x1, y1, hole=None):
            rings = [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]
            if hole:
                hx0, hy0, hx1, hy1 = hole
                rings.append([[hx0, hy0], [hx0, hy1], [hx1, hy1], [hx1, hy0], [hx0, hy0]])
            return {"id": ident, "category": "park", "tags": {"leisure": "park"}, "bounds": [x0, y0, x1, y1],
                    "geometry": {"type": "MultiPolygon", "coordinates": [rings]}}

        def field(point):
            return [point[0] / 100, 0.0]
        moved = BUILDER.park_follow(field, [park("block", 100, 100, 200, 200, hole=(105, 105, 125, 125)),
                                            park("wide", 400, 0, 700, 300)])
        self.assertEqual(moved.parks, {"block": [1.5, 0.0]})
        self.assertEqual(moved([110, 150]), [1.5, 0.0])
        self.assertEqual(moved([190, 150]), [1.5, 0.0])
        self.assertAlmostEqual(moved([104, 150])[0], .4 * 1.5 + .6 * 1.04)
        self.assertEqual(moved([100, 150]), field([100, 150]))
        self.assertEqual(moved([115, 115]), [1.15, 0.0])
        self.assertEqual(moved([450, 150]), [4.5, 0.0])
        self.assertEqual(moved([50, 50]), [0.5, 0.0])

    def test_a_road_meeting_a_bridge_keeps_the_shared_vertex(self):
        # The town moves 1 m east. The bridge keeps its mapped place over the
        # water, and the path that meets it keeps their shared vertex there, so
        # the two stay joined; the path's far end moves with the town.
        def road(tags, points):
            return {"tags": tags, "nativeRoad": BUILDER.road_style({"tags": tags}),
                    "geometry": {"type": "LineString", "coordinates": points}}
        bridge = road({"highway": "footway", "bridge": "yes"}, [[0.0, 0.0], [0.0, 20.0]])
        path = road({"highway": "footway"}, [[0.0, 20.0], [0.0, 40.0]])
        BUILDER.follow_streets([bridge, path], [{}, {}], lambda point: [1.0, 0.0])
        self.assertNotIn("centerline", bridge["nativeRoad"])
        self.assertEqual(path["nativeRoad"]["centerline"], [[0.0, 20.0], [1.0, 40.0]])


class PierAndRailwayUnits(unittest.TestCase):
    """Pier decks and railway beds on small made-up grids, without building the town."""

    def test_piers_and_railways_whose_rails_remain_are_drawn(self):
        self.assertEqual(BUILDER.category({"man_made": "pier"}), "pier")
        for kind in ("rail", "disused"):
            self.assertEqual(BUILDER.category({"railway": kind}), "railway")
        for kind in ("abandoned", "razed", "proposed"):
            self.assertEqual(BUILDER.category({"railway": kind}), "context")

    def test_pier_decks_draw_each_line_once(self):
        # A cross-dock mapped out and back (A-B-C-A) is one chord.
        self.assertEqual(BUILDER.pier_decks([[5.0, 5.0], [5.0, 0.0], [5.1, 12.0], [5.0, 5.0]]), [[[5.0, 0.0], [5.1, 12.0]]])
        # An open way that walks its crossbar three times: the stem and one crossbar, a T.
        self.assertEqual(BUILDER.pier_decks([[30.0, 10.0], [6.0, 10.0], [6.0, -5.0], [6.0, 14.0], [6.0, 10.0]]),
                         [[[30.0, 10.0], [6.0, 10.0]], [[6.0, -5.0], [6.0, 14.0]]])
        # An L mapped out and back keeps both legs: no diagonal across it.
        self.assertEqual(BUILDER.pier_decks([[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [10.0, 0.0], [0.0, 0.0]]),
                         [[[0.0, 0.0], [10.0, 0.0]], [[10.0, 0.0], [10.0, 10.0]]])
        # Segments that only continue a straight line, or turn, stay as they are.
        line = [[0.0, 0.0], [3.0, 4.0], [3.0, 9.0], [3.0, 15.0]]
        self.assertEqual(BUILDER.pier_decks(line), [line[:2], line[1:3], line[2:]])
        # A parallel deck 1 m to the side is another deck, not a doubling, and so is
        # a deck that turns sharply back (14 degrees off its own line).
        self.assertEqual(len(BUILDER.pier_decks([[0.0, 0.0], [10.0, 0.0], [10.0, 1.0], [0.0, 1.0]])), 3)
        self.assertEqual(len(BUILDER.pier_decks([[0.0, 0.0], [10.0, 0.0], [8.0, 0.5]])), 2)
        # A way drawn the other way round merges the same segments.
        def unordered(lines):
            return sorted(sorted(map(tuple, line)) for line in lines)
        for way in ([[0.0, 0.0], [20.0, 0.0], [16.0, 0.15]], [[30.0, 10.0], [6.0, 10.0], [6.0, -5.0], [6.0, 14.0], [6.0, 10.0]],
                    [[5.0, 5.0], [5.0, 0.0], [5.1, 12.0], [5.0, 5.0]]):
            self.assertEqual(unordered(BUILDER.pier_decks(way)), unordered(BUILDER.pier_decks(way[::-1])), way)
        self.assertEqual(len(BUILDER.pier_decks([[16.0, 0.15], [20.0, 0.0], [0.0, 0.0]])), 1)

    def test_a_bend_stays_joined_side_to_side(self):
        # Square ends would leave the bend's outer corner cell (8, 5) to neither
        # line, so (7, 5) and (8, 4) would touch only at a corner.
        width, depth, code = 12, 8, BUILDER.CODE
        terrain = bytearray([code["water"]] * (width * depth))
        pier = {"id": "p", "tags": {"man_made": "pier"}, "geometry": {"type": "LineString", "coordinates": [[2.0, 5.3], [8.3, 5.3], [8.3, 0.3]]}}
        BUILDER.paint_piers(terrain, bytearray(width * depth), [pier], bytearray(width * depth), bytearray(width * depth), width, depth)
        deck = {(i % width, i // width) for i, v in enumerate(terrain) if v == code["bridge"]}
        self.assertEqual(pier["nativePier"]["joints"], [[8.3, 5.3]])
        self.assertIn((8, 5), deck)
        self.assertNotIn((7, 4), deck)
        start = next(iter(deck))
        seen, todo = {start}, [start]
        while todo:
            x, y = todo.pop()
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n in deck and n not in seen:
                    seen.add(n)
                    todo.append(n)
        self.assertEqual(seen, deck)

    def test_a_pier_keeps_every_joint(self):
        width, depth = 12, 8
        pier = {"id": "p", "tags": {"man_made": "pier"}, "geometry": {"type": "LineString", "coordinates": [[1.0, 2.5], [5.0, 2.5], [5.0, 5.5], [9.0, 5.5]]}}
        BUILDER.paint_piers(bytearray([BUILDER.CODE["water"]] * (width * depth)), bytearray(width * depth), [pier], bytearray(width * depth), bytearray(width * depth), width, depth)
        self.assertEqual(pier["nativePier"]["joints"], [[5.0, 2.5], [5.0, 5.5]])

    def test_a_joint_rounds_the_band_three_quarters_of_a_metre_out(self):
        # Cell (8, 5) lies past both lines' square ends, in the bend's outer corner,
        # so only the joint's round band can reach its centre (8.5, 5.5).
        width, depth, code = 12, 8, BUILDER.CODE
        for reach, painted in ((.74, True), (.76, False)):
            jx, jy = 8.5 - reach / math.sqrt(2), 5.5 - reach / math.sqrt(2)
            terrain = bytearray([code["water"]] * (width * depth))
            pier = {"id": "p", "tags": {"man_made": "pier"}, "geometry": {"type": "LineString", "coordinates": [[2.0, jy], [jx, jy], [jx, 0.3]]}}
            BUILDER.paint_piers(terrain, bytearray(width * depth), [pier], bytearray(width * depth), bytearray(width * depth), width, depth)
            self.assertEqual(terrain[5 * width + 8] == code["bridge"], painted, reach)

    def test_validator_markers_share_the_first_sentrys_walkable_area(self):
        # A deck in the sector's first rows meets land only beyond the sector (here,
        # nowhere): the first five cells in scan order lie on it, cut off by water.
        size, code = 12, BUILDER.CODE
        terrain = bytearray([code["water"]] * (size * size))
        for y in range(1, 3):
            for x in range(2, 9):
                terrain[y * size + x] = code["bridge"]
        for y in range(4, size):
            for x in range(size):
                terrain[y * size + x] = code["ground-grass"]
        blocked = bytearray(size * size)
        first = BUILDER.preview_anchors(terrain, blocked, [], (0, 0), size, size)
        self.assertEqual({p["y"] for p in first}, {1, 2})
        # The sentry stands at (1, 4) and walks through (3, 4): the markers keep off both.
        guards = [{"x": 1, "y": 4, "patrol": [{"x": 1, "y": 4}, {"x": 3, "y": 4}]}]
        moved = BUILDER.anchors_with_sentries(terrain, blocked, [], (0, 0), size, size, first, guards)
        cells = [(p["x"], p["y"]) for p in moved]
        self.assertEqual(cells, [(2, 4), (2, 5), (3, 5), (2, 6), (1, 5)])
        # Land that touches the deck only at a corner does not join them: the validator walks four ways.
        corner = bytearray(terrain)
        corner[3 * size + 9] = code["ground-grass"]
        self.assertTrue(all(p["y"] >= 3 for p in BUILDER.anchors_with_sentries(corner, blocked, [], (0, 0), size, size, first, guards)))
        # Markers already in the sentry's area stay where they are, as do a sector's without sentries.
        self.assertIs(BUILDER.anchors_with_sentries(terrain, blocked, [], (0, 0), size, size, moved, guards), moved)
        self.assertIs(BUILDER.anchors_with_sentries(terrain, blocked, [], (0, 0), size, size, first, []), first)
        # A deck joined to the land within the sector is the same area: no move.
        terrain[3 * size + 4] = code["bridge"]
        self.assertIs(BUILDER.anchors_with_sentries(terrain, blocked, [], (0, 0), size, size, first, guards), first)

    def test_the_walking_band_is_three_quarters_of_a_metre_either_side(self):
        width, depth, code = 12, 6, BUILDER.CODE
        for y, painted in ((3.24, True), (3.26, False)):
            terrain = bytearray([code["water"]] * (width * depth))
            pier = {"id": "p", "tags": {"man_made": "pier"}, "geometry": {"type": "LineString", "coordinates": [[1.0, y], [11.0, y]]}}
            BUILDER.paint_piers(terrain, bytearray(width * depth), [pier], bytearray(width * depth), bytearray(width * depth), width, depth)
            # Row 2's centres lie 0.74 or 0.76 m from the line.
            self.assertEqual(terrain[2 * width + 5] == code["bridge"], painted, y)

    def test_a_pier_leaves_a_path_cell_alone(self):
        width, depth, code = 12, 5, BUILDER.CODE
        terrain = bytearray([code["water"]] * 6 + [code["ground-grass"]] * 6) * depth
        road = bytearray(width * depth)
        terrain[2 * width + 8] = code["ground-dirt"]
        road[2 * width + 8] = 1
        terrain[2 * width + 10] = code["ground-dirt"]
        pier = {"id": "p", "tags": {"man_made": "pier"}, "geometry": {"type": "LineString", "coordinates": [[1.0, 2.5], [11.5, 2.5]]}}
        BUILDER.paint_piers(terrain, bytearray(width * depth), [pier], road, bytearray(width * depth), width, depth)
        row = [BUILDER.KINDS[v] for v in terrain[2 * width:3 * width]]
        self.assertEqual((row[8], row[10]), ("ground-dirt", "ground-wood-planks"))
        self.assertEqual((pier["nativePier"]["heightM"], pier["nativePier"]["lines"]), (.4, [[[1.0, 2.5], [11.5, 2.5]]]))
        # The pier says what its deck is and where its numbers come from.
        native = pier["nativePier"]
        self.assertEqual((native["shape"], native["widthM"], native["widthSource"], native["walkWidthM"], native["joints"]),
                         ("deck-lines", 2, "declared-boardwalk-proxy", 1.5, []))
        self.assertTrue(native["heightSource"].startswith("owner's choice 2026-11-10 (low deck)"), native["heightSource"])

    def test_a_pier_band_stops_square_at_its_ends_and_a_road_does_not(self):
        width, depth, code = 12, 5, BUILDER.CODE
        terrain = bytearray([code["water"]] * (width * depth))
        pier = {"id": "p", "tags": {"man_made": "pier"}, "geometry": {"type": "LineString", "coordinates": [[2.0, 2.5], [8.0, 2.5]]}}
        BUILDER.paint_piers(terrain, bytearray(width * depth), [pier], bytearray(width * depth), bytearray(width * depth), width, depth)
        self.assertEqual([BUILDER.KINDS[v] for v in terrain[2 * width:3 * width]],
                         ["water"] * 2 + ["bridge"] * 6 + ["water"] * 4)
        road = bytearray(width * depth)
        BUILDER.paint_line(road, [[2.0, 2.5], [8.0, 2.5]], 1.5, 1, width, depth)
        self.assertEqual(list(road[2 * width:3 * width]), [0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0])

    def test_a_diagonal_pier_decks_a_two_metre_band(self):
        width, depth, code = 16, 16, BUILDER.CODE
        terrain = bytearray([code["water"]] * (width * depth))
        pier = {"id": "p", "tags": {"man_made": "pier"}, "geometry": {"type": "LineString", "coordinates": [[2.5, 2.5], [13.5, 13.5]]}}
        BUILDER.paint_piers(terrain, bytearray(width * depth), [pier], bytearray(width * depth), bytearray(width * depth), width, depth)
        bridge = {(x, y) for y in range(depth) for x in range(width) if terrain[y * width + x] == code["bridge"]}
        for x, y in bridge:
            self.assertLessEqual(segment_distance([x + .5, y + .5], [2.5, 2.5], [13.5, 13.5]), 1)
        for k in range(3, 13):
            # Side neighbours lie 0.71 m from the line (inside the 0.75 m walking
            # band, so the deck stays joined side to side), corner neighbours 1.41 m.
            self.assertTrue({(k, k), (k + 1, k), (k, k + 1)} <= bridge, k)
            self.assertNotIn((k + 1, k - 1), bridge)
        self.assertEqual(pier["nativePier"]["bridgeCells"], len(bridge))

    def test_an_observation_must_start_on_its_pier(self):
        width, depth = 20, 6
        pier = {"id": "osm-way-7", "tags": {"man_made": "pier"}, "geometry": {"type": "LineString", "coordinates": [[1.0, 2.5], [10.0, 2.5]]}}
        good = {"id": "t", "source": {"type": "way", "id": 7}, "addLine": [[10.0, 2.5], [10.0, 5.5]]}
        terrain = bytearray([BUILDER.CODE["water"]] * (width * depth))
        BUILDER.paint_piers(terrain, bytearray(width * depth), [pier], bytearray(width * depth), bytearray(width * depth), width, depth, [good])
        self.assertEqual(pier["nativePier"]["lines"][-1], good["addLine"])
        # The added line starts on a vertex of the way (not merely near its deck), is one
        # straight line of two distinct points, and does not run back over a mapped deck line.
        for bad, message in (([[15.0, 2.5], [15.0, 5.5]], "no longer starts on a vertex"), ([[9.9, 2.5], [9.9, 5.5]], "no longer starts on a vertex"),
                             ([[10.0, 5.5], [10.0, 2.5]], "no longer starts on a vertex"),
                             ([[10.0, 2.5], [10.0, 4.0], [12.0, 5.0]], "must add one straight line"), ([[10.0, 2.5], [10.0, 2.5]], "must add one straight line"),
                             ([[10.0, 2.5], [4.0, 2.5]], "runs over a mapped deck line")):
            with self.assertRaisesRegex(ValueError, message, msg=str(bad)):
                BUILDER.paint_piers(terrain, bytearray(width * depth), [pier], bytearray(width * depth), bytearray(width * depth), width, depth, [{**good, "addLine": bad}])
        with self.assertRaisesRegex(ValueError, "name ways the town has no pier for"):
            BUILDER.paint_piers(terrain, bytearray(width * depth), [pier], bytearray(width * depth), bytearray(width * depth), width, depth,
                                [{**good, "source": {"type": "way", "id": 8}}])
        # A stem added at a vertex inside a straight run makes a T: three line ends, one joint.
        run = {**pier, "geometry": {"type": "LineString", "coordinates": [[1.0, 2.5], [5.0, 2.5], [10.0, 2.5]]}}
        BUILDER.paint_piers(bytearray([BUILDER.CODE["water"]] * (width * depth)), bytearray(width * depth), [run], bytearray(width * depth), bytearray(width * depth), width, depth,
                            [{**good, "addLine": [[5.0, 2.5], [5.0, 5.5]]}])
        self.assertEqual(run["nativePier"]["joints"], [[5.0, 2.5]])
        # A long added line that runs out over a short mapped one (3 degrees off it, its far
        # end 0.9 m to the side) is refused, as seen from either line; 8 degrees off is a new line.
        short = {**pier, "geometry": {"type": "LineString", "coordinates": [[1.0, 2.5], [3.0, 2.5]]}}
        with self.assertRaisesRegex(ValueError, "runs over a mapped deck line"):
            BUILDER.paint_piers(terrain, bytearray(width * depth), [short], bytearray(width * depth), bytearray(width * depth), width, depth,
                                [{**good, "addLine": [[1.0, 2.5], [19.0, 3.4]]}])
        BUILDER.paint_piers(terrain, bytearray(width * depth), [short], bytearray(width * depth), bytearray(width * depth), width, depth,
                            [{**good, "addLine": [[1.0, 2.5], [19.0, 5.0]]}])
        self.assertEqual(short["nativePier"]["lines"][-1], [[1.0, 2.5], [19.0, 5.0]])
        # A platform outline has no deck line to extend.
        platform = {**pier, "geometry": {"type": "MultiPolygon", "coordinates": [[[[1.0, 1.0], [5.0, 1.0], [5.0, 4.0], [1.0, 4.0], [1.0, 1.0]]]]}}
        with self.assertRaisesRegex(ValueError, "may only extend a deck line"):
            BUILDER.paint_piers(terrain, bytearray(width * depth), [platform], bytearray(width * depth), bytearray(width * depth), width, depth, [good])

    def test_a_path_meeting_a_pier_keeps_the_shared_vertex(self):
        tags = {"highway": "footway"}
        path = {"tags": tags, "nativeRoad": BUILDER.road_style({"tags": tags}),
                "geometry": {"type": "LineString", "coordinates": [[0.0, 20.0], [0.0, 40.0]]}}
        BUILDER.follow_streets([path], [{}, {}], lambda point: [1.0, 0.0], [[0.0, 0.0], [0.0, 20.0]])
        self.assertEqual(path["nativeRoad"]["centerline"], [[0.0, 20.0], [1.0, 40.0]])

    def test_the_track_keeps_road_cell_centres_one_and_a_quarter_metres_away(self):
        # Samples fall 0.5 m apart from x 0.2668, so the road cell centred at
        # (10.5, 5.5) lies 1.2400 m from the sample at x 9.7668 (inside the
        # clearance) and 1.2602 m from the one at x 11.2668 (outside it).
        width, depth, code = 40, 9, BUILDER.CODE
        terrain, road = bytearray([code["ground-grass"]] * (width * depth)), bytearray(width * depth)
        road[5 * width + 10], terrain[5 * width + 10] = 1, code["ground-asphalt"]
        rail = {"id": "r", "tags": {"railway": "disused"}, "geometry": {"type": "LineString", "coordinates": [[0.2668, 4.5], [39.2668, 4.5]]}}
        BUILDER.paint_railways(terrain, bytearray(width * depth), [rail], road, bytearray(width * depth), lambda point: [0.0, 0.0], width, depth)
        runs = rail["nativeRailway"]["runs"]
        self.assertEqual((runs[0][-1], runs[1][0]), ([9.2668, 4.5], [11.2668, 4.5]))

    def test_the_track_stops_at_water_a_building_a_deck_and_the_street_corridor(self):
        width, depth, code = 80, 9, BUILDER.CODE
        terrain, road, corridor = bytearray([code["ground-grass"]] * (width * depth)), bytearray(width * depth), bytearray(width * depth)
        for x, kind in ((10, "water"), (25, "floor"), (40, "bridge"), (55, "ground-wood-planks")):
            terrain[4 * width + x] = code[kind]
        corridor[4 * width + 70] = 1
        # Samples every 0.5 m from x 0.5: whole-metre sampling would end each run
        # half a metre sooner.
        rail = {"id": "r", "tags": {"railway": "disused"}, "geometry": {"type": "LineString", "coordinates": [[0.5, 4.5], [79.5, 4.5]]}}
        BUILDER.paint_railways(terrain, bytearray(width * depth), [rail], road, corridor, lambda point: [0.0, 0.0], width, depth)
        runs = rail["nativeRailway"]["runs"]
        self.assertEqual([(run[0][0], run[-1][0]) for run in runs],
                         [(1.0, 9.0), (12.0, 24.0), (27.0, 39.0), (42.0, 54.0), (57.0, 69.0), (72.0, 79.0)])
        row = [BUILDER.KINDS[v] for v in terrain[4 * width:5 * width]]
        self.assertEqual((row[10], row[25], row[40], row[55], row[70], row[69]),
                         ("water", "floor", "bridge", "ground-wood-planks", "ground-grass", "ground-gravel"))
        self.assertEqual(BUILDER.rail_runs([[3.0, 3.0]], lambda point: True), [])
        # A run open to the end of its line ends exactly there, between two samples.
        self.assertEqual(BUILDER.rail_runs([[1.0, 4.5], [20.3, 4.5]], lambda point: True), [[[1.0, 4.5], [20.3, 4.5]]])

    def test_a_pier_decks_water_and_open_ground_but_no_road_building_or_corridor(self):
        width, depth, code = 20, 7, BUILDER.CODE
        terrain = bytearray([code["water"]] * 10 + [code["ground-grass"]] * 10) * depth
        terrain[3 * width + 14], terrain[3 * width + 16] = code["ground-concrete"], code["floor"]
        green, corridor = bytearray([1] * (width * depth)), bytearray(width * depth)
        corridor[3 * width + 18] = 1
        pier = {"id": "p", "tags": {"man_made": "pier"}, "geometry": {"type": "LineString", "coordinates": [[2.0, 3.5], [19.5, 3.5]]}}
        BUILDER.paint_piers(terrain, green, [pier], bytearray(width * depth), corridor, width, depth)
        row = [BUILDER.KINDS[v] for v in terrain[3 * width:4 * width]]
        self.assertEqual(row[2:10], ["bridge"] * 8)
        self.assertEqual(row[10:14] + row[15:16] + row[17:18] + row[19:], ["ground-wood-planks"] * 7)
        self.assertEqual((row[0], row[14], row[16], row[18]), ("water", "ground-concrete", "floor", "ground-grass"))
        self.assertEqual((green[3 * width + 12], green[3 * width + 18], green[0]), (0, 1, 1))
        # The drawn deck is two metres wide, but a walker crosses only cells whose
        # centres lie within 0.75 m of its line: here one row, under the deck.
        self.assertEqual([BUILDER.KINDS[terrain[y * width + 5]] for y in range(depth)], ["water", "water", "water", "bridge", "water", "water", "water"])
        # A line on a cell boundary takes both rows beside it (0.5 m each).
        terrain = bytearray([code["water"]] * (width * depth))
        BUILDER.paint_piers(terrain, bytearray(width * depth), [{"id": "q", "tags": {"man_made": "pier"}, "geometry": {"type": "LineString", "coordinates": [[2.0, 3.0], [9.0, 3.0]]}}],
                            bytearray(width * depth), bytearray(width * depth), width, depth)
        self.assertEqual([BUILDER.KINDS[terrain[y * width + 5]] for y in range(depth)], ["water", "water", "bridge", "bridge", "water", "water", "water"])
        self.assertEqual(pier["nativePier"]["widthM"], 2)

    def test_a_railway_bed_yields_to_a_road_and_its_track_stops_short(self):
        width, depth, code = 40, 9, BUILDER.CODE
        terrain, green, road = bytearray([code["ground-grass"]] * (width * depth)), bytearray([1] * (width * depth)), bytearray(width * depth)
        for y in range(depth):
            for x in (19, 20):
                road[y * width + x], terrain[y * width + x] = 1, code["ground-asphalt"]
        rail = {"id": "r", "tags": {"railway": "disused"}, "geometry": {"type": "LineString", "coordinates": [[-1.0, 4.5], [39.0, 4.5]]}}
        BUILDER.paint_railways(terrain, green, [rail], road, bytearray(width * depth), lambda point: [1.0, 0.0], width, depth)
        native = rail["nativeRailway"]
        self.assertEqual(native["centerline"], [[0.0, 4.5], [40.0, 4.5]])
        row = [BUILDER.KINDS[v] for v in terrain[4 * width:5 * width]]
        self.assertEqual(row[19:21], ["ground-asphalt"] * 2)
        self.assertTrue(all(kind == "ground-gravel" for kind in row[:19] + row[21:]))
        self.assertEqual((green[4 * width + 3], green[0]), (0, 1))
        # Road cell centres (19.5, 20.5) and the map edges stay 1.25 m clear of the track.
        self.assertEqual([[run[0], run[-1]] for run in native["runs"]], [[[1.0, 4.5], [18.0, 4.5]], [[22.0, 4.5], [39.0, 4.5]]])

    def test_a_siding_stops_where_its_bed_would_meet_the_main_line(self):
        width, depth, code = 40, 12, BUILDER.CODE
        terrain = bytearray([code["ground-grass"]] * (width * depth))
        main = {"id": "m", "tags": {"railway": "disused"}, "geometry": {"type": "LineString", "coordinates": [[0.0, 2.5], [40.0, 2.5]]}}
        siding = {"id": "s", "tags": {"railway": "disused", "service": "siding"},
                  "geometry": {"type": "LineString", "coordinates": [[5.0, 9.5], [20.0, 9.5], [35.0, 3.5]]}}
        BUILDER.paint_railways(terrain, bytearray(width * depth), [main, siding], bytearray(width * depth), bytearray(width * depth),
                               lambda point: [0.0, 0.0], width, depth)
        (run,) = siding["nativeRailway"]["runs"]
        self.assertEqual(run[0], [5.0, 9.5])
        # The bed would reach the main line's within 2 m below y 4.5, at x 32.5.
        self.assertGreaterEqual(run[-1][1] - 2.5, BUILDER.RAIL_BED_WIDTH)
        self.assertGreater(run[-1][0], 31)
        self.assertEqual(len(main["nativeRailway"]["runs"]), 1)


class LidarCrownUnits(unittest.TestCase):
    """plant_crowns on a made-up 20 x 20 m park of four 10 m sectors."""

    def setUp(self):
        self.foliage = BUILDER.load_map_helper("mount_dora_foliage")
        self.code = {"ground-grass": 0, "woodland": 2, "water": 1}
        self.terrain = [0] * 400
        self.green = bytearray([1] * 400)
        self.blocked = bytearray(400)
        self.props = collections.defaultdict(list)
        self.brush = collections.defaultdict(dict)

    def plant(self, crowns, tree_cells=(), occupied=(), **kw):
        self.tree_cells, self.occupied = set(tree_cells), set(occupied)
        return self.foliage.plant_crowns(crowns, self.terrain, self.green, self.blocked, 20, 20, 10, self.code,
                                         lambda c, r: (c, r), self.props, self.brush, self.tree_cells, self.occupied, **kw)

    def trees(self):
        return {(c * 10 + p["x"], r * 10 + p["y"]): p for (c, r), props in self.props.items() for p in props}

    @staticmethod
    def crown(top, area=30.0, height=8.0, width=6.0, centre=None, number=0):
        return {"id": "lidar-crown-%d" % number, "top": top, "centre": centre or top, "areaM2": area, "heightM": height, "widthM": width}

    def test_an_empty_crown_gets_one_tree_nearest_its_top(self):
        self.assertEqual(self.plant([self.crown([5.2, 5.7])]), 1)
        (cell, prop), = self.trees().items()
        self.assertEqual(cell, (5, 5))
        self.assertEqual(prop["kind"], "tree-broadleaf")
        self.assertEqual(prop["mountDora"], {"sourceId": "lidar-crown-0", "habitat": "park", "placement": "lidar-crown",
                                             "crown": {"heightM": 8.0, "widthM": 6.0, "top": [5.2, 5.7]}})
        self.assertEqual(self.tree_cells, {(5, 5)})
        self.assertIn((5, 5), self.occupied)

    def test_crowns_that_get_no_tree_are_counted_by_reason(self):
        tally = {}
        crowns = [self.crown([5.5, 5.5], number=0), self.crown([15.5, 15.5], area=4, number=1), self.crown([10.5, 15.5], number=2)]
        everything = {(x, y) for x in range(13, 19) for y in range(13, 19)}
        self.assertEqual(self.plant(crowns, tree_cells={(5, 5)}, keep_clear=everything, tally=tally), 1)
        self.assertEqual(tally, {"held": 1, "noGround": 1})

    def test_a_tree_outside_every_mapped_habitat_says_so(self):
        self.green[:] = bytearray(400)
        self.assertEqual(self.plant([self.crown([5.5, 5.5])]), 1)
        self.assertEqual(next(iter(self.trees().values()))["mountDora"]["habitat"], "unmapped")

    def test_a_crown_moves_with_the_town_by_the_field_at_its_top(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / BUILDER.LIDAR_CROWNS
            target.parent.mkdir(parents=True)
            target.write_text(json.dumps({"collection": {"acquired": ["2018-12-06", "2018-12-06"]},
                                          "columns": ["topX", "topY", "centreX", "centreY", "areaM2", "heightM", "widthM", "multiShare"],
                                          "crowns": [[10, 20, 11, 21, 30, 9, 6, .4], [100, 5, 99, 6, 40, 14, 7, .5]]}), "utf-8")
            seen = []
            crowns, record = BUILDER.load_crowns(lambda p: seen.append(list(p)) or [p[0] * .01, -1.0], project=Path(folder))
        self.assertEqual(seen, [[10, 20], [100, 5]], "the field is read at each crown's top")
        self.assertEqual([c["top"] for c in crowns], [[10.1, 19.0], [101.0, 4.0]])
        self.assertEqual([c["centre"] for c in crowns], [[11.1, 20.0], [100.0, 5.0]], "the centre moves by the top's field")
        self.assertEqual([c["id"] for c in crowns], ["lidar-crown-0", "lidar-crown-1"])
        self.assertEqual(record["crowns"], 2)

    def test_a_whole_metre_top_is_written_as_an_integer(self):
        # house-parts.mjs re-encodes the sectors in JavaScript, which writes 21.0 as 21.
        self.assertEqual(self.plant([self.crown([5.0, 5.7])]), 1)
        top = next(iter(self.trees().values()))["mountDora"]["crown"]["top"]
        self.assertEqual(json.dumps(top), "[5, 5.7]")

    def test_kinds_by_height_and_shape(self):
        cases = [(8, 6, "tree-broadleaf"), (12, 6.01, "tree-broadleaf-large"), (12, 6, "tree-pine-large"), (9.9, 5, "tree-broadleaf"), (10, 5, "tree-pine")]
        crowns = [self.crown([3.5 + 3 * i, 3.5], area=4, height=h, width=w, number=i) for i, (h, w, _) in enumerate(cases)]
        self.assertEqual(self.plant(crowns), 5)
        self.assertEqual([self.trees()[(3 + 3 * i, 3)]["kind"] for i in range(5)], [kind for _, _, kind in cases])

    def test_a_crown_holding_a_trunk_gets_none(self):
        # A trunk 2.9 m from the centre of a crown 3.09 m in radius.
        self.assertEqual(self.plant([self.crown([10.5, 10.5])], tree_cells={(13, 10)}), 0)
        self.assertEqual(self.trees(), {})
        # Past its radius it does not count.
        self.assertEqual(self.plant([self.crown([10.5, 10.5], area=20.0)], tree_cells={(13, 10)}), 1)

    def test_the_trunk_keeps_off_taken_unclear_and_crowded_cells(self):
        top = [10.5, 10.5]
        # Its own cell taken, kept clear, blocked, water or reserved: the next cell within reach.
        for kw in ({"occupied": {(10, 10)}}, {"keep_clear": {(10, 10)}}, {"reserved": [(10, 10)]}, {"brush": True}):
            self.props.clear(); self.brush.clear()
            if kw.pop("brush", False):
                self.brush[(1, 1)]["0,0,0"] = [57, False, "woodland-v1"]  # brush already on (10, 10)
            self.assertEqual(self.plant([self.crown(top)], **kw), 1)
            (cell,) = self.trees()
            self.assertNotEqual(cell, (10, 10)); self.assertLessEqual(math.hypot(cell[0] + .5 - 10.5, cell[1] + .5 - 10.5), 1.5451)
        self.props.clear(); self.blocked[10 * 20 + 10] = 1; self.terrain[10 * 20 + 11] = 1
        self.assertEqual(self.plant([self.crown(top)]), 1)
        self.assertNotIn(next(iter(self.trees())), {(10, 10), (11, 10)})
        # No clear cell within reach (half the radius, at least a metre): no tree.
        self.props.clear(); self.blocked[:] = bytearray(400); self.terrain = [0] * 400
        everything = {(x, y) for x in range(8, 14) for y in range(8, 14)}
        self.assertEqual(self.plant([self.crown(top, area=4)], keep_clear=everything), 0)
        # Reach is half the radius: a 3.09 m crown reaches 1.55 m, though cells 2-3 m out are clear.
        within = {(x, y) for x in range(5, 16) for y in range(5, 16) if math.hypot(x + .5 - 10.5, y + .5 - 10.5) <= 1.6}
        self.assertEqual(self.plant([self.crown(top)], keep_clear=within), 0)
        # Only green ground that nothing blocks takes a trunk.
        self.terrain = [1] * 400
        self.assertEqual(self.plant([self.crown(top)]), 0)
        self.terrain = [0] * 400; self.blocked[:] = bytearray([1] * 400)
        self.assertEqual(self.plant([self.crown(top)]), 0)
        self.blocked[:] = bytearray(400)
        # A trunk never stands next to another: trunks on two diagonal cells, outside this
        # 1.13 m crown's radius, crowd every cell within its reach.
        self.props.clear()
        self.assertEqual(self.plant([self.crown(top, area=4, number=1)], tree_cells={(9, 9), (11, 11)}), 0)
        self.assertEqual(self.plant([self.crown(top, area=4, number=1)], tree_cells={(9, 9)}), 1)

    def test_two_crowns_side_by_side_get_trunks_two_metres_apart(self):
        # The second crown's centre lies 4.5 m from the first trunk, past its 3.57 m radius.
        self.assertEqual(self.plant([self.crown([10.5, 10.5], area=40.0, number=0), self.crown([11.5, 10.5], area=40.0, number=1, centre=[15, 10.5])]), 2)
        a, b = sorted(self.trees())
        self.assertGreaterEqual(max(abs(a[0] - b[0]), abs(a[1] - b[1])), 2)

    def test_brush_around_a_new_trunk_in_woods_and_wetland_only(self):
        self.green[:] = bytearray([2] * 400)
        self.assertEqual(self.plant([self.crown([10.5, 10.5])], occupied={(9, 9)}), 1)
        painted = {(c * 10 + int(k.split(",")[0]), r * 10 + int(k.split(",")[1])): v for (c, r), cells in self.brush.items() for k, v in cells.items()}
        self.assertEqual(set(painted), {(x, y) for x in range(8, 13) for y in range(8, 13)} - {(10, 10), (9, 9)})
        self.assertTrue(all(v == [57, False, "woodland-v1"] for v in painted.values()))
        self.brush.clear(); self.props.clear(); self.green[:] = bytearray([1] * 400)
        self.assertEqual(self.plant([self.crown([10.5, 10.5])]), 1)
        self.assertEqual(dict(self.brush), {})

    def test_seeded_plants_stay_exactly_as_they_are(self):
        seeded = {"x": 1, "y": 1, "z": 0, "kind": "tree-broadleaf", "mountDora": {"placement": "seeded"}}
        self.props[(0, 0)].append(seeded)
        before = json.dumps(seeded, sort_keys=True)
        self.assertEqual(self.plant([self.crown([15.5, 15.5])], tree_cells={(1, 1)}, occupied={(1, 1)}), 1)
        self.assertIs(self.props[(0, 0)][0], seeded)
        self.assertEqual(json.dumps(seeded, sort_keys=True), before)


class SurveyEvidence(unittest.TestCase):
    @staticmethod
    def evidence_project(tmp, survey=None, source=False):
        """A project folder holding the committed evidence files, and optionally a survey export and the sources."""
        project = Path(tmp)
        (project / "reference").mkdir()
        for name, kind, _ in BUILDER.EVIDENCE:
            if kind != "survey":
                shutil.copy(BUILDER.PROJECT / "reference" / name, project / "reference" / name)
        if source:
            shutil.copytree(BUILDER.PROJECT / "source", project / "source")
            crowns = project / BUILDER.LIDAR_CROWNS
            crowns.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(BUILDER.PROJECT / BUILDER.LIDAR_CROWNS, crowns)
        if survey is not None:
            (project / "reference" / "house-survey.json").write_text(json.dumps(
                {"kind": "mount-dora-house-survey", "version": 3, "exportedAt": "2026-11-03T00:00:00.000Z", **survey}), "utf-8")
        return project

    def test_a_survey_answer_reaches_a_county_building_beside_its_county_and_lidar_evidence(self):
        """house-survey.json is keyed by game id, so a county- id from the survey queue joins that building's evidence."""
        with tempfile.TemporaryDirectory() as tmp:
            base, _ = BUILDER.load_evidence(self.evidence_project(tmp))
        county = next(f for f in BUILDER.county_buildings()
                      if BUILDER.building_style(f, base)["stories"] == 1 and BUILDER.building_style(f, base)["material"] != "brick")
        answer = {"stories": "2", "wall": "brick", "confidence": "sure", "imageryDate": "2024-03"}
        with tempfile.TemporaryDirectory() as tmp:
            found, inputs = BUILDER.load_evidence(self.evidence_project(tmp, {"answers": {county["id"]: answer}}))
        before, after = BUILDER.building_style(county, base), BUILDER.building_style(county, found)
        self.assertFalse(before["storiesSource"].startswith("survey"))
        self.assertEqual((after["stories"], after["storiesSource"]), (2, "survey:stories 2"))
        self.assertEqual((after["material"], after["materialSource"]), ("brick", "survey:wall brick"))
        self.assertEqual(after["evidence"]["survey"], answer)
        self.assertEqual(after["evidence"]["county"], before["evidence"]["county"])
        self.assertEqual(after["evidence"]["lidar"], before["evidence"]["lidar"])
        self.assertEqual(inputs[-1]["kind"], "survey")
        self.assertEqual(BUILDER.lost_survey_answers(found, BUILDER.county_buildings()), [])

    def test_an_answer_for_a_building_the_town_no_longer_has_is_listed_as_lost_and_the_rest_still_apply(self):
        """A county building can change id when the county data does. Its answer must not vanish quietly, nor stop the build that
        lets the survey page show it for re-keying: project.json lists it as lost, and every other answer still applies."""
        known = BUILDER.county_buildings()[0]["id"]
        with tempfile.TemporaryDirectory() as tmp:
            project = self.evidence_project(tmp, {"answers": {known: {"stories": "2"}, "county-0000000-9": {"stories": "1"}}}, source=True)
            _, manifest, database, _ = BUILDER.build_project(project)
        survey = next(r for r in manifest["generation"]["evidenceInputs"] if r["kind"] == "survey")
        self.assertEqual(survey["lost"], ["county-0000000-9"])
        building = next(f for f in database["features"] if f["id"] == known)
        self.assertEqual(building["nativeProxy"]["storiesSource"], "survey:stories 2")


if __name__ == "__main__":
    unittest.main()
