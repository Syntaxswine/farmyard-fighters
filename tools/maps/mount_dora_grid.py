"""Deterministic one-metre rectilinear building authoring (geography stays raw)."""
from __future__ import annotations
import math

def signed_area(ring):
    return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ring,ring[1:]))/2

def area(polygons):
    return sum(abs(signed_area(p[0]))-sum(abs(signed_area(r)) for r in p[1:]) for p in polygons)

def inside(point,ring):
    x,y=point;yes=False
    for a,b in zip(ring,ring[1:]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:yes=not yes
    return yes

def ring_cells(ring,width=1440,height=1680):
    result=set()
    for y in range(max(0,math.floor(min(p[1] for p in ring))),min(height,math.ceil(max(p[1] for p in ring)))):
        cuts=sorted(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]) for a,b in zip(ring,ring[1:]) if (a[1]>y+.5)!=(b[1]>y+.5))
        for a,b in zip(cuts[::2],cuts[1::2]):
            result.update((x,y) for x in range(max(0,math.ceil(a-.5)),min(width,math.ceil(b-.5))))
    return result

def cells(polygons):
    result=set()
    for polygon in polygons:
        current=ring_cells(polygon[0])
        for hole in polygon[1:]:current-=ring_cells(hole)
        result|=current
    return result

def dominant_angle(polygons):
    co=si=0
    for polygon in polygons:
        for ring in polygon:
            for a,b in zip(ring,ring[1:]):
                dx,dy=b[0]-a[0],b[1]-a[1];weight=dx*dx+dy*dy;t=math.atan2(dy,dx)
                co+=weight*math.cos(4*t);si+=weight*math.sin(4*t)
    return math.atan2(si,co)/4

def simplify(ring):
    points=ring[:-1]
    while len(points)>=4:
        keep=[]
        for i,p in enumerate(points):
            a,b=points[i-1],points[(i+1)%len(points)]
            if p==a or p==b:continue
            if (a[0]==p[0]==b[0]) or (a[1]==p[1]==b[1]):continue
            keep.append(p)
        if keep==points:break
        points=keep
    return points+[points[0]] if points else []

def crosses(a,b,c,d):
    if a[0]==b[0] and c[0]==d[0]:return a[0]==c[0] and max(min(a[1],b[1]),min(c[1],d[1]))<=min(max(a[1],b[1]),max(c[1],d[1]))
    if a[1]==b[1] and c[1]==d[1]:return a[1]==c[1] and max(min(a[0],b[0]),min(c[0],d[0]))<=min(max(a[0],b[0]),max(c[0],d[0]))
    if a[0]!=b[0]:a,b,c,d=c,d,a,b
    return min(c[0],d[0])<=a[0]<=max(c[0],d[0]) and min(a[1],b[1])<=c[1]<=max(a[1],b[1])

def valid_ring(ring):
    if len(ring)<5 or ring[0]!=ring[-1] or not signed_area(ring):return False
    edges=list(zip(ring,ring[1:]))
    if any(a==b or (a[0]!=b[0] and a[1]!=b[1]) for a,b in edges):return False
    return not any(crosses(*a,*b) for i,a in enumerate(edges) for j,b in enumerate(edges) if j>i+1 and not(i==0 and j==len(edges)-1))

def rectify_ring(ring,centre,angle,phase=0):
    co,si=math.cos(angle),math.sin(angle)
    points=[[(p[0]-centre[0])*co+(p[1]-centre[1])*si+centre[0],-(p[0]-centre[0])*si+(p[1]-centre[1])*co+centre[1]] for p in ring[:-1]]
    edges=[]
    for i,a in enumerate(points):
        b=points[(i+1)%len(points)];dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy)
        if length<1e-8:continue
        axis=0 if abs(dx)>=abs(dy) else 1
        coord=(a[1-axis]+b[1-axis])/2
        edges.append([axis,coord*length,length])
    # Start at a real turn, then coalesce noisy nearly collinear edge chains.
    start=next((i for i in range(len(edges)) if edges[i][0]!=edges[i-1][0]),None)
    if start is None:raise ValueError('No orthogonal turns')
    edges=edges[start:]+edges[:start];runs=[]
    for axis,total,length in edges:
        if runs and runs[-1][0]==axis:runs[-1][1]+=total;runs[-1][2]+=length
        else:runs.append([axis,total,length])
    lines=[(axis,math.floor(total/length+.5+phase)) for axis,total,length in runs]
    vertices=[]
    for i,(axis,value) in enumerate(lines):
        previous=lines[i-1][1]
        vertices.append([previous,value] if axis==0 else [value,previous])
    result=simplify(vertices+[vertices[0]])
    if not valid_ring(result):raise ValueError('Collapsed or self-intersecting ring')
    if signed_area(result)*signed_area(ring)<0:raise ValueError('Ring winding changed')
    return result

