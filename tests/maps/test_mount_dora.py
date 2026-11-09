"""Meaningful geometry/provenance/reproduction checks for the native map source."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
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
