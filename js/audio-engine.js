// MUSICTOOL DAW V6 audio graph: isolated channel strips, EQ, dynamics and FX.
import { state, isAudible } from './state.js';
let ctx=null,master=null,metronomeGain=null,clickBuffer=null;
let activeSources=[];
const channels=new Map(),voices=new Map();
export function getContext(){
 if(!ctx){const AC=window.AudioContext||window.webkitAudioContext;ctx=new AC({latencyHint:'interactive'});master=ctx.createGain();master.gain.value=Number.isFinite(state.masterVolume)?state.masterVolume:.9;master.connect(ctx.destination);metronomeGain=ctx.createGain();metronomeGain.gain.value=.5;metronomeGain.connect(master);clickBuffer=makeClickBuffer(ctx);for(const t of state.tracks)ensureChannel(t.id);}
 return ctx;
}
export async function resume(){const c=getContext();if(c.state==='suspended')await c.resume();return c.state;}
export function setMasterVolume(value){state.masterVolume=Math.max(0,Math.min(1.5,Number(value)||0));getContext();master.gain.setTargetAtTime(state.masterVolume,ctx.currentTime,.015);}
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
  let effect=null,effectOutput=null;
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
  }else if(fx.type==='amp-cab'){
   effect=ctx.createWaveShaper();const curve=new Float32Array(2048);
   for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=Math.tanh(x*2.4)*.88;}
   effect.curve=curve;effect.oversample='4x';
   const cab=ctx.createBiquadFilter();cab.type='lowpass';cab.frequency.value=5200;cab.Q.value=.65;
   const lowCut=ctx.createBiquadFilter();lowCut.type='highpass';lowCut.frequency.value=75;lowCut.Q.value=.7;
   effect.connect(cab);cab.connect(lowCut);effectOutput=lowCut;ch.fxNodes.push(cab,lowCut);
  }
  if(effect){
   const dry=ctx.createGain(),wet=ctx.createGain(),sum=ctx.createGain();
   const mix=Math.max(0,Math.min(1,Number(fx.mix??.35)));
   dry.gain.value=1-mix;wet.gain.value=mix;
   node.connect(dry);node.connect(effect);if(!effectOutput)effect.connect(wet);
   dry.connect(sum);wet.connect(sum);node=sum;
   (effectOutput||effect).connect(wet);
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
   const velocity=Math.max(.03,Math.min(1,Number(note.velocity)||.8));
   const voice=makePitchedVoice(clip.instrument||'piano',Number(note.pitch)||60,velocity,when,remaining,ch.gain);
   const entry={sources:voice.sources,gain:voice.gain,startTime:when,clipId:clip.id,trackId:track.id};
   voice.sources[0].onended=()=>{const i=activeSources.indexOf(entry);if(i>=0)activeSources.splice(i,1);try{voice.gain.disconnect();}catch{}};
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
export function stopAll(){for(const e of activeSources){for(const source of (e.sources||[e.source]))try{source.stop();}catch{}try{e.gain.disconnect();}catch{}}activeSources=[];}
export async function decodeAudio(arrayBuffer){getContext();return await ctx.decodeAudioData(arrayBuffer.slice(0));}
export function computePeaks(buffer,buckets=200){const data=buffer.getChannelData(0),per=Math.floor(data.length/buckets)||1,peaks=new Float32Array(buckets);for(let i=0;i<buckets;i++){let max=0;for(let j=i*per;j<Math.min((i+1)*per,data.length);j++)max=Math.max(max,Math.abs(data[j]));peaks[i]=max;}return peaks;}
export function nowSec(){getContext();return ctx.currentTime;}

// Expressive, synthesized instrument voices. These are musical tones, not raw test oscillators.
let noiseBuffer=null;
function getNoiseBuffer(){
 if(noiseBuffer)return noiseBuffer;
 const length=Math.floor(ctx.sampleRate*1.2);noiseBuffer=ctx.createBuffer(1,length,ctx.sampleRate);
 const data=noiseBuffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*.72;
 return noiseBuffer;
}
function releaseVoice(voice,when=ctx.currentTime){
 if(!voice||voice.releasing)return;voice.releasing=true;
 try{voice.gain.gain.cancelScheduledValues(when);voice.gain.gain.setTargetAtTime(.0001,when,.055);}catch{}
 for(const source of voice.sources)try{source.stop(when+.24);}catch{}
}
function makePitchedVoice(type,note,velocity,when,duration,destination){
 const freq=440*Math.pow(2,(note-69)/12),vel=Math.max(.02,Math.min(1,velocity));
 const output=ctx.createGain(),filter=ctx.createBiquadFilter(),sources=[];
 filter.type='lowpass';filter.frequency.setValueAtTime(type==='bass'?1000:type==='guitar'?4200:type==='piano'?9800:5200,when);filter.Q.value=.55;
 filter.connect(output);output.gain.setValueAtTime(.0001,when);output.gain.linearRampToValueAtTime(vel*(type==='bass'?.24:type==='piano'?.3:.22),when+.009);
 let partials=[];
 if(type==='piano'||type==='synth'){
  partials=type==='piano'?[[1,'sine',.78],[2,'sine',.22],[3,'sine',.09],[4,'sine',.035]]:[[1,'sawtooth',.42],[1.003,'triangle',.3],[2,'sine',.08]];
 }else if(type==='guitar'){partials=[[1,'triangle',.8],[2.01,'sine',.16],[3.02,'sine',.045]];}
 else if(type==='bass'){partials=[[1,'sine',.82],[1,'triangle',.28],[2,'sine',.06]];}
 else if(type==='pad'){partials=[[1,'triangle',.6],[1.006,'sine',.35],[2,'sine',.08]];}
 else{partials=[[1,'triangle',.7],[2,'sine',.12]];}
 for(const [ratio,wave,level] of partials){
  const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=wave;osc.frequency.setValueAtTime(freq*ratio,when);gain.gain.value=level;osc.connect(gain);gain.connect(filter);osc.start(when);sources.push(osc);
 }
 if(type==='piano'){output.gain.exponentialRampToValueAtTime(Math.max(.0002,vel*.095),when+.24);}
 if(type==='guitar'){
  output.gain.exponentialRampToValueAtTime(Math.max(.0002,vel*.035),when+.55);
  const click=ctx.createBufferSource(),clickFilter=ctx.createBiquadFilter(),clickGain=ctx.createGain();click.buffer=getNoiseBuffer();clickFilter.type='bandpass';clickFilter.frequency.value=2400;clickFilter.Q.value=.8;clickGain.gain.setValueAtTime(.0001,when);clickGain.gain.linearRampToValueAtTime(vel*.045,when+.002);clickGain.gain.exponentialRampToValueAtTime(.0001,when+.028);click.connect(clickFilter);clickFilter.connect(clickGain);clickGain.connect(output);click.start(when);click.stop(when+.035);sources.push(click);
 }
 if(type==='bass')output.gain.exponentialRampToValueAtTime(Math.max(.0002,vel*.16),when+.18);
 output.connect(destination);
 const voice={sources,gain:output,filter,releasing:false};
 if(Number.isFinite(duration)&&duration>0)releaseVoice(voice,when+duration);
 return voice;
}
function makeDrumVoice(note,velocity,when,destination){
 const vel=Math.max(.05,Math.min(1,velocity)),out=ctx.createGain(),sources=[];
 out.gain.setValueAtTime(.0001,when);out.connect(destination);
 const noise=(kind,cutoff,decay,level)=>{
  const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain();
  src.buffer=getNoiseBuffer();filter.type=kind;filter.frequency.value=cutoff;filter.Q.value=.7;
  g.gain.setValueAtTime(.0001,when);g.gain.linearRampToValueAtTime(vel*level,when+.003);g.gain.exponentialRampToValueAtTime(.0001,when+decay);
  src.connect(filter);filter.connect(g);g.connect(out);src.start(when);src.stop(when+decay+.02);sources.push(src);
 };
 const tone=(startFreq,endFreq,decay,level,wave='sine')=>{
  const osc=ctx.createOscillator();osc.type=wave;osc.frequency.setValueAtTime(startFreq,when);osc.frequency.exponentialRampToValueAtTime(Math.max(25,endFreq),when+Math.min(.22,decay*.55));
  const g=ctx.createGain();g.gain.setValueAtTime(.0001,when);g.gain.linearRampToValueAtTime(vel*level,when+.004);g.gain.exponentialRampToValueAtTime(.0001,when+decay);
  osc.connect(g);g.connect(out);osc.start(when);osc.stop(when+decay+.02);sources.push(osc);
 };
 let decay=.25;
 if(note===36){decay=.42;tone(155,43,decay,.95);}
 else if(note===38||note===40){decay=.22;noise('highpass',1500,decay,.72);tone(note===40?210:175,100,.13,.22);}
 else if(note===39){decay=.2;noise('bandpass',1250,decay,.68);noise('highpass',4200,.11,.24);}
 else if(note===42||note===44){decay=.09;noise('highpass',7600,decay,.38);}
 else if(note===46){decay=.42;noise('highpass',6800,decay,.42);}
 else if(note===49||note===52||note===55||note===57){decay=note===49||note===52?1.15:.7;noise('highpass',note===52?4200:5600,decay,.48);}
 else if(note===51||note===53||note===54||note===56){decay=.72;noise('highpass',5200,decay,.34);}
 else{const base=note===45?112:note===47?145:note===48?175:note===43?82:135;decay=.3;tone(base,base*.58,decay,.7);}
 out.gain.setValueAtTime(1,when);out.gain.setTargetAtTime(.0001,when+decay,.025);
 const voice={sources,gain:out,releasing:false};return voice;
}
export function playInstrumentNote(type,note,velocity=.8){
 getContext();const key=String(note);if(voices.has(key))stopInstrumentNote(note);
 const voice=(type==='drum'||type==='drums')?makeDrumVoice(note,velocity,ctx.currentTime,master):makePitchedVoice(type,note,velocity,ctx.currentTime,null,master);
 voices.set(key,voice);
 if(type==='drum'||type==='drums'){
  const end=note===36?.48:note===49||note===52?1.2:note===46?.46:note===51?.75:.34;
  setTimeout(()=>{if(voices.get(key)===voice)voices.delete(key);},end*1000);
 }else{
  voice.sources[0].onended=()=>{if(voices.get(key)===voice)voices.delete(key);try{voice.gain.disconnect();}catch{}};
 }
}
export function stopInstrumentNote(note){
 const voice=voices.get(String(note));if(!voice)return;
 releaseVoice(voice,ctx.currentTime);voices.delete(String(note));
}
