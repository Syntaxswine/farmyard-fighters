"""Verify art geometry factories in both immutable released source trees; never read moving worker code."""
from pathlib import Path
import subprocess,json,hashlib,sys
root=Path(__file__).resolve().parents[1];farmyard=root.parents[2];engine=Path(sys.argv[1]);engine_rev='2502646482218524fd5129641da769bb82462e4d';farm_rev='251bf8094b5f9ebe44208443084c1a6d6658512a'
records=[]
for name in ['biome-foliage-models.js','biome-foliage-data.js','biome-plant-parts.js','foliage-models.js','environment-geometry.js','hybrid-world.js','environment-visuals.js','environment-models.js','painted-furniture.js']:
 ep='vendor/aft/781246a668c723d5a4c5463e70534cc04b6a5641/dist/tactics/'+name;fp='sites/tactical-animal/dist/aft/tactics/'+name
 a=subprocess.run(['git','-C',str(engine),'show',engine_rev+':'+ep],check=True,stdout=subprocess.PIPE).stdout
 b=subprocess.run(['git','-C',str(farmyard),'show',farm_rev+':'+fp],check=True,stdout=subprocess.PIPE).stdout
 if a.replace(b'\r\n',b'\n')!=b.replace(b'\r\n',b'\n'):raise ValueError('Geometry source differs: '+name)
 records.append({'module':name,'nautilus':{'revision':engine_rev,'path':ep,'sha256':hashlib.sha256(a).hexdigest()},'farmyard':{'revision':farm_rev,'path':fp,'sha256':hashlib.sha256(b).hexdigest()},'comparison':'exact after CRLF/LF normalization'})
(root/'source/geometry-compatibility.json').write_bytes((json.dumps({'schema':1,'records':records},indent=2)+'\n').encode('utf-8'))
print(json.dumps({'verifiedGeometryModules':len(records)}))
