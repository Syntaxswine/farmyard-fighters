// The pinned renderer classifies GPU arrays with realm-local instanceof checks.
// Keep the artist objects/materials intact; copy only their GPU buffers into
// the same-origin iframe's typed-array constructors before it renders them.
export function adoptWindowBuffers(root,realm){
  const visited=new Set();
  function adopt(attribute){const buffer=attribute?.isInterleavedBufferAttribute?attribute.data:attribute;if(!buffer?.array||visited.has(buffer))return;visited.add(buffer);const Type=realm[buffer.array.constructor.name];if(typeof Type!=='function')throw Error('Unsupported editor window buffer.');if(!(buffer.array instanceof Type)){buffer.array=new Type(buffer.array);buffer.needsUpdate=true;}}
  root.traverse(object=>{const geometry=object.geometry;if(!geometry)return;adopt(geometry.index);for(const attribute of Object.values(geometry.attributes))adopt(attribute);});
  return root;
}
