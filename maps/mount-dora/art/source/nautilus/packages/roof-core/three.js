// Host-renderer adapter. Keep Three.js injected to avoid a second renderer copy.
import {createSlopedRoof, ROOF_FEATURE} from './index.js';

// Row-major cells in the existing 4×4 original-building painted atlas.
export const PAINTED_ROOF_MATERIALS = Object.freeze({
  slate: Object.freeze({tile: 8, color: 0x52616a, roughness: .94, metalness: 0}),
  clay: Object.freeze({tile: 9, color: 0xb56b46, roughness: .96, metalness: 0}),
  metal: Object.freeze({tile: 7, color: 0x698382, roughness: .8, metalness: .12}),
  fascia: Object.freeze({tile: 14, color: 0x65533f, roughness: 1, metalness: 0}),
  soffit: Object.freeze({tile: 5, color: 0x958267, roughness: 1, metalness: 0})
});
const lookup = (map, id) => map instanceof Map ? map.get(id) : map?.[id];

function atlasMaterial(T, atlas, id) {
  const finish = PAINTED_ROOF_MATERIALS[id];
  const sample = 'texture2D( map, vMapUv )';
  if (!T.ShaderChunk?.map_fragment?.includes(sample)) throw new TypeError('This host Three.js map shader needs an explicit painted-roof adapter.');
  const material = new T.MeshStandardMaterial({color: 0xffffff, map: atlas,
    roughness: finish.roughness, metalness: finish.metalness, vertexColors: true});
  // Repeat the selected cell in the shader. Geometry UVs retain physical metre
  // distances, without hundreds of atlas-clipped triangles or cloned textures.
  // Explicit gradients avoid false low-resolution mip selection at repeat seams.
  const col = finish.tile % 4, row = 3 - Math.floor(finish.tile / 4), inset = .012;
  const offset = [(col + inset) / 4, (row + inset) / 4], scale = (1 - 2 * inset) / 4;
  material.onBeforeCompile = shader => {
    const fragment = T.ShaderChunk.map_fragment.replace(sample,
      `textureGrad( map, vec2(${offset.join(',')}) + fract(vMapUv) * ${scale}, dFdx(vMapUv) * ${scale}, dFdy(vMapUv) * ${scale} )`);
    if (!shader.fragmentShader.includes('#include <map_fragment>')) throw new TypeError('Missing host Three.js map fragment hook.');
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', fragment);
  };
  material.customProgramCacheKey = () => `nautilus-painted-roof-v1:${finish.tile}`;
  material.userData = {roofMaterial: id, atlasTile: finish.tile, metresPerRepeat: 1};
  return material;
}

export function createRoofGroup(THREE, spec, options = {}) {
  const T = THREE;
  if (!T?.Group || !T.BufferGeometry || !T.Float32BufferAttribute || !T.Mesh || !T.MeshStandardMaterial) throw new TypeError('Supply the host Three.js instance.');
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Roof adapter options must be an object.');
  for (const key of ['materialMap', 'textures']) if (options[key] != null && !(options[key] instanceof Map) &&
    (typeof options[key] !== 'object' || Array.isArray(options[key]))) throw new TypeError(`Roof ${key} must be a Map or object.`);
  const data = createSlopedRoof(spec), ownedMaterials = new Set(), slotMaterials = [];
  const geometry = new T.BufferGeometry();
  try {
    for (const slot of data.materialSlots) {
      const supplied = lookup(options.materialMap, slot.id);
      if (supplied !== undefined) {
        if (!supplied?.isMaterial) throw new TypeError(`Host roof material ${slot.id} must be a Three.js material.`);
        slotMaterials.push(supplied); continue;
      }
      const finish = PAINTED_ROOF_MATERIALS[slot.id], texture = lookup(options.textures, slot.id);
      if (texture !== undefined && !texture?.isTexture) throw new TypeError(`Roof texture ${slot.id} must be a Three.js texture.`);
      if (options.atlas != null && !options.atlas.isTexture) throw new TypeError('Roof atlas must be a host Three.js texture.');
      const material = !options.grey && !texture && options.atlas ? atlasMaterial(T, options.atlas, slot.id)
        : new T.MeshStandardMaterial({color: options.grey ? 0xaaa99f : texture ? 0xffffff : finish.color,
          map: options.grey ? null : texture || null, roughness: finish.roughness, metalness: options.grey ? 0 : finish.metalness, vertexColors: true});
      material.name = `roof:${slot.id}`; ownedMaterials.add(material); slotMaterials.push(material);
    }
    for (const [name, values, size] of [['position', data.positions, 3], ['normal', data.normals, 3], ['uv', data.uvs, 2], ['color', data.colors, 3]]) {
      geometry.setAttribute(name, new T.Float32BufferAttribute(values, size));
    }
    geometry.setIndex(data.indices);
    for (const group of data.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new T.Mesh(geometry, slotMaterials), root = new T.Group();
    mesh.name = `${spec.id}:shell`; mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData = {feature: ROOF_FEATURE, roofId: spec.id}; root.add(mesh); root.name = spec.id;
    root.userData = {feature: ROOF_FEATURE, spec: {...data.spec}, bounds: data.bounds, metrics: data.metrics,
      metresPerUnit: 1, consumerIntegrated: false, physics: 'Host adapter required'};
    let disposed = false;
    root.dispose = () => {
      if (disposed) return; disposed = true;
      geometry.dispose(); for (const material of ownedMaterials) material.dispose(); root.removeFromParent();
    };
    return root;
  } catch (error) {
    geometry.dispose(); for (const material of ownedMaterials) material.dispose(); throw error;
  }
}
