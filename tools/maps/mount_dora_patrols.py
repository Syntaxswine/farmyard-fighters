"""Place fictional sentries on the authored Mount Dora terrain."""

from collections import defaultdict
from math import atan2, ceil, degrees, dist, floor, sqrt


WEAPON_MIX = ("pistol", "smg", "pistol", "rifle", "shotgun", "pistol", "smg")
EXTRA_POSTS = ((1, 1), (3, 2), (4, 3))
# Game coordinates of Donnelly deployment and the direct landmark arrivals,
# before each moves with the town at its place (the generator's approach_moves).
ARRIVALS = {"launch": (459, 500, 44), "donnelly-park": (477.5, 484.25, 32), "lakeside-inn": (336, 810, 32),
            "elizabeth-evans": (469.5, 1004.5, 32), "grantham-lighthouse": (504, 1168, 32),
            "gilbert-park": (736.7963, 1180.867, 32), "palm-island": (529, 1402, 32),
            "palm-entrance": (665.469, 1296.0786, 32), "historic-shopfronts": (433, 635, 32),
            "donnelly-house": (414, 480, 32), "history-museum": (481, 598, 32), "former-depot": (328, 687, 32)}


def _line_cells(a, b, step=.3):
    steps = max(1, ceil(dist(a, b) / step))
    previous = None
    for i in range(steps + 1):
        cell = tuple(round(a[j] + (b[j] - a[j]) * i / steps) for j in range(2))
        if cell != previous:
            yield cell
            previous = cell


def _reserve_disc(allowed, center, radius, width, depth):
    x, y = center
    for row in range(max(0, ceil(y - radius)), min(depth, floor(y + radius) + 1)):
        half = sqrt(radius**2 - (row - y)**2)
        left = max(0, ceil(x - half))
        right = min(width, floor(x + half) + 1)
        if right > left:
            allowed[row * width + left:row * width + right] = bytes(right - left)


