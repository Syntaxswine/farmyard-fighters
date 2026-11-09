// Twelve Jungian archetypes (GUARDS.md G3, G4: `hit` = the quip, the repeat and the retaliation line when a colleague's bullet lands). Guards draw one at map creation; the four authored mercs carry a tag.
// Traits scale the G2 state machine (vigilance, nerve, initiative, obedience) and feed Codex's merc formula
// (aggression, pride, discipline, forgiveness, loyalty, humor). Bonds between archetypes are derived, not authored,
// by three rules: Pearson's wheel, complementary wants, and failure modes that hit fears. Six rungs label a bond.
// Nothing here consumes an RNG stream: the draw is a hash of the map seed and the guard's index.

export const WHEEL=['Innocent','Sage','Explorer','Rebel','Magician','Hero','Lover','Jester','Everyman','Caregiver','Ruler','Creator'];
const angle=Object.fromEntries(WHEEL.map((a,i)=>[a,i*30]));
const T=(vigilance,nerve,initiative,obedience,aggression,pride,discipline,forgiveness,loyalty,humor)=>({vigilance,nerve,initiative,obedience,aggression,pride,discipline,forgiveness,loyalty,humor});

export const ARCHETYPES={
 Innocent:{thanks:'Thank you. I knew somebody would come.',hit:['That was me! You shot me!','Again? Please stop. Please.','Stop it! Stop it, I said!'],wants:'safety and simple happiness',fears:'doing something wrong',speaks:'plainly, trusts first',fails:'denial: ignoring what is ugly until it bites',radius:8,traits:T(60,30,30,80,20,30,60,85,70,40),
  barks:{suspicious:['Hello? Is somebody there?','Probably just the pipes. Probably.'],alert:['Oh no. Oh no, they are real.','Somebody! There are people in here!'],searching:['They were right here. Where did they go?','Maybe they left. People leave, sometimes.'],standdown:['It was nothing. It was nothing, right?','I am sure it was nothing.'],rest:['Back where I belong. Nice and quiet.','See? Everything is fine.'],broken:['I do not want to be here anymore!','Please, I only guard the door!']}},
 Everyman:{thanks:'Cheers. I owe you a round.',hit:['Oi. Other way, mate.','Twice now. That is not an accident.','Right. Have some back, then.'],wants:'to belong',fears:'standing out, being left behind',speaks:'common sense, understatement',fails:'going along with the crowd against their own judgment',radius:12,traits:T(50,45,30,85,35,35,60,60,75,50),
  barks:{suspicious:['Something is off. I will have a look.','Bit noisy for this hour.'],alert:['Right. That is trouble, that is.','Lads, we have company.'],searching:['Lost them. They cannot have gone far.','Anyone else see where they went?'],standdown:['Enough of that. Back to work.','Not my problem anymore.'],rest:['Post. Kettle. Normal.','Same as it ever was.'],broken:['Not paid for this. Not paid nearly enough.','Somebody else can be the hero.']}},
 Hero:{thanks:'I had it handled. But thank you.',hit:['Is that the best you can do?','Shoot me again and see what happens.','You were warned.'],wants:'to prove worth through hard action',fears:'weakness',speaks:'challenges and deadlines',fails:'arrogance: picking fights that did not need fighting',radius:16,traits:T(60,85,95,40,85,80,55,30,60,45),
  barks:{suspicious:['Come out. I dare you.','If that is a rat, it is a brave one.'],alert:['There you are. Come and get some!','Finally! Something worth doing!'],searching:['Hiding? Cowards hide. I do not.','Run all you like. I am faster.'],standdown:['They ran. Of course they ran.','Next time they will not get away.'],rest:['Post held. Nobody got past me.','Let them try again.'],broken:['Not like this. Not like this!','Tactical retreat. It is a thing!']}},
 Caregiver:{thanks:'So this is how it feels. Thank you.',hit:['Careful! Somebody could get hurt. Me.','I bandaged you last week, and this is the thanks.','Enough. I am done being careful with you.'],wants:'to protect others',fears:'selfishness in themselves',speaks:'warmly, asks what you need',fails:'martyrdom and smothering, helping past the point of being asked',radius:14,traits:T(65,55,60,60,30,40,70,80,95,35),
  barks:{suspicious:['Is someone hurt out there?','Hello? Do you need help?'],alert:['Everyone stay behind me!','Get down, all of you, get down!'],searching:['Are you hurt? You can come out.','Nobody has to get hurt tonight.'],standdown:['Gone. I hope they are all right.','Back to the others, then.'],rest:['Everyone accounted for. Good.','All safe. That is what matters.'],broken:['I cannot help anyone if I am dead!','Someone look after the others!']}},
 Explorer:{thanks:'Not done yet, then. Thanks.',hit:['Wrong direction. Everything is, with you.','You again. I should have kept walking.','Fine. Let us see who is faster.'],wants:'freedom and new ground',fears:'being trapped or conforming',speaks:'restlessly, about the next place',fails:'never committing, wandering when staying was the task',radius:6,traits:T(85,50,80,20,50,55,30,55,40,60),
  barks:{suspicious:['Now what is over there?','Something new. About time.'],alert:['Finally, something moves in this place!','Contact! And I am going after it.'],searching:['Come on, where does this lead?','They went somewhere. I like somewhere.'],standdown:['Trail is cold. Shame.','Well. That was the interesting part.'],rest:['Back at the post. Dull, dull post.','Same four walls. For now.'],broken:['This is not my fight. Anywhere but here!','There is always another door.']}},
 Rebel:{thanks:'Do not expect me to say it twice. Thanks.',hit:['Do that again. I dare you.','That is two. I count.','Nobody shoots me for free.'],wants:'to break what is broken',fears:'being powerless',speaks:'bluntly, provokes on purpose',fails:'destroying things that worked, revolt as habit',radius:0,traits:T(55,75,90,10,90,75,20,20,35,55),
  barks:{suspicious:['Who is sneaking about? Show yourself.','I hear you. I am not impressed.'],alert:['Good. I was getting bored of orders.','Come on then! Nobody tells me to wait!'],searching:['Hiding does not make you clever.','Come out and say it to my face.'],standdown:['Fine. Whatever. I have better things to do.','Post? What post.'],rest:['Standing where they tell me. For now.','Do not get used to it.'],broken:['This is not worth it. None of it!','Let the foreman guard his own door!']}},
 Lover:{thanks:'You came back for me. I will not forget that.',hit:['You... you hit me. How could you?','It hurts more the second time.','If that is how it is, so be it.'],wants:'intimacy and beauty',fears:'being unwanted',speaks:'sensory detail and devotion',fails:'losing self in the other, pleasing rather than telling the truth',radius:10,traits:T(45,35,40,65,30,50,45,70,85,50),
  barks:{suspicious:['Someone is here. I can feel it.','Is that you? Say something.'],alert:['Stay with me, do not leave me alone out here!','They are here! Stay close!'],searching:['Where did you go? Come back to me.','I know you are near. I can feel it.'],standdown:['Gone. Like everyone, in the end.','Alone again. Back to my post.'],rest:['Home. Such as it is.','Quiet again. I hated the quiet, once.'],broken:['Not like this, not alone!','Somebody, please, do not leave me!']}},
 Creator:{thanks:'Clean work. I will remember the hands.',hit:['Sloppy work. That was my arm.','A pattern. I keep notes on patterns.','Corrected.'],wants:'to make something that lasts',fears:'mediocrity',speaks:'ideas and half-finished sketches',fails:'perfectionism, never shipping',radius:10,traits:T(55,45,25,45,30,60,75,50,55,40),
  barks:{suspicious:['That sound has a shape. Let me see it.','Interesting. Wrong, but interesting.'],alert:['So that is the design. Crude.','Contact. Noted, and now, answered.'],searching:['They took a route. Every route leaves a line.','If I were them, I would be... there.'],standdown:['Unfinished. Like everything here.','I will draw this properly later.'],rest:['My corner. Nearly right. Needs work.','Post improved. Slightly.'],broken:['The plan was flawed. Badly flawed!','I need to redraw all of this!']}},
 Jester:{thanks:'Ha. Dying was boring anyway. Thanks.',hit:['Ha! Ha. Ow. That was me.','The joke was funnier the first time.','Everyone is a critic. Here is mine.'],wants:'to enjoy the moment, make others laugh',fears:'boredom, being boring',speaks:'jokes that carry the true thing',fails:'frivolity, joking through the moment that needed seriousness',radius:12,traits:T(40,40,55,30,45,45,25,65,60,95),
  barks:{suspicious:['If that is a ghost, I am off shift.','Knock knock. Seriously, who is there?'],alert:['Ha! Party is on! Nobody told me to dress!','Oh good, visitors. I hate visitors.'],searching:['Come out, come out. I have snacks. I lie.','Marco? No? Tough crowd.'],standdown:['And the crowd goes... home.','Best hide-and-seek I have lost all week.'],rest:['Back at my post, which is also my best joke.','Nothing happened. Story of my life.'],broken:['This is the part where I leave! Ha! Ha!','Joke is over! Joke is very over!']}},
 Sage:{thanks:'Textbook. Thank you.',hit:['Your aim, statistically, favours me.','Twice is a trend, not an accident.','Hypothesis: you will not do it a third time.'],wants:'to understand',fears:'being deceived or ignorant',speaks:'carefully, cites, qualifies',fails:'paralysis: studying instead of acting',radius:8,traits:T(90,50,20,55,25,55,85,55,50,30),
  barks:{suspicious:['A sound. Probably footsteps. Probably.','Consistent with movement. Not yet with intent.'],alert:['Confirmed. Hostiles. I did say probably.','As the evidence suggested. Contact.'],searching:['They were here. The question is where next.','Consider the exits. They did.'],standdown:['Insufficient evidence. Returning.','Conclusion: gone. For now.'],rest:['Observation resumes. Nothing observed.','Quiet. Noted, with reservations.'],broken:['This was a miscalculation. Withdraw!','The data says run. I concur!']}},
 Magician:{thanks:'Well timed. You are a useful part.',hit:['Careful. I am a moving part.','The same fault, twice. Interesting.','Every action has a consequence. This one.'],wants:'to transform situations',fears:'unintended consequences',speaks:'systems and hidden levers',fails:'manipulation: treating people as parts',radius:6,traits:T(70,60,65,25,55,65,60,35,40,45),
  barks:{suspicious:['Something has changed. I will find the lever.','The pattern shifted. Interesting.'],alert:['There. Now the others will move where I need them.','Contact. And every piece is in play.'],searching:['They think they are hidden. Everything has a mechanism.','Every hiding place has a rule. I know the rules.'],standdown:['The game resets. It always does.','Withdrawn. Not defeated. Rearranged.'],rest:['In position. Watching the machine turn.','Back on the board. My square.'],broken:['This was not in the design! Not in the design!','The system fails! I fail with it!']}},
 Ruler:{thanks:'Noted. You will be commended.',hit:['Discipline! That was your commander!','Insubordination. Twice.','You are relieved of duty. Permanently.'],wants:'order and control',fears:'chaos, being overthrown',speaks:'decisions and responsibilities',fails:'authoritarianism: control past the point of usefulness',radius:20,traits:T(70,70,45,50,55,85,90,30,65,25),
  barks:{suspicious:['Who is there? Identify yourself.','This area is under my control. Speak.'],alert:['Intruders! All posts, on me!','Contact! Nobody leaves their post without my word!'],searching:['They are on my ground. Find them.','Nobody hides on my shift for long.'],standdown:['The area is secured. Resume posts.','Enough. Order is restored.'],rest:['Post held. As it should be.','Everything in its place. Including me.'],broken:['This is unacceptable! Fall back! Fall back!','I will not die for a door!']}},
};
export const NAMES=Object.keys(ARCHETYPES);

