// A pin on maps/mount-dora/features.json for the tools that read it: the house
// reference and the lidar roofs. Both read only OSM-sourced features (their
// ids, categories, tags, geographic geometry and, for buildings, the sector
// list) and the hand-placed shelters and stages the generator lays over them
// (`authoredStructures`). build-mount-dora.py writes the rest from these tools' outputs
// (`nativeProxy`, the authored grid outlines, layout digests) and adds the
// county buildings listed in reference/county-buildings.json, so pinning the
// whole file would make every regeneration invalidate the tools that feed it.
// The digest covers exactly the fields they read; a change to any still shows.
import {createHash} from 'node:crypto';

export const isOsm = feature => Boolean(feature.osm);

export function featuresDigest(bytes) {
  const doc = JSON.parse(bytes);
  const read = doc.features.filter(isOsm).map(f => ({id: f.id, category: f.category, tags: f.tags,
    geometry: f.geographicGeometry ?? f.geometry, ...(f.category === 'building' ? {sectors: f.nativeSectors ?? []} : {})}));
  const structures = (doc.authoredStructures ?? []).map(s => ({id: s.id, geometry: s.geographicGeometry ?? s.geometry}));
  return createHash('sha256').update(JSON.stringify({features: read, structures})).digest('hex');
}

export const featuresPin = bytes => ({file: 'maps/mount-dora/features.json', sha256OfFieldsRead: featuresDigest(bytes),
  fields: 'OSM-sourced features only: id, category, tags, geographicGeometry (else geometry); nativeSectors for buildings; authoredStructures ids and geographicGeometry (else geometry)'});