def _sidewalk_routes(roads, size):
    """Candidate straight patrol legs follow the playable sidewalk ribbons."""
    candidates = defaultdict(list)
    for feature in roads:
        road = feature["nativeRoad"]
        geometry = feature["geometry"]
        if road["widthSource"] != "standard-game-street" or road["bridge"] or geometry["type"] != "LineString":
            continue
        points = road.get("centerline", geometry["coordinates"])
        sidewalk_center = (road["widthM"] + road["sidewalkWidthM"]) / 2
        for a, b in zip(points, points[1:]):
            length = dist(a, b)
            if length < 14:
                continue
            dx, dy = (b[0] - a[0]) / length, (b[1] - a[1]) / length
            span = min(20, int(length))
            # Sample the endpoints and interior of long street segments.
            starts = range(0, floor(length) - span + 1, 7)
            for start in starts:
                for side in (-1, 1):
                    route = tuple((floor(a[0] + t*dx - dy*side*sidewalk_center),
                                   floor(a[1] + t*dy + dx*side*sidewalk_center))
                                  for t in (start, start + span))
                    sector = route[0][0] // size, route[0][1] // size
                    if sector == (route[1][0] // size, route[1][1] // size):
                        candidates[sector].append((route, feature["id"]))
    return candidates


def _record(guard_id, start, route, source, origin):
    ox, oy = origin
    heading = 90
    if route:
        heading = round(degrees(atan2(route[1][1] - start[1], route[1][0] - start[0])) % 360) % 360
    guard = {"id": guard_id, "x": start[0] - ox, "y": start[1] - oy, "z": 0,
             "species": "pig-foreman", "weapon": WEAPON_MIX[guard_id % len(WEAPON_MIX)], "heading": heading}
    if route:
        guard["patrol"] = [{"x": x - ox, "y": y - oy, "z": 0, "waitSeconds": 0} for x, y in route]
    if source:
        guard["patrolSource"] = source
    return guard


def author_guards(terrain, blocked, plants, roads, eligible_sectors, *, width, depth, size, code, anchors_by_sector=None, moves=None):
    forbidden = {code[key] for key in ("water", "floor", "bridge", "ground-wood-planks")}
    allowed = bytearray(value not in forbidden and not blocked[i] for i, value in enumerate(terrain))
    for x, y in plants:
        _reserve_disc(allowed, (x, y), 1.45, width, depth)
    for name, (x, y, radius) in ARRIVALS.items():
        dx, dy = (moves or {}).get(name, (0, 0))
        _reserve_disc(allowed, (x + dx, y + dy), radius, width, depth)
    for feature in roads:
        if not feature["nativeRoad"]["woodSurface"] or feature["geometry"]["type"] != "LineString":
            continue
        points = [(x - .5, y - .5) for x, y in feature["geometry"]["coordinates"]]
        for a, b in zip(points, points[1:]):
            for point in _line_cells(a, b, step=8):
                _reserve_disc(allowed, point, 32, width, depth)
    for (col, row), anchors in (anchors_by_sector or {}).items():
        for point in anchors:
            allowed[(row*size + point["y"])*width + col*size + point["x"]] = 0

    sidewalk = code["ground-concrete"]
    water = code["water"]
    green = {code["ground-grass"], code["woodland"]}
    street_routes = _sidewalk_routes(roads, size)
    guards = defaultdict(list)

    def place(sector, guard_id, *, extra=False):
        ox, oy = (coordinate*size for coordinate in sector)
        centre = (size - 1) / 2
        focus = (ox + centre + (54 if extra else 0), oy + centre)

        def clear(point):
            x, y = point
            return ox + 8 <= x < ox + size - 8 and oy + 8 <= y < oy + size - 8 and allowed[y*width + x]

        def route_clear(points, *, on_sidewalk=False):
            for a, b in zip(points, points[1:] + points[:1]):
                for x, y in _line_cells(a, b):
                    if not clear((x, y)) or on_sidewalk and terrain[y*width + x] != sidewalk:
                        return False
                    # Diagonal legs may pass close to the water side of an
                    # otherwise dry cell. Leave a dry border for actor radius.
                    if any(terrain[(y+dy)*width + x+dx] == water for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                        return False
            return True

        def street():
            options = sorted(street_routes[sector], key=lambda entry: (sum(dist(p, focus)**2 for p in entry[0]), entry))
            return next(((route, source) for route, source in options if route_clear(route, on_sidewalk=True)), ((), None))

        def loop():
            candidates = [(x, y) for y in range(oy + 11, oy + size - 10, 4)
                          for x in range(ox + 11, ox + size - 10, 4) if clear((x, y))]
            for x, y in sorted(candidates, key=lambda p: dist(p, focus)**2 + (0 if terrain[p[1]*width + p[0]] in green else 64)):
                for radius, corner in ((7, 5), (6, 4), (4, 3)):
                    points = tuple((x + dx, y + dy) for dx, dy in ((radius, 0), (corner, corner), (0, radius),
                                   (-corner, corner), (-radius, 0), (-corner, -corner), (0, -radius), (corner, -corner)))
                    if route_clear(points):
                        return points, None
            return (), None

        route, source = (), None
        if guard_id % 7:
            first, second = (street, loop) if guard_id % 2 == 0 else (loop, street)
            route, source = first()
            if not route:
                route, source = second()
        if route:
            start = route[0]
        else:
            candidates = ((x, y) for y in range(oy + 8, oy + size - 8)
                          for x in range(ox + 8, ox + size - 8) if clear((x, y)))
            start = min(candidates, key=lambda p: (dist(p, focus)**2 + (0 if terrain[p[1]*width + p[0]] == sidewalk else 100), p), default=None)
            if start is None:
                raise ValueError(f"No outdoor sentry post in sector {sector}")
        guards[sector].append(_record(guard_id, start, route, source, (ox, oy)))
        # Give following posts and patrols a distinct encounter area.
        _reserve_disc(allowed, start, 34, width, depth)
        for a, b in zip(route, route[1:] + route[:1]):
            for point in _line_cells(a, b, step=6):
                _reserve_disc(allowed, point, 34, width, depth)

    columns = width // size
    eligible = set(eligible_sectors)
    for col, row in sorted(eligible, key=lambda sector: (sector[1], sector[0])):
        place((col, row), row * columns + col + 1)
    for offset, sector in enumerate(EXTRA_POSTS, 1):
        if sector not in eligible:
            raise ValueError(f"Additional sentry sector {sector} has no native land")
        place(sector, columns*(depth // size) + offset, extra=True)
    return guards
