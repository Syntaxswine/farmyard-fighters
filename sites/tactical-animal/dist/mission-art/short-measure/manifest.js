// Authoring proposal, not a mission definition. World x/z equals blockout x/y.
// /2: sealed-load conformed to the runtime crate collider so its binding agrees.
export const ART_VERSION = 'short-measure/2';
export const SOURCE_COMMIT = 'a20b343a0234b5d8b365a4e1668961ca1bf37653';
export const SOURCES = {
  sacks: {path:'aft/tactics/environment-models.js', recipe:'sandbags: crown + stitched seam; flattened for empties', license:'AFT snapshot supplied by the user; upstream art license not declared', commit:SOURCE_COMMIT},
  pallet: {path:'aft/tactics/environment-models.js', recipe:'pallet: runners and five slats', license:'AFT snapshot supplied by the user; upstream art license not declared', commit:SOURCE_COMMIT},
  desk: {path:'aft/tactics/environment-models.js', recipe:'table-wood, 2 × 1 × 1 m', license:'AFT snapshot supplied by the user; upstream art license not declared', commit:SOURCE_COMMIT},
  geometry: {path:'aft/tactics/environment-geometry.js', recipe:'normalized box, cylinder and crown', license:'AFT snapshot supplied by the user; upstream art license not declared', commit:SOURCE_COMMIT},
  materials: {path:'aft/tactics/hybrid-materials.js', recipe:'surfacePixels: wood, sand, linen, steel, olive, dark-metal, rust, red', license:'AFT snapshot supplied by the user; upstream art license not declared', commit:SOURCE_COMMIT},
  reserve7: {path:'mission-art/short-measure/reserve-7.svg', recipe:'original vector stencil; same path in kit.js', license:'Original project contribution; repository has no declared project license'},
  paper: {path:'mission-art/short-measure/shipping-manifest.svg', recipe:'original flat dispatch paper, Reserve 7 / Pump Station 3', license:'Original project contribution; repository has no declared project license'},
  scale: {path:'mission-art/short-measure/kit.js', recipe:'original platform-scale geometry using inherited primitives and materials', license:'Original project contribution; repository has no declared project license'},
  paint: {path:'mission-art/short-measure/kit.js', recipe:'original flat lane bars and arrows', license:'Original project contribution; repository has no declared project license'},
  renderer: {path:'aft/tactics/vendor/three.module.js', license:'MIT; aft/tactics/vendor/THREE-LICENSE.txt'},
};

// [west, north, east, south], in metres. Navigation reserves the ground box.
// LOS, bullets and grenades must use solidParts(root), preserving open air
// under scale beams and the desk. Height is a maximum, not an opaque wall.
export const PLACEMENTS = [
  {id:'worker-scale', kind:'scale-worker', anchor:[8,20], offset:[0,0], yaw:0,
    size:[1.7,1.72,1.1], footprint:[7.15,19.45,8.85,20.55], height:1.72,
    status:'solid-proposal', owner:'art:worker-scale', sources:['scale','geometry','materials','reserve7'],
    hook:'Bind a new 1.7 × 1.1 m solid, height 1.72; retain optional worker-scale inspect at (8,20).',
    note:'Bent ivory beam, red welded stop and empty pan. Supersedes the blockout decorative marker only after binding.'},
  {id:'freight-scale', kind:'scale-freight', anchor:[10.7,24], offset:[0,0], yaw:0,
    size:[1.7,1.72,1.1], footprint:[9.85,23.45,11.55,24.55], height:1.72,
    status:'solid-proposal', owner:'art:freight-scale', sources:['scale','sacks','geometry','materials','reserve7'],
    hook:'Add this exact solid to all scenery queries; it faces south into the outbound lane.',
    note:'Intact level beam, green counterweight, full pan. Same chassis and stamp as worker-scale.'},
  {id:'sealed-load-arrival', storyId:'sealed-load', kind:'sacks-full', anchor:[7.9,23.8], offset:[0,0], yaw:0,
    size:[1.5,.95,1.25], footprint:[7.15,23.175,8.65,24.425], height:.95,
    status:'solid-proposal', owner:'art:sealed-load-arrival', sources:['sacks','pallet','geometry','materials','reserve7'],
    hook:'Optional additional full-sack bay with matching solid. Omit the model until bound; do not move sealed-load inspection.',
    note:'Arrival contrast beside empty sacks; leaves the y=25 direct route and south shed door clear.'},
  {id:'sealed-load', kind:'sacks-full', anchor:[28,20], offset:[-.5,-.5], yaw:0,
    size:[1.96,.92,1.96], footprint:[26.52,18.52,28.48,20.48], height:.92,
    status:'existing-cover-replacement', owner:'cover:27,19,2,2', sources:['sacks','pallet','geometry','materials','reserve7'],
    hook:'Replace only this cover visual after validating footprint AND height against the four runtime crate cells. Keep inspect anchor (28,20). Never draw both cargo visuals.',
    note:'The offset centers the art on the blockout cover cells, rather than on its southeast inspection point. Sized to the runtime crate collider (0.96 m cells, 0.92 m high); the first proposal was 2 cm wider a side and 8 cm taller, so its binding could never agree.'},
  {id:'worker-empty-sacks', storyId:'worker-scale', kind:'sacks-empty', anchor:[6,23.2], offset:[0,0], yaw:0,
    size:[1.8,.055,.6], footprint:[5.1,22.9,6.9,23.5], height:.055,
    status:'decorative', owner:null, sources:['sacks','geometry','materials'],
    hook:'Ground dressing only; never add cover, LOS or movement collision.',
    note:'Collapsed inherited sack forms; maximum height 5.5 cm. Does not occupy the shed door at (9,22.5).'},
  {id:'shipping-manifest', kind:'dispatch-desk', anchor:[32,7], offset:[0,-.9], yaw:0,
    size:[2,1.05,1], footprint:[31,5.6,33,6.6], height:1.05,
    status:'solid-proposal', owner:'art:dispatch-desk', sources:['desk','geometry','materials','reserve7','paper'],
    hook:'Bind the desk behind the existing objective. Collect stays at (32,7); hide paper and its red tab when collected, retaining desk.',
    note:'Objective ground point remains 0.4 m south of the desk, outside its collision footprint. Paper center is (32,6.18) at 1.00 m.'},
].map(p=>({...p,occlusion:p.owner?{mode:'solid-mesh-parts',shapeKey:`${ART_VERSION}/${p.kind}/${p.size.join('x')}`}:{mode:'none'}}));

