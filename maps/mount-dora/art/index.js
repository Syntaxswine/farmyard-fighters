// Map-owned recipe helpers. No terrain projection, editor state, rendering or sector generation.
export function validateLandmarkArt(manifest,geography,assets){
 const errors=[],known=new Set(assets.assets.map(a=>a.id)),features=new Map(geography.features.map(f=>[f.id,f]));
 if(manifest.schema!=='mount-dora-landmark-art/1'||manifest.engineRevision!=='2502646482218524fd5129641da769bb82462e4d')errors.push('Use the reviewed Mount Dora art contract and fixed workshop revision.');
 const ids=new Set();for(const landmark of manifest.landmarks){
  if(ids.has(landmark.id))errors.push('Duplicate landmark: '+landmark.id);ids.add(landmark.id);
  if(!landmark.previewOnly||!Array.isArray(landmark.limitations)||!landmark.limitations.length)errors.push('A visual study needs explicit limitations: '+landmark.id);
  if(!features.has(landmark.geographicAnchor.sourceFeatureId))errors.push('Missing geographic anchor: '+landmark.id);
  if(!Array.isArray(landmark.geographicAnchor.townPoint)||landmark.geographicAnchor.townPoint.length!==2||landmark.geographicAnchor.townPoint.some(n=>!Number.isFinite(n)))errors.push('Invalid town anchor: '+landmark.id);
  for(const id of landmark.sourceFeatureIds)if(!features.has(id))errors.push('Missing source feature: '+id);
  for(const id of landmark.catalogueAssetIds)if(!known.has(id))errors.push('Unsupported catalogue asset: '+id);
 }
 if(features.size!==geography.features.length)errors.push('Duplicate geographic source identities.');
 return errors;
}
// Conservative authoring references, not clipped meshes or new sector topology.
export function referencesForSector(manifest,geography,column,row){
 if(!Number.isInteger(column)||!Number.isInteger(row)||column<0||column>=manifest.world.columns||row<0||row>=manifest.world.rows)throw Error('Choose a declared town sector.');
 const features=new Map(geography.features.map(f=>[f.id,f]));
 return manifest.landmarks.flatMap(l=>{const ids=l.sourceFeatureIds.filter(id=>features.get(id)?.sectorReferences.some(s=>s.column===column&&s.row===row));return ids.length?[{landmarkId:l.id,globalSourceIds:ids,geographicAnchor:structuredClone(l.geographicAnchor),geometryPolicy:'Host-owned pieces; retain global identities; no seam caps'}]:[];});
}
export function requireCatalogueBindings(landmark,supportedIds){
 const supplied=new Set(supportedIds),missing=landmark.catalogueAssetIds.filter(id=>!supplied.has(id));
 if(missing.length)throw Error('Landmark '+landmark.id+' needs explicit bindings: '+missing.join(', '));
 return structuredClone(landmark);
}
