"""Deterministic, editable AFT trees and brush from mapped land-cover areas."""

from collections import defaultdict
import math


SEED = 1947
HABITATS = ("", "park", "wood", "wetland", "residential")
# Forest and swamp get close stands, with larger gaps in parks and yards.
TREE_PROFILES = {
    1: (5, 54, 22),
    2: (3, 100, 80),
    3: (4, 63, 63),
    4: (5, 43, 10),
}
BRUSH_DENSITY = {2: 57, 3: 45}


def scatter_hash(x, y, salt=0):
    n = ((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791) ^ SEED) & 0xffffffff
    n ^= n >> 16
    n = (n * 0x7feb352d) & 0xffffffff
    return n ^ (n >> 15)


def scatter(width, depth, spacing, salt):
    """Pick one jittered metre cell per globally aligned square."""
    for gy in range(0, depth, spacing):
        for gx in range(0, width, spacing):
            seed = scatter_hash(gx, gy, salt)
            jitter = min(3, spacing - 1)
            x = gx + (spacing - jitter) // 2 + seed % jitter
            y = gy + (spacing - jitter) // 2 + (seed >> 8) % jitter
            if x < width and y < depth:
                yield x, y, seed


def build_vegetation(features, terrain, green, blocked, width, depth, size, code, sector_id, *, reserved=()):
    """Return native props, native AFT brush cells and the global trunk cells."""
    props_by_sector = defaultdict(list)
    foliage_by_sector = defaultdict(dict)
    tree_cells, occupied, protected = set(), set(), set(reserved)
    green_ground = {code["ground-grass"], code["woodland"]}

    def clear(x, y):
        return (0 <= x < width and 0 <= y < depth and (x, y) not in protected
                and terrain[y * width + x] in green_ground and not blocked[y * width + x])

    def put(x, y, kind, habitat, source_id=None):
        occupied.add((x, y))
        if kind.startswith("tree-"):
            tree_cells.add((x, y))
        sid = sector_id(x // size, y // size)
        props_by_sector[sid].append({
            "x": x % size, "y": y % size, "z": 0, "kind": kind,
            "mountDora": {"sourceId": source_id, "habitat": HABITATS[habitat],
                          "placement": "mapped-tree-cell-proxy" if source_id else "declared-seeded-greenery"},
        })

    for feature in features:
        if feature["geometry"]["type"] != "Point" or feature["tags"].get("natural") != "tree":
            continue
        x, y = map(math.floor, feature["geometry"]["coordinates"])
        if clear(x, y) and (x, y) not in occupied:
            kind = "tree-pine" if feature["tags"].get("leaf_type") == "needleleaved" else "tree-broadleaf"
            put(x, y, kind, green[y * width + x], feature["id"])

    for habitat, (spacing, chance, mature_chance) in TREE_PROFILES.items():
        for x, y, seed in scatter(width, depth, spacing, habitat):
            if green[y * width + x] != habitat or (seed >> 16) % 100 >= chance:
                continue
            mature = (seed >> 9) % 100 < mature_chance
            radius = 2 if mature else 1
            if not all(clear(x + dx, y + dy) for dx in range(-radius, radius + 1)
                       for dy in range(-radius, radius + 1)):
                continue
            # Leave at least two metres between trunks even at habitat edges.
            if any((x + dx, y + dy) in tree_cells for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                continue
            kind = "tree-pine" if (seed >> 24) % 5 == 0 and habitat != 3 else "tree-broadleaf"
            put(x, y, kind + ("-large" if mature else ""), habitat)

    for x, y, seed in scatter(width, depth, 8, 5):
        habitat = green[y * width + x]
        if not habitat or (seed >> 16) % 100 >= (43 if habitat == 3 else 18):
            continue
        if clear(x, y) and (x, y) not in occupied:
            put(x, y, "reeds" if habitat == 3 else "bush", habitat)

    # AFT's passable woodland brush paints the understory around actual trunks.
    # Its automatic canopy rule reserves two cells around explicit tree props.
    # Limit the painted cells to that same radius so the brush does not add a
    # second untracked trunk population over the authored one in the editor.
    for x, y in sorted(tree_cells):
        habitat = green[y * width + x]
        if habitat not in BRUSH_DENSITY:
            continue
        for brush_y in range(y - 2, y + 3):
            for brush_x in range(x - 2, x + 3):
                if not clear(brush_x, brush_y) or (brush_x, brush_y) in occupied:
                    continue
                if green[brush_y * width + brush_x] != habitat:
                    continue
                sid = sector_id(brush_x // size, brush_y // size)
                cell = f"{brush_x % size},{brush_y % size},0"
                foliage_by_sector[sid][cell] = [BRUSH_DENSITY[habitat], False, "woodland-v1"]

    return props_by_sector, foliage_by_sector, tree_cells
