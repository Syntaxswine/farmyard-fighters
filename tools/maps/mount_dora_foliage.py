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
# A lidar crown's tree is mature from this height. It is a pine where the crown stands at
# least twice as tall as it is wide: Florida's pines and palms run 2.5 to 4 times, its
# laurel oaks and magnolias 1.3 to 1.8, its live oaks under 1. The game has no palm.
CROWN_MATURE_M = 12
CROWN_NARROW = 2


def _json_number(value):
    """A float as JSON readers in either language write it back: a whole number as an
    int (house-parts.mjs re-encodes the sectors in JavaScript, which reads 21.0 as 21)."""
    return int(value) if float(value).is_integer() else value


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


def plant_crowns(crowns, terrain, green, blocked, width, depth, size, code, sector_id,
                 props_by_sector, foliage_by_sector, tree_cells, occupied, *, reserved=(), keep_clear=(), tally=None):
    """One tree in each lidar crown that holds no trunk yet; returns how many.

    `tally`, a dict when given, counts the crowns that get none: "held" (a trunk already
    stands within the crown) and "noGround" (no clear cell within reach).

    `crowns` are the 2018 lidar's tree crowns in town metres (id, top, centre, areaM2,
    heightM, widthM). A crown holds a trunk when one stands within its radius of its
    centre. Its tree's trunk goes on the clear ground nearest the crown's top within half
    the crown's radius (at least a metre), two metres from any other trunk, off the
    cells in `occupied` and `keep_clear` and off the woodland brush already painted (the
    town refuses brush under a plant). It is mature from CROWN_MATURE_M tall, and a
    pine where the crown stands CROWN_NARROW times as tall as it is wide. In woods and
    wetland the woodland brush paints its understory, as around a seeded trunk. The
    plants already in props_by_sector are left exactly as they are. A tree outside every
    mapped habitat (a lawn, a verge) records its habitat as "unmapped".
    """
    if tally is not None:
        tally.update(held=0, noGround=0)
    green_ground = {code["ground-grass"], code["woodland"]}
    protected, keep_clear = set(reserved), set(keep_clear)

    def clear(x, y):
        return (0 <= x < width and 0 <= y < depth and (x, y) not in protected
                and terrain[y * width + x] in green_ground and not blocked[y * width + x])

    def brushed(x, y):
        return f"{x % size},{y % size},0" in foliage_by_sector.get(sector_id(x // size, y // size), {})

    planted = []
    for crown in crowns:
        cx, cy = crown["centre"]
        radius = math.sqrt(crown["areaM2"] / math.pi)
        if any((x, y) in tree_cells and math.hypot(x + .5 - cx, y + .5 - cy) <= radius
               for x in range(math.floor(cx - radius), math.floor(cx + radius) + 1)
               for y in range(math.floor(cy - radius), math.floor(cy + radius) + 1)):
            if tally is not None:
                tally["held"] += 1
            continue
        tx, ty = crown["top"]
        reach = max(1.0, radius / 2)
        cells = sorted((math.hypot(x + .5 - tx, y + .5 - ty), y, x)
                       for x in range(math.floor(tx - reach), math.floor(tx + reach) + 1)
                       for y in range(math.floor(ty - reach), math.floor(ty + reach) + 1)
                       if math.hypot(x + .5 - tx, y + .5 - ty) <= reach)
        for _, y, x in cells:
            if not clear(x, y) or (x, y) in occupied or (x, y) in keep_clear or brushed(x, y):
                continue
            if any((x + dx, y + dy) in tree_cells for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                continue
            kind = "tree-pine" if crown["heightM"] >= CROWN_NARROW * crown["widthM"] else "tree-broadleaf"
            occupied.add((x, y))
            tree_cells.add((x, y))
            planted.append((x, y))
            props_by_sector[sector_id(x // size, y // size)].append({
                "x": x % size, "y": y % size, "z": 0, "kind": kind + ("-large" if crown["heightM"] >= CROWN_MATURE_M else ""),
                "mountDora": {"sourceId": crown["id"], "habitat": HABITATS[green[y * width + x]] or "unmapped", "placement": "lidar-crown",
                              "crown": {"heightM": crown["heightM"], "widthM": crown["widthM"], "top": [_json_number(round(tx, 2)), _json_number(round(ty, 2))]}},
            })
            break
        else:
            if tally is not None:
                tally["noGround"] += 1
    # The understory around the new trunks, as build_vegetation paints it around seeded ones.
    for x, y in planted:
        habitat = green[y * width + x]
        if habitat not in BRUSH_DENSITY:
            continue
        for brush_y in range(y - 2, y + 3):
            for brush_x in range(x - 2, x + 3):
                if not clear(brush_x, brush_y) or (brush_x, brush_y) in occupied:
                    continue
                if green[brush_y * width + brush_x] != habitat:
                    continue
                foliage_by_sector[sector_id(brush_x // size, brush_y // size)][f"{brush_x % size},{brush_y % size},0"] = [BRUSH_DENSITY[habitat], False, "woodland-v1"]
    return len(planted)
