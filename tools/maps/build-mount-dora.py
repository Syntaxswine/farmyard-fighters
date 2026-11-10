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
# A pedestrian street is part of the street grid (West 4th Avenue is one for
# the block between McDonald and Alexander Streets): it snaps with the streets
# but keeps its own mapped width.
SNAP_CLASSES = STREET_CLASSES | {"pedestrian"}
STREET_WIDTH = 6
SIDEWALK_WIDTH = 2
STREET_SNAP_LIMIT = 5        # metres a street may move to sit on one grid line; buildings move with it
STREET_BRIDGE_ALONG = 40     # metres: same-named runs this close end to end may share a line
STREET_BRIDGE_ACROSS = 2.5   # metres: ...when their ends are this nearly in line
STREET_STRAIGHT = .025       # across/along: runs within about 1.4 degrees of the grid are fitted first
# A mapped pier is a wooden deck as wide as a mapped boardwalk: an unsurveyed
# proxy, since OpenStreetMap records no width for any Mount Dora pier.
PIER_WIDTH = 2
# A pier's deck stands this high over the water, on AFT's timber trellis cut
# down to fit beneath it: the owner's choice of a low deck (2026-11-10). The
# 2018 USGS lidar puts the decks of Mount Dora's 19 piers a median 0.43 m over
# Lake Dora (most 0.37 to 0.46 m, four 0.7 to 1.4 m).
PIER_DECK_HEIGHT = .4
# The cells a walker crosses on a pier: centres within 0.75 m of a deck line,
# not past its free ends, and round at the joints where two of its lines meet
# (joints are found within one way; where two ways meet, every contact on this
# map is a T). The cells reach past the drawn 2 m deck, 0.25 m sideways on a
# square deck and more on a diagonal one or past a free end, so the town decides
# a walker's height from their body (and, on a deck cell over water, from that
# cell): see deckHeightAt in the art manifest and surfaceHeight in the town view.
# A straight band stays joined side to side at any angle (the overlap
# between neighbouring columns is (1.5 - sin a) / cos a >= 1.12 cells); a bend's
# outer corner falls past both lines' square ends, which is why joints round off.
PIER_WALK_WIDTH = 1.5
PIER_DECK_HEIGHT_SOURCE = "owner's choice 2026-11-10 (low deck); 2018 USGS lidar median deck 0.43 m over the lake"
# Railways whose rails are still in place. A disused line keeps its track; an
# abandoned or razed one does not. The bed is the Nautilus branch-line track
# bed (packages/railway-visuals, ballastWidthM 2), which the 3D track is drawn on.
RAILWAY_KINDS = ("rail", "disused", "preserved", "narrow_gauge", "light_rail")
RAIL_BED_WIDTH = 2
RAIL_CLEARANCE = 1.25        # metres: a 3D track run keeps road, building, deck and water cell centres this far from its centreline
RAIL_SAMPLE = .5             # metres between the samples that decide where a 3D track run may lie
RAIL_RUN_MIN = 2             # metres: the shortest 3D track run, one Nautilus straight piece
PALETTE ={"ground-grass": "#87956c", "water": "#64899a", "woodland": "#426148",
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


def ring_area(ring):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))) / 2


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
    if tags.get("man_made") == "pier":
        return "pier"
    if tags.get("railway") in RAILWAY_KINDS:
        return "railway"
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
        # A closed pier way outlines a platform, unless it encloses no deck:
        # Mount Dora's cross-docks are mapped out and back along one line
        # (A-B-C-A, under 2 m2). A closed railway is still a track.
        area = closed and (category(tags) not in ("road", "context", "railway") or tags.get("area") == "yes" or tags.get("landuse"))
        if area and category(tags) == "pier" and ring_area(points) < PIER_WIDTH ** 2:
            area = False
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


def paint_line(grid, points, width_m, code, width, depth, *, land_only=False, water_code=None, offset=0, mask=None):
    for index in line_cells(points, width_m, width, depth, offset=offset):
        if not land_only or grid[index] != WATER:
            grid[index] = water_code if water_code is not None and grid[index] == WATER else code
            if mask is not None:
                mask[index] = 1


def line_cells(points, width_m, width, depth, *, offset=0, ends=True):
    """Cells whose centres lie within width_m / 2 of the polyline (a cell on
    two segments comes once per segment). With ends=False each segment's band
    stops square at its ends instead of rounding past them."""
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
                along = ((px - a[0]) * dx + (py - a[1]) * dy) / length2
                if not ends and not 0 <= along <= 1:
                    continue
                t = max(0, min(1, along))
                if (px - a[0] - t * dx) ** 2 + (py - a[1] - t * dy) ** 2 <= radius * radius:
                    yield y * width + x


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