// Bonds. Affinity: wants that complete each other, +15 both ways. Friction: A's failure mode is what B fears, B resents A by 15.
const affinity=[['Innocent','Caregiver'],['Innocent','Ruler'],['Everyman','Caregiver'],['Everyman','Jester'],['Hero','Ruler'],['Hero','Rebel'],['Caregiver','Lover'],['Explorer','Rebel'],['Explorer','Sage'],['Creator','Magician'],['Creator','Sage'],['Jester','Lover'],['Sage','Magician'],['Ruler','Creator'],['Rebel','Magician']];
export const FRICTION={
 Innocent:['Sage','Magician'],Everyman:['Rebel','Sage','Hero'],Hero:['Innocent','Caregiver','Ruler','Everyman'],Caregiver:['Explorer','Rebel','Hero'],Explorer:['Ruler','Everyman'],
 Rebel:['Ruler','Innocent','Creator','Everyman'],Lover:['Sage','Hero'],Creator:['Hero','Ruler'],Jester:['Ruler','Sage','Caregiver','Hero'],Sage:['Hero','Rebel','Explorer'],
 Magician:['Innocent','Everyman','Lover','Caregiver','Rebel'],Ruler:['Rebel','Explorer','Jester']};
const competitive=new Set(['Hero','Ruler','Rebel','Jester','Magician']),cooperative=new Set(['Everyman','Caregiver','Innocent']);
const aff=new Set(affinity.flatMap(([a,b])=>[a+'|'+b,b+'|'+a]));
export const WHEEL_AMPLITUDE=30,AFFINITY=15,FRICTION_WEIGHT=15;
// How `from` initially regards `to`: the resting level of the bond.
export function bond(from,to){
 if(!ARCHETYPES[from]||!ARCHETYPES[to])return 0;
 if(from===to)return WHEEL_AMPLITUDE+(competitive.has(from)?-10:cooperative.has(from)?10:0);
 const d=Math.abs(angle[from]-angle[to]),delta=Math.min(d,360-d);
 let v=Math.round(WHEEL_AMPLITUDE*Math.cos(delta*Math.PI/180));
 if(aff.has(from+'|'+to))v+=AFFINITY;
 if(FRICTION[to].includes(from))v-=FRICTION_WEIGHT;
 return v;
}

