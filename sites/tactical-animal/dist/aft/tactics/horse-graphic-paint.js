// Painted value shapes in bind space: they follow the skin, independent of triangle edges.
// No additional geometry or change to the approved character proportions.
export const graphicPaintGLSL=`
float paintStroke(float distance,float width){return 1.0-smoothstep(width*.55,width,abs(distance));}
float paintRange(float x,float lo,float hi,float feather){return smoothstep(lo,lo+feather,x)*(1.0-smoothstep(hi-feather,hi,x));}
vec3 paintShirt(vec3 base,vec3 p,vec3 n){
 float sleeve=smoothstep(.22,.285,abs(p.z));
 float roll=p.y+abs(p.z)*.63;
 float cuff=paintRange(roll,1.11,1.29,.022)*sleeve*smoothstep(-.05,.10,p.x);
 float cuffPatch=exp(-pow((abs(p.z)-.315)/.040,2.0));
 float cuffTaper=.003+.008*cuffPatch;
 float dark=paintStroke(roll-1.172+(p.x-.08)*.22,cuffTaper)*cuff*cuffPatch;
 float light=paintStroke(roll-1.191+(p.x-.08)*.35,cuffTaper*1.6)*cuff*cuffPatch;
 float front=smoothstep(.045,.105,p.x)*(1.0-smoothstep(.15,.21,abs(p.z)));
 dark+=paintStroke(p.y-1.167+abs(p.z)*.52,.008)*front;
 dark+=paintStroke(p.y-1.200+(abs(p.z)-.20)*.62,.008)*paintRange(abs(p.z),.205,.34,.035)*smoothstep(.015,.065,p.x);
 float underarm=smoothstep(.14,.23,abs(p.z))*(1.0-smoothstep(1.05,1.14,p.y));
 vec3 result=mix(base,vec3(.94,.85,.65),.45);
 result*=1.0-.20*underarm-.10*(1.0-smoothstep(-.06,.12,n.x));
 result=mix(result,vec3(.22,.145,.072),clamp(dark*.58,0.0,.84));
 result=mix(result,vec3(1.0,.96,.79),clamp(light*.66,0.0,.72));
 float knot=1.0-smoothstep(.70,1.0,length((p.zy-vec2(0.0,1.249))/vec2(.028,.030)));
 float t=clamp((1.245-p.y)/.084,0.0,1.0);
 float tailWidth=.008+.013*sin(t*3.14159);
 float tails=paintStroke(p.z-(-.009-.026*t),tailWidth)*paintRange(p.y,1.160,1.248,.006);
 tails=max(tails,paintStroke(p.z-(.008+.031*t),tailWidth*.8)*paintRange(p.y,1.178,1.249,.009));
 float scarf=max(knot,tails)*smoothstep(.0,.055,p.x);
 result=mix(result,vec3(.51,.019,.006),scarf);
 result=mix(result,vec3(.76,.065,.016),scarf*paintStroke(p.z+.012+.014*t,.005)*.65);
 return result;
}
vec3 graphicPaint(vec3 base,vec3 p,vec3 n,float region){
 if(region<1.5){
  // Chestnut planes: a bright cheek/front ridge against a warm, dark jaw.
  float ridge=exp(-pow((p.y-(1.515-.47*(p.x+.01)))/.023,2.0));
  float jaw=exp(-pow((p.y-(1.393-.27*(p.x+.01)))/.012,2.0))*smoothstep(.045,.080,abs(p.z));
  vec3 coat=base*vec3(1.06,.64,.36);
  coat=mix(coat,vec3(.72,.285,.078),ridge*.46);
  return mix(coat,vec3(.105,.030,.009),jaw*.57);
 }
 if(region<2.5){
  float glove=1.0-smoothstep(.760,.778,p.y),cuff=smoothstep(.908,.925,p.y);
  vec3 coat=base*vec3(1.06,.64,.36);
  float edge=paintStroke(p.x-.10,.022)*paintRange(p.y,.78,.94,.025);
  coat=mix(coat,vec3(.66,.28,.080),edge*.40);
  coat=mix(coat,base,glove);
  return mix(coat,paintShirt(base,p,n),cuff);
 }
 if(region<3.5)return paintShirt(base,p,n);
 if(region<4.5){
  vec3 cloth=base*vec3(.78,.88,.60);
  float front=smoothstep(.035,.105,p.x),leg=paintRange(p.y,.23,.80,.045);
  float center=.13+(.78-p.y)*.15,across=abs(p.z)-center;
  float foldLength=exp(-pow((p.y-.63)/.095,2.0))+.60*exp(-pow((p.y-.32)/.060,2.0));
  float longFold=paintStroke(across+.031-(p.y-.48)*.055,.017)*leg*front*foldLength;
  float longLight=paintStroke(across+.010-(p.y-.48)*.055,.026)*leg*front*foldLength;
  float kneePatch=exp(-pow((across-.024)/.040,2.0));
  float knee=paintStroke(p.y-.455+across*.65,.003+.007*kneePatch)*kneePatch*front;
  float kneeLight=paintStroke(p.y-.471+across*.78,.003+.009*kneePatch)*kneePatch*front;
  cloth=mix(cloth,vec3(.026,.044,.019),clamp(longFold*.65+knee*.67,0.0,.82));
  cloth=mix(cloth,vec3(.31,.35,.17),clamp(longLight*.42+kneeLight*.49,0.0,.74));
  // Crisp pocket rim and narrow highlight make the bib readable at native size.
  vec2 q=abs(p.zy-vec2(0.0,1.043))-vec2(.064,.043);
  float sdf=length(max(q,0.0))+min(max(q.x,q.y),0.0)-.008;
  float bib=front*paintRange(p.y,.970,1.118,.009);
  cloth=mix(cloth,vec3(.020,.034,.015),paintStroke(sdf,.0055)*bib*.84);
  cloth=mix(cloth,vec3(.39,.40,.19),paintStroke(sdf+.005,.0025)*bib*.43);
  return cloth;
 }
 if(region<5.5){float edge=paintStroke(p.x-.082,.018)*paintRange(p.y,.028,.090,.020);return mix(base*.67,vec3(.22,.18,.13),edge*.45);}
 float lock=paintStroke(p.z-.010*sin((p.y-1.2)*7.0),.006);
 return mix(base*.68,vec3(.25,.095,.023),lock*.45);
}
`;