def author_streets(roads, width=None, depth=None):
    """Straighten near-cardinal runs without pulling shared junctions apart.

    Only points inside the town decide a run's line. A street's source line
    runs on past the crop (Alexander Street continues 268 m north), and those
    outside points drifted with the real grid's slight turn; letting them vote
    split straight in-town streets onto two lines with a sideways jump.
    Outside points still move onto the line the town chose."""
    streets = [f for f in roads if f["tags"]["highway"] in SNAP_CLASSES
               and f["geometry"]["type"] == "LineString"]
    fixed = {tuple(p) for f in roads if f["nativeRoad"]["bridge"] or f["nativeRoad"]["woodSurface"]
             if f["geometry"]["type"] == "LineString" for p in f["geometry"]["coordinates"]}

    def in_town(point):
        return width is None or (0 <= point[0] <= width and 0 <= point[1] <= depth)

    def merge(first, second):
        if first is None:
            return second
        if second is None:
            return first
        return min(first[0], second[0]), max(first[1], second[1])

    moves = [{}, {}]
    for axis in range(2):
        links, named = [], defaultdict(list)
        for street in streets:
            points = street["geometry"]["coordinates"]
            for a, b in zip(points, points[1:]):
                across, along = abs(b[axis] - a[axis]), abs(b[1-axis] - a[1-axis])
                if along and across <= along * .2 and tuple(a) not in fixed and tuple(b) not in fixed:
                    links.append((across > along * STREET_STRAIGHT, along, tuple(a), tuple(b)))
                    if street["tags"].get("name"):
                        named[street["tags"]["name"]] += [tuple(a), tuple(b)]
        # A short angled piece can break one street into runs that never meet
        # (Tremain Street's 1.6 m wiggle at 5th Avenue, Alexander Street and
        # West 3rd Avenue across the 3rd Avenue railway junction). Same-named
        # runs whose ends lie close along and nearly in line may share a line.
        for ends in named.values():
            ends = sorted(set(ends))
            for i, a in enumerate(ends):
                for b in ends[i + 1:]:
                    along, across = abs(b[1-axis] - a[1-axis]), abs(b[axis] - a[axis])
                    if 0 < along <= STREET_BRIDGE_ALONG and across <= STREET_BRIDGE_ACROSS:
                        links.append((False, along, a, b))
        parent, inner, outer = {}, {}, {}

        def root(point):
            parent.setdefault(point, point)
            while point != parent[point]:
                parent[point] = parent[parent[point]]
                point = parent[point]
            return point

        def spans(point):
            own = (point[axis], point[axis])
            return inner.get(point, own if in_town(point) else None), outer.get(point, own)

        # Straight runs (and the bridges between them) claim their points
        # first, longer before shorter; more steeply angled runs join only
        # where they still fit. Otherwise a tilted street (South Tremain, 3.4
        # degrees) took points of the straight street it continues and split
        # it with an 8 m jump. Each group needs a common integer line inside
        # every in-town member's allowed displacement; a group wholly outside
        # the town keeps the original all-member rule.
        for _, _, a, b in sorted(links, key=lambda link: (link[0], -link[1], link[2], link[3])):
            first, second = root(a), root(b)
            inner_a, outer_a = spans(first)
            inner_b, outer_b = spans(second)
            town, every = merge(inner_a, inner_b), merge(outer_a, outer_b)
            low, high = town if town is not None else every
            line = round((low + high) / 2)
            if max(line - low, high - line) <= STREET_SNAP_LIMIT:
                parent[second] = first
                inner[first], outer[first] = town, every
        for point in parent:
            leader = root(point)
            if leader in outer:
                low, high = inner[leader] if inner[leader] is not None else outer[leader]
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
    return moves


FOLLOW_REACH = 200  # metres: a street or shoreline stops moving the town this far away
FOLLOW_CELL = 50    # metres: bucket size of the segment index
# Pull of the unmoved town, as if an unmoved straight street lay four reaches
# away: a point beside one moved street takes 99% of its move at 10 m and fades
# smoothly to none at FOLLOW_REACH.
FOLLOW_REST = math.pi / (4 * FOLLOW_REACH)


def _segment_pull(point, a, b, move_a, move_b):
    """How hard one constraint segment pulls a point, and toward what move.

    The weight is the integral of 1/r^2 along the segment, so a segment split
    in two pulls as hard as the whole (exactly so before the reach taper, which
    each piece takes at its own nearest distance), and two long parallel streets at
    distances d1 and d2 pull in the ratio 1/d1 : 1/d2 (before the reach taper,
    which favours the nearer street a little more): the town blends across the
    block between them. The move varies linearly along the segment.
    Returns (distance, weight, weight * move), or (0, None, move) on the segment."""
    ux, uy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(ux, uy)
    ux, uy = ux / length, uy / length
    rx, ry = point[0] - a[0], point[1] - a[1]
    t = rx * ux + ry * uy                      # the foot of the perpendicular, from a
    h = abs(rx * uy - ry * ux)                 # distance from the segment's line
    s1, s2 = -t, length - t                    # the segment's ends, measured from the foot
    slope = (move_b - move_a) / length
    foot = move_a + slope * t                  # the move the segment's line has at the foot
    if s1 <= 0 <= s2:
        distance = h
        if h < 1e-9:
            return 0.0, None, foot
    else:
        distance = min(math.hypot(h, s1), math.hypot(h, s2))
    if h < 1e-9:
        near, far = sorted((abs(s1), abs(s2)))
        weight = 1 / near - 1 / far
    else:
        weight = math.atan2(h * (s2 - s1), h * h + s1 * s2) / h
    moment = .5 * math.log((h * h + s2 * s2) / (h * h + s1 * s1))
    return distance, weight, foot * weight + slope * moment


def street_follow_field(roads, features=(), width=None, depth=None):
    """How far the town moves so everything keeps its place beside the streets.

    On each axis, the snapped near-cardinal segments of the grid streets pull
    toward their own move (snapped line minus source line, varying along a
    segment whose two ends took different lines), and the mapped lake shore
    pulls toward no move: it keeps its place. Pulls are 1/r^2 integrals along
    each segment, tapered to nothing at FOLLOW_REACH, against the rest pull of
    the unmoved town, so the field is continuous everywhere: a building moved by
    the field at its centre keeps its setback, and nothing tears where one
    street ends or another begins. Returns field(point) -> [dx, dy]."""
    def in_town(point):
        return width is None or (0 <= point[0] <= width and 0 <= point[1] <= depth)

    constraints = ([], [])
    for feature in roads:
        if feature["tags"]["highway"] not in SNAP_CLASSES or feature["geometry"]["type"] != "LineString":
            continue
        source = feature["geometry"]["coordinates"]
        line = feature["nativeRoad"].get("centerline", source)
        for a, b, p, q in zip(source, source[1:], line, line[1:]):
            if not (in_town(a) or in_town(b)):
                continue
            for axis in range(2):
                across, along = abs(b[axis] - a[axis]), abs(b[1-axis] - a[1-axis])
                if along and across <= along * .2:
                    constraints[axis].append((a, b, p[axis] - a[axis], q[axis] - b[axis]))
    for feature in features:
        if feature["category"] == "water" and feature["geometry"]["type"] == "MultiPolygon":
            for polygon in feature["geometry"]["coordinates"]:
                for ring in polygon:
                    for a, b in zip(ring, ring[1:]):
                        if a != b and (in_town(a) or in_town(b)):
                            for axis in range(2):
                                constraints[axis].append((a, b, 0.0, 0.0))
    index = ({}, {})
    for axis in range(2):
        for number, (a, b, _, _) in enumerate(constraints[axis]):
            for cx in range(math.floor((min(a[0], b[0]) - FOLLOW_REACH) / FOLLOW_CELL),
                            math.floor((max(a[0], b[0]) + FOLLOW_REACH) / FOLLOW_CELL) + 1):
                for cy in range(math.floor((min(a[1], b[1]) - FOLLOW_REACH) / FOLLOW_CELL),
                                math.floor((max(a[1], b[1]) + FOLLOW_REACH) / FOLLOW_CELL) + 1):
                    index[axis].setdefault((cx, cy), []).append(number)

    def move(axis, point):
        weight, total, exact = FOLLOW_REST, 0.0, []
        for number in index[axis].get((math.floor(point[0] / FOLLOW_CELL), math.floor(point[1] / FOLLOW_CELL)), ()):
            a, b, move_a, move_b = constraints[axis][number]
            distance, pull, pulled = _segment_pull(point, a, b, move_a, move_b)
            if pull is None:
                exact.append(pulled)
            elif distance < FOLLOW_REACH:
                taper = (1 - (distance / FOLLOW_REACH) ** 2) ** 2
                weight += pull * taper
                total += pulled * taper
        return sum(exact) / len(exact) if exact else total / weight

    cache = {}

    def field(point):
        key = (point[0], point[1])
        if key not in cache:
            cache[key] = [move(0, point), move(1, point)]
        return list(cache[key])

    return field


