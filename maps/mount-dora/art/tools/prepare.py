"""Read only reviewed Git objects and verified Mount Dora geodata; write art-owned reference files."""
from pathlib import Path
import json,subprocess,hashlib,sys
ROOT=Path(__file__).resolve().parents[1]
ENGINE=Path(sys.argv[1]); DATA=Path(sys.argv[2]); REV='2502646482218524fd5129641da769bb82462e4d'
sha=lambda b:hashlib.sha256(b).hexdigest()
def put(name,b):
 p=ROOT/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b if isinstance(b,bytes) else b.encode('utf-8'))
def write(name,d):put(name,json.dumps(d,indent=2,ensure_ascii=False)+'\n')
provenance=[]
def source(name):
 b=subprocess.run(['git','-C',str(ENGINE),'show',REV+':'+name],check=True,stdout=subprocess.PIPE).stdout
 dest='source/nautilus/'+name;put(dest,b);provenance.append({'repository':'Nautilus Engine','revision':REV,'path':name,'local':dest,'bytes':len(b),'sha256':sha(b)});return b
catalogue=source('packages/assets/catalogue.js').decode('utf-8');assets=json.loads(catalogue[catalogue.index('['):catalogue.rindex(']')+1])
for n in ['packages/building-catalog/designs.js','packages/building-catalog/index.js','packages/building-catalog/three.js','packages/roof-core/index.js','packages/roof-core/three.js','assets/buildings/painted-materials-v2.png','NOTICE.md']:source(n)
# Keep exact boundary sources for the shortcomings report; no engine change or runtime pin.
for n in ['apps/editor/asset-catalog.js','packages/prefab-core/index.js','packages/map-core/wall-runs.js','apps/editor/editor.js']:
 b=subprocess.run(['git','-C',str(ENGINE),'show',REV+':'+n],check=True,stdout=subprocess.PIPE).stdout
 provenance.append({'repository':'Nautilus Engine','revision':REV,'path':n,'referenceOnly':True,'bytes':len(b),'sha256':sha(b)})
