// MUSICTOOL DAW V6 audio graph: isolated channel strips, EQ, dynamics and FX.
import { state, isAudible } from './state.js';
let ctx=null,master=null,metronomeGain=null,clickBuffer=null;
let activeSources=[];
const channels=new Map();
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
export async function schedulePlayback(fromSec,windowSec=30,isCurrent=()=>true){
 getContext();stopAll();
 const audible=state.tracks.filter(track=>isAudible(track));
 // Decode all MIDI voices before scheduling so notes stay locked to the transport clock.
 const loads=[];
 for(const track of audible)for(const clip of track.clips||[]){
  if(clip.kind==='midi'&&Array.isArray(clip.notes)){
   const type=clip.instrument||'piano';
   for(const note of clip.notes)loads.push(loadInstrumentVoice(type,Number(note.pitch)||60,Number(note.velocity)||.8));
  }
 }
 await Promise.allSettled(loads);
 if(!isCurrent())return;
 const t0=ctx.currentTime+.06;
 for(const track of audible){
  const ch=ensureChannel(track.id);updateChannel(track);
  for(const clip of track.clips||[]){
   if(clip.startSec+clip.lengthSec<=fromSec||clip.startSec>=fromSec+windowSec)continue;
   scheduleClip(track,clip,ch,fromSec,t0);
  }
 }
}
function scheduleClip(track,clip,ch,fromSec,t0){
 if(clip.kind==='midi'&&Array.isArray(clip.notes)){
  const clipStart=t0+Math.max(0,clip.startSec-fromSec),clipOffset=Math.max(0,fromSec-clip.startSec);
  for(const note of clip.notes){
   const relative=Number(note.time)||0,duration=Math.max(.04,Number(note.duration)||.2);
   if(relative+duration<=clipOffset)continue;
   const when=clipStart+Math.max(0,relative-clipOffset),remaining=Math.max(.04,duration-Math.max(0,clipOffset-relative));
   const type=clip.instrument||'piano',velocity=Math.max(.03,Math.min(1,Number(note.velocity)||.8)),voice=getCachedInstrumentVoice(type,Number(note.pitch)||60,velocity);
   if(!voice)continue;
   const source=ctx.createBufferSource(),gain=ctx.createGain();
   source.buffer=voice.buffer;source.playbackRate.value=voice.rate;
   const noteEnd=when+Math.max(.16,remaining);
   gain.gain.setValueAtTime(.0001,when);gain.gain.linearRampToValueAtTime(velocity*.72,when+.012);
   gain.gain.setValueAtTime(velocity*.72,Math.max(when+.025,noteEnd-.045));gain.gain.linearRampToValueAtTime(.0001,noteEnd);
   source.connect(gain);gain.connect(ch.gain);source.start(when);source.stop(noteEnd+.02);
   const entry={source,gain,startTime:when,clipId:clip.id,trackId:track.id};
   source.onended=()=>{const i=activeSources.indexOf(entry);if(i>=0)activeSources.splice(i,1);try{gain.disconnect();}catch{}};
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

// MUSICTOOL sampled instrument engine — CC0 recordings, cached for offline use.
const instrumentBuffers=new Map(),instrumentLoads=new Map(),voices=new Map(),pendingVoices=new Map();
let samplePreloadPromise=null;
const SAMPLE_CACHE='musicttool-instrument-bank-v72';
const META='https://raw.githubusercontent.com/facebookincubator/Meta-open-sound/main/systems/instruments/';
const BASS='https://raw.githubusercontent.com/sfzinstruments/karoryfer.big-little-bass/main/Samples/';
const DRUM='https://raw.githubusercontent.com/august-byrne/phazite-sounds/main/pack/Drums/';
const sample=(base,path)=>base+path;
const pianoNotes=['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
function sampleNoteName(note){return pianoNotes[((note%12)+12)%12]+(Math.floor(note/12)-1);}
function pianoUrl(note,layer=3){return sample(META,'meta-piano/ogg/INSPiano_Vel0'+layer+'_'+sampleNoteName(note)+'_01.ogg');}
const pianoMap=Array.from({length:88},(_,i)=>{const note=21+i;return [note,pianoUrl(note,3)];});
const acousticZones=[
 {root:40,max:60,id:'StringLowE'},{root:45,max:65,id:'StringA'},
 {root:50,max:70,id:'StringD'},{root:55,max:75,id:'StringG'},
 {root:59,max:79,id:'StringB'},{root:64,max:84,id:'StringHighE'}
];
function acousticUrl(note,layer=3){
 const n=Math.max(40,Math.min(84,Math.round(note)));
 const zones=acousticZones.filter(z=>n>=z.root&&n<=z.max);
 const zone=zones.sort((a,b)=>Math.abs(n-a.root)-Math.abs(n-b.root))[0]||acousticZones.reduce((best,z)=>Math.abs(n-z.root)<Math.abs(n-best.root)?z:best,acousticZones[0]);
 return {rootNote:n,url:sample(META,'meta-steel-guitar/ogg/INSGuitarSteel_'+zone.id+'_Vel0'+layer+'_'+sampleNoteName(n)+'_01.ogg')};
}
const acousticMap=[40,45,50,55,60,64,67,72,79].map(note=>[note,acousticUrl(note,3).url]);
const electricZones=[
 {low:35,high:38,root:36,file:'C2_s1_01.flac'},
 {low:39,high:42,root:41,file:'F2_s1_01.flac'},
 {low:43,high:46,root:45,file:'A2_s2_01.flac'},
 {low:47,high:49,root:48,file:'C3_s2_02.flac'},
 {low:50,high:53,root:52,file:'E3_s3_01.flac'},
 {low:54,high:56,root:55,file:'G3_s4_01.flac'},
 {low:57,high:61,root:59,file:'B3_s5_01.flac'},
 {low:62,high:65,root:64,file:'E4_s6_01.flac'},
 {low:66,high:69,root:67,file:'G4_s6_01.flac'},
 {low:70,high:72,root:71,file:'B4_s6_01.flac'},
 {low:73,high:76,root:74,file:'D5_s6_01.flac'},
 {low:77,high:82,root:80,file:'G%235_s6_03.flac'},
 {low:83,high:86,root:85,file:'C%236_s6_01.flac'}
];
const ELECTRIC='https://raw.githubusercontent.com/freepats/electric-guitar-FSBS-clean/main/samples/bridge/small/';
function electricUrl(note){
 const n=Math.max(35,Math.min(86,Math.round(note)));
 const zone=electricZones.find(z=>n>=z.low&&n<=z.high)||electricZones.reduce((best,z)=>Math.abs(n-z.root)<Math.abs(n-best.root)?z:best,electricZones[0]);
 return {rootNote:zone.root,url:sample(ELECTRIC,zone.file),oneShot:false};
}
const guitarMap=electricZones.map(z=>[z.root,sample(ELECTRIC,z.file)]);
const bassRoots=[
 [35,'b1'],[36,'c2'],[38,'d2'],[40,'e2'],[41,'f2'],[43,'g2'],[45,'a2'],[47,'b2'],
 [48,'c3'],[50,'d3'],[52,'e3'],[53,'f3'],[55,'g3'],[57,'a3'],[59,'b3'],[60,'c4'],
 [62,'d4'],[64,'e4'],[65,'f4'],[67,'g4'],[69,'a4'],[71,'b4'],[72,'c5']
];
const bassMap=bassRoots.map(([note,name])=>[note,sample(BASS,'big_little_pluck_'+name+'_f_rr1.wav')]);
const drumSamples={
 kick:sample(DRUM,'Kicks/Kick%20Acoustic.flac'),
 kickBig:sample(DRUM,'Kicks/Kick%20Acoustic%20Big.flac'),
 rim:sample(DRUM,'Snares/Rim%20Side%20Stick.flac'),
 snare:sample(DRUM,'Snares/Snare%20Acoustic.flac'),
 snareRim:sample(DRUM,'Snares/Snare%20Rimshot.flac'),
 snareTight:sample(DRUM,'Snares/Snare%20Tight.flac'),
 hat:sample(DRUM,'Hats/Hat%20Closed%20Acoustic.flac'),
 hatOpen:sample(DRUM,'Hats/Hat%20Open%20Acoustic.flac'),
 hatPedal:sample(DRUM,'Hats/Hat%20Pedal.flac'),
 clap:sample(DRUM,'Claps/Clap%20Studio.flac'),
 tomFloor:sample(DRUM,'Toms/Tom%20Floor.flac'),
 tomLow:sample(DRUM,'Toms/Tom%20Low.flac'),
 tomHigh:sample(DRUM,'Toms/Tom%20High.flac'),
 crash:sample(DRUM,'Cymbals/Crash.flac'),
 ride:sample(DRUM,'Cymbals/Ride.flac'),
 rideBell:sample(DRUM,'Cymbals/Ride%20Bell.flac'),
 tambourine:sample(DRUM,'Percussion/Tambourine.flac'),
};
const drumMap={
 35:'kick',36:'kickBig',37:'rim',38:'snare',39:'clap',40:'snareRim',41:'tomFloor',
 42:'hat',43:'kick',44:'hatPedal',45:'tomFloor',46:'hatOpen',47:'tomLow',48:'tomHigh',
 49:'crash',50:'tomHigh',51:'ride',52:'crash',53:'rideBell',54:'tambourine',55:'rideBell',
 56:'rideBell',57:'crash'
};
const padOrder=['kickBig','snare','clap','hat','hatOpen','tomFloor','tomLow','tomHigh','crash','ride','rim','kick','snareRim','snareTight','hatPedal','rideBell'];
function nearestMap(map,note){
 let best=map[0];for(const entry of map)if(Math.abs(entry[0]-note)<Math.abs(best[0]-note))best=entry;
 return {rootNote:best[0],url:best[1]};
}
function resolveSample(type,note,velocity=.8){
 const n=Math.round(Number(note)||60);
 if(type==='piano'){
  // Four recorded piano velocity layers; stronger playing selects a brighter, harder-hit recording.
  const layer=velocity<.28?1:velocity<.52?2:velocity<.78?3:4;
  return {rootNote:n,url:pianoUrl(Math.max(21,Math.min(108,n)),layer),oneShot:false};
 }
 if(type==='guitar')return electricUrl(n);
 if(type==='acoustic'){
  const layer=velocity<.34?1:velocity<.68?2:3;
  return {...acousticUrl(n,layer),oneShot:false};
 }
 if(type==='bass')return {...nearestMap(bassMap,n),oneShot:false};
 if(type==='drum'){const name=drumSamples[drumMap[n]||'snare'];return {rootNote:n,url:name,oneShot:true};}
 if(type==='pad'){const name=drumSamples[padOrder[(n-48+16)%16]];return {rootNote:n,url:name,oneShot:true};}
 return null;
}
async function getCachedResponse(url){
 let cache=null;try{if('caches'in window)cache=await caches.open(SAMPLE_CACHE);}catch{}
 let response=cache?await cache.match(url):null;
 if(!response){
  response=await fetch(url,{mode:'cors'});
  if(!response.ok)throw new Error('Sample download failed: '+response.status);
  if(cache)try{await cache.put(url,response.clone());}catch{}
 }
 return response;
}
async function loadInstrumentVoice(type,note,velocity=.8){
 if(type==='synth')return {buffer:makeSynthBuffer(note),rootNote:Number(note),rate:1,oneShot:false};
 const def=resolveSample(type,Number(note),velocity);if(!def?.url)throw new Error('No sample mapped for '+type);
 if(instrumentBuffers.has(def.url))return {...def,buffer:instrumentBuffers.get(def.url),rate:Math.pow(2,(Number(note)-def.rootNote)/12)};
 if(instrumentLoads.has(def.url)){
  const buffer=await instrumentLoads.get(def.url);return {...def,buffer,rate:Math.pow(2,(Number(note)-def.rootNote)/12)};
 }
 const task=(async()=>{
  const response=await getCachedResponse(def.url),bytes=await response.arrayBuffer();
  const buffer=await getContext().decodeAudioData(bytes.slice(0));instrumentBuffers.set(def.url,buffer);return buffer;
 })();
 instrumentLoads.set(def.url,task);
 try{const buffer=await task;return {...def,buffer,rate:Math.pow(2,(Number(note)-def.rootNote)/12)};}
 finally{instrumentLoads.delete(def.url);}
}
function getCachedInstrumentVoice(type,note,velocity=.8){
 if(type==='synth')return {buffer:makeSynthBuffer(note),rate:1,oneShot:false};
 const def=resolveSample(type,Number(note),velocity);if(!def||!instrumentBuffers.has(def.url))return null;
 return {...def,buffer:instrumentBuffers.get(def.url),rate:Math.pow(2,(Number(note)-def.rootNote)/12)};
}
function makeSynthBuffer(note){
 const key='synth:'+note;if(instrumentBuffers.has(key))return instrumentBuffers.get(key);
 const frequency=440*Math.pow(2,(Number(note)-69)/12),sr=ctx.sampleRate,length=Math.floor(sr*1.8);
 const buffer=ctx.createBuffer(1,length,sr),data=buffer.getChannelData(0);
 for(let i=0;i<length;i++){const t=i/sr,env=Math.min(1,t*9)*Math.exp(-t*1.65);data[i]=(Math.sin(2*Math.PI*frequency*t)+.24*Math.sin(4*Math.PI*frequency*t)+.1*Math.sin(6*Math.PI*frequency*t))*env*.24;}
 instrumentBuffers.set(key,buffer);return buffer;
}
export function preloadInstrumentSamples(){
 if(samplePreloadPromise)return samplePreloadPromise;
 samplePreloadPromise=(async()=>{
  const urls=[...pianoMap,...guitarMap,...acousticMap,...bassMap].map(x=>x[1]).concat(Object.values(drumSamples));
  const unique=[...new Set(urls)];
  let cache=null;try{if('caches'in window)cache=await caches.open(SAMPLE_CACHE);}catch{}
  const results=[];
  for(let i=0;i<unique.length;i+=6){
   const batch=await Promise.allSettled(unique.slice(i,i+6).map(async url=>{
    if(cache&&await cache.match(url))return true;
    const response=await fetch(url,{mode:'cors'});if(!response.ok)throw new Error('HTTP '+response.status);
    if(cache)try{await cache.put(url,response.clone());}catch{}
    return true;
   }));
   results.push(...batch);
  }
  const ready=results.filter(x=>x.status==='fulfilled').length;
  console.info('MUSICTOOL CC0 sample bank:',ready+'/'+unique.length,'files ready for playback');
  return {ready,total:unique.length};
 })().catch(error=>{samplePreloadPromise=null;console.warn('Sample bank preload failed:',error);return {ready:0,total:0,error};});
 return samplePreloadPromise;
}
export function playInstrumentNote(type,note,velocity=.8){
 getContext();
 // Capture the destination at note-on: changing the selected track while a sample
 // is loading must not silently route that note into a different channel.
 const selected=state.tracks.find(track=>track.id===state.selectedTrackId);
 const trackId=selected?.id||null;
 const key=[type,trackId??'master',Number(note)].join(':');
 stopInstrumentNote(note,type,trackId);
 const request={released:false};pendingVoices.set(key,request);
 loadInstrumentVoice(type,Number(note),velocity).then(voice=>{
  if(pendingVoices.get(key)!==request)return;
  pendingVoices.delete(key);
  const source=ctx.createBufferSource();source.buffer=voice.buffer;source.playbackRate.value=voice.rate;
  const gain=ctx.createGain(),now=ctx.currentTime,level=Math.max(.02,Math.min(1,velocity));
  gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(level*.76,now+.012);
  source.connect(gain);
  // Each live voice belongs to one channel strip. Equal pitches on different
  // tracks/types remain independent instead of replacing each other in a global note map.
  const destination=selected?ensureChannel(selected.id).gain:master;
  gain.connect(destination);
  const entry={source,gain,oneShot:voice.oneShot,trackId,type,note:Number(note)};
  voices.set(key,entry);
  source.onended=()=>{if(voices.get(key)===entry)voices.delete(key);try{gain.disconnect();}catch{}};
  source.start(now);
  if(request.released&&!voice.oneShot){gain.gain.setTargetAtTime(.0001,now+.01,.035);try{source.stop(now+.19);}catch{}}
 }).catch(err=>{if(pendingVoices.get(key)===request)pendingVoices.delete(key);console.warn('Instrument sample unavailable:',type,note,err);});
}
export function stopInstrumentNote(note,type=null,trackId=null){
 const pitch=Number(note);
 // Older UI callers only supply the pitch. Stop every matching sustained voice;
 // newer callers may narrow this to an instrument and/or channel.
 for(const [key,pending] of pendingVoices){
  const [voiceType,voiceTrack,voicePitch]=key.split(':');
  if(Number(voicePitch)!==pitch||(type&&voiceType!==type)||(trackId&&voiceTrack!==trackId))continue;
  pending.released=true;
 }
 for(const [key,voice] of voices){
  if(voice.note!==pitch||(type&&voice.type!==type)||(trackId&&voice.trackId!==trackId)||voice.oneShot)continue;
  try{voice.gain.gain.cancelScheduledValues(ctx.currentTime);voice.gain.gain.setTargetAtTime(.0001,ctx.currentTime,.035);voice.source.stop(ctx.currentTime+.18);}catch{}
  voices.delete(key);
 }
}