BLOCK_PARK_SPAN = 120  # metres: a park no wider or deeper than this moves as one piece with its contents


def _inside(point, polygons):
    """Even/odd test against every ring of a MultiPolygon, holes included."""
    x, y = point
    hit = False
    for polygon in polygons:
        for ring in polygon:
            for (ax, ay), (bx, by) in zip(ring, ring[1:]):
                if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
                    hit = not hit
    return hit


BLOCK_PARK_BAND = 10  # metres inside a block park's edge over which its one-piece move blends into the town's


def _edge_distance(point, polygons):
    best = math.inf
    for polygon in polygons:
        for ring in polygon:
            for a, b in zip(ring, ring[1:]):
                dx, dy = b[0] - a[0], b[1] - a[1]
                t = max(0, min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy or 1)))
                best = min(best, math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy))
    return best


def park_follow(field, features):
    """A block-sized park moves as one piece, with everything inside it.

    The street move blends across a block, so a block between a street that
    moved 3 m (5th Avenue) and one that did not (6th Avenue) compresses a
    little. Inside Donnelly Park that pulled the Art Centre 1.8 m north and
    its tennis courts under 1 m, closing the stage's approach between them.
    A park is laid out as a whole, so a park at most BLOCK_PARK_SPAN metres
    across takes the move at its centre, and so does any point inside it
    deeper than BLOCK_PARK_BAND; nearer its edge the two moves blend, so a path
    or street crossing the edge stays joined and unbent. The returned function
    lists the block parks' one-piece moves in .parks."""
    parks = []
    for feature in features:
        if (feature["category"] == "park" and feature["tags"].get("leisure") == "park"
                and feature["geometry"]["type"] == "MultiPolygon"):
            x0, y0, x1, y1 = feature["bounds"]
            if x1 - x0 <= BLOCK_PARK_SPAN and y1 - y0 <= BLOCK_PARK_SPAN:
                parks.append((feature["id"], feature["bounds"], feature["geometry"]["coordinates"],
                              field([(x0 + x1) / 2, (y0 + y1) / 2])))

    def moved(point):
        for _, (x0, y0, x1, y1), polygons, shift in parks:
            if x0 <= point[0] <= x1 and y0 <= point[1] <= y1 and _inside(point, polygons):
                weight = min(1, _edge_distance(point, polygons) / BLOCK_PARK_BAND)
                if weight == 1:
                    return list(shift)
                return [weight * whole + (1 - weight) * own for whole, own in zip(shift, field(point))]
        return field(point)

    moved.parks = {ident: shift for ident, _, _, shift in parks}
    return moved


def follow_streets(roads, moves, field, decks=()):
    """Carry every other road with the straightened streets.

    A vertex the street snap placed keeps that line on each axis it moved;
    every other source vertex takes the town's move, so paths and curved
    roads keep their shape and stay joined. Bridges, boardwalks and piers
    (`decks`: their source points) keep their mapped place over the water,
    and so does every vertex another road shares with them. A segment whose
    two ends took different lines (a street that really turns off the grid,
    in the east and southeast) crosses between them as the field does, so
    the town beside it moves with it."""
    # A road that meets a bridge, boardwalk or pier keeps the shared vertex
    # where the deck is, so the two stay joined.
    moored = {tuple(p) for f in roads if f["nativeRoad"]["bridge"] or f["nativeRoad"]["woodSurface"]
              if f["geometry"]["type"] == "LineString" for p in f["geometry"]["coordinates"]}
    moored |= {tuple(p) for p in decks}
    for feature in roads:
        style, geometry = feature["nativeRoad"], feature["geometry"]
        if geometry["type"] != "LineString" or style["bridge"] or style["woodSurface"]:
            continue
        points = geometry["coordinates"]
        line = []
        for point in points:
            shift = [0.0, 0.0] if tuple(point) in moored else field(point)
            line.append([moves[axis][tuple(point)] if tuple(point) in moves[axis]
                         else round(point[axis] + shift[axis], 4) for axis in range(2)])
        if line != points:
            style["centerline"] = line
        else:
            style.pop("centerline", None)


def paint_roads(terrain, roads, width, depth, mask=None):
    # All sidewalks go down before carriageways so intersections stay open.
    # `mask` gathers every cell a road or sidewalk painted (where a railway
    # crosses, the road keeps its surface).
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
                       CODE["ground-concrete"], width, depth, land_only=True, mask=mask)
        else:
            for side in sides:
                paint_line(terrain, points, walk_width, CODE["ground-concrete"], width, depth,
                           land_only=True, offset=side * (style["widthM"] + walk_width) / 2, mask=mask)
    for feature in sorted(roads, key=lambda f: f["nativeRoad"]["widthSource"] == "standard-game-street"):
        style, geometry = feature["nativeRoad"], feature["geometry"]
        if geometry["type"] == "MultiPolygon":
            paint_polygon(terrain, geometry["coordinates"], CODE[style["terrain"]], width, depth, land_only=not style["bridge"], mask=mask)
        else:
            bridge, wooden = style["bridge"], style["woodSurface"]
            paint_line(terrain, style.get("centerline", geometry["coordinates"]), style["widthM"],
                       CODE["bridge"] if bridge else CODE[style["terrain"]], width, depth,
                       land_only=not (bridge or wooden), water_code=CODE["bridge"] if wooden else None, mask=mask)


