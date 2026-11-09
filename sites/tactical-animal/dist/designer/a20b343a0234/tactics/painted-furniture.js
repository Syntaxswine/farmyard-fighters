import {WOODEN_LIGHT_MOUNT} from './tower-geometry.js';
import * as THREE from './vendor/three.module.js';
import {buildStairGuardTower} from './stair-guard-tower.js';
import {buildWoodenGuardTower} from './wooden-guard-tower.js';
import {softBox} from './painted-environment-scene.js';

export const FURNITURE_FORMS=[
 {id:'spotlight',name:'Sweeping spotlight',tiles:[1,1],light:true,note:'Industrial searchlight on a swivel post; one to three authored aim points.'},
 {"id":"wood-ladder-tower","name":"Timber ladder guardhouse","tiles":[6,5],"source":"wood-stair-tower","light":false,"note":"Three-story guardhouse with its searchlight opposite the exterior ladder and guarded landing."},
 {"id":"iron-ladder-tower","name":"Iron ladder guardhouse","tiles":[6,5],"source":"iron-stair-tower","light":false,"note":"Three-story guardhouse with an exterior ladder and guarded entry landing."},
 {"id":"wood-rear-ladder-tower","name":"Timber rear-ladder guardhouse","tiles":[5,5],"source":"wood-wrap-tower","light":false,"note":"Three-story guardhouse with an exterior ladder and guarded entry landing."},
 {"id":"iron-rear-ladder-tower","name":"Iron rear-ladder guardhouse","tiles":[5,5],"source":"iron-wrap-tower","light":false,"note":"Three-story guardhouse with an exterior ladder and guarded entry landing."},
 {"id":"wood-large-ladder-tower","name":"Large timber ladder guardhouse","tiles":[7,7],"source":"wood-large-wrap-tower","light":false,"note":"Three-story guardhouse with an exterior ladder and guarded entry landing."},
 {"id":"iron-large-ladder-tower","name":"Large iron ladder guardhouse","tiles":[7,7],"source":"iron-large-wrap-tower","light":false,"note":"Three-story guardhouse with an exterior ladder and guarded entry landing."},
 {"id":"iron-searchlight-ladder-tower","name":"Iron searchlight ladder guardhouse","tiles":[6,5],"source":"iron-searchlight-stair-tower","light":true,"note":"Three-story guardhouse with an exterior ladder and guarded entry landing."},
 {id:'iron-searchlight-stair-tower',name:'Iron guardhouse with searchlight',tiles:[6,5],light:true,note:'Rust-red stair tower with a bracket-mounted searchlight beneath the front window. Lighting deferred.'},
 {id:'wooden-spotlight-tower',name:'Spotlight guard tower',tiles:[5,5],light:true,note:'Three-story timber tower with a pedestal searchlight facing away from the ladder hatch.'},
 {id:'wood-large-wrap-tower',name:'Large timber guardhouse tower',tiles:[7,7],note:'5×5 guardhouse and timber trellis with wraparound stairs. 7×7 overall.'},
 {id:'iron-large-wrap-tower',name:'Large rust-red guardhouse tower',tiles:[7,7],note:'5×5 rusty red iron guardhouse with wraparound stairs. 7×7 overall.'},
 {id:'wood-wrap-tower',name:'Timber wraparound guard tower',tiles:[5,5],note:'Stairs wrap around the 3×3 timber trellis to a 3×3 guardhouse. 5×5 overall.'},
 {id:'iron-wrap-tower',name:'Rust-red wraparound guard tower',tiles:[5,5],note:'Perimeter stairs and a guardhouse in rusty red barrel paint. 3×3 core; 5×5 overall.'},
 {id:'wood-stair-tower',name:'Timber stair guard tower',tiles:[6,5],note:'Three-story 3×3 guardhouse tower with exterior switchback stairs. 6×5 overall clearance.'},
 {id:'iron-stair-tower',name:'Iron stair guard tower',tiles:[6,5],note:'Riveted iron guardhouse and exterior stairs. 3×3 house; 6×5 overall clearance.'},
 {id:'wooden-guard-tower',name:'Wooden guard tower',tiles:[5,5],note:'3×3 braced supports · three stories · 5×5 railed deck with a ladder opening.'},
 {id:'cooking-fire',name:'Hanging cooking pot',tiles:[2,2],light:true,fire:true,note:'A suspended iron cooking pot over a stone-ring campfire, on a 2×2 footprint.'},
 {id:'campfire',name:'Stone-ring campfire',tiles:[1,1],light:true,fire:true,note:'Charred crossed logs, ash and warm sculpted flames inside a stone ring.'},
 {id:'standing-torch',name:'Standing torch',tiles:[1,1],light:true,fire:true,note:'Timber torch in an iron tripod, with a bound fuel head.'},
 {id:'wall-torch',name:'Wall-mounted torch',tiles:[1,1],light:true,fire:true,wall:true,note:'Bound timber torch in a projecting iron wall bracket.'},
 {id:'dining-table',name:'Farmhouse table',tiles:[1,2],note:'Planked top, tapered square legs and pegged apron.'},
 {id:'coffee-table',name:'Low living-room table',tiles:[1,2],note:'Solid flat top with a lower magazine shelf.'},
 {id:'single-bed',name:'Single bed',tiles:[1,2],note:'Panelled timber frame, pillow and folded blue quilt.'},
 {id:'bedside-table',name:'Bedside table',tiles:[1,1],note:'Inset drawer and an open lower shelf.'},
 {id:'bedside-table-lamp',name:'Bedside table with lamp',tiles:[1,1],light:true,note:'A compact brass and linen lamp on the drawer table; lighting deferred.'},
 {id:'refrigerator',name:'Enamel refrigerator',tiles:[1,1],note:'Separate freezer, rounded enamel corners and rear cooling coils.'},
 {id:'cabinet',name:'Double-door cabinet',tiles:[1,2],note:'A 1×2 cabinet with recessed panels, drawers and brass pulls.'},
 {id:'floor-lamp',name:'Pleated floor lamp',tiles:[1,1],light:true,note:'Weighted base, brass stem and a warm linen shade.'},
 {id:'gooseneck-sconce',name:'Green industrial sconce',tiles:[1,1],light:true,wall:true,note:'Wall-mounted gooseneck, green enamel shade and ivory underside.'},
 {id:'streetlight',name:'Single-arm streetlight',tiles:[1,1],light:true,note:'Fluted cast-iron base and a suspended industrial lantern.'},
 {id:'streetlight-double',name:'Double-arm streetlight',tiles:[2,1],light:true,note:'Paired industrial lanterns on a shared cast-iron post.'}
];
export const FURNITURE_FINISHES={honey:'Honey timber',cream:'Aged cream',sage:'Sage paint'};