// Six rungs on the −100..100 bond scale and what each does to the friendly-fire retaliation chance.
export const RUNGS=[{name:'bonded',min:60,retaliation:0},{name:'trusted',min:25,retaliation:.5},{name:'cautious trust',min:0,retaliation:1},{name:'strained',min:-34,retaliation:1.5},{name:'resented',min:-69,retaliation:2},{name:'feud',min:-100,retaliation:2}];
export const rungOf=value=>RUNGS.find(r=>(value??0)>=r.min)||RUNGS.at(-1);
export const retaliationScale=value=>rungOf(value).retaliation;
export const opposing=value=>(value??0)<=-35; // resented or feud: the G5 "opposing personalities"
export const liked=value=>(value??0)>=25;     // trusted or bonded

// Deterministic draw: a hash of the map seed and the guard's index, so a seed reproduces its roster and no RNG stream moves.
export function drawArchetype(seed,index){let h=(seed>>>0)^0x9e3779b9;for(const c of 'guard:'+index)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;h^=h>>>16;h=Math.imul(h,0x45d9f3b)>>>0;h=(h^(h>>>16))>>>0;return NAMES[h%NAMES.length];}
// A recruit squad draws four distinct archetypes.
export function drawSquad(seed,count=4){const out=[];for(let i=0;out.length<count&&i<200;i++){const a=drawArchetype(seed^0x5bd1e995,i);if(!out.includes(a))out.push(a);}return out;}