def geometry_points(geometry):
    coordinates = geometry["coordinates"]
    if geometry["type"] == "LineString":
        return coordinates
    return [p for polygon in coordinates for ring in polygon for p in ring]


def _runs_back_over(s, t, sin_tolerance=math.sin(math.radians(5)), across=.6, shared=.05):
    """Whether segment t runs back over segment s: parallel within 5 degrees,
    both ends within 0.6 m of s's line, and more than 5 cm of s in common.
    Two segments that only meet end to end share nothing."""
    (a, b), (c, d) = s, t
    length, other = math.dist(a, b), math.dist(c, d)
    u, v = ((b[0] - a[0]) / length, (b[1] - a[1]) / length), ((d[0] - c[0]) / other, (d[1] - c[1]) / other)
    if abs(u[0] * v[1] - u[1] * v[0]) > sin_tolerance:
        return False
    if any(abs((p[0] - a[0]) * u[1] - (p[1] - a[1]) * u[0]) > across for p in (c, d)):
        return False
    low, high = sorted((p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1] for p in (c, d))
    return min(high, length) - max(low, 0) > shared


def pier_decks(points):
    """The deck centrelines of a pier way, each a straight line. Every segment
    is a line, except that segments mapped back over one another merge into
    the chord between their two farthest vertices, so no deck is drawn twice:
    Mount Dora's cross-docks are mapped out and back (A-B-C-A, a closed way
    enclosing no deck), and one open way walks its crossbar three times."""
    segments = [(a, b) for a, b in zip(points, points[1:]) if math.dist(a, b) > 1e-9]
    parent = list(range(len(segments)))

    def root(i):
        while parent[i] != i:
            i = parent[i]
        return i
    for i, segment in enumerate(segments):
        for j in range(i):
            # Tested both ways round, so a reversed way merges the same segments.
            if (_runs_back_over(segments[j], segment) or _runs_back_over(segment, segments[j])) and root(i) != root(j):
                parent[root(i)] = root(j)
    groups = defaultdict(list)
    for i in range(len(segments)):
        groups[root(i)].append(i)
    lines = []
    for members in sorted(groups.values()):
        ends = [p for k in members for p in segments[k]]
        a, b = segments[members[0]] if len(members) == 1 else max(
            ((p, q) for i, p in enumerate(ends) for q in ends[i + 1:]), key=lambda pair: math.dist(*pair))
        lines.append([list(a), list(b)])
    return lines


def paint_piers(terrain, green, piers, road_mask, corridor, width, depth, observations=()):
    """Lay every mapped pier as a wooden deck PIER_DECK_HEIGHT over the water:
    bridge over open water, planks on open ground. A pier keeps its mapped
    place, as a boardwalk does. Its walkable cells run PIER_WALK_WIDTH wide
    (the drawn deck PIER_WIDTH) along each of pier_decks' lines, plus any
    line a reviewed observation adds (the owner's
    pierObservations in source/authoring-config.json, each recorded with the
    pier); a closed way enclosing a deck would outline a platform (Mount Dora
    has none). A pier never replaces a road, path or sidewalk, a building,
    another deck or the street corridor, and no plant grows on it."""
    soft = {CODE[k] for k in ("ground-grass", "woodland", "ground-dirt")}
    seen = {item["source"]["id"]: item for item in observations}
    for feature in piers:
        geometry = feature["geometry"]
        observed = [item for item in observations if f"osm-way-{item['source']['id']}" == feature["id"]]
        joints = []
        if geometry["type"] == "LineString":
            lines = pier_decks(geometry["coordinates"])
            vertices = {tuple(p) for p in geometry["coordinates"]}
            for item in observed:
                added = item["addLine"]
                if len(added) != 2 or math.dist(*added) < 1e-9:
                    raise ValueError("Pier observation %s must add one straight line." % item["id"])
                if tuple(added[0]) not in vertices:
                    raise ValueError("Pier observation %s no longer starts on a vertex of its pier." % item["id"])
                if any(_runs_back_over(line, added) or _runs_back_over(added, line) for line in lines):
                    raise ValueError("Pier observation %s runs over a mapped deck line." % item["id"])
                lines.append(added)
            # A vertex where two of the pier's lines end is a joint. The bands stop
            # square at free ends, so no walkable cell reaches past a deck's end,
            # but round off at joints, so a bend stays joined side to side.
            ends = Counter(tuple(p) for line in lines for p in line)
            joints = [list(p) for p, count in ends.items() if count > 1]
            cells = {index for line in lines for index in line_cells(line, PIER_WALK_WIDTH, width, depth, ends=False)}
            cells |= {index for joint in joints for index in line_cells([joint, [joint[0] + 1e-6, joint[1]]], PIER_WALK_WIDTH, width, depth)}
        else:
            if observed:
                raise ValueError("A pier observation may only extend a deck line: " + feature["id"])
            cells = {y * width + x for y, left, right in polygon_spans(geometry["coordinates"], width, depth)
                     for x in range(left, right)}
        water = land = 0
        for index in sorted(cells):
            if road_mask[index] or corridor[index]:
                continue
            if terrain[index] == WATER:
                terrain[index] = CODE["bridge"]
                water += 1
            elif terrain[index] in soft:
                terrain[index] = CODE["ground-wood-planks"]
                land += 1
            else:
                continue
            green[index] = 0
        feature["nativePier"] = {
            "shape": "deck-lines" if geometry["type"] == "LineString" else "platform-outline",
            **({"lines": lines, "joints": joints, "widthM": PIER_WIDTH, "widthSource": "declared-boardwalk-proxy", "walkWidthM": PIER_WALK_WIDTH} if geometry["type"] == "LineString" else {}),
            "heightM": PIER_DECK_HEIGHT, "heightSource": PIER_DECK_HEIGHT_SOURCE,
            **({"observations": observed} if observed else {}),
            "bridgeCells": water, "plankCells": land,
            "policy": "Mapped pier at its source place: bridge over open water, planks on open ground; roads, paths, sidewalks, buildings and other decks keep their surface. No surveyed width or railing."}
    missing = set(seen) - {int(f["id"].removeprefix("osm-way-")) for f in piers if f["id"].startswith("osm-way-")}
    if missing:
        raise ValueError("Pier observations name ways the town has no pier for: %s" % sorted(missing))


