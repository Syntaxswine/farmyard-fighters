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
            for x,y in cells:
                self.assertNotIn(mapping["terrain"][y][x],("water","floor"))
                self.assertFalse(any(abs(p["x"]-x)<=1 and abs(p["y"]-y)<=1 for p in mapping["props"]))
                self.assertTrue(all(segment_distance([x,y],r["a"],r["b"]) > 1 for r in mapping.get("wallRuns",{}).get("segments",[])))
        self.assertEqual(len({g["id"] for g in roster}), len(roster))
        self.assertEqual(len(roster), 42)
        self.assertEqual({g["weapon"] for g in roster}, {"pistol", "smg", "rifle", "shotgun"})
        self.assertTrue(any(len(g.get("patrol", [])) == 2 for g in roster))
        self.assertTrue(any(len(g.get("patrol", [])) > 2 for g in roster))


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
