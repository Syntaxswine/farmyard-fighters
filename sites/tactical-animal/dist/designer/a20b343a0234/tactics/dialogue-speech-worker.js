import {plan,render,mouthCues} from './vendor/babble/index.mjs';
// Synthesis and phoneme planning are synchronous upstream. Keep both off the UI thread.
self.onmessage=({data:{id,text,profile,rate}})=>{try{
 const voice=profile.voice,base=plan(text,voice),targetDuration=base.duration/rate;
 // Reject oversized phrases before allocating PCM, including prefetched phrases.
 if(!Number.isFinite(targetDuration)||targetDuration<=0||targetDuration*22050*4>2*1024*1024)throw Error('Voice phrase exceeds the audio budget. The full line is available.');
 const clip=render(text,voice,{sampleRate:22050,timing:{duration:targetDuration}});
 const {words,units,duration}=clip.plan;
 self.postMessage({id,clip:{samples:clip.samples,sampleRate:clip.sampleRate,plan:{words,units,duration},mouth:mouthCues(clip.plan)}},[clip.samples.buffer]);
 }catch(error){self.postMessage({id,error:error.message});}};