def rectify(polygons,phase=0,angle=None,centre=None):
    points=[q for p in polygons for r in p for q in r];centre=centre or [(min(p[i] for p in points)+max(p[i] for p in points))/2 for i in (0,1)]
    angle=dominant_angle(polygons) if angle is None else angle
    result=[[rectify_ring(r,centre,angle,phase) for r in polygon] for polygon in polygons]
    for polygon in result:
        outer=ring_cells(polygon[0])
        for hole in polygon[1:]:
            hc=ring_cells(hole)
            if not hc or not hc<outer:raise ValueError('Courtyard collapsed or left exterior')
            if any(crosses(a,b,c,d) for a,b in zip(polygon[0],polygon[0][1:]) for c,d in zip(hole,hole[1:])):raise ValueError('Courtyard touches exterior')
    return result,angle
"""Fit all building shells as shared, deterministic integer-edge components.

Geographic source rings remain untouched. This authoring step supplies only the
rectilinear geometry consumed by native walls, masks and the production art kit.
"""
import collections
import itertools


def _bounds(shapes):
    points = [point for polygons in shapes.values() for poly in polygons for ring in poly for point in ring]
    return [min(p[0] for p in points), min(p[1] for p in points),
            max(p[0] for p in points), max(p[1] for p in points)]


def _translate(shapes, dx, dy):
    return {id: [[[[x+dx, y+dy] for x,y in ring] for ring in poly] for poly in polygons]
            for id, polygons in shapes.items()}


def _rows(coords):
    rows = {}
    for x,y in coords:
        rows[y] = rows.get(y, 0) | (1 << x)
    return rows


def _trim(shapes, trims):
    west, north, east, south = _bounds(shapes)
    lo_x, lo_y, hi_x, hi_y = west+trims[0], north+trims[1], east-trims[2], south-trims[3]
    result = {}
    for id, polygons in shapes.items():
        result[id] = []
        for outer, *holes in polygons:
            if any(not (lo_x < x < hi_x and lo_y < y < hi_y) for hole in holes for x,y in hole):
                raise ValueError('Street frontage trim touches a courtyard')
            clipped = simplify([[max(lo_x, min(hi_x, x)), max(lo_y, min(hi_y, y))] for x,y in outer])
            if not valid_ring(clipped) or signed_area(clipped)*signed_area(outer) <= 0:
                raise ValueError('Street frontage trim changes ring topology')
            result[id].append([clipped, *holes])
    return result


