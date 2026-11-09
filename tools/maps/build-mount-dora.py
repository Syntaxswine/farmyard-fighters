#!/usr/bin/env python3
"""Deterministic, stdlib-only OSM -> editable Nautilus aft-map-v2 authoring maps.

Coordinates are real metres in the project's WGS84 local tangent plane. Nothing
here executes a donor program, infers interiors or adopts the maps into a game.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict, deque
import hashlib
import html
import json
import math
from pathlib import Path
import re
import importlib.util
import sys

ROOT = Path(__file__).resolve().parents[2]


def load_map_helper(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(f"{name}.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_grid = load_map_helper("mount_dora_grid")
author_buildings, rectify = _grid.author_buildings, _grid.rectify
PROJECT = ROOT / "maps" / "mount-dora"
KINDS = ("ground-grass", "water", "woodland", "ground-dirt", "ground-gravel",
         "ground-asphalt", "ground-concrete", "ground-wood-planks", "bridge", "floor")
CODE = {name: i for i, name in enumerate(KINDS)}
WIDTHS = {"secondary": 8, "tertiary": 7, "residential": 6, "unclassified": 6,
          "service": 3.5, "pedestrian": 4, "cycleway": 2.5, "footway": 2,
          "path": 1.5, "steps": 1.5, "track": 3, "living_street": 5}
STREET_CLASSES = {"secondary", "tertiary", "residential", "unclassified", "living_street"}
STREET_WIDTH = 6
SIDEWALK_WIDTH = 2
STREET_SNAP_LIMIT = 4
PALETTE = {"ground-grass": "#87956c", "water": "#64899a", "woodland": "#426148",
           "ground-dirt": "#bcad83", "ground-gravel": "#b3b0a1", "ground-asphalt": "#676c68",
           "ground-concrete": "#d5cfb8", "ground-wood-planks": "#a28b60", "bridge": "#c3a875", "floor": "#d0c0a1"}
WATER = CODE["water"]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value, pretty=False):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False,
                       indent=2 if pretty else None,
                       separators=None if pretty else (",", ":")) + "\n").encode("utf-8")


class Projection:
    def __init__(self, definition):
        self.definition = definition
        reference = definition["reference"]
        self.p, self.l = map(math.radians, (reference["lat"], reference["lon"]))
        self.a = definition["ellipsoid"]["semiMajorM"]
        self.e2 = definition["ellipsoid"]["eccentricitySquared"]
        self.origin = self.ecef(reference["lat"], reference["lon"])

    def ecef(self, lat, lon):
        p, l = map(math.radians, (lat, lon))
        n = self.a / math.sqrt(1 - self.e2 * math.sin(p) ** 2)
        return n * math.cos(p) * math.cos(l), n * math.cos(p) * math.sin(l), n * (1 - self.e2) * math.sin(p)

    def __call__(self, lat, lon):
        dx, dy, dz = (a - b for a, b in zip(self.ecef(lat, lon), self.origin))
        east = -math.sin(self.l) * dx + math.cos(self.l) * dy
        north = -math.sin(self.p) * math.cos(self.l) * dx - math.sin(self.p) * math.sin(self.l) * dy + math.cos(self.p) * dz
        offset = self.definition["townOffsetM"]
        # Match the survey's 0.1 mm coordinate precision, then place the town.
        return [round(round(east, 4) + offset["x"], 4), round(round(-north, 4) + offset["y"], 4)]


def bounds(points):
    return [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]


def intersects_extent(box, width, depth, padding=0):
    return box[2] + padding >= 0 and box[3] + padding >= 0 and box[0] - padding <= width and box[1] - padding <= depth


def point_in_ring(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def join_members(member_ids, ways):
    """Join complete node-ref chains in either orientation; never close a gap."""
    missing = sorted(i for i in member_ids if i not in ways)
    remaining = [(i, list(ways[i]["nodes"])) for i in sorted(member_ids) if i in ways]
    rings, open_chains = [], []
    while remaining:
        source_id, chain = remaining.pop(0)
        owners = [source_id]
        while chain and chain[0] != chain[-1]:
            match = next(((j, ids if ids[0] == chain[-1] else list(reversed(ids)))
                          for j, (_, ids) in enumerate(remaining)
                          if ids and chain[-1] in (ids[0], ids[-1])), None)
            if match is None:
                break
            index, ids = match
            owners.append(remaining[index][0])
            remaining.pop(index)
            chain.extend(ids[1:])
        (rings if len(chain) >= 4 and chain[0] == chain[-1] else open_chains).append((chain, owners))
    return rings, missing, open_chains


def category(tags):
    if tags.get("natural") == "water" or tags.get("waterway") in ("riverbank", "dock") and tags.get("area") == "yes":
        return "water"
    if tags.get("building") not in (None, "no"):
        return "building"
    if tags.get("highway"):
        return "road"
    if tags.get("amenity") == "parking":
        return "parking"
    if tags.get("natural") == "wood" or tags.get("landuse") == "forest":
        return "wood"
    if tags.get("natural") == "wetland":
        return "wetland"
    if tags.get("natural") == "beach":
        return "beach"
    if tags.get("leisure") in ("park", "garden", "nature_reserve", "playground", "pitch") or tags.get("landuse") in ("grass", "orchard") or tags.get("natural") == "scrub":
        return "park"
    return "context"


def load_source(project=PROJECT):
    source = project / "source"
    config = json.loads((source / "authoring-config.json").read_text("utf-8"))
    projection = Projection(config["projection"])
    objects, provenance, source_records = {}, defaultdict(list), []
    for item in config["sources"]:
        raw = (source / item["file"]).read_bytes()
        metadata = json.loads((source / item["metadata"]).read_text("utf-8"))
        if len(raw) != metadata["bytes"] or sha(raw) != metadata["sha256"]:
            raise ValueError("Source integrity mismatch: " + item["file"])
        source_records.append({"file": "source/" + item["file"], "metadata": "source/" + item["metadata"], "sha256": sha(raw), "bytes": len(raw)})
        for element in json.loads(raw)["elements"]:
            key = (element["type"], element["id"])
            provenance[key].append(item["file"])
            if key not in objects or element.get("version", 0) > objects[key].get("version", 0):
                objects[key] = element
    nodes = {i: e for (kind, i), e in objects.items() if kind == "node"}
    ways = {i: e for (kind, i), e in objects.items() if kind == "way"}
    relations = {i: e for (kind, i), e in objects.items() if kind == "relation"}
    xy = {i: projection(n["lat"], n["lon"]) for i, n in nodes.items()}
    width, depth = config["extent"]["widthM"], config["extent"]["depthM"]
    diagnostics, features, claimed = [], [], set()

    def feature(element, geometry, *, refs=None, members=None):
        kind, osm_id = element["type"], element["id"]
        tags = dict(sorted(element.get("tags", {}).items()))
        coordinates = geometry["coordinates"]
        if geometry["type"] == "Point":
            points = [coordinates]
        elif geometry["type"] == "LineString":
            points = coordinates
        else:
            points = [p for polygon in coordinates for ring in polygon for p in ring]
        if not points or not intersects_extent(bounds(points), width, depth, 16 if tags.get("highway") else 0):
            return
        value = {"id": f"osm-{kind}-{osm_id}", "category": "point" if kind == "node" else category(tags),
                 "osm": {"type": kind, "id": osm_id, "version": element.get("version"), "timestamp": element.get("timestamp"),
                         "sourceFiles": sorted(set(provenance[(kind, osm_id)]))},
                 "tags": tags, "geometry": geometry, "bounds": bounds(points)}
        if refs is not None:
            value["nodeRefs"] = refs
        if members is not None:
            value["members"] = members
        features.append(value)

    for osm_id, relation in sorted(relations.items()):
        tags = relation.get("tags", {})
        if tags.get("type") != "multipolygon" or category(tags) == "context" and not tags.get("landuse"):
            continue
        rings = {}
        problems = []
        for role in ("outer", "inner"):
            ids = [m["ref"] for m in relation["members"] if m["type"] == "way" and m.get("role", "outer") == role]
            chains, missing, opened = join_members(ids, ways)
            if missing or opened:
                problems.append({"role": role, "missingWayIds": missing, "openMemberGroups": [owners for _, owners in opened]})
            for refs, _ in chains:
                if any(i not in xy for i in refs):
                    problems.append({"role": role, "missingNodeIds": [i for i in refs if i not in xy]})
            rings[role] = [[xy[i] for i in refs] for refs, _ in chains if all(i in xy for i in refs)]
        if problems:
            if osm_id == 1163258:
                raise ValueError("The complete Lake Dora boundary is required: " + json.dumps(problems))
            diagnostics.append({"kind": "incomplete-multipolygon", "sourceId": f"osm-relation-{osm_id}", "problems": problems, "policy": "Not filled; original relation remains in source snapshots."})
            continue
        polygons = [[outer] for outer in rings["outer"]]
        for inner in rings["inner"]:
            containers = [p for p in polygons if point_in_ring(inner[0], p[0])]
            if len(containers) != 1:
                raise ValueError(f"Ambiguous multipolygon hole in relation {osm_id}.")
            containers[0].append(inner)
        if polygons:
            feature(relation, {"type": "MultiPolygon", "coordinates": polygons}, members=relation["members"])
            for member in relation["members"]:
                if member["type"] == "way":
                    claimed.add((member["ref"], category(tags)))
    for osm_id, way in sorted(ways.items()):
        tags, refs = way.get("tags", {}), way.get("nodes", [])
        if not tags or not refs:
            continue
        if any(i not in xy for i in refs):
            diagnostics.append({"kind": "incomplete-way", "sourceId": f"osm-way-{osm_id}", "missingNodeIds": [i for i in refs if i not in xy]})
            continue
        if (osm_id, category(tags)) in claimed:
            continue
        points = [xy[i] for i in refs]
        closed = len(refs) >= 4 and refs[0] == refs[-1]
        area = closed and (category(tags) not in ("road", "context") or tags.get("area") == "yes" or tags.get("landuse"))
        feature(way, {"type": "MultiPolygon", "coordinates": [[points]]} if area else {"type": "LineString", "coordinates": points}, refs=refs)
    for osm_id, node in sorted(nodes.items()):
        if node.get("tags"):
            feature(node, {"type": "Point", "coordinates": xy[osm_id]})
    features.sort(key=lambda f: f["id"])
    lake = next((f for f in features if f["id"] == "osm-relation-1163258"), None)
    if not lake or len(lake["members"]) != 4 or len(lake["geometry"]["coordinates"]) != 1:
        raise ValueError("Expected all four original Lake Dora outer members joined into one ring.")
    return config, projection, source_records, features, diagnostics


def polygon_spans(polygons, width, depth):
    """Even/odd scan conversion at global cell centres, with original holes."""
    # Each polygon's holes participate in one parity test. Separate polygons
    # union by painting; no per-cell traversal of the lake's thousands of edges.
    for polygon in polygons:
        rows = defaultdict(list)
        for ring in polygon:
            for a, b in zip(ring, ring[1:]):
                if a[1] == b[1]:
                    continue
                first = max(0, math.ceil(min(a[1], b[1]) - .5))
                last = min(depth, math.ceil(max(a[1], b[1]) - .5))
                slope = (b[0] - a[0]) / (b[1] - a[1])
                for y in range(first, last):
                    rows[y].append(a[0] + (y + .5 - a[1]) * slope)
        for y, values in sorted(rows.items()):
            values.sort()
            if len(values) % 2:
                raise ValueError("A source ring did not produce even scanline crossings.")
            for left, right in zip(values[::2], values[1::2]):
                start, end = max(0, math.ceil(left - .5)), min(width, math.ceil(right - .5))
                if start < end:
                    yield y, start, end


def paint_polygon(grid, polygons, code, width, depth, *, land_only=False, mask=None):
    for y, left, right in polygon_spans(polygons, width, depth):
        start, end = y * width + left, y * width + right
        if not land_only:
            grid[start:end] = bytes([code]) * (end - start)
            if mask is not None:
                mask[start:end] = b"\1" * (end - start)
        else:
            for index in range(start, end):
                if grid[index] != WATER:
                    grid[index] = code
                    if mask is not None:
                        mask[index] = 1


def paint_line(grid, points, width_m, code, width, depth, *, land_only=False, water_code=None, offset=0):
    radius = width_m / 2
    for a, b in zip(points, points[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length2 = dx * dx + dy * dy
        if not length2:
            continue
        if offset:
            length = math.sqrt(length2)
            ox, oy = dy / length * offset, -dx / length * offset
            a, b = [a[0] + ox, a[1] + oy], [b[0] + ox, b[1] + oy]
        x0, x1 = max(0, math.ceil(min(a[0], b[0]) - radius - .5)), min(width - 1, math.floor(max(a[0], b[0]) + radius - .5))
        y0, y1 = max(0, math.ceil(min(a[1], b[1]) - radius - .5)), min(depth - 1, math.floor(max(a[1], b[1]) + radius - .5))
        for y in range(y0, y1 + 1):
            py = y + .5
            for x in range(x0, x1 + 1):
                px = x + .5
                t = max(0, min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / length2))
                if (px - a[0] - t * dx) ** 2 + (py - a[1] - t * dy) ** 2 <= radius * radius:
                    index = y * width + x
                    if not land_only or grid[index] != WATER:
                        grid[index] = water_code if water_code is not None and grid[index] == WATER else code


def road_style(feature):
    tags = feature["tags"]
    highway = tags.get("highway")
    if highway in (None, "proposed", "construction") or tags.get("proposed") or tags.get("construction"):
        return None
    width = None
    raw_width = tags.get("width", "")
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(m|metres?|meters?|ft|feet|')?\s*", raw_width)
    if match:
        width = float(match[1]) * (.3048 if match[2] in ("ft", "feet", "'") else 1)
        if not .5 <= width <= 40:
            width = None
    width_source = "tag:width" if width is not None else "declared-class-default"
    width = width if width is not None else WIDTHS.get(highway, 4)
    surface = tags.get("surface")
    if surface in ("wood", "wood_planks") or tags.get("bridge") == "boardwalk":
        terrain = "ground-wood-planks"
    elif surface in ("concrete", "paved", "paving_stones", "sett") or highway in ("footway", "cycleway", "pedestrian", "steps"):
        terrain = "ground-concrete"
    elif surface in ("gravel", "fine_gravel", "pebblestone"):
        terrain = "ground-gravel"
    elif surface in ("ground", "dirt", "sand", "woodchips", "grass") or highway in ("path", "track"):
        terrain = "ground-dirt"
    else:
        terrain = "ground-asphalt"
    bridge = tags.get("bridge") not in (None, "no", "false", "0")
    return {"widthM": width, "widthSource": width_source, "terrain": terrain, "bridge": bridge,
            "woodSurface": terrain == "ground-wood-planks", "sidewalk": tags.get("sidewalk", "none"),
            "sidewalkWidthM": 1.5, "sidewalkWidthSource": "declared-default-if-mapped-present",
            "verticalPolicy": "Mapped steps/bridges are flat native authoring proxies; no surveyed elevation inferred."}


def author_streets(roads):
    """Straighten near-cardinal runs without pulling shared junctions apart."""
    streets = [f for f in roads if f["tags"]["highway"] in STREET_CLASSES
               and f["geometry"]["type"] == "LineString"]
    fixed = {tuple(p) for f in roads if f["nativeRoad"]["bridge"] or f["nativeRoad"]["woodSurface"]
             if f["geometry"]["type"] == "LineString" for p in f["geometry"]["coordinates"]}
    moves = [{}, {}]
    for axis in range(2):
        links = []
        for street in streets:
            points = street["geometry"]["coordinates"]
            for a, b in zip(points, points[1:]):
                across, along = abs(b[axis] - a[axis]), abs(b[1-axis] - a[1-axis])
                if along and across <= along * .2 and tuple(a) not in fixed and tuple(b) not in fixed:
                    links.append((along, tuple(a), tuple(b)))
        parent, ranges = {}, {}

        def root(point):
            parent.setdefault(point, point)
            while point != parent[point]:
                parent[point] = parent[parent[point]]
                point = parent[point]
            return point

        # Fit longer segments first. Each group needs a common integer line
        # inside every member's allowed displacement.
        for _, a, b in sorted(links, reverse=True):
            first, second = root(a), root(b)
            low_a, high_a = ranges.get(first, (first[axis], first[axis]))
            low_b, high_b = ranges.get(second, (second[axis], second[axis]))
            low, high = min(low_a, low_b), max(high_a, high_b)
            line = round((low + high) / 2)
            if max(line - low, high - line) <= STREET_SNAP_LIMIT:
                parent[second] = first
                ranges[first] = (low, high)
        for point in parent:
            leader = root(point)
            if leader in ranges:
                low, high = ranges[leader]
                moves[axis][point] = round((low + high) / 2)

    for feature in roads:
        if feature["geometry"]["type"] != "LineString":
            continue
        points = feature["geometry"]["coordinates"]
        style = feature["nativeRoad"]
        line = [[moves[axis].get(tuple(point), point[axis]) for axis in range(2)] for point in points]
        if line != points:
            style["centerline"] = line
        if feature["tags"]["highway"] in STREET_CLASSES:
            style.update(widthM=STREET_WIDTH, widthSource="standard-game-street",
                         sidewalk="both", sidewalkWidthM=SIDEWALK_WIDTH,
                         sidewalkWidthSource="standard-game-street")


def paint_roads(terrain, roads, width, depth):
    # All sidewalks go down before carriageways so intersections stay open.
    for feature in roads:
        style, geometry = feature["nativeRoad"], feature["geometry"]
        if geometry["type"] != "LineString":
            continue
        points = style.get("centerline", geometry["coordinates"])
        sidewalk = style["sidewalk"]
        sides = (-1, 1) if sidewalk in ("yes", "both") else (1,) if sidewalk == "left" else (-1,) if sidewalk == "right" else ()
        walk_width = style["sidewalkWidthM"]
        if len(sides) == 2 and style["widthSource"] == "standard-game-street":
            # One outer ribbon keeps sidewalks joined at bends.
            paint_line(terrain, points, style["widthM"] + 2 * walk_width,
                       CODE["ground-concrete"], width, depth, land_only=True)
        else:
            for side in sides:
                paint_line(terrain, points, walk_width, CODE["ground-concrete"], width, depth,
                           land_only=True, offset=side * (style["widthM"] + walk_width) / 2)
    for feature in sorted(roads, key=lambda f: f["nativeRoad"]["widthSource"] == "standard-game-street"):
        style, geometry = feature["nativeRoad"], feature["geometry"]
        if geometry["type"] == "MultiPolygon":
            paint_polygon(terrain, geometry["coordinates"], CODE[style["terrain"]], width, depth, land_only=not style["bridge"])
        else:
            bridge, wooden = style["bridge"], style["woodSurface"]
            paint_line(terrain, style.get("centerline", geometry["coordinates"]), style["widthM"],
                       CODE["bridge"] if bridge else CODE[style["terrain"]], width, depth,
                       land_only=not (bridge or wooden), water_code=CODE["bridge"] if wooden else None)


def street_corridor(roads, width, depth):
    corridor = bytearray(width * depth)
    for feature in roads:
        style, geometry = feature["nativeRoad"], feature["geometry"]
        if style["widthSource"] != "standard-game-street" or geometry["type"] != "LineString":
            continue
        points = style.get("centerline", geometry["coordinates"])
        width_with_walks = style["widthM"] + 2 * style["sidewalkWidthM"]
        paint_line(corridor, points, width_with_walks, 1, width, depth)
    return corridor


EVIDENCE = (("house-reference.json", "county", "Lake County Property Appraiser tax roll and building sketches"),
            ("lidar-roofs.json", "lidar", "USGS 3DEP lidar FL_Peninsular_Lake_2018"),
            ("county-buildings.json", "countyBuildings", "County building sketches OpenStreetMap lacks, placed on the 2018 lidar roofs"),
            ("house-survey.json", "survey", "A person viewing Google Maps Street View; no imagery stored"))
# Survey wall finishes the native kit can draw; storefront glass keeps the record's material.
SURVEY_WALLS = {"wood-siding": "wood", "other-siding": "wood", "brick": "brick", "stucco": "concrete", "block": "concrete", "stone": "concrete"}
SURVEY_STORIES = {"1": (1, False), "1.5": (1, True), "2": (2, False), "2.5": (2, True), "3": (3, False), "4": (4, False)}


def load_evidence(project=PROJECT):
    """Per-building county, lidar and survey facts from maps/mount-dora/reference.

    The survey export is optional; the others are required. Each file is pinned
    by SHA-256 in project.json. They pin only the OSM-sourced fields of
    features.json they read, so writing nativeProxy, the authored outlines and
    the county buildings here never invalidates them.
    """
    found, inputs = defaultdict(dict), []
    for name, key, source in EVIDENCE:
        path = project / "reference" / name
        if not path.exists():
            if key == "survey":
                continue
            raise ValueError("Missing building evidence: reference/" + name)
        raw = path.read_bytes()
        doc = json.loads(raw)
        record = {"file": "reference/" + name, "kind": key, "source": source, "sha256": sha(raw), "bytes": len(raw)}
        if key == "county":
            record["release"] = doc["inputs"]["county"]["release"]
            for item in doc["buildings"]:
                found[item["id"]]["county"] = item
        elif key == "lidar":
            record["acquired"] = doc["collection"]["acquired"]["days"]
            for item in doc["buildings"]:
                found[item["id"]]["lidar"] = item
        elif key == "countyBuildings":
            # Each carries county facts and a lidar record shaped like the
            # game buildings' own, so building_style treats them alike.
            record["buildings"] = len(doc["buildings"])
            for item in doc["buildings"]:
                found[item["id"]]["county"] = item["county"]
                found[item["id"]]["lidar"] = item["lidar"]
        else:
            record["exportedAt"] = doc["exportedAt"]
            for item_id, answer in doc["answers"].items():
                found[item_id]["survey"] = answer
        inputs.append(record)
    return found, inputs


def county_buildings(project=PROJECT):
    """Buildings the county sketched that OpenStreetMap lacks.

    reference/county-buildings.json places each sketch on its lidar roof and
    merges a structure's sketches (stacked or attached units) into one outline,
    in the same town metres as the OSM outlines. They join the town as
    buildings with no OSM tags; `county` says where each came from.
    """
    doc = json.loads((project / "reference" / "county-buildings.json").read_text("utf-8"))
    features = []
    for item in doc["buildings"]:
        records = item["county"]["county"]["records"]
        points = [p for polygon in item["geometry"]["coordinates"] for ring in polygon for p in ring]
        features.append({"id": item["id"], "category": "building",
                         "county": {"source": "reference/county-buildings.json", "sketches": [m["key"] for m in item["members"]],
                                    "style": records[0]["style"] if records else None, "lidarSaw": item["lidarSaw"],
                                    "roofShare": item["roofShare"], "clippedByGameM2": item["clippedByGameM2"]},
                         "tags": {}, "geometry": item["geometry"], "bounds": bounds(points)})
    return features


def lost_survey_answers(evidence, features):
    """Survey answers keyed to no building in the town.

    building_style looks answers up by building id, so these apply to nothing:
    the building is gone, or its id changed (a county building's can when the
    county data does). build_project lists them in project.json and warns,
    rather than refusing, so the regenerated town and house reference let the
    survey page show them for re-keying or dropping.
    """
    known = {f["id"] for f in features if f["category"] == "building"}
    return sorted(item_id for item_id, found in evidence.items() if "survey" in found and item_id not in known)


def building_style(feature, evidence=None):
    """Storeys and wall material, from the best evidence available.

    Storeys: a survey answer, then the mapper's building:levels tag, then the
    county record, then lidar, then the one-storey kit default. County STORIES
    is unreliable for some commercial records (the three-storey Shamrock
    Building is recorded as 1), so a mapped tag outranks it. Where county and
    lidar disagree the disagreement is kept for a survey to settle.
    """
    tags = feature["tags"]
    found = (evidence or {}).get(feature["id"], {})
    county, lidar, survey = found.get("county"), found.get("lidar"), found.get("survey") or {}
    raw = tags.get("building:levels", "")
    suggested = county["suggested"] if county else {}
    half = False
    if survey.get("stories") in SURVEY_STORIES:
        (stories, half), stories_source = SURVEY_STORIES[survey["stories"]], "survey:stories " + survey["stories"]
    elif re.fullmatch(r"[1-5]", raw):
        stories, stories_source = int(raw), "tag:building:levels"
    elif suggested.get("stories"):
        stories, half, stories_source = suggested["stories"], suggested["halfStory"], suggested["storiesSource"]
    elif lidar and lidar.get("storeysFromLidar"):
        stories, stories_source = min(5, lidar["storeysFromLidar"]), "lidar:eave %.2f m" % lidar["eaveM"]
    else:
        stories, stories_source = 1, "unsurveyed-one-story-kit-proxy"
    material = tags.get("building:material")
    tagged_material = material in ("wood", "timber", "concrete", "cement", "brick")
    if survey.get("wall") in SURVEY_WALLS:
        material, material_source = SURVEY_WALLS[survey["wall"]], "survey:wall " + survey["wall"]
    elif tagged_material:
        material = "wood" if material in ("wood", "timber") else "concrete" if material in ("concrete", "cement") else "brick"
        material_source = "tag:building:material"
    elif suggested.get("material"):
        material, material_source = suggested["material"], suggested["materialSource"]
    else:
        material, material_source = "brick", "unsurveyed-native-kit-proxy"
    style = {"stories": stories, "storiesSource": stories_source, "material": material, "materialSource": material_source,
             "wallHeightM": 2, "slabM": .12, "floorPitchM": 2.12,
             "interiors": "not-surveyed; closed exterior proxy; no invented doors, stairs or room partitions"}
    if half:
        style["halfStory"] = True
    record = {}
    if county:
        first = county["county"]["records"][0] if county["county"]["records"] else {}
        record["county"] = {"match": county["match"]["method"], "iou": county["match"].get("iou"),
                            "altKey": first.get("altKey"), "bldgNum": first.get("bldgNum"), "wall": first.get("wall"),
                            "roofCover": suggested.get("roofCover"), "roofPitch": suggested.get("roofPitch"), "yearBuilt": suggested.get("yearBuilt"),
                            "porchM2": suggested.get("porchM2"), "garage": suggested.get("garage")}
    if lidar:
        roof = lidar.get("roof") or {}
        record["lidar"] = {"storeys": lidar.get("storeysFromLidar"), "eaveM": lidar.get("eaveM"), "ridgeM": lidar.get("ridgeM"),
                           "roofForm": roof.get("form"), "roofConfidence": roof.get("confidence"), "pitchDeg": roof.get("pitchDeg"),
                           "ridgeBearingDeg": roof.get("ridgeBearingDeg")}
    if survey:
        record["survey"] = dict(sorted(survey.items()))
    county_stories, lidar_stories = suggested.get("stories"), lidar and lidar.get("storeysFromLidar")
    if county_stories and lidar_stories and county_stories != lidar_stories:
        record["storiesDisagreement"] = {"county": county_stories, "lidar": lidar_stories}
    if record:
        style["evidence"] = record
    return style


def clip_segment(a, b, width, depth):
    dx, dy, lo, hi = b[0] - a[0], b[1] - a[1], 0., 1.
    for p, q in ((-dx, a[0]), (dx, width - a[0]), (-dy, a[1]), (dy, depth - a[1])):
        if abs(p) < 1e-15:
            if q < 0:
                return None
        elif p < 0:
            lo = max(lo, q / p)
        else:
            hi = min(hi, q / p)
        if lo > hi:
            return None
    return [a[0] + lo * dx, a[1] + lo * dy], [a[0] + hi * dx, a[1] + hi * dy]


def deduplicated_walls(buildings):
    """Exact collinear interval union; shared party walls retain every owner."""
    groups = defaultdict(list)
    for feature in buildings:
        for polygon in feature["geometry"]["coordinates"]:
            for ring in polygon:
                for a, b in zip(ring, ring[1:]):
                    ax, ay, bx, by = (round(n * 10000) for n in (*a, *b))
                    dx, dy = bx - ax, by - ay
                    if not dx and not dy:
                        continue
                    divisor = math.gcd(dx, dy)
                    ux, uy = dx // divisor, dy // divisor
                    if ux < 0 or ux == 0 and uy < 0:
                        ux, uy = -ux, -uy
                    constant = ux * ay - uy * ax
                    norm = math.hypot(ux, uy)
                    vx, vy = ux / norm, uy / norm
                    ta, tb = (a[0] * vx + a[1] * vy), (b[0] * vx + b[1] * vy)
                    groups[(ux, uy, constant)].append((min(ta, tb), max(ta, tb), feature["id"], a, vx, vy))
    styles = {f["id"]: f["nativeProxy"] for f in buildings}
    result = []
    for key, segments in sorted(groups.items()):
        stops = sorted({round(t, 9) for s in segments for t in s[:2]})
        active = []
        for left, right in zip(stops, stops[1:]):
            if right - left < 1e-8:
                continue
            owners = sorted({s[2] for s in segments if s[0] < (left + right) / 2 < s[1]})
            if not owners:
                continue
            if active and active[-1][2] == owners and abs(active[-1][1] - left) < 1e-8:
                active[-1] = (active[-1][0], right, owners)
            else:
                active.append((left, right, owners))
        _, _, _, a, vx, vy = segments[0]
        base = a[0] * vx + a[1] * vy
        for left, right, owners in active:
            start = [a[0] + (left - base) * vx, a[1] + (left - base) * vy]
            end = [a[0] + (right - base) * vx, a[1] + (right - base) * vy]
            result.append({"id": "wall-" + sha(encoded([key, left, right]))[:18], "a": start, "b": end,
                           "owners": owners, "stories": max(styles[o]["stories"] for o in owners),
                           "material": styles[owners[0]]["material"]})
    return result


def sector_id(column, row):
    return chr(65 + column) + f"{row + 1:02d}"


def split_walls(walls, extent, diagnostics):
    size, width, depth = extent["sectorSizeM"], extent["widthM"], extent["depthM"]
    pieces = defaultdict(list)
    for wall in walls:
        clipped = clip_segment(wall["a"], wall["b"], width, depth)
        if not clipped:
            continue
        a, b = clipped
        dx, dy = b[0] - a[0], b[1] - a[1]
        cuts = {0., 1.}
        if abs(dx) > 1e-12:
            cuts.update((x - a[0]) / dx for x in range(size, width, size) if 0 < (x - a[0]) / dx < 1)
        if abs(dy) > 1e-12:
            cuts.update((y - a[1]) / dy for y in range(size, depth, size) if 0 < (y - a[1]) / dy < 1)
        ordered = sorted(cuts)
        part = 0
        for left, right in zip(ordered, ordered[1:]):
            length = math.hypot(dx, dy) * (right - left)
            divisions = max(1, math.ceil(length / 64))
            for i in range(divisions):
                lo, hi = left + (right - left) * i / divisions, left + (right - left) * (i + 1) / divisions
                start = [round(a[0] + dx * lo, 6), round(a[1] + dy * lo, 6)]
                end = [round(a[0] + dx * hi, 6), round(a[1] + dy * hi, 6)]
                col = min(extent["columns"] - 1, max(0, int((start[0] + end[0]) / 2 // size)))
                row = min(extent["rows"] - 1, max(0, int((start[1] + end[1]) / 2 // size)))
                sid, part = sector_id(col, row), part + 1
                actual = math.dist(start, end)
                if actual < 1e-6:
                    continue  # An outline tangent to the outer crop has no wall inside it.
                if actual < .1 - 1e-6:
                    diagnostics.append({"kind": "wall-sliver-below-native-minimum", "sourceWallId": wall["id"], "sourceBuildingIds": wall["owners"], "sectorId": sid, "a": start, "b": end, "lengthM": actual})
                    continue
                pieces[sid].append({"id": f"md-{wall['id']}-{part}", "a": [round(start[0] - col * size - .5, 6), round(start[1] - row * size - .5, 6)],
                                    "b": [round(end[0] - col * size - .5, 6), round(end[1] - row * size - .5, 6)],
                                    "z": 0, "stories": wall["stories"], "material": wall["material"],
                                    "sourceBuildingIds": wall["owners"], "sourceWallId": wall["id"]})
    return pieces


def vegetation_clearings():
    # Keep the launch point, source-reviewed visit approaches, and the
    # Donnelly four-sector crossing clear of decorative brush and tree trunks.
    approaches = ((459, 500), (477, 484), (336, 810), (469, 1004), (504, 1168),
                  (737, 1181), (529, 1402), (665, 1296), (433, 635), (414, 480),
                  (481, 598), (328, 687), (479, 479))
    clear = {(x + dx, y + dy) for x, y in approaches for dx in range(-3, 4) for dy in range(-3, 4)}
    clear.update((x, y) for x in range(458, 491) for y in range(506, 511))
    return clear


def preview_anchors(terrain, blocked, props, origin, size, width):
    ox, oy = origin
    occupied = {(p["x"], p["y"]) for p in props}
    eligible = bytearray(size * size)
    for y in range(1, size - 1):
        for x in range(1, size - 1):
            index = (oy + y) * width + ox + x
            if terrain[index] not in (WATER, CODE["floor"]) and not blocked[index] and not any((x + dx, y + dy) in occupied for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                eligible[y * size + x] = 1
    # A five-cell flood produces connected existing floor, even on narrow land.
    for index, valid in enumerate(eligible):
        if not valid:
            continue
        queue, seen = deque([index]), {index}
        eligible[index] = 0
        cluster = []
        while queue and len(cluster) < 5:
            current = queue.popleft()
            cluster.append(current)
            x, y = current % size, current // size
            for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                nx, ny = x + dx, y + dy
                nxt = ny * size + nx
                if 0 <= nx < size and 0 <= ny < size and eligible[nxt] and nxt not in seen:
                    eligible[nxt] = 0
                    seen.add(nxt)
                    queue.append(nxt)
        if len(cluster) == 5:
            return [{"x": i % size, "y": i // size, "z": 0} for i in cluster]
    return []


def render_atlas(features, config):
    extent = config["extent"]
    width, depth = extent["widthM"], extent["depthM"]
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {depth}" role="img" aria-label="Mount Dora native map atlas">',
           '<title>Mount Dora — playable layout, local metres</title>', '<desc>OpenStreetMap contributors. Editable geographic authoring approximation.</desc>',
           f'<defs><clipPath id="extent"><rect width="{width}" height="{depth}"/></clipPath></defs>', f'<rect width="{width}" height="{depth}" fill="{PALETTE["ground-grass"]}"/>', '<g clip-path="url(#extent)">']
    def paths(polygons):
        return " ".join("M" + " L".join(f"{p[0]},{p[1]}" for p in ring) + " Z" for polygon in polygons for ring in polygon)
    for kind, color in (("park", "#9ea77a"), ("wood", PALETTE["woodland"]), ("wetland", "#849476"), ("beach", "#d0bf8e"), ("parking", PALETTE["ground-asphalt"]), ("water", PALETTE["water"])):
        for feature in features:
            if feature["category"] == kind and feature["geometry"]["type"] == "MultiPolygon":
                out.append(f'<path d="{paths(feature["geometry"]["coordinates"])}" fill="{color}" fill-rule="evenodd"/>')
    roads = [f for f in features if f.get("nativeRoad") and f["geometry"]["type"] == "LineString"]

    def road_line(feature, color, width_m):
        style = feature["nativeRoad"]
        points = " ".join(f"{p[0]},{p[1]}" for p in style.get("centerline", feature["geometry"]["coordinates"]))
        return f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="{width_m}" stroke-linecap="round" stroke-linejoin="round"/>'

    for feature in roads:
        style = feature["nativeRoad"]
        if style["widthSource"] == "standard-game-street":
            out.append(road_line(feature, PALETTE["ground-concrete"], style["widthM"] + 2 * style["sidewalkWidthM"]))
    for feature in sorted(roads, key=lambda f: f["nativeRoad"]["widthSource"] == "standard-game-street"):
        style = feature.get("nativeRoad")
        out.append(road_line(feature, PALETTE["bridge"] if style["bridge"] else PALETTE[style["terrain"]], style["widthM"]))
    for feature in features:
        if feature["category"] == "building" and feature["geometry"]["type"] == "MultiPolygon":
            out.append(f'<path d="{paths(feature["geometry"]["coordinates"])}" fill="{PALETTE["floor"]}" stroke="#6c6254" stroke-width=".6" fill-rule="evenodd"/>')
    out.append('</g><g fill="none" stroke="#f6f0d8" stroke-width="1.2" opacity=".8">')
    for x in range(0, width + 1, extent["sectorSizeM"]):
        out.append(f'<path d="M{x},0 V{depth}"/>')
    for y in range(0, depth + 1, extent["sectorSizeM"]):
        out.append(f'<path d="M0,{y} H{width}"/>')
    out.append('</g><g font-family="monospace" font-size="14" fill="#fff7df" stroke="#26372e" stroke-width=".4" paint-order="stroke">')
    for row in range(extent["rows"]):
        for col in range(extent["columns"]):
            out.append(f'<text x="{col * 240 + 8}" y="{row * 240 + 20}">{sector_id(col,row)}</text>')
    for item in config.get("landmarkOverrides", []):
        point = item.get("town", item.get("townMetres", item.get("expectedTownM")))
        if isinstance(point, dict):
            point = [point["x"], point["y"]]
        if point:
            out.append(f'<text x="{point[0]}" y="{point[1]}">{html.escape(item.get("label", item.get("name", "Landmark")))}</text>')
    out.append('</g><g font-family="sans-serif" font-size="14" fill="#243d36">')
    out.append(f'<rect x="0" y="{depth - 27}" width="{width}" height="27" fill="#ede7d3" opacity=".94"/>')
    out.append(f'<text x="12" y="{depth - 9}">OpenStreetMap contributors · ODbL 1.0 · https://www.openstreetmap.org/copyright · 240 m sectors</text>')
    out.append('</g></svg>\n')
    return "\n".join(out).encode("utf-8")


def build_project(project=PROJECT):
    config, projection, source_records, features, diagnostics = load_source(project)
    evidence, evidence_inputs = load_evidence(project)
    features = sorted(features + county_buildings(project), key=lambda f: f["id"])
    lost = lost_survey_answers(evidence, features)
    for record in evidence_inputs:
        if record["kind"] == "survey":
            record["lost"] = lost
    if lost:
        print("warning: reference/house-survey.json answers %d building id(s) the town no longer has, and they apply to nothing: %s. "
              "project.json lists them as lost. Re-key or drop each in the survey page, then export again." % (len(lost), ", ".join(lost)),
              file=sys.stderr)
    extent = config["extent"]
    width, depth, size = extent["widthM"], extent["depthM"], extent["sectorSizeM"]
    if width != 1440 or depth != 1680 or size != 240 or extent["columns"] != 6 or extent["rows"] != 7:
        raise ValueError("This authoring extent is the agreed 42 native sectors.")
    terrain = bytearray(width * depth)
    green = bytearray(width * depth)
    source_water = bytearray(width * depth)
    buildings, roads = [], []
    for feature in features:
        if feature["category"] == "road":
            style = road_style(feature)
            if style:
                feature["nativeRoad"] = style
                roads.append(feature)
            else:
                feature["nativeOmission"] = "Proposed/construction road; retained as source, not painted."
        elif feature["category"] == "building" and feature["geometry"]["type"] == "MultiPolygon":
            feature["nativeProxy"] = building_style(feature, evidence)
            buildings.append(feature)
    for feature in features:
        if feature["category"] == "water" and feature["geometry"]["type"] == "MultiPolygon":
            paint_polygon(terrain, feature["geometry"]["coordinates"], WATER, width, depth)
    source_water[:] = bytes(1 if value == WATER else 0 for value in terrain)
    for feature in features:
        if feature["tags"].get("landuse") == "residential" and feature["geometry"]["type"] == "MultiPolygon":
            for y, left, right in polygon_spans(feature["geometry"]["coordinates"], width, depth):
                green[y * width + left:y * width + right] = bytes([4]) * (right - left)
    for kind, value, greenery in (("park", CODE["ground-grass"], 1), ("wood", CODE["woodland"], 2), ("wetland", CODE["ground-grass"], 3), ("beach", CODE["ground-dirt"], 0), ("parking", CODE["ground-asphalt"], 0)):
        for feature in features:
            if feature["category"] == kind and feature["geometry"]["type"] == "MultiPolygon":
                polygons = feature["geometry"]["coordinates"]
                paint_polygon(terrain, polygons, value, width, depth, land_only=True)
                if greenery:
                    for y, left, right in polygon_spans(polygons, width, depth):
                        for index in range(y * width + left, y * width + right):
                            if terrain[index] != WATER:
                                green[index] = greenery
    # A pitch can be nested in a park polygon. It must not inherit the park's
    # procedural trees, and hard courts need a visible existing ground proxy.
    # Keep overlapping/historical source polygons; do not invent court markings.
    for feature in features:
        if feature["tags"].get("leisure") != "pitch" or feature["geometry"]["type"] != "MultiPolygon":
            continue
        tags = feature["tags"]
        surface = {"asphalt": "ground-asphalt", "concrete": "ground-concrete",
                   "clay": "ground-dirt", "grass": "ground-grass"}.get(tags.get("surface"))
        source = "mapped-surface-tag" if surface else "existing-grass-blockout"
        if not surface and tags.get("sport") in ("tennis", "pickleball"):
            surface, source = "ground-asphalt", "declared-hard-court-proxy"
        feature["nativeSportsSurface"] = {"terrain": surface or "ground-grass", "source": source,
                                           "proceduralGreenery": False, "courtMarkings": False,
                                           "note": "Mapped sport polygons, not a current court inventory or surveyed surfacing."}
        polygons = feature["geometry"]["coordinates"]
        if surface:
            paint_polygon(terrain, polygons, CODE[surface], width, depth, land_only=True)
        for y, left, right in polygon_spans(polygons, width, depth):
            green[y * width + left:y * width + right] = bytes(right - left)
    terrain_without_roads = bytes(terrain)
    paint_roads(terrain, roads, width, depth)
    # A county building stands on its 2018 lidar roof. Where the mapped Lake
    # Dora shoreline runs through one, its outline already supports itself
    # over that water, as a mapped footprint may; let the one-metre fit also
    # take the water cells touching it. Only the fit sees this; nothing is
    # painted as land.
    fit_terrain = bytearray(terrain)
    for feature in buildings:
        if "county" in feature:
            for x, y in _grid.cells(feature["geometry"]["coordinates"]):
                for nx in range(max(0, x - 3), min(width, x + 4)):
                    for ny in range(max(0, y - 3), min(depth, y + 4)):
                        if fit_terrain[ny * width + nx] == WATER:
                            fit_terrain[ny * width + nx] = CODE["ground-grass"]
    terrain[:] = terrain_without_roads
    author_streets(roads)
    paint_roads(terrain, roads, width, depth)
    # Preserve the source fit for paths, water and adjoining buildings, and
    # reserve the full playable street and sidewalk ribbon for every footprint.
    corridor = street_corridor(roads, width, depth)
    authored = author_buildings(buildings, deduplicated_walls(buildings), fit_terrain, CODE,
                                config["buildingGrid"], street_corridor=corridor, street_fit_terrain=terrain)
    # A mapped shelter deck supplies support over water, never invented land.
    structures = []
    for source_id in ('osm-way-557051211', 'osm-way-557154683', 'osm-way-557154684'):
        source = next(f for f in features if f['id'] == source_id)
        polygons, _ = rectify([[source['geometry']['coordinates']]])
        if source_id == 'osm-way-557051211':
            polygons = [[[[562,1383],[569,1383],[569,1389],[562,1389],[562,1383]]]]
        structures.append({'id':'md:shelter:'+source_id.removeprefix('osm-way-'), 'sourceIds':[source_id],
                           'geometry':{'type':'MultiPolygon','coordinates':polygons}})
    for ident, source_id, box in (('md:donnelly-stage','osm-way-468920884',[472,482,485,487]),
                                  ('md:evans-pavilion','osm-way-486656245',[466,1002,474,1008])):
        x0,y0,x1,y1 = box
        structures.append({'id':ident,'sourceIds':[source_id],'geometry':{'type':'MultiPolygon',
                           'coordinates':[[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]]]}})
    authored['structures'] = structures
    layout_digest = sha(encoded(authored))
    authored_by_id = {record['id']: record for record in authored['records']}
    for feature in buildings:
        record = authored_by_id[feature['id']]
        feature['geographicGeometry'] = feature['geometry']
        feature['geographicBounds'] = feature['bounds']
        feature['geometry'] = record['geometry']
        feature['bounds'] = record['bounds']
        feature['authoredLayoutSHA256'] = layout_digest
    upper = defaultdict(dict)
    building_cells = defaultdict(int)
    sector_buildings = defaultdict(set)
    for feature in buildings:
        stories = feature["nativeProxy"]["stories"]
        sectors = set()
        for y, left, right in polygon_spans(feature["geometry"]["coordinates"], width, depth):
            for x in range(left, right):
                if corridor[y * width + x]:
                    raise ValueError("Authored footprint occupies a public street corridor: " + feature["id"])
                terrain[y * width + x] = CODE["floor"]
                sid = sector_id(x // size, y // size)
                sectors.add(sid)
                sector_buildings[sid].add(feature["id"])
                building_cells[feature["id"]] += 1
                for layer in range(1, stories + 1):
                    upper[(sid, layer)][f"{x % size},{y % size}"] = "floor"
        feature["nativeSectors"] = sorted(sectors)
        feature["nativeFloorCells"] = building_cells[feature["id"]]
        if not sectors:
            diagnostics.append({"kind": "building-below-raster-resolution-or-outside", "sourceId": feature["id"], "policy": "Footprint/walls retained; no raster cell centre lies inside."})
    for structure in structures:
        for y, left, right in polygon_spans(structure['geometry']['coordinates'], width, depth):
            for x in range(left, right):
                index = y * width + x
                if corridor[index]:
                    raise ValueError("Authored shelter occupies a public street corridor: " + structure["id"])
                if terrain[index] == CODE['floor']:
                    raise ValueError('Grid shelter overlaps a closed building: ' + structure['id'])
                terrain[index] = CODE['bridge'] if source_water[index] else CODE['ground-wood-planks']
                green[index] = 0
    walls = deduplicated_walls(buildings)
    wall_pieces = split_walls(walls, extent, diagnostics)
    # A source boundary can enter a neighbouring sector by less than one cell.
    # Preserve its global building identity there even when no floor sample fits.
    for sid, runs in wall_pieces.items():
        for run in runs:
            sector_buildings[sid].update(run["sourceBuildingIds"])
    for feature in buildings:
        feature["nativeSectors"] = sorted(sid for sid, owners in sector_buildings.items() if feature["id"] in owners)
    blocked = bytearray(width * depth)
    for wall in walls:
        paint_line(blocked, [wall["a"], wall["b"]], 2.6, 1, width, depth)
    vegetation = load_map_helper("mount_dora_foliage")
    props_by_sector, foliage_by_sector, tree_cells = vegetation.build_vegetation(
        features, terrain, green, blocked, width, depth, size, CODE, sector_id,
        reserved=vegetation_clearings())
    sector_positions = [(col, row) for row in range(extent["rows"]) for col in range(extent["columns"])]
    anchors_by_sector = {}
    for col, row in sector_positions:
        props = props_by_sector.get(sector_id(col, row), [])
        anchors_by_sector[col, row] = preview_anchors(terrain, blocked, props, (col * size, row * size), size, width)
    patrols = load_map_helper("mount_dora_patrols")
    guards_by_sector = patrols.author_guards(
        terrain, blocked, tree_cells, roads, {cell for cell, anchors in anchors_by_sector.items() if anchors},
        width=width, depth=depth, size=size, code=CODE, anchors_by_sector=anchors_by_sector)
    outputs, sectors = {'authored-buildings.json': encoded(authored)}, []
    config_digest = sha((project / "source" / "authoring-config.json").read_bytes())
    digest = sha(encoded(source_records))
    for row in range(extent["rows"]):
        for col in range(extent["columns"]):
            sid, ox, oy = sector_id(col, row), col * size, row * size
            cells = b"".join(terrain[(oy + y) * width + ox:(oy + y) * width + ox + size] for y in range(size))
            counts = Counter(cells)
            runs = sorted(wall_pieces[sid], key=lambda r: r["id"])
            props = sorted(props_by_sector.get(sid, []), key=lambda p: (p["y"], p["x"], p["kind"]))
            foliage = foliage_by_sector.get(sid, {})
            anchors = anchors_by_sector[col, row]
            guards = guards_by_sector.get((col, row), [])
            levels = max(3, max((run["stories"] + 1 for run in runs), default=3),
                         max((layer + 1 for key_sid, layer in upper if key_sid == sid), default=3))
            mapping = {"version": 2, "width": size, "height": size, "levels": levels, "name": f"Mount Dora {sid} - native authoring sector",
                       "terrain": [[KINDS[value] for value in cells[y * size:(y + 1) * size]] for y in range(size)],
                       "upper": [upper.get((sid, z), {}) for z in range(1, levels)], "edges": {}, "stairs": [], "climbs": [], "props": props,
                       "starts": anchors[:4], "guards": guards, "exits": anchors[4:],
                       "mountDora": {"version": 1, "projectId": config["id"], "sectorId": sid, "originM": {"x": ox, "y": oy},
                                     "sourceDigest": digest, "authoredLayoutSHA256": layout_digest, "buildingIds": sorted(sector_buildings[sid]),
                                     "previewAnchors": "Authoring-validator markers on existing connected land; not real spawn/extraction locations.",
                                     "buildingPolicy": "Grid-generalized footprints from retained geographic source; closed native-kit exteriors; no cut-boundary cap walls."}}
            if runs:
                mapping["wallRuns"] = {"version": 1, "segments": runs}
            if foliage:
                mapping["foliage"] = foliage
            filename = f"sectors/{sid}.map.json"
            data = encoded(mapping)
            if len(data) > 4000000 or len(runs) > 4096 or sum(math.ceil(math.dist(r["a"], r["b"]) - 1e-9) * r["stories"] for r in runs) > 50000:
                raise ValueError(f"Native document budget exceeded in {sid}.")
            outputs[filename] = data
            ready = len(anchors) == 5
            native_import = {"ready": ready}
            if not ready:
                native_import.update({"reason": "Existing native validator requires four distinct walkable starts and one walkable travel marker; this sector has no five safe connected existing land cells. Water is preserved without fake platforms.",
                                      "validatorRefusal": "Place exactly four valid squad starts."})
            metrics = {"terrainCells": size * size, "terrainCounts": {KINDS[k]: v for k, v in sorted(counts.items())}, "terrainSHA256": sha(cells),
                       "sourceWaterCells": sum(source_water[(oy + y) * width + ox:(oy + y) * width + ox + size].count(1) for y in range(size)),
                       "buildingCount": len(sector_buildings[sid]), "wallRunCount": len(runs), "nativePanelCount": sum(math.ceil(math.dist(r["a"], r["b"]) - 1e-9) * r["stories"] for r in runs),
                       "propCount": len(props), "foliageCells": len(foliage), "bytes": len(data), "sha256": sha(data)}
            sectors.append({"id": sid, "column": col, "row": row, "origin": {"x": ox, "y": oy}, "file": filename,
                            "neighbors": {"north": sector_id(col,row-1) if row else None, "east": sector_id(col+1,row) if col+1 < extent["columns"] else None,
                                          "south": sector_id(col,row+1) if row+1 < extent["rows"] else None, "west": sector_id(col-1,row) if col else None},
                            "bounds": {"x": ox, "y": oy, "widthM": size, "depthM": size}, "nativeImport": native_import, "metrics": metrics,
                            "buildingIds": sorted(sector_buildings[sid]), "guards": guards})
    feature_database = {"kind": "mount-dora-source-features", "version": 1, "id": config["id"], "projection": config["projection"],
                        "coordinates": "Local east/south metres. Buildings retain geographicGeometry; street geometry retains the source line with playable adjustments in nativeRoad.centerline.",
                        "authoredLayoutSHA256": layout_digest,
                        "authoredStructures": structures,
                        "sources": source_records, "features": features, "diagnostics": diagnostics}
    outputs["features.json"] = encoded(feature_database)
    outputs["atlas.svg"] = render_atlas(features, config)
    manifest = {"kind": "mount-dora-native-project", "version": 1, "id": config["id"], "name": config["name"], "target": config["target"],
                "projection": config["projection"], "extent": {"widthM": width, "depthM": depth}, "sectorSize": size, "columns": extent["columns"], "rows": extent["rows"],
                "featuresFile": "features.json", "atlasFile": "atlas.svg", "authoredBuildingsFile": "authored-buildings.json", "sectors": sectors, "sources": source_records,
                "generation": {"tool": "tools/maps/build-mount-dora.py", "version": 7, "configFile": "source/authoring-config.json", "configSHA256": config_digest,
                               "authoredLayoutSHA256": layout_digest, "evidenceInputs": evidence_inputs,
                               "sourceDigest": digest, "terrainCodebook": list(KINDS), "globalTerrainSHA256": sha(terrain),
                               "sampleRule": "Global cell centre (column*240+x+0.5, row*240+y+0.5); one global raster sliced without seam repaint.",
                               "nativeCoordinates": "Wall metre endpoints = global east/south - sectorOrigin - 0.5; tile indices remain integer cells.",
                               "streets": {"classes": sorted(STREET_CLASSES), "widthM": STREET_WIDTH, "sidewalkWidthM": SIDEWALK_WIDTH,
                                           "buildingClearanceTiles": 1,
                                           "snapLimitMPerAxis": STREET_SNAP_LIMIT, "policy": "Near-cardinal street runs align to a common metre line. Connected source nodes stay joined. Bridge and boardwalk points stay fixed."},
                               "defaultRoadWidthsM": WIDTHS,
                               "waterPolicy": "Fill complete source polygons first; land cover never creates land in water. Only mapped building footprints, bridges or wooden-surface paths can provide source-backed support over water; a county building on its lidar roof is such a footprint, and its one-metre fit may take the mapped water within three cells of it.",
                               "vegetation": {"seed": 1947, "brush": "woodland-v1",
                                              "policy": "AFT woodland brush and seeded trees, shrubs and reeds on mapped parks, woods, wetlands and open land in residential areas. Individual plants are gameplay scenery."},
                               "guardPolicy": "Fictional posts on land sectors include street patrols and local circuits. Posts and waypoints use the native editor format.",
                               "sportsSurfaces": "Mapped pitch polygons exclude procedural greenery; tennis/pickleball use a declared existing asphalt proxy unless a supported source surface tag is present. No invented court lines or current inventory claim.",
                               "buildingDefaults": {"stories": 1, "material": "brick", "heightM": 2, "slabM": .12, "pitchM": 2.12,
                                                    "policy": "Native-kit closed exterior proxies on one-metre integer-edge plans; geographic outlines retained separately; courtyard holes and shared party wall relationships retained; no invented entrances/interiors.",
                                                    "evidence": "Storeys: survey > building:levels tag > county STORIES > lidar eave > default. Material: survey > building:material tag > county wall code > default. Each building records its sources in nativeProxy; county/lidar storey disagreements are kept for a survey.",
                                                    "countyBuildings": "Buildings OpenStreetMap lacks, from Lake County sketches placed on their 2018 lidar roofs (reference/county-buildings.json); stacked and attached units are one outline; no OSM tags."}},
                "landmarks": config.get("landmarkOverrides", []),
                "calibration": config.get("calibration", {}), "coverageNotes": config.get("coverageNotes", []),
                "metrics": {"sectors": len(sectors), "nativeImportReady": sum(s["nativeImport"]["ready"] for s in sectors),
                            "nativeImportRefused": sum(not s["nativeImport"]["ready"] for s in sectors), "featureCount": len(features),
                            "featureCategories": dict(sorted(Counter(f["category"] for f in features).items())), "buildingCount": len(buildings), "countyBuildings": sum("county" in f for f in buildings),
                            "crossSectorBuildings": sum(len(f["nativeSectors"]) > 1 for f in buildings), "roadCount": len(roads),
                            "excludedProposedRoads": sum("nativeOmission" in f for f in features), "wallRuns": sum(len(r) for r in wall_pieces.values()),
                            "props": sum(len(p) for p in props_by_sector.values()), "trees": len(tree_cells),
                            "foliageCells": sum(len(cells) for cells in foliage_by_sector.values()), "guards": sum(len(s["guards"]) for s in sectors),
                            "terrainCounts": {KINDS[k]: v for k, v in sorted(Counter(terrain).items())},
                            "unrepresentedWallSlivers": sum(d["kind"] == "wall-sliver-below-native-minimum" for d in diagnostics)},
                "limitations": ["Geographic map-authoring approximation with fictional gameplay placements.",
                                "Flat terrain. Storeys and wall materials follow recorded evidence (nativeProxy sources) as whole native-kit storeys, not measured wall heights; no interiors or entrances are inferred.",
                                "Buildings use cardinal integer tile edges and clear the full sidewalk ribbon with a tile of facade clearance. The authored fit records any setbacks or frontage adjustments; source outlines remain in geographicGeometry and raw snapshots.",
                                "County buildings come from appraiser sketches placed on December 2018 lidar roofs; a few stand where the lidar saw no building class, and the mapped Lake Dora shoreline runs through six lakeside ones.",
                                "The former depot is relocated approximately6.2m to preserve its proportions while clearing the original streets; other fitting changes are recorded in authored-buildings.json.",
                                "Native wall butt joints and per-run texture phases retain the workshop's existing limits; curved decorative parts and the lighthouse remain curved.",
                                "Water-only sectors remain complete in the atlas/source but the existing four-start/one-exit native validator refuses them.",
                                "Street widths, sidewalk widths, bridge/steps heights and seeded vegetation are declared authoring approximations.",
                                "No suggested future roads or gameplay objectives are authored."]}
    outputs["project.json"] = encoded(manifest, pretty=True)
    return outputs, manifest, feature_database, terrain


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Regenerate in memory and verify every owned output without writing.")
    args = parser.parse_args()
    outputs, manifest, _, _ = build_project()
    for name, data in outputs.items():
        destination = PROJECT / name
        if args.check:
            if not destination.exists() or destination.read_bytes() != data:
                raise SystemExit("Stale Mount Dora output: " + name)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
    print(json.dumps({"mode": "verified" if args.check else "generated", "files": len(outputs), **manifest["metrics"]}, indent=2))


if __name__ == "__main__":
    main()