def rail_line(feature, follow):
    """A railway's centreline moved with the town vertex by vertex, as the
    curved roads are (follow_streets), so it keeps its level crossings and the
    buildings beside it."""
    return [[round(x + dx, 4), round(y + dy, 4)] for (x, y), (dx, dy) in
            ((point, follow(point)) for point in feature["geometry"]["coordinates"])]


def _segment_distance(point, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy or 1)))
    return math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy)


def rail_runs(line, open_at):
    """The stretches of a polyline where every RAIL_SAMPLE sample is open,
    each at least RAIL_RUN_MIN long, as polylines (the source vertices inside
    a stretch are kept, so a run bends where the railway does). Openness is
    tested at the samples only, so a run's clearance can dip a few
    centimetres between two of them."""
    if len(line) < 2:
        return []
    lengths = [0.0]
    for a, b in zip(line, line[1:]):
        lengths.append(lengths[-1] + math.dist(a, b))
    total = lengths[-1]

    def at(s):
        i = max(0, min(len(line) - 2, next((k for k in range(1, len(lengths)) if lengths[k] >= s), len(lengths) - 1) - 1))
        a, b, span = line[i], line[i + 1], lengths[i + 1] - lengths[i]
        t = (s - lengths[i]) / span if span else 0
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

    stations = [k * RAIL_SAMPLE for k in range(int(total / RAIL_SAMPLE) + 1)]
    if total - stations[-1] > 1e-6:
        stations.append(total)
    runs, start, last = [], None, None
    for s in stations + [None]:
        if s is not None and open_at(at(s)):
            start = s if start is None else start
            last = s
            continue
        if start is not None and last - start >= RAIL_RUN_MIN - 1e-9:
            inner = [line[k] for k in range(1, len(line) - 1) if start < lengths[k] < last]
            runs.append([[round(v, 4) for v in p] for p in [at(start), *inner, at(last)]])
        start = None
    return runs


def paint_railways(terrain, green, railways, road_mask, corridor, follow, width, depth):
    """Lay each railway whose rails remain as a gravel bed RAIL_BED_WIDTH wide,
    and find where its 3D track may lie (nativeRailway.runs).

    The bed moves with the town (rail_line). Roads and sidewalks keep their
    surface where the railway crosses them, as do buildings, decks and
    water. A track run covers only the stretches where no road, building,
    deck or water cell centre comes within RAIL_CLEARANCE of the centreline,
    so the track stops short of every level crossing; a siding also stops
    where its bed would meet a main line's (no turnout is drawn)."""
    keep = {WATER, CODE["floor"], CODE["bridge"], CODE["ground-wood-planks"]}
    lines = {f["id"]: rail_line(f, follow) for f in railways}
    for feature in railways:
        gravel = 0
        for index in sorted(set(line_cells(lines[feature["id"]], RAIL_BED_WIDTH, width, depth))):
            if road_mask[index] or corridor[index] or terrain[index] in keep:
                continue
            gravel += terrain[index] != CODE["ground-gravel"]
            terrain[index] = CODE["ground-gravel"]
            green[index] = 0
        feature["nativeRailway"] = {"centerline": lines[feature["id"]], "bedWidthM": RAIL_BED_WIDTH,
                                    "bedWidthSource": "nautilus.railway.branch-line ballastWidthM", "terrain": "ground-gravel",
                                    "gravelCells": gravel}
    mains = [lines[f["id"]] for f in railways if not f["tags"].get("service")]
    reach = RAIL_CLEARANCE + .5

    def blocked(point):
        for y in range(math.floor(point[1] - reach), math.floor(point[1] + reach) + 1):
            for x in range(math.floor(point[0] - reach), math.floor(point[0] + reach) + 1):
                if (x + .5 - point[0]) ** 2 + (y + .5 - point[1]) ** 2 > RAIL_CLEARANCE ** 2:
                    continue
                if not (0 <= x < width and 0 <= y < depth):
                    return True
                index = y * width + x
                if road_mask[index] or corridor[index] or terrain[index] in keep:
                    return True
        return False

    for feature in railways:
        others = [] if not feature["tags"].get("service") else mains

        def open_at(point):
            return not blocked(point) and all(_segment_distance(point, a, b) >= RAIL_BED_WIDTH
                                              for line in others for a, b in zip(line, line[1:]))
        runs = rail_runs(lines[feature["id"]], open_at)
        feature["nativeRailway"].update(runs=runs, runLengthM=round(sum(math.dist(a, b) for run in runs for a, b in zip(run, run[1:])), 2),
                                        policy="Rails still in place (railway=%s): a gravel bed on open ground; roads, sidewalks, buildings, decks and water keep their surface where the railway meets them. "
                                               "The 3D track (Nautilus railway-visuals) is drawn only on runs and stops short of every road, so level crossings and the bridge over a road show the road; "
                                               "no turnout, crossing panel or bridge structure is drawn." % feature["tags"]["railway"])


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


# Source-reviewed approach points of the walking tour, in town metres. Each
# moves with the town at its own place by whole metres (approach_moves, recorded
# in project.json as approachMovesM); the game's TOUR_VISITS (mount-dora-entry.js)
# and the route review's targets hold the moved points.
APPROACH_POINTS = {
    "launch": (459.5, 500.5), "donnelly-park": (478, 484.75), "lakeside-inn": (336.5, 810.5),
    "elizabeth-evans": (470, 1005), "evans-route": (430.5, 1015.5), "grantham-lighthouse": (504.5, 1168.5),
    "gilbert-park": (737.2963, 1181.367), "gilbert-route": (710.5, 1207.5), "palm-island": (529.5, 1402.5),
    "palm-entrance": (665.969, 1296.5786), "historic-shopfronts": (433.5, 635.5), "donnelly-house": (414.5, 480.5),
    "history-museum": (481.5, 598.5), "former-depot": (328.5, 687.5)}


