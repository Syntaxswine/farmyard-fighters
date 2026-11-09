// Isolated test instrumentation: observe native API calls without replacing
// renderer output, shader results, audio data or any game/editor operation.
export function installNativeProbe(){
  // Popup creation can run the context init script more than once in the
  // initial document. Never wrap a native API twice or replace its receipts.
  if(Object.prototype.hasOwnProperty.call(window,'__windowNativeProbe'))return;
  const records={shaders:[],links:[],audio:[]},captures=[];
  for(const name of ['WebGLRenderingContext','WebGL2RenderingContext']){
    const prototype=window[name]?.prototype;if(!prototype)continue;
    const compile=prototype.compileShader,link=prototype.linkProgram;
    prototype.compileShader=function(shader){const result=compile.call(this,shader);records.shaders.push({ok:!!this.getShaderParameter(shader,this.COMPILE_STATUS),log:this.getShaderInfoLog(shader)||''});return result;};
    prototype.linkProgram=function(program){const result=link.call(this,program);records.links.push({ok:!!this.getProgramParameter(program,this.LINK_STATUS),log:this.getProgramInfoLog(program)||''});return result;};
  }
  const NativeAudio=window.AudioContext||window.webkitAudioContext;
  if(NativeAudio){
    const taps=new WeakMap(),connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(...args){const result=connect.apply(this,args),tap=taps.get(this.context);if(tap&&args[0]===this.context.destination)connect.call(this,tap);return result;};
    window.AudioContext=class extends NativeAudio{
      constructor(...args){super(...args);const ctx=this,record={state:this.state,gestureAtCreation:navigator.userActivation.isActive,resumes:[],decoded:[],starts:[],errors:[]};records.audio.push(record);
        this.addEventListener('statechange',()=>record.state=this.state);
        const decode=this.decodeAudioData.bind(this),resume=this.resume.bind(this),source=this.createBufferSource.bind(this),close=this.close.bind(this);
        this.resume=(...a)=>{const at={gesture:navigator.userActivation.isActive,before:ctx.state};record.resumes.push(at);return resume(...a).then(v=>{at.after=ctx.state;return v;},e=>{record.errors.push(String(e));throw e;});};
        this.decodeAudioData=(bytes,...a)=>{const length=bytes.byteLength;return decode(bytes,...a).then(buffer=>{const channel=buffer.getChannelData(0);let square=0,peak=0;for(const value of channel){square+=value*value;peak=Math.max(peak,Math.abs(value));}record.decoded.push({bytes:length,duration:buffer.duration,channels:buffer.numberOfChannels,sampleRate:buffer.sampleRate,rms:Math.sqrt(square/channel.length),peak});return buffer;},e=>{record.errors.push(String(e));throw e;});};
        this.createBufferSource=()=>{const node=source(),start=node.start.bind(node);node.start=(...a)=>{const item={state:ctx.state,userGestureSeen:navigator.userActivation.hasBeenActive,duration:node.buffer?.duration,time:performance.now()};record.starts.push(item);node.addEventListener('ended',()=>item.ended=true,{once:true});return start(...a);};return node;};
        let capture;
        try{if(window.MediaRecorder&&MediaRecorder.isTypeSupported('audio/webm;codecs=opus')){const tap=this.createMediaStreamDestination();taps.set(this,tap);const recorder=new MediaRecorder(tap.stream,{mimeType:'audio/webm;codecs=opus'}),chunks=[];capture={recorder,chunks,stream:tap.stream,record};captures.push(capture);capture.finished=new Promise(resolve=>recorder.addEventListener('stop',resolve,{once:true}));recorder.addEventListener('dataavailable',event=>{if(event.data.size)chunks.push(event.data);});recorder.start(200);}}catch(e){record.captureUnavailable=String(e);}
        this.close=(...a)=>{if(capture?.recorder.state==='recording')capture.recorder.stop();return close(...a);};
      }
    };
  }
  Object.defineProperty(window,'__windowNativeProbe',{value:{snapshot:()=>structuredClone(records),async finishAudio(){const output=[];for(const [index,capture]of captures.entries()){if(capture.recorder.state==='recording')capture.recorder.stop();await capture.finished;for(const track of capture.stream.getTracks())track.stop();const blob=new Blob(capture.chunks,{type:'audio/webm;codecs=opus'}),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let at=0;at<bytes.length;at+=16384)binary+=String.fromCharCode(...bytes.subarray(at,at+16384));output.push({index,mime:blob.type,bytes:bytes.length,base64:btoa(binary),starts:capture.record.starts.length});}return output;}}});
}

export function inspectWebGL(selector){
  const canvas=document.querySelector(selector),gl=canvas?.getContext('webgl2')||canvas?.getContext('webgl');if(!gl)return {available:false};
  const extension=gl.getExtension('WEBGL_debug_renderer_info'),vendor=extension?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer=extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  return {available:true,version:gl.getParameter(gl.VERSION),shadingLanguage:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),vendor,renderer,software:/swiftshader|llvmpipe|software/i.test(renderer),contextLost:gl.isContextLost()};
}