// Trait scaling for the G2 state machine. A unit without traits scales by 1 (the G2 base numbers).
const TRAIT_KEYS=['vigilance','nerve','initiative','obedience'];const whole=t=>!!t&&TRAIT_KEYS.every(k=>Number.isFinite(t[k]));
export const traitsOf=u=>{if(whole(u?.traits))return u.traits;const a=ARCHETYPES[u?.archetype]?.traits;return a||null;}; // a partial traits object counts as none
const scale=(u,key)=>{const t=traitsOf(u);return t?.5+t[key]/100:1;};
export const hearingScale=u=>scale(u,'vigilance');       // footstep radius: Sage 1.4, Jester 0.9
export const stepsScale=u=>scale(u,'initiative');        // suspicion steps: Hero 1.45, Sage 0.7
export const cellsScale=u=>scale(u,'vigilance');         // report cells searched
export const alertScale=u=>scale(u,'vigilance');         // rounds before an alert guard loses the trail
export const nerveFraction=u=>{const t=traitsOf(u);return t?(1-t.nerve/100)*2/3:1/3;}; // breaks at or below this share of health: Hero .10, Innocent .47
export const brokenRoundsOf=u=>{const t=traitsOf(u);return t?Math.max(1,Math.round(4*(1-t.nerve/100))):2;}; // Innocent 3, Hero 1
export const shoutRadius=u=>ARCHETYPES[u?.archetype]?.radius??12;
// A bark in the archetype's register, alternating between its two lines; null without an archetype.
export function archetypeBark(u,state){const a=ARCHETYPES[u?.archetype];if(!a||!a.barks[state])return null;const lines=a.barks[state],n=((u.barked??={})[state]||0);u.barked[state]=n+1;return lines[n%lines.length];}
export function describeArchetype(name){const a=ARCHETYPES[name];if(!a)return '';return `${name}: wants ${a.wants}; fears ${a.fears}; speaks ${a.speaks}; fails by ${a.fails}.`;}