# Each approach keeps its place beside its landmark as reviewed on main
# 57887f1: a building's authored centre there, a structure's box centre, the
# lines of the two streets at a corner. The game's spawn, the lighthouse and the
# moored Palm Island boardwalk do not move; the Gilbert Park route target, in an
# open park, moves with the town where it stands.
APPROACH_ANCHORS = {
    "launch": ("fixed",), "donnelly-park": ("structure", "md:donnelly-stage", (478.5, 484.5)),
    "lakeside-inn": ("building", "osm-way-560095890", (346.5, 811.0)),
    "elizabeth-evans": ("structure", "md:evans-pavilion", (470.0, 1005.0)),
    "evans-route": ("structure", "md:evans-pavilion", (470.0, 1005.0)),
    "grantham-lighthouse": ("fixed",), "gilbert-park": ("structure", "md:shelter:557154684", (737.0, 1181.5)),
    "gilbert-route": ("town",), "palm-island": ("fixed",), "palm-entrance": ("fixed",),
    "historic-shopfronts": ("streets", ("North Donnelly Street", 430), ("East 4th Avenue", 634)),
    "donnelly-house": ("building", "osm-way-547799531", (398.5, 479.0)),
    "history-museum": ("building", "osm-way-556809468", (494.0, 598.0)),
    "former-depot": ("building", "osm-way-557494933", (315.5, 679.0))}


def street_line(roads, name, axis, at):
    """Where the named street's straight run covering `at` lies on `axis`."""
    for feature in roads:
        if feature["tags"].get("name") != name or feature["geometry"]["type"] != "LineString":
            continue
        line = feature["nativeRoad"].get("centerline", feature["geometry"]["coordinates"])
        for p, q in zip(line, line[1:]):
            if p[axis] == q[axis] and min(p[1 - axis], q[1 - axis]) <= at <= max(p[1 - axis], q[1 - axis]):
                return p[axis]
    raise ValueError(f"No straight run of {name} at {at}")


def approach_moves(authored, structures, roads, follow):
    """Each approach point's whole-metre move: its landmark's move since main."""
    records = {record["id"]: record for record in authored["records"]}
    boxes = {}
    for structure in structures:
        points = [q for poly in structure["geometry"]["coordinates"] for ring in poly for q in ring]
        boxes[structure["id"]] = [min(q[0] for q in points), min(q[1] for q in points), max(q[0] for q in points), max(q[1] for q in points)]
    moves = {}
    for name, (kind, *anchor) in APPROACH_ANCHORS.items():
        point = APPROACH_POINTS[name]
        if kind == "fixed":
            move = [0, 0]
        elif kind == "town":
            move = [round(v) for v in follow(list(point))]
        elif kind in ("building", "structure"):
            ident, then = anchor
            box = records[ident]["bounds"] if kind == "building" else boxes[ident]
            move = [round((box[i] + box[i + 2]) / 2 - then[i]) for i in (0, 1)]
        else:
            (across, x_then), (along, y_then) = anchor
            move = [round(street_line(roads, across, 0, point[1]) - x_then), round(street_line(roads, along, 1, point[0]) - y_then)]
        moves[name] = move
    return moves


def vegetation_clearings(moves):
    # Keep the launch point and the source-reviewed visit approaches (each moved
    # with the town at its place) and the Donnelly four-sector crossing (a fixed
    # sector corner) clear of decorative brush and tree trunks.
    approaches = {"launch": (459, 500), "donnelly-park": (477, 484), "lakeside-inn": (336, 810),
                  "elizabeth-evans": (469, 1004), "grantham-lighthouse": (504, 1168), "gilbert-park": (737, 1181),
                  "palm-island": (529, 1402), "palm-entrance": (665, 1296), "historic-shopfronts": (433, 635),
                  "donnelly-house": (414, 480), "history-museum": (481, 598), "former-depot": (328, 687)}
    clear = {(x + moves[name][0] + dx, y + moves[name][1] + dy) for name, (x, y) in approaches.items()
             for dx in range(-3, 4) for dy in range(-3, 4)}
    clear.update((479 + dx, 479 + dy) for dx in range(-3, 4) for dy in range(-3, 4))
    clear.update((x + moves["launch"][0], y + moves["launch"][1]) for x in range(458, 491) for y in range(506, 511))
    return clear


def preview_anchors(terrain, blocked, props, origin, size, width, within=None, avoid=()):
    """The first five connected eligible cells of a sector in scan order (local
    coordinates), optionally only cells in `within` (local indices) and not in
    `avoid` (local (x, y) cells)."""
    ox, oy = origin
    occupied = {(p["x"], p["y"]) for p in props}
    avoid = set(avoid)
    eligible = bytearray(size * size)
    for y in range(1, size - 1):
        for x in range(1, size - 1):
            index = (oy + y) * width + ox + x
            if (terrain[index] not in (WATER, CODE["floor"]) and not blocked[index]
                    and not any((x + dx, y + dy) in occupied for dx in (-1, 0, 1) for dy in (-1, 0, 1))
                    and (within is None or y * size + x in within) and (x, y) not in avoid):
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


def sector_area(terrain, origin, size, width, start):
    """The local indices of a sector's cells reachable from `start` (local x, y)
    over 4-connected cells that are not water, without leaving the sector. Water
    divides the validator's walk within one sector file; a building cut by the
    sector edge has no cap wall, so its floor does not."""
    ox, oy = origin
    first = start[1] * size + start[0]
    area, queue = {first}, deque([first])
    while queue:
        current = queue.popleft()
        x, y = current % size, current // size
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            nxt = ny * size + nx
            if 0 <= nx < size and 0 <= ny < size and nxt not in area and terrain[(oy + ny) * width + ox + nx] != WATER:
                area.add(nxt)
                queue.append(nxt)
    return area


