// Bind-space cloth print: follows the existing skinned shirt without new meshes.
export const DONKEY_GUIDE_OUTFIT='blue-hawaiian';
export const TOWN_GUIDE_APPEARANCE=Object.freeze({species:'donkey',outfit:DONKEY_GUIDE_OUTFIT,weapon:'hands'});
export function applyDonkeyHawaiian(material){
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey;
 material.customProgramCacheKey=()=>key.call(material)+'-donkey-hawaiian-v1';
 material.onBeforeCompile=shader=>{
  previous(shader);
  shader.fragmentShader=shader.fragmentShader.replace('void main() {',`
   vec3 alohaPrint(vec2 uv){
    uv*=9.;vec2 cell=floor(uv);vec2 q=fract(uv)-.5;
    float seed=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
    float angle=seed*6.283185;mat2 turn=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));q=turn*q;
    float a=atan(q.y,q.x),r=length(q);
    float petal=.225+.068*cos(5.*a);
    float flower=1.-smoothstep(petal-.015,petal+.015,r);
    float heart=1.-smoothstep(.035,.06,r);
    vec2 leaf=q-vec2(.26,.26);float blade=1.-smoothstep(.85,1.,length(leaf/vec2(.08,.24)));
    vec3 blue=vec3(.025,.20,.47)*(1.+.045*sin(uv.y*83.)*sin(uv.x*77.));
    vec3 c=mix(blue,vec3(.055,.39,.38),blade);
    c=mix(c,vec3(.94,.89,.69),flower);return mix(c,vec3(.94,.60,.25),heart);
   }
   void main() {`);
  shader.fragmentShader=shader.fragmentShader.replace('if(uPaintDebug>.5)',`
   float alohaCloth=(vPaintPart<1.5?1.:abs(vPaintPart-2.)<.1?smoothstep(.79,.83,p.y):0.);
   if(abs(vPaintPart-3.)<.1||abs(vPaintPart-5.)<.1)alohaCloth=smoothstep(.945,.985,p.y);
   if(alohaCloth>0.){
    vec3 weights=pow(abs(n),vec3(6.));weights/=max(.0001,weights.x+weights.y+weights.z);
    vec3 shirt=alohaPrint(p.zy)*weights.x+alohaPrint(p.xy)*weights.z+alohaPrint(p.xz)*weights.y;
    float front=smoothstep(.07,.12,p.x)*(1.-smoothstep(.012,.021,abs(p.z)));
    shirt=mix(shirt,vec3(.03,.16,.35),front*.85);
    float button=(1.-smoothstep(.005,.009,abs(p.z)))*(1.-smoothstep(.003,.007,abs(mod(p.y-.86,.085)-.0425)))*smoothstep(.09,.12,p.x);
    shirt=mix(shirt,vec3(.86,.82,.66),button);
    diffuseColor.rgb=mix(diffuseColor.rgb,shirt,alohaCloth);coverage*=1.-alohaCloth;filled=max(filled,alohaCloth);
   }
   if(uPaintDebug>.5)`);
 };
 material.needsUpdate=true;
 return ()=>{material.onBeforeCompile=previous;material.customProgramCacheKey=key;material.needsUpdate=true;};
}