// Geometry is expressed in gameplay tiles, Y up. Libraries own shared GPU
// resources; built roots only borrow them. Fixtures carry passive anchors,
// never Light objects or emissive materials. Day/night behavior is deferred.
export function createFurnitureLibrary(atlas,cargo){
 const geometries=new Map(),materials=new Map(),textures=[];let disposed=false;
 const geo=(key,make)=>{if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);};
 function material(name,color,cell,source=atlas){
  if(materials.has(name))return materials.get(name);
  const m=new THREE.MeshStandardMaterial({color,roughness:.88});m.name=name;
  if(cell){const t=source.clone();t.offset.set(cell[0],cell[1]);t.repeat.set(cell[2],cell[3]);t.needsUpdate=true;textures.push(t);m.map=t;}
  if(name.startsWith('wood:')){const tone=name.includes(':honey:')?[.22,.13,.065]:name.includes(':cream:')?[.48,.41,.30]:[.16,.20,.12];m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb=mix(vec3('+tone.join(',')+'),diffuseColor.rgb,.62);');};m.customProgramCacheKey=()=>name;}
  materials.set(name,m);return m;
 }
 const iron=material('iron',0x343b37,[.69,.04,.28,.42],cargo),brass=material('brass',0xb8a071,[.35,.04,.28,.42],cargo),
  cream=material('enamel',0xe6dfbd,[.68,.03,.30,.44],cargo),green=material('green-enamel',0x386343,[.75,.12,.15,.26],cargo),
  linen=material('linen',0xd5c9a7,[.75,.12,.15,.26],cargo),cloth=material('blue-quilt',0x597f94,[.56,.07,.29,.32]),
  dark=material('recess',0x352e28),bulb=material('unlit-glass',0xded9bd),seam=material('quilt-seam',0x6b858e);
 function wood(skin,index=0){const cell=skin==='honey'?[.515+(index%3)*.055,.52,.30,.44]:[skin==='cream'?.345:.677,.53,.30,.44];return material('wood:'+skin+':'+index,skin==='honey'?0xc4ab83:skin==='cream'?0xd3c5a7:0xb1b99a,cell,skin==='honey'?atlas:cargo);}
 function mesh(root,g,m,p,r=[0,0,0]){const o=new THREE.Mesh(g,m);o.position.set(...p);o.rotation.set(...r);o.castShadow=o.receiveShadow=true;root.add(o);return o;}
 const box=(root,m,p,s,r,bevel=.004)=>mesh(root,geo('box:'+s+':'+bevel,()=>softBox(...s,bevel,1)),m,p,r);
 const cyl=(root,m,p,rt,rb,h)=>mesh(root,geo(`c:${rt}:${rb}:${h}`,()=>new THREE.CylinderGeometry(rt,rb,h,20)),m,p);
 function tube(root,m,points,r=.018){return mesh(root,geo('tube:'+JSON.stringify(points)+':'+r,()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,r,7,false)),m,[0,0,0]);}
 function anchor(root,name,p,direction){const a=new THREE.Object3D();a.name=name;a.position.set(...p);if(direction)a.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(...direction).normalize());a.userData={role:name.startsWith('emitter')?'future-light':'mount',enabled:false};root.add(a);return a;}
 function knob(root,p){cyl(root,brass,p,.023,.023,.033).rotation.x=Math.PI/2;}
 function panel(root,m,x,y,z,w,h){box(root,dark,[x,y,z],[w,h,.055]);box(root,m,[x,y,z+.036],[w-.075,h-.075,.03]);for(const xx of [x-w/2+.019,x+w/2-.019])box(root,m,[xx,y,z+.037],[.037,h,.045]);for(const yy of [y-h/2+.019,y+h/2-.019])box(root,m,[x,yy,z+.037],[w,.037,.045]);}
 function feet(root,m,w,d,h=.18){for(const x of [-w/2+.075,w/2-.075])for(const z of [-d/2+.075,d/2-.075])box(root,m,[x,h/2,z],[.09,h,.09]);}
 function shade(root,x,y,z,r=.24){
  const profile=[[.037,.14],[.063,.12],[.09,.05],[r*.7,-.035],[r,-.075],[r,-.09]];
  const g=geo('shade:'+r,()=>new THREE.LatheGeometry(profile.slice().reverse().map(v=>new THREE.Vector2(...v)),32));
  const outer=mesh(root,g,green,[x,y,z]);outer.name='green-metal-shade';
  const inside=material('shade-lining',0xd5d1b3);inside.side=THREE.BackSide;
  mesh(root,g,inside,[x,y,z]);
  mesh(root,geo('rim:'+r,()=>new THREE.TorusGeometry(r,.009,6,32)),green,[x,y-.083,z],[Math.PI/2,0,0]);
  cyl(root,iron,[x,y+.04,z],.038,.038,.08);
  mesh(root,geo('bulb',()=>new THREE.SphereGeometry(.048,12,8)),bulb,[x,y-.035,z]);
 }
 function addSearchlight(root,position,wall=false){
    const fixture=new THREE.Group();fixture.name='spotlight';fixture.position.set(...position);root.add(fixture);
    const housing=material('spotlight-oxide',0xd3b6a8,[.012,.012,.30,.475],cargo);
    box(fixture,iron,[0,.055,0],[.66,.11,.58]);for(const x of [-.24,.24])for(const z of [-.20,.20])cyl(fixture,brass,[x,.125,z],.033,.033,.035);
    cyl(fixture,iron,[0,wall?.155:.53,0],.115,.16,wall?.16:.91);cyl(fixture,housing,[0,1.01,0],.23,.23,.13);
    box(fixture,housing,[0,1.12,0],[1.18,.12,.15]);for(const x of [-.56,.56]){box(fixture,housing,[x,1.38,0],[.095,.53,.14]);const pivot=cyl(fixture,brass,[x,1.61,0],.105,.105,.13);pivot.rotation.z=Math.PI/2;}
    const head=new THREE.Group();head.name='spotlight-head';head.position.set(0,1.61,0);head.rotation.x=.22;fixture.add(head);
    const shell=geo('searchlight-shell',()=>new THREE.LatheGeometry([[.08,-.39],[.26,-.35],[.42,-.22],[.46,.19],[.49,.24],[.49,.29],[.45,.29],[.425,.20],[.38,-.17],[.22,-.27],[.08,-.28]].map(v=>new THREE.Vector2(...v)),48));
    mesh(head,shell,housing,[0,0,0],[Math.PI/2,0,0]).name='spotlight-housing';
    const reflector=material('searchlight-reflector',0xb9c6c8);reflector.side=THREE.DoubleSide;reflector.roughness=.34;reflector.metalness=.35;
    mesh(head,geo('searchlight-reflector',()=>new THREE.LatheGeometry([[.065,-.22],[.13,-.19],[.24,-.10],[.34,.055],[.423,.205]].map(v=>new THREE.Vector2(...v)),48)),reflector,[0,0,0],[Math.PI/2,0,0]).name='spotlight-reflector';
    mesh(head,geo('searchlight-rim',()=>new THREE.TorusGeometry(.465,.025,8,48)),iron,[0,0,.282]);mesh(head,geo('searchlight-bulb',()=>new THREE.SphereGeometry(.09,16,10)),bulb,[0,0,.065]);
    for(const x of [-.24,.24])box(head,iron,[x,0,.31],[.014,.79,.018]);box(head,iron,[0,0,.31],[.85,.014,.018]);
    tube(head,iron,[[-.23,.29,-.23],[-.23,.43,-.20],[.23,.43,-.20],[.23,.29,-.23]],.023);
    tube(fixture,iron,[[.12,.32,-.05],[.29,.46,-.22],[.30,.90,-.25],[.14,1.13,-.20]],.019);
    box(fixture,iron,[.17,.82,-.04],[.20,.26,.17]);knob(fixture,[.18,.83,.057]);
    const emitter=anchor(head,'emitter-0',[0,0,.34],[0,0,1]);emitter.userData.distribution='spot';emitter.userData.coneAngle=Math.PI/8;anchor(root,'mount',position);
    if(wall){for(const o of fixture.children)if(o.position.y>.75)o.position.y-=.75;head.rotation.x=.35;const cable=fixture.children.find(o=>o.geometry?.type==='TubeGeometry'&&o.parent===fixture);if(cable)cable.scale.y=.4;}
    return fixture;
 }
 function build(id,skin='honey',{burning=true}={}){
  if(disposed)throw Error('Furniture library disposed');
  const form=FURNITURE_FORMS.find(f=>f.id===id);if(!form||!Object.hasOwn(FURNITURE_FINISHES,skin))throw Error('Invalid furniture form/finish');
  const source=form.source||id,ladder=!!form.source;const root=new THREE.Group();root.name=id;const timber=wood(skin),warm=wood(skin,1);
  if(['iron-searchlight-stair-tower','wood-stair-tower','iron-stair-tower','wood-wrap-tower','iron-wrap-tower','wood-large-wrap-tower','iron-large-wrap-tower'].includes(source)){buildStairGuardTower(root,{box,wood,iron,material,skin,cargo,metal:id.startsWith('iron-'),wrap:source.includes('-wrap-'),large:source.includes('-large-'),ladder,wideExit:id==='iron-searchlight-ladder-tower'});
   if(source==='iron-searchlight-stair-tower'){
    // Compact rear bracket scales about the wall face to retain the six-tile footprint.
    const H=root.userData.stairTower.deckHeight,x=0,lightMount=new THREE.Group();lightMount.name='searchlight-mount';lightMount.position.x=root.userData.stairTower.coreOffsetX;lightMount.rotation.y=ladder?-Math.PI/2:0;if(ladder){const scale=.55;lightMount.scale.setScalar(scale);lightMount.position.x-=1.5*(1-scale);lightMount.position.y=H*(1-scale);}root.add(lightMount);
    const plate=box(lightMount,iron,[x,H+.01,1.53],[.62,.88,.065]);plate.name='searchlight-wall-plate';
    for(const dx of [-.23,.23]){box(lightMount,iron,[x+dx,H-.35,1.77],[.065,.09,.49]);tube(lightMount,iron,[[x+dx,H-.48,1.56],[x+dx,H-.36,1.82],[x+dx,H-.31,2.02]],.035);for(const y of [H-.30,H+.32]){const bolt=cyl(lightMount,brass,[x+dx,y,1.575],.035,.035,.025);bolt.rotation.x=Math.PI/2;}}
    addSearchlight(lightMount,[x,H-.30,1.99],true);
   }

   }else if(id==='wooden-guard-tower'||id==='wooden-spotlight-tower'){buildWoodenGuardTower(root,{box,wood,iron,skin});
   if(id==='wooden-spotlight-tower'){
    addSearchlight(root,[WOODEN_LIGHT_MOUNT.x,root.userData.tower.deckHeight,WOODEN_LIGHT_MOUNT.y]).rotation.y=Math.PI;
   }

  }else if(id==='cooking-fire'){
   const hearth=build('campfire',skin,{burning}).root;root.add(hearth);
   // Three planted legs form a triangular pyramid around the hearth.
   for(let i=0;i<3;i++){
    const a=-Math.PI/2+i*Math.PI*2/3,x=Math.cos(a)*.90,z=Math.sin(a)*.90;
    cyl(root,iron,[x,.014,z],.065,.065,.028);
    tube(root,iron,[[x,.03,z],[0,2.20,0]],.033);
   }
   cyl(root,iron,[0,2.185,0],.073,.073,.075);
   const potAssembly=new THREE.Group();potAssembly.name='suspended-pot';potAssembly.position.y=-.061;root.add(potAssembly);
   const potMaterial=material('cooking-pot',0x65615a,[.56,.08,.30,.33]);
   const profile=[[0,0],[.17,0],[.25,.065],[.31,.18],[.335,.42],[.335,.46],[.304,.46],[.302,.41],[.278,.18],[.22,.085],[0,.06]],pot=mesh(potAssembly,geo('cooking-pot',()=>new THREE.LatheGeometry(profile.map(v=>new THREE.Vector2(...v)),32)),potMaterial,[0,.83,0]);pot.name='cooking-pot';
   mesh(potAssembly,geo('pot-rim',()=>new THREE.TorusGeometry(.322,.019,7,32)),iron,[0,1.285,0],[Math.PI/2,0,0]);
   for(const x of [-.335,.335]){box(potAssembly,iron,[x,1.24,0],[.055,.08,.055]);mesh(potAssembly,geo('pot-handle-eye',()=>new THREE.TorusGeometry(.038,.009,6,12)),brass,[x,1.285,0],[0,Math.PI/2,0]);}
   tube(potAssembly,iron,[[-.35,1.28,0],[-.30,1.50,0],[0,1.71,0],[.30,1.50,0],[.35,1.28,0]],.016);
   for(let i=0;i<9;i++)mesh(root,geo('pot-chain-link',()=>new THREE.TorusGeometry(.034,.008,6,12)),iron,[0,1.667+i*.061,0],[0,i%2*Math.PI/2,0]);
   const broth=material('stew',0x9b642f,[.40,.12,.15,.26],cargo);cyl(potAssembly,broth,[0,1.205,0],.294,.294,.012);
  }else if(form.fire){
   const ash=material('ash',0x58544c,[.56,.08,.30,.33]),char=material('charred-timber',0x625344,[.54,.53,.30,.42]),stone=material('fire-stone',0x9a9585,[.56,.08,.30,.33]);
   let center;
   if(id==='campfire'){
    cyl(root,ash,[0,.018,0],.34,.35,.036);
    for(let i=0;i<11;i++){const a=i*Math.PI*2/11,g=geo('fire-rock:'+i,()=>{const g=new THREE.IcosahedronGeometry(1,1),p=g.attributes.position;for(let j=0;j<p.count;j++){const x=p.getX(j),y=p.getY(j),z=p.getZ(j),f=1+.07*Math.sin(x*19+y*11+z*7+i);p.setXYZ(j,x*f,y*f,z*f);}g.computeVertexNormals();g.computeBoundingBox();g.translate(0,-g.boundingBox.min.y,0);return g;});const rock=mesh(root,g,stone,[Math.sin(a)*.365,0,Math.cos(a)*.365]);rock.scale.set(.105,.065,.085);rock.rotation.y=a;}
    for(let i=0;i<4;i++){const log=cyl(root,char,[(i%2-.5)*.15,.105+Math.floor(i/2)*.075,0],.053,.068,.53);log.rotation.set(Math.PI/2,0,(i<2?-.55:.85));}
    center=[0,.17,0];anchor(root,'mount',[0,0,0]);
   }else{
    const wall=id==='wall-torch',z=wall?.27:0,base=wall?.90:.20;
    if(wall){box(root,iron,[0,1.15,.006],[.13,.38,.035]);for(const y of [1.02,1.28])box(root,brass,[0,y,.028],[.025,.025,.009]);tube(root,iron,[[0,1.02,.02],[0,1.02,z],[0,1.19,z]],.025);anchor(root,'mount',[0,1.15,0],[0,0,-1]);}
    else{for(let i=0;i<3;i++){const a=i*Math.PI*2/3;cyl(root,iron,[Math.sin(a)*.23,.008,Math.cos(a)*.23],.035,.035,.016);tube(root,iron,[[Math.sin(a)*.23,.02,Math.cos(a)*.23],[Math.sin(a)*.10,.22,Math.cos(a)*.10],[0,.46,0]],.018);}cyl(root,iron,[0,.33,0],.075,.075,.15);anchor(root,'mount',[0,0,0]);}
    cyl(root,wood('honey'),[0,base+.48,z],.035,.047,.96);
    cyl(root,char,[0,base+.91,z],.082,.055,.22);
    for(let i=0;i<5;i++)mesh(root,geo('torch-binding',()=>new THREE.TorusGeometry(.072,.010,5,12)),iron,[0,base+.82+i*.035,z],[Math.PI/2,0,0]);
    center=[0,base+1.01,z];
   }
   const fire=new THREE.Group();fire.name='flames';fire.visible=burning;fire.position.set(...center);root.add(fire);
   const flameMat=material('painted-flame',0xffffff,[.40,.12,.15,.26],cargo);flameMat.vertexColors=true;flameMat.roughness=1;
   // Closed curved volumes rather than camera-facing flame cards. Broad color
   // bands model the painted tongues; these do not illuminate the scene.
   function flameGeo(variant){return geo('flame-tongue:'+variant,()=>{const bends=[[0,-.10,.08,.26,.13,.39],[0,.07,-.14,-.12,-.36,-.27],[0,-.04,.12,.08,.27,.18]][variant],rings=[[0,0],[.035,.24],[.26,.37],[.53,.22],[.79,.105],[1,0]],g=new THREE.LatheGeometry(rings.map(([y,r])=>new THREE.Vector2(r,y)),11),p=g.attributes.position,colors=[];
    for(let i=0;i<p.count;i++){const y=p.getY(i),j=rings.findIndex(v=>Math.abs(v[0]-y)<.001),a=Math.atan2(p.getX(i),p.getZ(i)),f=1+.13*Math.sin(a*3+variant+y*7);p.setXYZ(i,p.getX(i)*f+(bends[j]||0),y,p.getZ(i)*f+Math.sin(y*4+variant)*y*.13);const c=new THREE.Color().setRGB(1,.12+.50*y,.012+.06*y);colors.push(c.r,c.g,c.b);}g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;});}
   const count=id==='campfire'?5:3,inner=material('flame-core',0xffd080,[.77,.15,.12,.20],cargo);
   for(let i=0;i<count;i++){const a=i*2.4,r=id==='campfire'?.12:.025,o=mesh(fire,flameGeo(i%3),flameMat,[Math.sin(a)*r,0,Math.cos(a)*r],[0,a,(i%2?-.12:.08)]),width=id==='campfire'?.33:.17,height=(id==='campfire'?.30:.24)+[.19,0,.11,.06,.23][i];o.scale.set(width,height,width*.85);o.castShadow=false;
    const core=mesh(fire,flameGeo((i+1)%3),inner,[Math.sin(a)*(r+.025),.006,Math.cos(a)*(r+.025)],[0,a+.5,0]);core.scale.set(width*.60,height*.53,width*.58);core.castShadow=false;
   }
   for(const [i,o]of fire.children.entries()){o.userData.flicker={scale:o.scale.toArray(),rotation:o.rotation.z,phase:i*1.73};o.material.userData.flickerBaseColor??=o.material.color.clone();}
   const a=anchor(root,'emitter-0',[center[0],center[1]+.15,center[2]],[0,-1,0]);a.userData.distribution='omnidirectional';
  }else if(id==='dining-table'||id==='coffee-table'){

   const h=id==='dining-table'?.84:.46;
   for(let i=0;i<4;i++)box(root,wood(skin,i),[(i-1.5)*.224,h-.035,0],[.221,.07,1.87]);
   for(const x of [-.33,.33])for(const z of [-.77,.77]){
    const g=geo('leg:'+h,()=>{const g=new THREE.BoxGeometry(.085,h-.11,.085),p=g.attributes.position;for(let j=0;j<p.count;j++)if(p.getY(j)<0){p.setX(j,p.getX(j)*.72);p.setZ(j,p.getZ(j)*.72);}g.computeVertexNormals();return g;});mesh(root,g,timber,[x,(h-.11)/2,z]);
   }
   for(const x of [-.34,.34])box(root,warm,[x,h-.12,0],[.055,.13,1.61]);
   for(const z of [-.78,.78])box(root,warm,[0,h-.12,z],[.73,.13,.055]);
   if(id==='coffee-table')box(root,warm,[0,.13,0],[.70,.035,1.60]);
   for(const x of [-.28,.28])for(const z of [-.81,.81])cyl(root,brass,[x,h+.001,z],.009,.009,.003);
  }else if(id==='single-bed'){
   feet(root,timber,.86,1.86,.26);
   box(root,dark,[0,.26,0],[.83,.10,1.75]);
   for(const x of [-.425,.425])box(root,timber,[x,.32,0],[.06,.17,1.83]);
   for(const [z,h]of [[-.90,.94],[.90,.55]]){
    for(const x of [-.415,.415])box(root,timber,[x,h/2,z],[.075,h,.075]);
    panel(root,warm,0,h-.20,z,.79,.32);box(root,timber,[0,h,z],[.91,.045,.095]);
   }
   box(root,linen,[0,.405,0],[.78,.20,1.69],undefined,.035);
   box(root,cloth,[0,.505,.24],[.80,.055,1.17],undefined,.013);
   for(const x of [-.402,.402])box(root,cloth,[x,.405,.24],[.018,.22,1.17],undefined,.007);
   for(const z of [-.27,-.07,.13,.33,.53,.73])box(root,seam,[0,.534,z],[.76,.003,.007]);
   box(root,linen,[0,.548,-.59],[.59,.105,.31],[0,-.035,0],.042);
   box(root,cloth,[0,.559,-.22],[.80,.052,.18],undefined,.012);
  }else if(id==='bedside-table'||id==='bedside-table-lamp'){
   feet(root,timber,.63,.56,.15);box(root,warm,[0,.15,0],[.60,.04,.53]);
   for(const x of [-.285,.285])box(root,timber,[x,.34,0],[.045,.40,.51]);
   box(root,timber,[0,.37,-.24],[.55,.43,.03]);box(root,timber,[0,.58,0],[.66,.05,.59]);
   box(root,dark,[0,.465,0],[.55,.17,.48]);panel(root,warm,0,.46,.25,.55,.17);knob(root,[0,.46,.305]);
   if(id==='bedside-table-lamp'){const lamp=build('floor-lamp',skin).root;lamp.name='bedside-lamp';lamp.scale.setScalar(.48);lamp.position.set(0,.605,-.045);root.add(lamp);}
  }else if(id==='cabinet'){
   // Long axis is local Z, so the cabinet is exactly a 1×2 footprint.
   const body=new THREE.Group();body.rotation.y=Math.PI/2;root.add(body);
   feet(body,timber,1.85,.67,.15);box(body,timber,[0,.70,0],[1.82,1.12,.63]);
   box(body,warm,[0,1.285,0],[1.91,.07,.74]);box(body,warm,[0,.18,0],[1.87,.07,.70]);
   for(const x of [-.45,.45]){panel(body,warm,x,.62,.325,.85,.76);knob(body,[x+(x<0?.31:-.31),.84,.39]);panel(body,timber,x,1.135,.325,.85,.20);knob(body,[x,1.135,.39]);}
  }else if(id==='refrigerator'){
   feet(root,iron,.73,.70,.09);box(root,cream,[0,.78,0],[.76,1.43,.68],undefined,.025);
   box(root,dark,[0,.79,.348],[.72,1.34,.025]);
   for(const [y,h]of [[.59,.98],[1.28,.35]])box(root,cream,[0,y,.377],[.73,h,.082],undefined,.018);
   for(const y of [.94,1.26])tube(root,brass,[[-.25,y-.07,.424],[-.25,y-.07,.46],[-.25,y+.07,.46],[-.25,y+.07,.424]],.014);
   for(let i=0;i<7;i++)box(root,iron,[(i-3)*.077,.09,.357],[.04,.045,.012]);
   for(let i=0;i<8;i++)tube(root,iron,[[-.26,.30+i*.13,-.35],[-.29,.34+i*.13,-.37],[.29,.34+i*.13,-.37],[.26,.39+i*.13,-.35]],.01);
   box(root,brass,[.20,1.35,.424],[.12,.028,.005]);
  }else if(id==='floor-lamp'){
   cyl(root,iron,[0,.035,0],.25,.28,.07);cyl(root,brass,[0,.078,0],.11,.18,.045);cyl(root,brass,[0,.82,0],.021,.028,1.48);
   const g=geo('pleated-shade',()=>{const g=new THREE.CylinderGeometry(.17,.31,.42,64,1,true),p=g.attributes.position;for(let i=0;i<p.count;i++){const a=Math.atan2(p.getX(i),p.getZ(i)),f=1+.035*Math.cos(a*32);p.setX(i,p.getX(i)*f);p.setZ(i,p.getZ(i)*f);}g.computeVertexNormals();return g;});
   const shadeMat=material('pleated-linen',0xd3be91,[.75,.12,.15,.26],cargo);shadeMat.side=THREE.DoubleSide;mesh(root,g,shadeMat,[0,1.55,0]);
   for(const [y,r]of [[1.34,.31],[1.76,.17]])mesh(root,geo('linen-rim:'+r,()=>new THREE.TorusGeometry(r,.009,6,32)),brass,[0,y,0],[Math.PI/2,0,0]);
   cyl(root,iron,[0,1.43,0],.035,.035,.10);mesh(root,geo('bulb',()=>new THREE.SphereGeometry(.048,12,8)),bulb,[0,1.52,0]);
   tube(root,brass,[[.07,1.44,0],[.085,1.28,0]],.005);anchor(root,'emitter-0',[0,1.48,0],[0,-1,0]);anchor(root,'mount',[0,0,0]);
  }else if(id==='gooseneck-sconce'){
   // Origin lies on the mounting wall at floor level; shade projects forward.
   cyl(root,iron,[0,1.72,0],.11,.11,.045).rotation.x=Math.PI/2;
   tube(root,green,[[0,1.73,.01],[0,1.79,.10],[0,1.99,.18],[0,2.04,.38],[0,1.93,.55],[0,1.80,.55]],.022);
   shade(root,0,1.67,.55,.23);for(const y of [1.65,1.79])box(root,brass,[0,y,.027],[.019,.019,.006]);
   anchor(root,'emitter-0',[0,1.62,.55],[0,-1,0]);anchor(root,'mount',[0,1.72,0],[0,0,-1]);
  }else if(id==='spotlight'){
   cyl(root,iron,[0,.07,0],.28,.32,.14);cyl(root,iron,[0,1.27,0],.045,.075,2.4);
   const head=new THREE.Group();head.name='spot-head';head.position.set(0,2.6,0);root.add(head);
   // Local +Z points through the open searchlight face; housing sits behind emitter.
   cyl(head,green,[0,0,-.19],.27,.23,.32).rotation.x=Math.PI/2;
   cyl(head,bulb,[0,0,-.02],.23,.23,.015).rotation.x=Math.PI/2;
   mesh(head,geo('spot-rim',()=>new THREE.TorusGeometry(.255,.025,8,32)),brass,[0,0,0]);
   for(const x of [-.32,.32])box(head,iron,[x,-.12,-.15],[.055,.38,.07]);
   anchor(root,'emitter-0',[0,2.6,0],[0,0,1]);anchor(root,'mount',[0,0,0]);
  }else if(id.startsWith('streetlight')){
   cyl(root,iron,[0,.055,0],.19,.22,.11);cyl(root,iron,[0,.28,0],.095,.15,.40);cyl(root,iron,[0,1.66,0],.038,.068,2.40);
   for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl(root,iron,[Math.sin(a)*.11,.27,Math.cos(a)*.11],.01,.013,.28);}
   for(const y of [.49,2.6])cyl(root,brass,[0,y,0],.065,.065,.035);
   const arms=id==='streetlight-double'?[-1,1]:[1];
   for(const [i,s]of arms.entries()){
    const reach=id==='streetlight-double'?.66:.24;
    tube(root,iron,[[0,2.65,0],[s*.05,2.84,0],[s*reach*.65,2.95,0],[s*reach,2.85,0],[s*reach,2.69,0]],.025);
    shade(root,s*reach,2.57,0,.22);anchor(root,'emitter-'+i,[s*reach,2.51,0],[0,-1,0]);
   }
   anchor(root,'mount',[0,0,0]);
  }
  root.userData={...root.userData,kind:id,tiles:[...form.tiles],placement:form.wall?'wall':'ground',lighting:'deferred'};root.updateMatrixWorld(true);
  return {root,form,skin,bounds:new THREE.Box3().setFromObject(root)};
 }
 return {build,stats:()=>({geometries:geometries.size,materials:materials.size,textures:textures.length}),dispose(){if(disposed)return;disposed=true;for(const g of geometries.values())g.dispose();for(const m of materials.values())m.dispose();for(const t of textures)t.dispose();geometries.clear();materials.clear();textures.length=0;}};
}

// Absolute-time sampling makes the four-second loop independent of frame rate.
// null restores the authored pose for paused/reduced-motion previews.
export function animateFurnitureFire(root,seconds){
 const fire=root.getObjectByName('flames');if(!fire||!fire.visible)return;
 const t=seconds===null?0:seconds*Math.PI/2;
 for(const o of fire.children){const f=o.userData.flicker;if(!f)continue;
  const wave=seconds===null?0:Math.sin(t*5+f.phase)*.065+Math.sin(t*9+f.phase*.7)*.025;
  o.scale.set(f.scale[0]*(1-wave*.40),f.scale[1]*(1+wave),f.scale[2]*(1-wave*.30));
  o.rotation.z=f.rotation+(seconds===null?0:Math.sin(t*3+f.phase)*.045);
  // Flame materials are library-shared: brightness uses one common time phase.
  o.material.color.copy(o.material.userData.flickerBaseColor).multiplyScalar(seconds===null?1:.97+.03*Math.sin(t*7));
 }
}
