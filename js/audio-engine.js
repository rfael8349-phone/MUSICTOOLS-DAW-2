// MUSICTOOL DAW V6 audio graph: isolated channel strips, EQ, dynamics and FX.
import { state, isAudible } from './state.js';
let ctx=null,master=null,masterLimiter=null,metronomeGain=null,clickBuffer=null;
let activeSources=[];
const channels=new Map(),voices=new Map();
export function getContext(){
 if(!ctx){const AC=window.AudioContext||window.webkitAudioContext;ctx=new AC({latencyHint:'interactive'});master=ctx.createGain();master.gain.value=Number.isFinite(state.masterVolume)?state.masterVolume:.9;masterLimiter=ctx.createDynamicsCompressor();masterLimiter.threshold.value=-1;masterLimiter.knee.value=0;masterLimiter.ratio.value=20;masterLimiter.attack.value=.003;masterLimiter.release.value=.12;master.connect(masterLimiter);masterLimiter.connect(ctx.destination);metronomeGain=ctx.createGain();metronomeGain.gain.value=.5;metronomeGain.connect(master);clickBuffer=makeClickBuffer(ctx);for(const t of state.tracks)ensureChannel(t.id);}
 return ctx;
}
export async function resume(){const c=getContext();if(c.state==='suspended')await c.resume();return c.state;}
export function setMasterVolume(value){state.masterVolume=Math.max(0,Math.min(2,Number(value)||0));getContext();master.gain.setTargetAtTime(state.masterVolume,ctx.currentTime,.015);}
export function getMasterGain(){getContext();return master;}
function makeChannel(trackId){
 const input=ctx.createGain(),filters=[80,250,1000,4000,10000].map((freq)=>{const f=ctx.createBiquadFilter();f.type='peaking';f.frequency.value=freq;f.Q.value=.85;return f;});
 const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-18;compressor.knee.value=18;compressor.ratio.value=3;compressor.attack.value=.008;compressor.release.value=.18;
 const panner=ctx.createStereoPanner?ctx.createStereoPanner():null;
 const analyser=ctx.createAnalyser();analyser.fftSize=256;
 const ch={gain:input,filters,compressor,panner,analyser,fxNodes:[],fxSignature:''};
 let node=input;for(const f of filters){node.connect(f);node=f;}node.connect(compressor);node=compressor;if(panner){node.connect(panner);panner.connect(analyser);}else node.connect(analyser);analyser.connect(master);
 channels.set(trackId,ch);return ch;
}
export function ensureChannel(trackId){getContext();return channels.get(trackId)||makeChannel(trackId);}
function buildFx(ch,track){
 const effects=(track.effects||[]).filter(f=>f.enabled);
 const signature=effects.map(f=>f.type+':'+(f.mix??.35)).join('|');
 if(signature===ch.fxSignature)return;
 for(const n of ch.fxNodes){try{n.disconnect();}catch{}try{if(typeof n.stop==='function')n.stop();}catch{}}
 ch.fxNodes=[];
 const tail=ch.panner||ch.analyser;
 // Rewire compressor through the enabled effect chain to the channel output.
 try{ch.compressor.disconnect();}catch{}
 let node=ch.compressor;
 for(const fx of effects){
  let effect=null;
  if(fx.type==='overdrive'||fx.type==='distortion'){
   effect=ctx.createWaveShaper();const curve=new Float32Array(2048),amount=fx.type==='overdrive'?12:35;
   for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=(1+amount)*x/(1+amount*Math.abs(x));}effect.curve=curve;effect.oversample='4x';
  }else if(fx.type==='delay'){
   effect=ctx.createDelay(2);effect.delayTime.value=.28;
   const fb=ctx.createGain();fb.gain.value=.24;effect.connect(fb);fb.connect(effect);ch.fxNodes.push(fb);
  }else if(fx.type==='reverb'){
   effect=ctx.createConvolver();const length=Math.floor(ctx.sampleRate*1.6),imp=ctx.createBuffer(2,length,ctx.sampleRate);
   for(let c=0;c<2;c++){const d=imp.getChannelData(c);for(let i=0;i<length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/length,2.8);}
   effect.buffer=imp;
  }else if(fx.type==='chorus'){
   effect=ctx.createDelay(.08);effect.delayTime.value=.018;const lfo=ctx.createOscillator(),depth=ctx.createGain();lfo.frequency.value=.8;depth.gain.value=.006;lfo.connect(depth);depth.connect(effect.delayTime);lfo.start();ch.fxNodes.push(lfo,depth);
  }
  if(effect){
   const dry=ctx.createGain(),wet=ctx.createGain(),sum=ctx.createGain();
   const mix=Math.max(0,Math.min(1,Number(fx.mix??.35)));
   dry.gain.value=1-mix;wet.gain.value=mix;
   node.connect(dry);node.connect(effect);effect.connect(wet);
   dry.connect(sum);wet.connect(sum);node=sum;
   ch.fxNodes.push(effect,dry,wet,sum);
  }
 }
 node.connect(tail);ch.fxSignature=signature;
}
export function updateChannel(track){
 const ch=ensureChannel(track.id);
 ch.gain.gain.setTargetAtTime(Math.max(0,Number(track.volume??1)),ctx.currentTime,.012);
 if(ch.panner)ch.panner.pan.setTargetAtTime(Math.max(-1,Math.min(1,Number(track.pan)||0)),ctx.currentTime,.012);
 const eq=track.eq||{};const vals=[eq.low,eq.lowMid,eq.mid,eq.highMid,eq.high];
 ch.filters.forEach((f,i)=>f.gain.setTargetAtTime(Number(vals[i])||0,ctx.currentTime,.02));
 if(track.compressor?.enabled){ch.compressor.threshold.value=Number(track.compressor.threshold??-18);ch.compressor.ratio.value=Number(track.compressor.ratio??3);}else{ch.compressor.threshold.value=0;ch.compressor.ratio.value=1;}
 buildFx(ch,track);
}
export function getChannelLevel(trackId){const ch=channels.get(trackId);if(!ch)return 0;const data=new Uint8Array(ch.analyser.fftSize);ch.analyser.getByteTimeDomainData(data);let sum=0;for(const v of data){const x=(v-128)/128;sum+=x*x;}return Math.min(1,Math.sqrt(sum/data.length)*3.2);}
export function removeChannel(trackId){const ch=channels.get(trackId);if(ch){for(const n of [ch.gain,...ch.filters,ch.compressor,ch.panner,ch.analyser,...ch.fxNodes])if(n)try{n.disconnect();}catch{}channels.delete(trackId);}}
export function playClick(when,accent=false){getContext();const src=ctx.createBufferSource();src.buffer=clickBuffer;const g=ctx.createGain();g.gain.value=accent?1:.6;src.connect(g);g.connect(metronomeGain);src.start(when);}
function makeClickBuffer(c){const dur=.05,sr=c.sampleRate,b=c.createBuffer(1,Math.floor(sr*dur),sr),d=b.getChannelData(0);for(let i=0;i<d.length;i++){const t=i/sr;d[i]=Math.sin(2*Math.PI*1000*t)*Math.exp(-t*60);}return b;}
export function schedulePlayback(fromSec,windowSec=30){getContext();stopAll();const t0=ctx.currentTime+.05;for(const track of state.tracks){if(!isAudible(track))continue;const ch=ensureChannel(track.id);updateChannel(track);for(const clip of track.clips){if(clip.startSec+clip.lengthSec<=fromSec||clip.startSec>=fromSec+windowSec)continue;scheduleClip(track,clip,ch,fromSec,t0);}}}
function scheduleClip(track,clip,ch,fromSec,t0){
 if(clip.kind==='midi'&&Array.isArray(clip.notes)){
  const clipStart=t0+Math.max(0,clip.startSec-fromSec),clipOffset=Math.max(0,fromSec-clip.startSec);
  for(const note of clip.notes){
   const relative=Number(note.time)||0,duration=Math.max(.04,Number(note.duration)||.2);
   if(relative+duration<=clipOffset)continue;
   const when=clipStart+Math.max(0,relative-clipOffset),remaining=Math.max(.04,duration-Math.max(0,clipOffset-relative));
   const osc=ctx.createOscillator(),gain=ctx.createGain();
   const freq=440*Math.pow(2,((Number(note.pitch)||60)-69)/12);
   osc.type=clip.instrument==='bass'?'square':clip.instrument==='guitar'?'triangle':'sawtooth';
   osc.frequency.setValueAtTime(freq,when);
   const velocity=Math.max(.03,Math.min(1,Number(note.velocity)||.8));
   gain.gain.setValueAtTime(.0001,when);gain.gain.linearRampToValueAtTime(velocity*.22,when+.012);
   gain.gain.setValueAtTime(velocity*.22,when+Math.max(.02,remaining-.025));gain.gain.linearRampToValueAtTime(.0001,when+remaining);
   osc.connect(gain);gain.connect(ch.gain);osc.start(when);osc.stop(when+remaining+.01);
   const entry={source:osc,gain,startTime:when,clipId:clip.id,trackId:track.id};
   osc.onended=()=>{const i=activeSources.indexOf(entry);if(i>=0)activeSources.splice(i,1);try{gain.disconnect();}catch{}};
   activeSources.push(entry);
  }
  return;
 }
 if(clip.kind!=='audio'||!clip.audioBuffer)return;
 const when=t0+Math.max(0,clip.startSec-fromSec),offset=Math.max(0,fromSec-clip.startSec)+(clip.sourceOffsetSec||0),duration=Math.min(clip.lengthSec-Math.max(0,fromSec-clip.startSec),clip.audioBuffer.duration-offset);
 if(duration<=0)return;
 const src=ctx.createBufferSource();src.buffer=clip.audioBuffer;const g=ctx.createGain();src.connect(g);g.connect(ch.gain);src.start(when,offset,duration);
 const entry={source:src,gain:g,startTime:when,clipId:clip.id,trackId:track.id};src.onended=()=>{const i=activeSources.indexOf(entry);if(i>=0)activeSources.splice(i,1);};activeSources.push(entry);
}
export function stopAll(){for(const e of activeSources){try{e.source.stop();}catch{}try{e.gain.disconnect();}catch{}}activeSources=[];}
export async function decodeAudio(arrayBuffer){getContext();return await ctx.decodeAudioData(arrayBuffer.slice(0));}
export function computePeaks(buffer,buckets=200){const data=buffer.getChannelData(0),per=Math.floor(data.length/buckets)||1,peaks=new Float32Array(buckets);for(let i=0;i<buckets;i++){let max=0;for(let j=i*per;j<Math.min((i+1)*per,data.length);j++)max=Math.max(max,Math.abs(data[j]));peaks[i]=max;}return peaks;}
export function nowSec(){getContext();return ctx.currentTime;}