input_names=['osm-downtown-snapshot.json','osm-source.json','projected-ways.json','survey.json']
inputs={n:{'bytes':len((DATA/n).read_bytes()),'sha256':sha((DATA/n).read_bytes())} for n in input_names}
ways={w['id']:w for w in json.loads((DATA/'projected-ways.json').read_text(encoding='utf-8-sig'))}
osm=json.loads((DATA/'osm-downtown-snapshot.json').read_text(encoding='utf-8-sig'));nodes={e['id']:e for e in osm['elements'] if e['type']=='node'}
# Ground anchors retain original source identity. No screenshots become geometry.
sets={
 'donnelly-park':[468920884,557051180,557051194,561136643,561136644,1215493446,557051202],
 'lakeside-inn':[560095890,560095892,560095893,560095895,560095896,560095897,560095898,560095899],
 'elizabeth-evans':[486656245,559770164,559770165,559770166,559770167,559770171,559770172,559770175,559770178,559770191,559770193,559770196],
 'gilbert-park':[468921011,557154683,557154684,557349878],
 'palm-island':[548471563,688219167,557051211],
}
# Public historic frontage examples near Donnelly/5th; retain unnamed sources as unnamed.
sets['historic-shopfronts']=[i for i,w in ways.items() if 'building' in w['tags'] and -135<(w['bounds'][0]+w['bounds'][2])/2<85 and 46<(w['bounds'][1]+w['bounds'][3])/2<175]
features={}
keep={'name','building','amenity','leisure','sport','surface','bridge','layer','description','shelter_type','tourism','brand'}
def sectors(bounds):
 x0,y0,x1,y1=bounds
 return [{'column':x,'row':y} for y in range(max(0,int(y0//240)),min(6,int((y1-1e-8)//240))+1) for x in range(max(0,int(x0//240)),min(5,int((x1-1e-8)//240))+1)]
for i in sorted({i for ids in sets.values() for i in ids}):
 w=ways[i];b=w['bounds'];points=[[round(p[0]+480,4),round(p[1]+480,4)] for p in w['points']];bounds=[round(v+480,4) for v in b]
 features['osm:way/'+str(i)]={'id':'osm:way/'+str(i),'kind':'polygon' if points[0]==points[-1] else 'polyline','sourceId':i,'sourceType':'way','tags':{k:v for k,v in w['tags'].items() if k in keep},'townPoints':points,'townBounds':bounds,'sectorReferences':sectors(bounds),'coverage':'conservative full bounds; host clips geometry; do not cap sector cuts'}
node=nodes[2704687214];features['osm:node/2704687214']={'id':'osm:node/2704687214','kind':'point','sourceId':2704687214,'sourceType':'node','tags':{'name':node['tags']['name']},'wgs84':{'lat':node['lat'],'lon':node['lon']},'townPoint':[500.2877,1169.7989],'townBounds':[500.2876,1169.7988,500.2878,1169.799],'sectorReferences':[{'column':2,'row':4}],'coordinateSource':'Architect supplied verified ECEF tangent projection; no second projection or scale'}
write('geography.json',{'schema':'mount-dora-art-geography/1','units':'metres','axes':['east','south'],'townOffset':[480,480],'features':list(features.values()),'attribution':'© OpenStreetMap contributors, ODbL 1.0','sourceURL':'https://www.openstreetmap.org/copyright','inputs':inputs})
selected=['building:branchline-depot','building:estuary-cottage','building:coach-yard-inn','building:pepper-corner-shop','building:batten-general-store','building:market-terrace','terrain:ground-wood-planks','terrain:ground-concrete','terrain:ground-biome-wetlands','terrain:ground-grass','objects:streetlight','objects:streetlight-double','objects:tree-broadleaf','objects:tree-broadleaf-large','objects:reeds','objects:table-wood','objects:chair-wood-honey','boundaries:fence-railing','boundaries:fence-chainlink','boundaries:window-brick','boundaries:window-concrete','boundaries:door-wood-closed','foliage:wetland-v1','foliage:woodland-v1']
lookup={a['id']:a for a in assets}
assert all(i in lookup for i in selected)
write('source/selected-assets.json',{'revision':REV,'catalogue':'packages/assets/catalogue.js','assets':[lookup[i] for i in selected]})
write('source/provenance.json',{'schema':1,'engineRevision':REV,'engineBaselineOnly':True,'farmyardBase':'251bf8094b5f9ebe44208443084c1a6d6658512a','geodataInputs':inputs,'files':provenance})
# The manifest is map-owned art metadata, never a new engine preset registry.
landmarks=[]
config={
 'donnelly-park':('Donnelly Park / building, deck and courts',468920884,'civic-park',['building:branchline-depot','terrain:ground-concrete','boundaries:fence-chainlink','objects:streetlight','objects:tree-broadleaf-large'],['No surveyed building interiors or heights.','Court/stage use is city-confirmed; five mapped court footprints are preserved as mapped, not asserted to be the current complete count.','Stage/deck shape and court paint remain explicit authoring studies, not invented native presets.']),
 'lakeside-inn':('Lakeside Inn / historic hotel group',560095897,'yellow-veranda',['building:branchline-depot','building:estuary-cottage','building:coach-yard-inn'],['Anchor is one small associated building, not the complete hotel outline.','Eight OSM associated structures remain independent footprint identities. OSM labels are retained, not asserted as current hotel operation names.','Yellow/white facade, deep porch and green roof/awning are visual treatment; catalogue plans and rooms are not surveyed inn interiors.']),
 'elizabeth-evans':('Elizabeth Evans Park / lakefront pavilion',486656245,'lakefront-timber',['terrain:ground-wood-planks','boundaries:fence-railing','objects:reeds'],['Source park is named Evans Park; the city name is Elizabeth Evans Park.','Mapped lawn-bowling shelters are not silently relabelled as the lakefront pavilion.','The lakefront pavilion has no independently verified point/footprint in this source subset: retain park anchor and defer precise pavilion placement.']),
 'gilbert-park':('Gilbert Park / pavilions',468921011,'civic-park',['terrain:ground-concrete','objects:table-wood','objects:tree-broadleaf-large'],['Two mapped pavilion footprints are retained separately from the restrooms.','Open-sided shelters use roof/column art studies; no invented pavilion prop ID.']),
 'palm-island':('Palm Island / wooden boardwalk and wetlands',688219167,'lakefront-timber',['terrain:ground-wood-planks','boundaries:fence-railing','foliage:wetland-v1','objects:reeds'],['Follow mapped wood footway centreline; do not straighten/rescale it or move the shoreline.','OSM bridge layer is not a surveyed deck elevation. Native storey pitch is only an edit-friendly approximation.','Wetland foliage exists; a named public cabbage-palm preset and boardwalk-rail generator do not exist in the reviewed workshop catalogue.']),
 'historic-shopfronts':('Donnelly / Fifth Avenue shopfront palette',None,'historic-retail',['building:pepper-corner-shop','building:batten-general-store','building:market-terrace','boundaries:window-brick','objects:streetlight'],['Selected OSM footprints retain global IDs and actual street position.','Catalogue shopfronts/awnings are typology studies, not identical copies of individual businesses.','Do not stretch a whole prefab to fit a mapped polygon or create artificial walls at sector cuts.'])}
for key,ids in sets.items():
 name,anchor,palette,kit,limits=config[key];refs=['osm:way/'+str(i) for i in ids];a=features['osm:way/'+str(anchor or ids[0])];b=a['townBounds'];point=[round((b[0]+b[2])/2,4),round((b[1]+b[3])/2,4)]
 landmarks.append({'id':'md:'+key,'name':name,'geographicAnchor':{'sourceFeatureId':a['id'],'townPoint':point,'method':'source footprint bounds centre, a reference point rather than an entrance or surveyed building centre'},'sourceFeatureIds':refs,'palette':palette,'catalogueAssetIds':kit,'treatmentMode':'palette-over-host-footprints','previewOnly':True,'heightPolicy':'native kit dimensions only; no surveyed height or interiors','placementPolicy':'Keep source geometry and global identity; source footprint wins over the illustrative prefab. Host owns sector pieces; do not cap seams.','limitations':limits})
landmarks.insert(3,{'id':'md:grantham-lighthouse','name':'Grantham Point lighthouse','geographicAnchor':{'sourceFeatureId':'osm:node/2704687214','townPoint':[500.2877,1169.7989],'method':'architect supplied verified point'},'sourceFeatureIds':['osm:node/2704687214'],'palette':'lighthouse-stripes','catalogueAssetIds':['terrain:ground-concrete'],'treatmentMode':'bespoke-static-reference-required','previewOnly':True,'heightPolicy':'five 2.12m kit intervals = 10.6m visual proxy, not a survey','placementPolicy':'One global landmark at the supplied point. No fabricated interior or functioning beacon.','limitations':['No lighthouse preset exists in the reviewed catalogue. A map-owned static red/ivory tower study is retained separately and must not masquerade as an engine preset.']})
manifest={'schema':'mount-dora-landmark-art/1','status':'authoring recipe for architect review; no game/engine adoption','engineRevision':REV,'farmyardBase':'251bf8094b5f9ebe44208443084c1a6d6658512a','geography':'geography.json','assetCatalogue':'source/selected-assets.json','provenance':'source/provenance.json','world':{'units':'metres','north':'up / negative y','extent':[1440,1680],'sectorMetres':240,'columns':6,'rows':7,'projection':'architect-owned WGS84 ECEF local tangent plane','referenceWGS84':{'lat':28.8010291,'lon':-81.6442229},'townOffset':[480,480],'legacyTileCentre':'town = sectorOrigin + local integer + .5; do not apply .5 again to town anchors'},'palettes':{'yellow-veranda':{'sourceMaterials':['yellow-siding','plaster','green-metal','wood'],'nativeBoundaryFallback':'wood'},'civic-park':{'sourceMaterials':['cream-siding','plaster','green-metal','concrete'],'nativeBoundaryFallback':'concrete'},'lakefront-timber':{'sourceMaterials':['wood','dark-wood','green-metal'],'nativeBoundaryFallback':'wood'},'historic-retail':{'sourceMaterials':['brick','cream-siding','green-metal','plaster'],'nativeBoundaryFallback':'brick'},'lighthouse-stripes':{'sourceMaterials':['red-timber','plaster','green-metal'],'nativeBoundaryFallback':'concrete'}},'landmarks':landmarks,'failurePolicy':'Retain all source features and recipes. Unsupported bindings must be reported, never dropped or replaced with unknown native preset IDs.'}
write('manifest.json',manifest)
print(json.dumps({'landmarks':len(landmarks),'sourceFeatures':len(features),'registeredAssets':len(selected),'output':str(ROOT)}))