export const GROUND_MARKINGS = [
  {id:'ration-lane-bar',kind:'bar',at:[6.5,24.6],size:[2.5,.08],yaw:0},
  {id:'freight-lane-bar',kind:'bar',at:[10.3,22.9],size:[2.2,.08],yaw:0},
  {id:'ration-lane-arrow',kind:'arrow',at:[6.5,23.8],size:[.84,1.2],yaw:Math.PI},
  {id:'freight-lane-arrow',kind:'arrow',at:[11.4,22.9],size:[.84,1.2],yaw:Math.PI/2},
  {id:'dispatch-arrow',kind:'arrow',at:[29.4,9.2],size:[.84,1.2],yaw:Math.PI},
].map(p=>({...p,status:'decorative',height:.032,collision:null,occlusion:false,sources:['paint'],hook:'Included by createShortMeasureArt only for short-measure; flat paint, no collision.'}));

export const STRUCTURES = [
  {id:'ration-shed', wallHeight:2, hook:'Keep the authored room and three door gaps. No new wall, roof or collision.'},
  {id:'packing-hall', wallHeight:2, hook:'Keep the authored room and four door gaps. Ordinary inherited cover remains the fallback.'},
  {id:'dispatch-office', wallHeight:2, hook:'Keep both doors; do not obstruct west entry, south exit or the objective use point.'},
];

export const CAMERAS = {
  arrival: {target:[8.1,22.5], span:13, title:'Empty rations. Full freight.', subtitle:'Arrival inspection pan · 13 m view', cutaway:['ration-shed:south','ration-shed:east']},
  office: {target:[31.2,7.8], span:13, title:'The destination is on the paper.', subtitle:'Dispatch approach · 13 m view', cutaway:['dispatch-office:south','dispatch-office:east']},
  props: {target:[0,0], span:7.8, title:'One seal. Two measures.', subtitle:'Prop study · not a gameplay camera', cutaway:[]},
};

export function bindingFor(placement) {
  return {owner:placement.owner, footprint:[...placement.footprint], height:placement.height,occlusion:{...placement.occlusion}};
}

export function acceptsBinding(placement, binding) {
  if(placement.status === 'decorative') return true;
  return binding?.owner === placement.owner && Number.isFinite(binding.height) &&
    Math.abs(binding.height-placement.height)<1e-6 &&
    binding.occlusion?.mode===placement.occlusion.mode && binding.occlusion?.shapeKey===placement.occlusion.shapeKey &&
    Array.isArray(binding.footprint) && binding.footprint.length===4 &&
    binding.footprint.every((n,i)=>Number.isFinite(n)&&Math.abs(n-placement.footprint[i])<1e-6);
}