def _fit_street_clearance(groups, street_corridor, protected, validate, by_id, options, width, depth):
    if len(street_corridor) != width*depth:
        raise ValueError('Street clearance mask dimensions differ from the terrain')
    painted = _rows((i%width, i//width) for i, value in enumerate(street_corridor) if value)
    reserved = {}
    for y in range(depth):
        row = painted.get(y-1, 0) | painted.get(y, 0) | painted.get(y+1, 0)
        # Integer footprints need one extra tile next to angled raster edges.
        # This also keeps native wall thickness and façade ornaments off the sidewalk.
        reserved[y] = row | (row << 1) | (row >> 1)
    immovable = _rows(protected)
    occupied = _rows(cell for g in groups for floor in g['current']['cells'].values() for cell in floor)
    offsets = sorted((dx*dx+dy*dy, dx, dy) for dx in range(-12, 13) for dy in range(-12, 13)
                     if dx*dx+dy*dy <= 144)

    for group in groups:
        current = group['current']
        old_rows = _rows(cell for floor in current['cells'].values() for cell in floor)
        if not any(bits & reserved[y] for y,bits in old_rows.items()):
            continue
        if current['override']:
            raise ValueError('Reviewed footprint needs a street clearance revision: '+','.join(group['ids']))
        blocked = {y: reserved[y] | immovable.get(y, 0) | (occupied.get(y, 0) & ~old_rows.get(y, 0))
                   for y in range(depth)}
        ids, pairs = group['ids'], group['pairs']
        variants = [current] + group['families']
        old_x0,old_y0,old_x1,old_y1 = _bounds(current['shapes'])
        best = None
        score = math.inf

        def try_shape(base, trims, turned=False):
            nonlocal best, score
            shape_cost = 4*sum(trims) + (9 if turned else 0)
            if shape_cost >= score:
                return
            shapes, footprint = base['shapes'], base['cells']
            if any(trims):
                try:
                    shapes = _trim(shapes, trims)
                    footprint = validate(shapes, ids, pairs)
                except ValueError:
                    return
            sample = _rows(cell for floor in footprint.values() for cell in floor)
            x0,y0,x1,y1 = _bounds(shapes)
            for distance,dx,dy in offsets:
                total = distance+shape_cost
                if total >= score:
                    break
                if (x0+dx < min(0, old_x0-2) or y0+dy < min(0, old_y0-2) or
                    x1+dx > max(width, old_x1+2) or y1+dy > max(depth, old_y1+2)):
                    continue
                if x0+dx < 0 or y0+dy < 0 or x1+dx > width or y1+dy > depth or x0 < 0 or y0 < 0 or x1 > width or y1 > depth:
                    # A published building may already extend beyond the town
                    # crop. Sample its translated visible portion exactly.
                    moved = _translate(shapes, dx, dy)
                    trial = _rows(cell for polys in moved.values() for cell in cells(polys))
                else:
                    trial = {y+dy: bits<<dx if dx>=0 else bits>>-dx for y,bits in sample.items()}
                if not trial or any(bits & blocked[y] for y,bits in trial.items()):
                    continue
                moved = _translate(shapes, dx, dy)
                try:
                    moved_cells = validate(moved, ids, pairs)
                except ValueError:
                    continue
                if any(not moved_cells[id] and current['cells'][id] for id in ids):
                    continue
                best = {**base, 'shapes':moved, 'cells':moved_cells, 'dx':base['dx']+dx, 'dy':base['dy']+dy,
                        'streetClearance':{'streetSetbackMetres':[dx,dy], 'frontageTrimMetres':list(trims),
                                           'quarterTurn':turned}}
                score = total
                break

        for base in variants:
            try_shape(base, (0,0,0,0))
        for amount in range(1, 5):
            if 4*amount >= score:
                break
            for sides in itertools.combinations_with_replacement(range(4), amount):
                trims = tuple(sides.count(side) for side in range(4))
                for base in variants:
                    try_shape(base, trims)
        if best is None and len(ids)==1:
            # A historic street line may cross a surveyed roof. Try the other
            # cardinal orientation only when preserving the original axis
            # cannot keep that shell in the surrounding block.
            id = ids[0]
            for phase in options['phaseOffsets']:
                angle = current['angle']+math.pi/2
                try:
                    shapes = {id:rectify(by_id[id]['geometry']['coordinates'], phase, angle, group['centre'])[0]}
                    rotated = {**current, 'shapes':shapes, 'cells':validate(shapes, ids, pairs),
                               'angle':angle, 'phase':phase, 'dx':0, 'dy':0}
                except ValueError:
                    continue
                for amount in range(5):
                    for sides in itertools.combinations_with_replacement(range(4), amount):
                        try_shape(rotated, tuple(sides.count(side) for side in range(4)), turned=True)
        if best is None:
            raise ValueError('No building fit clears both sidewalks: '+','.join(ids))
        for y,bits in old_rows.items():
            occupied[y] &= ~bits
        for y,bits in _rows(cell for floor in best['cells'].values() for cell in floor).items():
            occupied[y] = occupied.get(y, 0) | bits
        group['current'] = best


def author_buildings(buildings, source_walls, terrain, codebook, options, *,
                     street_corridor=None, street_fit_terrain=None):
    if options.get('version') != 1 or options.get('gridMetres') != 1:
        raise ValueError('Unsupported building-grid authoring profile')
    by_id={f['id']:f for f in buildings}
    parents={id:id for id in by_id}
    def root(id):
        while parents[id]!=id:
            parents[id]=parents[parents[id]];id=parents[id]
        return id
    shared=set()
    for wall in source_walls:
        owners=[id for id in wall['owners'] if id in by_id]
        for a,b in itertools.combinations(owners,2):
            shared.add(tuple(sorted((a,b))))
            parents[root(b)]=root(a)
    components=collections.defaultdict(list)
    for id in sorted(by_id):components[root(id)].append(id)
    originals={id:cells(f['geometry']['coordinates']) for id,f in by_id.items()}
    source_cells=set().union(*originals.values())
    width=1440
    protected_codes={codebook[k] for k in ('water','ground-asphalt','ground-concrete','ground-dirt','ground-gravel','ground-wood-planks','bridge')}
    protected={(i%width,i//width) for i,value in enumerate(terrain) if value in protected_codes}-source_cells
    overrides=options.get('overrides',{})
    if set(overrides)-set(by_id):raise ValueError('Grid override refers to an unknown building')
    groups=[]
    def touches(a,b):
        return any((x+dx,y+dy) in b for x,y in a for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)))
    def validate(shapes,ids,pairs):
        cs={id:cells(shape) for id,shape in shapes.items()}
        for id,polygons in shapes.items():
            if len(polygons)!=len(by_id[id]['geometry']['coordinates']):raise ValueError('Building component topology changed: '+id)
            if any(not valid_ring(r) or any(not isinstance(v,int) for p in r for v in p) for poly in polygons for r in poly):raise ValueError('Non-grid or invalid authored ring: '+id)
            if any(abs(area(polygons)/area(by_id[id]['geometry']['coordinates'])-1)>options['maxAreaChangeFraction'] for id,polygons in shapes.items()):raise ValueError('Building area outlier')
        if any(cs[a]&cs[b] for a,b in itertools.combinations(ids,2)):raise ValueError('Shared component overlaps')
        if any(not touches(cs[a],cs[b]) for a,b in pairs):raise ValueError('Shared-owner relationship separated')
        return cs
    for ids in sorted(components.values(),key=lambda ids:ids[0]):
        polygons=[p for id in ids for p in by_id[id]['geometry']['coordinates']]
        points=[q for p in polygons for r in p for q in r]
        centre=[(min(q[i] for q in points)+max(q[i] for q in points))/2 for i in (0,1)]
        angle=dominant_angle(polygons);pairs=[pair for pair in shared if pair[0] in ids and pair[1] in ids];families=[]
        if any(id in overrides for id in ids):
            if not all(id in overrides for id in ids):raise ValueError('Override every member of a shared-wall component together')
            shapes={id:overrides[id]['geometry']['coordinates'] for id in ids}
            families=[{'shapes':shapes,'cells':validate(shapes,ids,pairs),'angle':angle,'phase':None,'dx':0,'dy':0,'override':True}]
        else:
            for turn in ([0,math.pi/2] if abs(angle)>math.pi/8 else [0]):
                for phase in options['phaseOffsets']:
                    try:
                        shapes={id:rectify(by_id[id]['geometry']['coordinates'],phase,angle+turn,centre)[0] for id in ids}
                        cs=validate(shapes,ids,pairs)
                        families.append({'shapes':shapes,'cells':cs,'angle':angle+turn,'phase':phase,'dx':0,'dy':0,'override':False})
                    except ValueError:pass
        if not families:raise ValueError('Unresolved grid shape/component: '+','.join(ids))
        fidelity=lambda c:sum(len(c['cells'][id]^originals[id]) for id in ids)
        groups.append({'ids':ids,'centre':centre,'pairs':pairs,'families':families,'current':min(families,key=fidelity)})
    occupancy=collections.defaultdict(set)
    for group in groups:
        for id,cs in group['current']['cells'].items():
            for cell in cs:occupancy[cell].add(id)
    empty=frozenset()
    def score(group,candidate):
        ids=set(group['ids'])
        road=sum(cell in protected for cs in candidate['cells'].values() for cell in cs)
        overlap=sum(bool(occupancy.get(cell,empty)-ids) for cs in candidate['cells'].values() for cell in cs)
        fidelity=sum(len(candidate['cells'][id]^originals[id]) for id in ids)
        return road+overlap,road,overlap,fidelity,candidate['dx']**2+candidate['dy']**2
    offsets=sorted(((x,y) for x in range(-4,5) for y in range(-4,5) if x*x+y*y<=options['maxTranslationSquaredMetres']),key=lambda p:(p[0]**2+p[1]**2,p))
    for iteration in range(3):
        changed=False
        for group in groups:
            current=group['current'];best_score=score(group,current)
            if not best_score[0] or current['override']:continue
            best=current
            for base in group['families']:
                for dx,dy in offsets:
                    shapes=_translate(base['shapes'],dx,dy)
                    # Re-sample the translated polygons: moving an edge into the
                    # town must include cells previously outside the crop.
                    cs={id:cells(shape) for id,shape in shapes.items()}
                    candidate={**base,'shapes':shapes,'cells':cs,'dx':dx,'dy':dy};s=score(group,candidate)
                    if s<best_score:best,best_score=candidate,s
            if best is not current:
                for id,cs in current['cells'].items():
                    for cell in cs:occupancy[cell].discard(id)
                group['current']=best
                for id,cs in best['cells'].items():
                    for cell in cs:occupancy[cell].add(id)
                changed=True
        if not changed:break
    unresolved=[{'ids':g['ids'],'violations':score(g,g['current'])[:3]} for g in groups if score(g,g['current'])[0]]
    if unresolved:raise ValueError('Grid layout intrudes on streets/water/neighbours: '+str(unresolved))
    if street_corridor is not None:
        if street_fit_terrain is not None:
            if len(street_fit_terrain) != len(terrain):
                raise ValueError('Street fit terrain dimensions differ from the source terrain')
            water = codebook['water']
            protected = {(i%width,i//width) for i, value in enumerate(street_fit_terrain)
                         if value in protected_codes and (value != water or terrain[i] == water)}-source_cells
        _fit_street_clearance(groups, street_corridor, protected, validate, by_id, options, width, len(terrain)//width)
    records=[]
    for group in groups:
        candidate=group['current']
        for id in group['ids']:
            polygons=candidate['shapes'][id];points=[q for poly in polygons for r in poly for q in r]
            b=[min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]
            original=by_id[id];old_bounds=original['bounds'];old_centre=[(old_bounds[i]+old_bounds[i+2])/2 for i in (0,1)];new_centre=[(b[i]+b[i+2])/2 for i in (0,1)]
            records.append({'id':id,'geometry':{'type':'MultiPolygon','coordinates':polygons},'bounds':b,'componentIds':group['ids'],
                'derivation':{'method':'reviewed-grid-override' if candidate['override'] else 'shared-component-dominant-axis','dominantAxisDegrees':round(candidate['angle']*180/math.pi,9),'componentCentre':group['centre'],'phase':candidate['phase'],'translationMetres':[candidate['dx'],candidate['dy']],
                    'note':overrides[id]['reason'] if candidate['override'] else 'Coherent cardinal lines and one-metre integer tile edges; geographic source retained.',
                    **({'streetClearance':candidate['streetClearance']} if 'streetClearance' in candidate else {})},
                'metrics':{'sourceAreaM2':area(original['geometry']['coordinates']),'authoredAreaM2':area(polygons),'centreShiftM':math.dist(old_centre,new_centre),'sourceFloorCells':len(originals[id]),'authoredFloorCells':len(candidate['cells'][id])}})
    records.sort(key=lambda r:r['id'])
    return {'kind':'mount-dora-authored-buildings','version':1,'gridMetres':1,'coordinatePolicy':'integer town structural edges; host game coordinates subtract0.5 exactly once','records':records,
        'metrics':{'buildings':len(records),'components':len(groups),'sourceFloorCells':len(source_cells),'authoredFloorCells':sum(r['metrics']['authoredFloorCells'] for r in records),'sourceHoles':sum(len(p)-1 for f in buildings for p in f['geometry']['coordinates']),'authoredHoles':sum(len(p)-1 for r in records for p in r['geometry']['coordinates']),'sharedOwnerPairs':len(shared),'sharedOwnerPairsRetained':sum(touches(next(g['current']['cells'][a] for g in groups if a in g['ids']),next(g['current']['cells'][b] for g in groups if b in g['ids'])) for a,b in shared),'newStreetWaterCells':0,'overlappingInteriorCells':0}}
