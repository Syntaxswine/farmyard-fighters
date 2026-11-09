import * as THREE from './vendor/three.module.js';
import {baseWeapon} from './one-handed.js';
import {createGrenadeModel} from './grenade-model.js';
import {createWorkerRifle} from './horse-rifle.js';

export const WEAPON_MODELS={
 hands:{label:'Unarmed',kind:'unarmed'},knife:{label:'NR-40 knife',kind:'melee'},pistol:{label:'TT-33 pistol',kind:'firearm'},
 rifle:{label:'Mosin-Nagant',kind:'firearm'},assault:{label:'AK-47',kind:'firearm'},smg:{label:'PPSh submachine gun',kind:'firearm'},
 hmg:{label:'Heavy machine gun',kind:'firearm'},shotgun:{label:'Pump-action shotgun',kind:'firearm'},sniper:{label:'Sniper rifle',kind:'firearm'},
 grenade:{label:'Fragmentation grenade',kind:'thrown'},launcher:{label:'Grenade launcher',kind:'launcher'},rpg:{label:'RPG',kind:'launcher'},flamethrower:{label:'Backpack flamethrower',kind:'flame'},
};
const V=a=>new THREE.Vector3(...a);
const defaultCarry={position:[.24,1.005,.035],axis:[.20,.38,-.90],hands:[1,-1]};
export function createWeaponModel(id,texture=null){
 id=baseWeapon(id);
 if(!WEAPON_MODELS[id])throw Error('Unknown weapon model: '+id);
 if(id==='grenade')return createGrenadeModel();
 if(id==='rifle'){const asset=createWorkerRifle(texture);return {...asset,id,...WEAPON_MODELS[id],carry:defaultCarry,muzzleMesh:asset.parts.find(p=>p.name==='muzzle opening')};}
 // Keep the architect-approved shotgun/flamethrower materials and geometry frozen.
 const revised=['assault','smg','sniper','launcher','hmg','rpg'].includes(id);
 const root=new THREE.Group();root.name=WEAPON_MODELS[id].label;const parts=[],anchors={};
 const materials={wood:new THREE.MeshStandardMaterial({color:0x986039,roughness:.88}),steel:new THREE.MeshStandardMaterial({color:0x424b4f,roughness:.7,metalness:.3}),edge:new THREE.MeshStandardMaterial({color:0x85908e,roughness:.6,metalness:.35}),dark:new THREE.MeshStandardMaterial({color:0x21292a,roughness:.9}),olive:new THREE.MeshStandardMaterial({color:0x646745,roughness:.88}),brass:new THREE.MeshStandardMaterial({color:0xb29954,roughness:.55,metalness:.4}),blade:new THREE.MeshStandardMaterial({color:0xc5cbbb,roughness:.55,metalness:.15}),bore:new THREE.MeshBasicMaterial({color:0x090c0c})};
 if(texture){materials.wood.map=texture;materials.wood.color.set(0xd6b090);}
 // Object-space painted values stay attached while turning, like the horse's skin.
 // Broad metal highlights survive native scale; fine noise would alias into a weave.
 if(revised)for(const kind of ['wood','steel','edge','dark','olive','brass']){materials[kind].dispose();const palette={wood:0x966039,steel:0x303631,edge:0x939684,dark:0x202720,olive:0x68683c,brass:0xbca264};const mat=new THREE.MeshBasicMaterial({color:palette[kind],toneMapped:false});
  mat.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vPaintP,vPaintN;').replace('#include <begin_vertex>','#include <begin_vertex>\nvPaintP=position;vPaintN=normal;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vPaintP,vPaintN;').replace('#include <color_fragment>',`#include <color_fragment>
   vec3 n=normalize(vPaintN),p=vPaintP;
   float plane=.37+.82*smoothstep(-.15,.8,n.y)+.16*abs(n.z);
   float brush=sin(p.x*19.0+p.y*31.0+p.z*23.0)*sin(p.x*43.0-p.y*17.0);
   diffuseColor.rgb*=plane*(.87+.22*smoothstep(-.4,.45,brush));
   ${kind==='wood'?'float grain=sin(p.y*180.0+sin(p.x*12.0)*1.8+p.z*23.0);diffuseColor.rgb*=.80+.24*smoothstep(-.65,.45,grain);diffuseColor.rgb+=vec3(.058,.032,.011)*smoothstep(.6,.95,n.y);':kind==='steel'?'float upper=dot(n,normalize(vec3(.10,.80,.60)));diffuseColor.rgb+=vec3(.14,.145,.115)*smoothstep(.35,.80,upper)*(.90+.10*brush);':'diffuseColor.rgb+=vec3(.028,.030,.020)*smoothstep(.80,.98,n.y);'}

  `);};mat.customProgramCacheKey=()=> 'weapon-painted-v5-'+kind;materials[kind]=mat;
 }
 function add(geometry,mat,name,pos=[0,0,0],group=root){if(mat==='wood'&&texture&&!revised){const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(.03+uv.getX(i)*.94)/4,1-(2.03+uv.getY(i)*.94)/4);}const mesh=new THREE.Mesh(geometry,materials[mat]);mesh.name=name;mesh.position.fromArray(pos);group.add(mesh);parts.push(mesh);return mesh;}
 const box=(name,size,pos,mat='steel',group=root)=>add(new THREE.BoxGeometry(...size),mat,name,pos,group);
 function rod(name,a,b,r,mat='steel',r2=r,sides=10,group=root){const axis=V(b).sub(V(a));const g=new THREE.CylinderGeometry(r2,r,axis.length(),sides);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V([0,1,0]),axis.clone().normalize()));g.translate(...V(a).add(V(b)).multiplyScalar(.5).toArray());return add(g,mat,name,[0,0,0],group);}
 function profile(name,points,depth,mat='wood'){const shape=new THREE.Shape();shape.moveTo(...points[0]);for(const pt of points.slice(1))shape.lineTo(...pt);shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:1});g.translate(0,0,-depth/2);return add(g,mat,name);}
 function anchor(name,p,group=root){const a=new THREE.Object3D();a.name=name;a.position.fromArray(p);group.add(a);anchors[name]=a;return a;}
 function ring(name,r,t,pos,mat='steel',axis='z',group=root){const m=add(new THREE.TorusGeometry(r,t,5,12),mat,name,pos,group);if(axis==='x')m.rotation.y=Math.PI/2;else if(axis==='y')m.rotation.x=Math.PI/2;return m;}
 function stock(length=.30){profile('wooden shoulder stock',[[-length,-.079],[-length,.025],[-.20,.020],[-.12,-.008],[-.045,-.018],[-.012,-.04],[-.055,-.061],[-.15,-.04]],.045);box('stock heel cap',[.012,.10,.051],[-length,-.026,0],'dark');anchor('stock',[-length,-.025,0]);}
 let muzzleMesh=null,carry={...defaultCarry},mount=null,hose=null;
 function muzzle(x,y,r){const m=add(new THREE.CircleGeometry(r*.72,12),'bore','muzzle opening',[x+.0001,y,0]);m.rotation.y=Math.PI/2;muzzleMesh=m;anchor('muzzle',[x+.0001,y,0]);ring('muzzle rim',r*.88,r*.10,[x,y,0],'edge','x');}
 function barrel(x0,x1,r=.011,y=.020){rod('barrel',[x0,y,0],[x1,y,0],r);muzzle(x1,y,r);box('front sight',[.012,.019,.009],[x1-.029,y+r+.009,0]);}
 function receiver(length=.18){const lo=.05-length/2,hi=.05+length/2;profile('receiver',[[lo,-.019],[hi-.008,-.019],[hi,.0],[hi,.020],[hi-.016,.031],[lo+.012,.031],[lo,.020]],.046,'steel');box('receiver highlight',[length*.80,.003,.042],[.05,.034,0],'edge');for(const z of [-.026,.026]){box('ejection port',[.055,.017,.003],[.066,.013,z],'dark');box('bolt edge',[.044,.003,.004],[.059,.005,z*1.03],'edge');box('receiver lower seam',[length*.75,.002,.003],[.05,-.015,z],'edge');for(const x of [lo+.025,hi-.025]){const pin=add(new THREE.CircleGeometry(.0035,6),'edge','receiver pin',[x,-.003,z*1.03]);if(z<0)pin.rotation.y=Math.PI;}}}
 function guard(pos=[0,-.050,0]){const m=ring('trigger guard',.026,.004,pos);m.scale.x=1.2;box('trigger',[.009,.027,.007],[pos[0]+.005,pos[1]+.011,0],'dark');}
 function pistolGrip(x=-.025,y=-.065,mat='wood'){profile('pistol grip',[[x-.025,y+.042],[x+.02,y+.036],[x+.005,y-.055],[x-.048,y-.052]],.033,mat);anchor('grip',[x-.012,y-.006,0]);}
 function longContacts(grip=[-.025,-.050,0],support=[.225,-.044,0]){anchor('grip',grip);anchor('support',support);}
 if(id==='hands'){carry={...carry,hands:[]};}
 if(id==='knife'){
  profile('steel blade',[[.002,-.014],[.115,-.014],[.186,.010],[.116,.025],[.002,.019]],.009,'blade');profile('blade bevel',[[.003,-.014],[.115,-.014],[.186,.010],[.102,-.005],[.003,-.005]],.011,'edge');
  rod('dark handle',[-.110,0,0],[-.005,0,0],.017,'dark');box('cross guard',[.012,.059,.024],[0,0,0],'steel');for(let i=0;i<5;i++)ring('handle wrap '+i,.017,.0015,[-.021-i*.017,0,0],'edge','x');anchor('grip',[-.057,0,0]);anchor('tip',[.188,.010,0]);carry={position:[.29,.88,.26],axis:[.35,-.9,-.3],hands:[1]};
 }
 if(id==='pistol'){
  profile('slide',[[.0,.003],[.157,.003],[.157,.040],[.025,.040],[.0,.030]],.036,'steel');box('slide edge',[.138,.004,.038],[.081,.041,0],'edge');
  pistolGrip(.008,-.046,'dark');guard([.044,-.024,0]);barrel(.025,.165,.009,.020);box('rear sight',[.010,.009,.042],[.017,.046,0]);for(let i=0;i<5;i++)box('slide serration '+i,[.002,.022,.038],[.022+i*.006,.019,0],'dark');carry={position:[.30,.95,.24],axis:[1,-.2,-.05],hands:[1]};
 }
 if(id==='shotgun'){stock(.30);receiver(.18);guard();longContacts();}
 if(['assault','smg','sniper','hmg','launcher'].includes(id)){guard();longContacts();}
 function shapedStock(name,outline,depth=.048){profile(name,outline,depth);anchor('stock',[outline[0][0],-.025,0]);}
 function sidePort(x,y,width,z=.028){for(const sign of [-1,1]){box('dark action recess',[width,.015,.002],[x,y,sign*z],'dark');box('painted action rim',[width*.95,.002,.003],[x,y+.010,sign*(z+.001)],'edge');}}
 function stroke(name,points,mat='edge',radius=.002){return add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(V)),12,radius,4,false),mat,name);}
 if(id==='assault'){
  shapedStock('AK angular butt',[[-.30,-.087],[-.30,.020],[-.205,.021],[-.118,.012],[-.072,-.005],[-.075,-.033],[-.180,-.041]],.042);
  profile('AK stamped receiver',[[-.083,-.020],[.142,-.020],[.151,.022],[.125,.044],[-.055,.044],[-.083,.021]],.052,'steel');rod('AK rounded dust cover',[-.069,.030,0],[.126,.030,0],.023,'steel');sidePort(.060,.012,.076,.029);
  pistolGrip();box('wooden lower handguard',[.145,.039,.045],[.217,-.007,0],'wood');rod('gas tube',[.125,.043,0],[.354,.043,0],.009);barrel(.13,.52,.011);
  const magazine=new THREE.Shape();magazine.moveTo(.063,-.020);magazine.bezierCurveTo(.055,-.11,.067,-.195,.118,-.241);magazine.lineTo(.186,-.222);magazine.bezierCurveTo(.137,-.173,.135,-.092,.137,-.020);magazine.closePath();const magazineG=new THREE.ExtrudeGeometry(magazine,{depth:.043,curveSegments:10,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:1});magazineG.translate(0,0,-.0215);add(magazineG,'dark','bowed AK magazine');
  for(const z of [-.024,.024])for(const offset of [0,.018,.036])stroke('curved magazine stamping',[[.078+offset,-.048,z],[.082+offset,-.135,z],[.113+offset,-.213,z]],'steel',.0018);box('gas block',[.018,.057,.026],[.35,.02,0]);anchor('support',[.232,-.027,0]);
 }
 if(id==='smg'){
  shapedStock('PPSh continuous dropped-comb stock',[[-.33,-.105],[-.33,.008],[-.27,.024],[-.19,.012],[-.11,-.008],[-.045,-.020],[.20,-.022],[.24,-.040],[.19,-.056],[-.055,-.050],[-.125,-.055],[-.23,-.085]],.049);
  rod('PPSh rounded action',[-.075,.018,0],[.18,.018,0],.029,'steel');sidePort(.058,.022,.068,.030);box('PPSh charging tab',[.022,.012,.026],[.094,.012,.041],'dark');
  box('wooden fore-end',[.17,.036,.047],[.22,-.018,0],'wood');rod('perforated barrel shroud',[.11,.019,0],[.43,.019,0],.023);barrel(.13,.457,.010);
  for(let i=0;i<7;i++)for(const z of [-.024,.024])box('shroud vent',[.017,.012,.001],[.185+i*.031,.020,z],'bore');
  rod('drum magazine',[.030,-.097,0],[.100,-.097,0],.068,'dark',.068,16);for(const x of [.027,.103]){ring('drum rim',.059,.003,[x,-.097,0],'edge','x');rod('drum hub',[x-.002,-.097,0],[x+.002,-.097,0],.021,'steel');}anchor('support',[.24,-.04,0]);
 }
 if(id==='shotgun'){
  barrel(.09,.61,.012);rod('magazine tube',[.09,-.012,0],[.49,-.012,0],.010);rod('wooden pump',[.15,-.015,0],[.32,-.015,0],.026,'wood');for(let i=0;i<7;i++)ring('pump groove '+i,.026,.002,[.167+i*.021,-.015,0],'dark','x');anchor('support',[.245,-.039,0]);
 }
 if(id==='sniper'){
  shapedStock('sniper continuous walnut stock',[[-.345,-.099],[-.345,.017],[-.260,.021],[-.13,-.006],[-.055,-.012],[.36,-.014],[.39,-.022],[.35,-.043],[-.05,-.043],[-.145,-.049],[-.26,-.089]],.044);
  rod('slim bolt action',[-.065,.018,0],[.155,.018,0],.017,'steel');sidePort(.052,.016,.067,.020);rod('bent bolt stem',[.048,.02,.018],[.030,-.012,.054],.004,'steel');add(new THREE.SphereGeometry(.009,8,5),'dark','bolt knob',[.030,-.012,.054]);
  for(const x of [.22,.34])ring('sniper furniture band',.024,.0025,[x,-.012,0],'dark','x');barrel(.10,.66,.010);rod('scope tube',[.00,.094,0],[.225,.094,0],.017);rod('scope objective',[.187,.094,0],[.252,.094,0],.024);rod('scope eyepiece',[-.030,.094,0],[.018,.094,0],.020);for(const x of [.035,.155])box('scope mount',[.024,.06,.027],[x,.051,0]);rod('scope lens',[.252,.094,0],[.253,.094,0],.018,'dark');rod('scope turret',[.109,.094,0],[.109,.126,0],.013);longContacts();
 }
 if(id==='hmg'){
  shapedStock('HMG deep shoulder butt',[[-.31,-.092],[-.31,.030],[-.245,.030],[-.15,.002],[-.075,-.003],[-.056,-.034],[-.17,-.041],[-.25,-.084]],.054);
  profile('HMG heavy receiver',[[-.082,-.030],[.215,-.030],[.237,.021],[.206,.065],[-.060,.065],[-.082,.038]],.082,'steel');sidePort(.106,.014,.097,.044);box('HMG feed lid',[.235,.015,.097],[.07,.069,0],'dark');box('HMG lid top plane',[.209,.004,.079],[.068,.079,0],'steel');
  box('receiver rear step',[.042,.017,.066],[-.065,.051,0],'dark');for(const z of [-.044,.044]){box('receiver lower rail',[.205,.006,.004],[.063,-.025,z],'edge');box('receiver side inset',[.076,.024,.003],[.003,.015,z],'dark');}rod('receiver latch',[.162,.031,.045],[.192,.031,.045],.007,'edge',.007,6);rod('heavy barrel shroud',[.21,.025,0],[.62,.025,0],.027);barrel(.23,.70,.014,.025);
  for(let i=0;i<8;i++)for(const z of [-.028,.028])box('cooling port',[.024,.016,.001],[.25+i*.045,.025,z],'bore');
  box('ammunition box',[.12,.13,.09],[.045,-.075,.075],'olive');
  const beltCurve=new THREE.CatmullRomCurve3([V([.085,.054,.046]),V([.083,.043,.115]),V([.082,-.030,.172]),V([.064,-.126,.178]),V([.041,-.205,.141])]);const belt= beltCurve.getSpacedPoints(20),ribbon=[],ribbonIndices=[];
  for(let i=0;i<belt.length;i++){const p=belt[i];ribbon.push(p.x-.023,p.y,p.z-.004,p.x+.023,p.y,p.z-.004);if(i<belt.length-1)ribbonIndices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);}
  const band=new THREE.BufferGeometry();band.setAttribute('position',new THREE.Float32BufferAttribute(ribbon,3));band.setIndex(ribbonIndices);band.computeVertexNormals();const backing=add(band,'dark','draped belt backing');backing.material.side=THREE.DoubleSide;
  for(let i=0;i<belt.length;i++){const p=belt[i];rod('belt round '+i,[p.x-.032,p.y,p.z],[p.x+.040,p.y,p.z],.007,'brass',.003,6);const link=add(new THREE.TorusGeometry(.007,.002,3,8),'steel','cartridge link '+i,p.toArray());link.rotation.y=Math.PI/2;}

  for(const z of [-1,1]){rod('bipod leg',[.49,.012,z*.021],[.53,-.235,z*.10],.007);box('bipod foot',[.047,.009,.027],[.53,-.238,z*.10],'dark');}rod('upper handle rear riser',[.125,.067,0],[.15,.170,0],.009,'dark',.009,8);rod('upper handle front riser',[.32,.047,0],[.30,.170,0],.009,'dark',.009,8);rod('upper handle grip',[.15,.170,0],[.30,.170,0],.013,'wood',.013,10);anchor('support',[.225,.170,0]);carry={...carry,position:[.29,.88,.055],axis:[.20,.12,-.97],handPoses:{support:{quaternion:[-.5,.5,.5,-.5],fingerCurl:1.7,palm:[.065,-.016,0],elbowPole:[-.15,-.55,-.7],gripMesh:true}}};
 }
 if(id==='launcher'){
  shapedStock('launcher short broad butt',[[-.265,-.083],[-.265,.012],[-.175,.007],[-.097,-.009],[-.052,-.015],[-.052,-.041],[-.143,-.044]],.055);
  profile('launcher hinge frame',[[-.073,-.026],[.088,-.034],[.09,.064],[.028,.073],[-.053,.029]],.061,'steel');sidePort(-.012,.012,.046,.033);rod('launcher hinge pin',[.067,-.016,-.042],[.067,-.016,.042],.013,'dark');
  pistolGrip(-.028,-.065);rod('revolving cylinder',[.071,.025,0],[.221,.025,0],.052,'dark',.052,12);
  for(let i=0;i<6;i++){const a=Math.PI/2+i*Math.PI/3;rod('chamber ridge '+i,[.076,.025+Math.sin(a)*.051,Math.cos(a)*.051],[.211,.025+Math.sin(a)*.051,Math.cos(a)*.051],.018,'steel');}
  ring('cylinder front band',.065,.004,[.210,.025,0],'edge','x');ring('cylinder rear band',.065,.004,[.079,.025,0],'steel','x');barrel(.20,.405,.030,.076);box('foregrip barrel saddle',[.067,.047,.028],[.28,.024,0],'dark');box('foregrip',[.067,.055,.042],[.28,-.026,0],'wood');anchor('support',[.28,-.044,0]);
 }
 if(id==='rpg'){
  anchor('stock',[-.18,-.019,0]); // Actual shoulder saddle, also used by the prone hold.
  rod('launch tube',[-.39,.025,0],[.35,.025,0],.033,'olive');rod('rear venturi',[-.48,.025,0],[-.39,.025,0],.062,'steel',.033);ring('rear rim',.057,.004,[-.48,.025,0],'edge','x');
  for(const x of [-.25,-.12,.28])ring('tube clamp',.035,.004,[x,.025,0],'steel','x');rod('ribbed heat sleeve',[-.24,.025,0],[-.095,.025,0],.039,'wood');for(const x of [-.23,-.19,-.15,-.11])ring('heat sleeve groove',.039,.0018,[x,.025,0],'dark','x');box('shoulder saddle',[.105,.025,.058],[-.18,-.019,0],'dark');box('sight bracket',[.046,.014,.052],[-.002,.068,0],'steel');pistolGrip(-.035,-.046,'dark');box('forward grip',[.035,.106,.03],[.05,-.057,0],'wood');anchor('support',[.05,-.060,0]);
  const warhead=new THREE.LatheGeometry([[.027,.35],[.030,.405],[.056,.435],[.070,.48],[.066,.525],[.051,.577],[.023,.644],[.006,.689]].map(p=>new THREE.Vector2(...p)),12);warhead.rotateZ(-Math.PI/2);warhead.translate(0,.025,0);add(warhead,'olive','shaped RPG warhead');ring('warhead shoulder seam',.067,.0025,[.478,.025,0],'dark','x');rod('nose fuse',[.688,.025,0],[.705,.025,0],.006,'brass',.004,8);muzzle(.35,.025,.033);box('folding sight',[.013,.10,.017],[.02,.095,-.04],'steel');carry={...carry,position:[.22,1.245,.185],axis:[1,.015,-.10]};
 }
 if(id==='flamethrower'){
  receiver(.12);pistolGrip(-.06,-.060,'dark');guard([-.025,-.065,0]);rod('fuel lance',[-.07,.020,0],[.46,.020,0],.021);barrel(.30,.49,.028);box('support grip',[.035,.070,.035],[.18,-.037,0],'dark');anchor('support',[.18,-.046,0]);rod('igniter tube',[.27,-.017,0],[.50,-.017,0],.007,'brass');anchor('hoseIn',[-.11,.014,.026]);
  mount=new THREE.Group();mount.name='backpack fuel system';
  box('backplate',[.050,.33,.28],[-.015,0,0],'dark',mount);
  for(const z of [-.083,.083]){rod('fuel cylinder',[-.064,-.13,z],[-.064,.15,z],.065,'olive',.065,12,mount);for(const y of [-.12,.13])ring('tank band',.067,.007,[-.064,y,z],'steel','y',mount);rod('tank valve',[-.064,.15,z],[-.064,.205,z],.012,'brass',.012,8,mount);ring('valve wheel',.022,.004,[-.064,.202,z],'steel','y',mount);}
  for(const z of [-.15,.15]){const curve=new THREE.CatmullRomCurve3([V([-.01,-.14,z]),V([.06,.18,z]),V([.22,.17,z]),V([.26,-.03,z]),V([.10,-.18,z])]);add(new THREE.TubeGeometry(curve,16,.009,5,false),'olive','backpack shoulder strap',[0,0,0],mount);}
  anchor('hoseOut',[-.076,-.125,.15],mount);hose=new THREE.Mesh(new THREE.BufferGeometry(),materials.dark);hose.name='flexible fuel hose';parts.push(hose);
 }
 const gripTargets=id==='hmg'?{support:parts.find(p=>p.name==='upper handle grip')}:{};
 const asset={id,...WEAPON_MODELS[id],root,parts,anchors,carry,mount,hose,muzzleMesh,gripTargets,get triangles(){return parts.reduce((n,p)=>n+(p.geometry.index?.count||p.geometry.attributes.position?.count||0)/3,0);},dispose(){for(const p of parts)p.geometry.dispose();for(const m of Object.values(materials))m.dispose();}};
 if(hose)asset.updateHose=characterRoot=>{characterRoot.updateMatrixWorld(true);const a=characterRoot.worldToLocal(anchors.hoseOut.getWorldPosition(new THREE.Vector3())),b=characterRoot.worldToLocal(anchors.hoseIn.getWorldPosition(new THREE.Vector3()));const curve=new THREE.CatmullRomCurve3([a,a.clone().add(V([-.03,-.16,.07])),b.clone().add(V([-.06,-.12,.12])),b]);hose.geometry.dispose();hose.geometry=new THREE.TubeGeometry(curve,18,.011,6,false);};
 return asset;
}