def anchors_with_sentries(terrain, blocked, props, origin, size, width, anchors, guards):
    """The validator walks from the squad starts to every sentry post and patrol
    point within the sector. Anchors in another walkable area than the sector's
    first sentry (a deck that meets land only in the next sector) move to the
    first five-cell cluster in the sentry's area, clear of every post."""
    if not anchors or not guards:
        return anchors
    area = sector_area(terrain, origin, size, width, (guards[0]["x"], guards[0]["y"]))
    if all(p["y"] * size + p["x"] in area for p in anchors):
        return anchors
    posts = {(p["x"], p["y"]) for guard in guards for p in [guard, *guard.get("patrol", [])]}
    return preview_anchors(terrain, blocked, props, origin, size, width, within=area, avoid=posts) or anchors


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
    # Piers and the railway bed go under the roads, which keep their surface where they meet.
    for feature in features:
        if "nativePier" in feature and feature["geometry"]["type"] == "MultiPolygon":
            out.append(f'<path d="{paths(feature["geometry"]["coordinates"])}" fill="{PALETTE["bridge"]}" fill-rule="evenodd"/>')
        elif "nativePier" in feature:
            for line in feature["nativePier"]["lines"]:
                points = " ".join(f"{p[0]},{p[1]}" for p in line)
                out.append(f'<polyline points="{points}" fill="none" stroke="{PALETTE["bridge"]}" stroke-width="{PIER_WIDTH}"/>')
        elif "nativeRailway" in feature:
            points = " ".join(f"{p[0]},{p[1]}" for p in feature["nativeRailway"]["centerline"])
            out.append(f'<polyline points="{points}" fill="none" stroke="{PALETTE["ground-gravel"]}" stroke-width="{RAIL_BED_WIDTH}" stroke-linejoin="round"/>')
            out.append(f'<polyline points="{points}" fill="none" stroke="#5f584d" stroke-width=".9" stroke-dasharray=".25 .25" stroke-linejoin="round"/>')
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
    piers = [f for f in features if f["category"] == "pier"]
    railways = [f for f in features if f["category"] == "railway" and f["geometry"]["type"] == "LineString"]
    # Straighten the grid streets first. Every other road, every building,
    # every park, pitch and car park and every railway then moves with them
    # (street_follow_field), so each keeps its place in its block instead of
    # being pushed off a moved sidewalk. Woods, wetlands, beaches, piers and
    # the lake keep the mapped shoreline.
    moves = author_streets(roads, width, depth)
    follow = park_follow(street_follow_field(roads, features, width, depth), features)
    follow_streets(roads, moves, follow, [p for f in piers for p in geometry_points(f["geometry"])])
    # Park, pitch and car-park outlines move vertex by vertex with the town, so
    # their edges stay on the paths and streets around them; a block park's
    # inside moves as one piece (nativeShiftM).
    for feature in features:
        if feature["category"] in ("park", "parking") and feature["geometry"]["type"] == "MultiPolygon":
            source = feature["geometry"]["coordinates"]
            moved = [[[[round(x + dx, 4), round(y + dy, 4)] for (x, y), (dx, dy) in ((point, follow(point)) for point in ring)]
                      for ring in polygon] for polygon in source]
            if moved != source:
                points = [point for polygon in moved for ring in polygon for point in ring]
                feature["geographicGeometry"], feature["geographicBounds"] = feature["geometry"], feature["bounds"]
                feature["geometry"] = {"type": "MultiPolygon", "coordinates": moved}
                feature["bounds"] = [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]
            if feature["id"] in follow.parks:
                feature["nativeShiftM"] = [round(v, 4) for v in follow.parks[feature["id"]]]
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
    road_cells = bytearray(width * depth)
    paint_roads(terrain, roads, width, depth, mask=road_cells)
    # A county building stands on its 2018 lidar roof. Where the mapped Lake
    # Dora shoreline runs through one, its outline already supports itself
    # over that water, as a mapped footprint may; let the one-metre fit also
    # take the water cells touching it, where the building now stands. Only
    # the fit sees this; nothing is painted as land.
    # Buildings move by whole metres with their cluster (building_shifts), so
    # each keeps the shape the one-metre fit gives it unmoved.
    walls = deduplicated_walls(buildings)
    shifts, exact = _grid.building_shifts(buildings, walls, follow)
    fit_terrain = bytearray(terrain)
    for feature in buildings:
        if "county" in feature:
            shift = shifts[feature["id"]]
            for x, y in _grid.cells(feature["geometry"]["coordinates"]):
                for nx in range(max(0, x + shift[0] - 3), min(width, x + shift[0] + 4)):
                    for ny in range(max(0, y + shift[1] - 3), min(depth, y + shift[1] + 4)):
                        if fit_terrain[ny * width + nx] == WATER:
                            fit_terrain[ny * width + nx] = CODE["ground-grass"]
    # Reserve the full playable street and sidewalk ribbon for every footprint.
    corridor = street_corridor(roads, width, depth)
    authored = author_buildings(buildings, walls, fit_terrain, CODE,
                                config["buildingGrid"], street_corridor=corridor, street_fit_terrain=terrain,
                                shifts=shifts, exact=exact)
    # A mapped shelter deck supplies support over water, never invented land,
    # and keeps its place there as the boardwalks do; a shelter on land moves
    # with the town at its centre (the Gilbert Park paths around it moved), by
    # whole metres.
    structures = []
    for source_id in ('osm-way-557051211', 'osm-way-557154683', 'osm-way-557154684'):
        source = next(f for f in features if f['id'] == source_id)
        polygons, _ = rectify([[source['geometry']['coordinates']]])
        if source_id == 'osm-way-557051211':
            polygons = [[[[562,1383],[569,1383],[569,1389],[562,1389],[562,1383]]]]
        points = [q for poly in polygons for ring in poly for q in ring]
        centre = [(min(q[i] for q in points) + max(q[i] for q in points)) / 2 for i in (0, 1)]
        dx, dy = (0, 0) if source_water[int(centre[1]) * width + int(centre[0])] else tuple(round(v) for v in follow(centre))
        moved = [[[[x + dx, y + dy] for x, y in ring] for ring in poly] for poly in polygons]
        structures.append({'id':'md:shelter:'+source_id.removeprefix('osm-way-'), 'sourceIds':[source_id],
                           'geometry':{'type':'MultiPolygon','coordinates':moved},
                           **({'geographicGeometry':{'type':'MultiPolygon','coordinates':polygons}} if (dx, dy) != (0, 0) else {})})
    for ident, source_id, box in (('md:donnelly-stage','osm-way-468920884',[472,482,485,487]),
                                  ('md:evans-pavilion','osm-way-486656245',[466,1002,474,1008])):
        # Inside a block park it moves with the park; elsewhere with the town
        # at its centre; by whole metres either way.
        centre = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]
        homes = [f for f in features if f["category"] == "park" and f["geometry"]["type"] == "MultiPolygon"
                 and _inside(centre, f.get("geographicGeometry", f["geometry"])["coordinates"])]
        home = min(homes, key=lambda f: _grid.area(f.get("geographicGeometry", f["geometry"])["coordinates"]), default=None)
        dx, dy = (round(v) for v in (home["nativeShiftM"] if home and "nativeShiftM" in home else follow(centre)))
        x0,y0,x1,y1 = box[0]+dx, box[1]+dy, box[2]+dx, box[3]+dy
        structures.append({'id':ident,'sourceIds':[source_id],'geometry':{'type':'MultiPolygon',
                           'coordinates':[[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]]]},
                           **({'geographicGeometry':{'type':'MultiPolygon','coordinates':[[[[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]],[box[0],box[1]]]]]}}
                              if (dx, dy) != (0, 0) else {})})
    authored['structures'] = structures
    approaches = approach_moves(authored, structures, roads, follow)
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
    # Piers and railways go down after the building fit, which treats gravel,
    # planks and decks as cells a footprint must clear: they take only what the
    # fitted town leaves open.
    paint_piers(terrain, green, piers, road_cells, corridor, width, depth, config.get("pierObservations", []))
    paint_railways(terrain, green, railways, road_cells, corridor, follow, width, depth)
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
        reserved=vegetation_clearings(approaches))
    sector_positions = [(col, row) for row in range(extent["rows"]) for col in range(extent["columns"])]
    anchors_by_sector = {}
    for col, row in sector_positions:
        props = props_by_sector.get(sector_id(col, row), [])
        anchors_by_sector[col, row] = preview_anchors(terrain, blocked, props, (col * size, row * size), size, width)
    patrols = load_map_helper("mount_dora_patrols")
    guards_by_sector = patrols.author_guards(
        terrain, blocked, tree_cells, roads, {cell for cell, anchors in anchors_by_sector.items() if anchors},
        width=width, depth=depth, size=size, code=CODE, anchors_by_sector=anchors_by_sector, moves=approaches)
    for col, row in sector_positions:
        anchors_by_sector[col, row] = anchors_with_sentries(
            terrain, blocked, props_by_sector.get(sector_id(col, row), []), (col * size, row * size), size, width,
            anchors_by_sector[col, row], guards_by_sector.get((col, row), []))
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
                                     "previewAnchors": "Authoring-validator markers on existing connected walkable cells (land, or a mapped deck); not real spawn/extraction locations.",
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
                        "coordinates": "Local east/south metres. Buildings, parks and car parks that moved with their streets retain geographicGeometry, and a block-sized park that moved as one piece records nativeShiftM; street geometry retains the source line with playable adjustments in nativeRoad.centerline, and a railway its moved bed and 3D track runs in nativeRailway. Piers keep their source place.",
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
                               "streets": {"classes": sorted(STREET_CLASSES), "snapClasses": sorted(SNAP_CLASSES), "widthM": STREET_WIDTH, "sidewalkWidthM": SIDEWALK_WIDTH,
                                           "buildingClearanceTiles": 1,
                                           "snapLimitMPerAxis": STREET_SNAP_LIMIT, "policy": "Near-cardinal street runs align to a common metre line. Connected source nodes stay joined. Bridge, boardwalk and pier points stay fixed."},
                               "approachMovesM": approaches,
                               "defaultRoadWidthsM": WIDTHS,
                               "piers": {"widthM": PIER_WIDTH, "widthSource": "declared-boardwalk-proxy", "walkWidthM": PIER_WALK_WIDTH, "deckHeightM": PIER_DECK_HEIGHT, "deckHeightSource": PIER_DECK_HEIGHT_SOURCE,
                                         "observations": len(config.get("pierObservations", [])),
                                         "policy": "Every man_made=pier way is a wooden deck at its source place: bridge over open water, planks on open ground, drawn raised on AFT's timber trellis. Segments mapped back over one another are drawn once; a reviewed observation may add a deck line. Roads, paths, sidewalks, buildings and other decks keep their surface."},
                               "railways": {"kinds": list(RAILWAY_KINDS), "bedWidthM": RAIL_BED_WIDTH, "trackClearanceM": RAIL_CLEARANCE, "track": "Nautilus railway-visuals branch-line profile",
                                            "policy": "Railways whose rails remain move with the town and lie as a gravel bed on open ground. The 3D track covers only runs clear of roads, buildings, decks and water, so it stops short of level crossings and of road bridges over the line; a siding stops where its bed would meet its main line's."},
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
                                ("The former depot's reviewed plan stands %.1f m from its geographic centre: relocated to keep its proportions "
                                 "while clearing the original streets, and since moved with its street, so it needs re-review; other fitting "
                                 "changes are recorded in authored-buildings.json." % authored_by_id["osm-way-557494933"]["metrics"]["centreShiftM"]),
                                "Native wall butt joints and per-run texture phases retain the workshop's existing limits; curved decorative parts and the lighthouse remain curved.",
                                "Water-only sectors remain complete in the atlas/source but the existing four-start/one-exit native validator refuses them.",
                                "Street widths, sidewalk widths, pier widths, bridge/steps heights and seeded vegetation are declared authoring approximations.",
                                "Railways keep their mapped line and a declared 2 m bed. Level crossings, a railway bridge over a road, a road bridge over the railway, turnouts and crossing panels are not drawn: the 3D track stops short of each road.",
                                "Pier decks stand a declared 0.4 m over the water; the shore end is a single 0.4 m step, and shots and sight still treat a walker on a deck at ground height.",
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