// Lightweight playable instrument voice for computer keys, pads and MIDI input.
export function playInstrumentNote(type,note,velocity=.8){
 getContext();const key=String(note);if(voices.has(key))stopInstrumentNote(note);
 const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(Math.max(.02,Math.min(1,velocity))*.18,ctx.currentTime+.012);
 let source;
 if(type.startsWith('drum')){
  source=ctx.createOscillator();source.type='sine';
  const drumFreq={36:125,38:185,39:240,42:920,46:1250,45:115,47:145,48:175,49:1500,51:1750,37:650,50:205,43:95,52:1300,55:1100,57:1650};
  const base=drumFreq[note]||260;
  source.frequency.setValueAtTime(base,ctx.currentTime);
  source.frequency.exponentialRampToValueAtTime(note===36?42:Math.max(70,base*.35),ctx.currentTime+.18);
  gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.28);
 }else{
  source=ctx.createOscillator();
  source.type=type==='pad'?'triangle':type==='bass'?'square':type==='guitar'?'triangle':'sawtooth';
  source.frequency.value=440*Math.pow(2,(note-69)/12);
 }
 source.connect(gain);gain.connect(master);source.start();if(type.startsWith('drum'))source.stop(ctx.currentTime+.3);
 voices.set(key,{source,gain});
}
export function stopInstrumentNote(note){const v=voices.get(String(note));if(!v)return;try{v.gain.gain.cancelScheduledValues(ctx.currentTime);v.gain.gain.setTargetAtTime(.0001,ctx.currentTime,.045);v.source.stop(ctx.currentTime+.22);}catch{}voices.delete(String(note));}
