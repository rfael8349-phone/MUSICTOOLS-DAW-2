// MUSICTOOL V7.1 — tuner, metronome and music study tools.
import { state } from './state.js';
import { getContext, resume, playClick, playInstrumentNote, stopInstrumentNote } from './audio-engine.js';
import { setTempo, setTimeSig, toast } from './transport.js';

const $ = id => document.getElementById(id);
const noteNames = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const tunings = {
  guitar:[['E2',40],['A2',45],['D3',50],['G3',55],['B3',59],['E4',64]],
  dropd:[['D2',38],['A2',45],['D3',50],['G3',55],['B3',59],['E4',64]],
  bass:[['E1',28],['A1',33],['D2',38],['G2',43]],
  ukulele:[['G4',67],['C4',60],['E4',64],['A4',69]]
};
const scales = {
  major:{label:'Mayor',steps:[0,2,4,5,7,9,11]},
  minor:{label:'Menor natural',steps:[0,2,3,5,7,8,10]},
  pentMajor:{label:'Pentatónica mayor',steps:[0,2,4,7,9]},
  pentMinor:{label:'Pentatónica menor',steps:[0,3,5,7,10]},
  blues:{label:'Blues',steps:[0,3,5,6,7,10]},
  dorian:{label:'Dórica',steps:[0,2,3,5,7,9,10]},
  mixolydian:{label:'Mixolidia',steps:[0,2,4,5,7,9,10]}
};
const chordTypes = {
  major:{label:'Mayor',steps:[0,4,7]},minor:{label:'Menor',steps:[0,3,7]},
  dim:{label:'Disminuido',steps:[0,3,6]},aug:{label:'Aumentado',steps:[0,4,8]},
  sus2:{label:'Suspendido 2',steps:[0,2,7]},sus4:{label:'Suspendido 4',steps:[0,5,7]},
  dom7:{label:'Séptima dominante',steps:[0,4,7,10]},maj7:{label:'Séptima mayor',steps:[0,4,7,11]},
  min7:{label:'Séptima menor',steps:[0,3,7,10]}
};
let tunerStream=null,tunerContext=null,tunerAnalyser=null,tunerTimer=null,tunerData=null;
let tunerA4=440,tunerMode='guitar',tunerLast=0,metroTimer=null,metroNext=0,metroBeat=0;
let studyRoot=0,studyScale='major',studyChord='major',studyTab='scales',studyProgression='pop';

function el(tag,cls='',txt=''){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined&&txt!=='')n.textContent=txt;return n;}
function noteName(midi){return noteNames[((midi%12)+12)%12]+' '+(Math.floor(midi/12)-1);}
function frequency(midi,a4=tunerA4){return a4*Math.pow(2,(midi-69)/12);}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

function detectPitch(buffer,sampleRate){
 let energy=0;for(let i=0;i<buffer.length;i++)energy+=buffer[i]*buffer[i];
 const rms=Math.sqrt(energy/buffer.length);if(rms<.012)return null;
 const minTau=Math.max(2,Math.floor(sampleRate/1100)),maxTau=Math.min(Math.floor(sampleRate/35),Math.floor(buffer.length/2));
 const diff=new Float32Array(maxTau+1),cmnd=new Float32Array(maxTau+1);let running=0;
 for(let tau=1;tau<=maxTau;tau++){
  let sum=0;for(let i=0;i<buffer.length-maxTau;i+=3){const d=buffer[i]-buffer[i+tau];sum+=d*d;}
  diff[tau]=sum;running+=sum;cmnd[tau]=running?sum*tau/running:1;
 }
 let chosen=-1;for(let tau=minTau;tau<maxTau;tau++){if(cmnd[tau]<.16){while(tau+1<=maxTau&&cmnd[tau+1]<cmnd[tau])tau++;chosen=tau;break;}}
 if(chosen<0){let best=.28;for(let tau=minTau;tau<=maxTau;tau++){if(cmnd[tau]<best){best=cmnd[tau];chosen=tau;}}}
 if(chosen<0||cmnd[chosen]>.32)return null;
 const a=cmnd[Math.max(minTau,chosen-1)],b=cmnd[chosen],c=cmnd[Math.min(maxTau,chosen+1)];
 const denom=2*(2*b-a-c),shift=denom?(a-c)/denom:0;
 const period=chosen+Math.max(-.5,Math.min(.5,shift));
 return period>0?sampleRate/period:null;
}
function closestString(midi){
 const tuning=tunings[tunerMode];if(!tuning)return null;
 let best=null;for(const item of tuning){const distance=Math.abs(item[1]-midi);if(!best||distance<best.distance)best={name:item[0],midi:item[1],distance};}
 return best&&best.distance<=2?best:null;
}
function renderTuner(host){
 stopTuner();
 host.replaceChildren();
 const card=el('section','tool-card tuner-card');
 card.append(el('h3','tool-card-title','AFINADOR CROMÁTICO'));
 card.append(el('p','tool-muted','Escucha el instrumento por el micrófono y muestra nota, frecuencia y desviación en cents.'));
 const controls=el('div','tool-controls');
 const mode=el('select','tool-select');[['guitar','Guitarra · estándar EADGBE'],['dropd','Guitarra · Drop D'],['bass','Bajo · estándar EADG'],['ukulele','Ukelele · GCEA'],['chromatic','Cromático libre']].forEach(([v,l])=>{const o=el('option','',l);o.value=v;mode.append(o);});mode.value=tunerMode;
 mode.onchange=()=>{tunerMode=mode.value;};
 const refWrap=el('label','tool-inline-label','LA 4');const ref=el('input','tool-number');ref.type='number';ref.min='400';ref.max='480';ref.step='1';ref.value=tunerA4;refWrap.append(ref,el('span','tool-muted','Hz'));ref.onchange=()=>{tunerA4=Math.max(400,Math.min(480,Number(ref.value)||440));ref.value=tunerA4;};
 controls.append(mode,refWrap);card.append(controls);
 const display=el('div','tuner-display');
 const note=el('div','tuner-note','—'),hz=el('div','tuner-hz','— Hz'),string=el('div','tuner-string','Toca una cuerda para comenzar');
 const meter=el('div','tuner-meter');const left=el('span','','♭');const center=el('span','','0');const right=el('span','','♯');const needle=el('i','tuner-needle');meter.append(left,center,right,needle);
 const cents=el('div','tuner-cents','0 cents');display.append(note,hz,string,meter,cents);card.append(display);
 const start=el('button','btn accent tool-action','ACTIVAR MICRÓFONO');const status=el('p','tool-status','El audio se procesa localmente y no se envía a ningún servidor.');
 start.onclick=async()=>{
  if(tunerStream){stopTuner();start.textContent='ACTIVAR MICRÓFONO';status.textContent='Afinador detenido.';return;}
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('El navegador no permite acceder al micrófono.');
   tunerStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
   const AC=window.AudioContext||window.webkitAudioContext;tunerContext=new AC();await tunerContext.resume();
   const source=tunerContext.createMediaStreamSource(tunerStream);tunerAnalyser=tunerContext.createAnalyser();tunerAnalyser.fftSize=8192;tunerAnalyser.smoothingTimeConstant=0;source.connect(tunerAnalyser);tunerData=new Float32Array(tunerAnalyser.fftSize);
   start.textContent='DETENER AFINADOR';status.textContent='Micrófono activo · toca una sola cuerda y deja que la nota se estabilice.';
   tunerTimer=setInterval(()=>{
    if(!tunerAnalyser||!tunerContext)return;tunerAnalyser.getFloatTimeDomainData(tunerData);
    const hzValue=detectPitch(tunerData,tunerContext.sampleRate);if(!hzValue||hzValue<30||hzValue>1400){if(!tunerLast){note.textContent='—';hz.textContent='— Hz';}return;}
    tunerLast=tunerLast?(.72*tunerLast+.28*hzValue):hzValue;
    const midi=Math.round(69+12*Math.log2(tunerLast/tunerA4)),target=frequency(midi),cent=1200*Math.log2(tunerLast/target),nearest=closestString(midi);
    note.textContent=noteName(midi);hz.textContent=tunerLast.toFixed(1)+' Hz';cents.textContent=(cent>0?'+':'')+cent.toFixed(1)+' cents';
    string.textContent=nearest?'Cuerda '+nearest.name+' · objetivo '+noteName(nearest.midi):'Afinación cromática';
    needle.style.left='calc(50% + '+(Math.max(-50,Math.min(50,cent))*.72)+'%)';needle.classList.toggle('in-tune',Math.abs(cent)<5);
   },90);
  }catch(err){stopTuner();status.textContent=err.message||'No se pudo activar el micrófono.';toast('No se pudo iniciar el afinador');}
 };
 card.append(start,status);host.append(card);
}
function stopTuner(){
 if(tunerTimer){clearInterval(tunerTimer);tunerTimer=null;}
 if(tunerStream){tunerStream.getTracks().forEach(t=>t.stop());tunerStream=null;}
 if(tunerContext){tunerContext.close().catch(()=>{});tunerContext=null;}
 tunerAnalyser=null;tunerData=null;tunerLast=0;
}

function renderMetronome(host){
 stopMetro();host.replaceChildren();
 const card=el('section','tool-card metro-card');card.append(el('h3','tool-card-title','METRÓNOMO'));
 card.append(el('p','tool-muted','Tempo sincronizado con el transporte principal del DAW.'));
 const bpmLabel=el('label','tool-field','TEMPO');const bpm=el('input','tool-number');bpm.type='number';bpm.min='30';bpm.max='300';bpm.value=state.bpm;bpmLabel.append(bpm);
 const slider=el('input','tool-range');slider.type='range';slider.min='30';slider.max='300';slider.value=state.bpm;
 bpm.onchange=()=>{setTempo(Number(bpm.value)||120);bpm.value=state.bpm;slider.value=state.bpm;};
 slider.oninput=()=>{setTempo(Number(slider.value));bpm.value=state.bpm;};
 const sigLabel=el('label','tool-field','COMPÁS');const sig=el('select','tool-select');[['2/4',2,4],['3/4',3,4],['4/4',4,4],['6/8',6,8],['7/8',7,8]].forEach(([v,n,d])=>{const o=el('option','',v);o.value=v;sig.append(o);});sig.value=state.timeSig.join('/');
 sig.onchange=()=>{const [n,d]=sig.value.split('/').map(Number);setTimeSig(n,d);};
 const pulse=el('div','metro-pulse');for(let i=0;i<7;i++){const p=el('i');pulse.append(p);}
 const actions=el('div','tool-actions');const toggle=el('button','btn accent','▶ INICIAR');const count=el('button','btn','1 COMPÁS DE CUENTA');const stop=el('button','btn','DETENER');
 toggle.onclick=async()=>{if(metroTimer){stopMetro();toggle.textContent='▶ INICIAR';return;}await startMetro(pulse);toggle.textContent='Ⅱ PAUSAR';};
 stop.onclick=()=>{stopMetro();toggle.textContent='▶ INICIAR';};
 count.onclick=async()=>{await resume();const ctx=getContext(),beats=state.timeSig[0],dur=60/state.bpm,first=ctx.currentTime+.06;for(let i=0;i<beats;i++)playClick(first+i*dur,i===0);toast('Cuenta previa · '+beats+' pulsos');};
 actions.append(toggle,count,stop);card.append(bpmLabel,slider,sigLabel,sig,pulse,actions);host.append(card);
}
async function startMetro(pulse){
 await resume();const ctx=getContext();metroBeat=0;metroNext=ctx.currentTime+.05;
 const lights=[...pulse.children];
 metroTimer=setInterval(()=>{
  const now=getContext().currentTime;
  while(metroNext<now+.12){
   const beats=state.timeSig[0]||4;playClick(metroNext,metroBeat%beats===0);
   const active=metroBeat%Math.min(beats,lights.length);lights.forEach((x,i)=>x.classList.toggle('active',i===active));
   metroBeat++;metroNext+=60/state.bpm;
  }
 },25);
}
function stopMetro(){if(metroTimer){clearInterval(metroTimer);metroTimer=null;}}

function renderStudy(host){
 host.replaceChildren();
 const card=el('section','tool-card study-card');card.append(el('h3','tool-card-title','ESTUDIO MUSICAL'));
 const tabs=el('div','tool-tabs');[['scales','ESCALAS'],['chords','ACORDES'],['progressions','PROGRESIONES']].forEach(([v,l])=>{const b=el('button','tool-tab'+(studyTab===v?' active':''),l);b.onclick=()=>{studyTab=v;renderStudy(host);};tabs.append(b);});card.append(tabs);
 const controls=el('div','tool-controls');const root=el('select','tool-select');noteNames.forEach((n,i)=>{const o=el('option','',n);o.value=i;root.append(o);});root.value=studyRoot;root.onchange=()=>{studyRoot=Number(root.value);renderStudy(host);};
 controls.append(el('span','tool-muted','TONALIDAD'),root);
 if(studyTab==='scales'){
  const scale=el('select','tool-select');Object.entries(scales).forEach(([v,s])=>{const o=el('option','',s.label);o.value=v;scale.append(o);});scale.value=studyScale;scale.onchange=()=>{studyScale=scale.value;renderStudy(host);};controls.append(el('span','tool-muted','ESCALA'),scale);
  card.append(controls);const notes=el('div','study-notes');scales[studyScale].steps.forEach((step,i)=>{const n=(studyRoot+step)%12;const chip=el('button','study-note-chip',noteNames[n]);chip.append(el('small','',String(i+1)));chip.onclick=()=>playOne(60+n);notes.append(chip);});card.append(notes);
  const play=el('button','btn accent tool-action','▶ ESCUCHAR ESCALA');play.onclick=()=>playScale(scales[studyScale].steps,studyRoot);card.append(play);
  card.append(buildFretboard(scales[studyScale].steps,studyRoot));
 }else if(studyTab==='chords'){
  const type=el('select','tool-select');Object.entries(chordTypes).forEach(([v,c])=>{const o=el('option','',c.label);o.value=v;type.append(o);});type.value=studyChord;type.onchange=()=>{studyChord=type.value;renderStudy(host);};controls.append(el('span','tool-muted','TIPO'),type);card.append(controls);
  const chord=chordTypes[studyChord],notes=chord.steps.map(x=>(studyRoot+x)%12);
  card.append(el('p','tool-muted',noteNames[studyRoot]+' '+chord.label+' · '+notes.map(n=>noteNames[n]).join(' – ')));
  const row=el('div','study-notes');notes.forEach(n=>{const chip=el('button','study-note-chip',noteNames[n]);chip.onclick=()=>playOne(60+n);row.append(chip);});card.append(row);
  const play=el('button','btn accent tool-action','▶ ESCUCHAR ACORDE');play.onclick=()=>playChord(notes);card.append(play);
  card.append(buildFretboard(chord.steps,studyRoot));
 }else{
  card.append(controls);const options={
   pop:{label:'Pop · I – V – vi – IV',degrees:[0,7,9,5],types:['major','major','minor','minor']},
   rock:{label:'Rock · I – IV – V',degrees:[0,5,7],types:['major','major','major']},
   minor:{label:'Menor · i – VI – III – VII',degrees:[0,8,3,10],types:['minor','major','major','major']},
   blues:{label:'Blues · I – IV – I – V',degrees:[0,5,0,7],types:['dom7','dom7','dom7','dom7']}
  };
  const prog=el('select','tool-select');Object.entries(options).forEach(([v,p])=>{const o=el('option','',p.label);o.value=v;prog.append(o);});prog.value=studyProgression;prog.onchange=()=>{studyProgression=prog.value;renderStudy(host);};card.append(prog);
  const p=options[studyProgression],row=el('div','progression-row');p.degrees.forEach((d,i)=>{const rootNote=(studyRoot+d)%12,typ=chordTypes[p.types[i]],b=el('button','progression-chord',noteNames[rootNote]+' '+(typ.label==='Menor'?'m':typ.label==='Séptima dominante'?'7':typ.label==='Séptima mayor'?'maj7':''));b.onclick=()=>playChord(typ.steps.map(s=>(rootNote+s)%12));row.append(b);});card.append(row);
  const play=el('button','btn accent tool-action','▶ ESCUCHAR PROGRESIÓN');play.onclick=async()=>{for(let i=0;i<p.degrees.length;i++){const rootNote=(studyRoot+p.degrees[i])%12,typ=chordTypes[p.types[i]];await playChord(typ.steps.map(s=>(rootNote+s)%12));await wait(250);}};card.append(play);
 }
 host.append(card);
}
function buildFretboard(intervals,root){
 const box=el('div','fretboard-wrap');box.append(el('h4','tool-subtitle','DIAGRAMA DE DIAPASÓN · GUITARRA'));
 const strings=[['E4',64],['B3',59],['G3',55],['D3',50],['A2',45],['E2',40]],grid=el('div','fretboard');
 strings.forEach(([label,open])=>{grid.append(el('span','fret-string-label',label));for(let fret=0;fret<=12;fret++){const pitch=open+fret,pc=pitch%12,active=intervals.some(step=>(root+step)%12===pc),cell=el('button','fret-cell'+(active?' in-scale':'')+(pc===root?' root-note':''),active?noteNames[pc]:'');cell.title=label+' · traste '+fret;cell.onclick=()=>playOne(pitch);grid.append(cell);}});
 box.append(grid);return box;
}
function playOne(note){resume();playInstrumentNote('piano',note,.72);setTimeout(()=>stopInstrumentNote(note),700);}
async function playScale(steps,root){for(let oct=0;oct<2;oct++)for(const step of steps){const note=60+root+step+oct*12;playOne(note);await wait(190);}playOne(60+root+24);}
async function playChord(notes){await resume();notes.forEach(n=>playOne(60+n));await wait(900);}
export function mountTools(){
 const host=$('tools-content');if(!host||host.dataset.mounted)return;host.dataset.mounted='1';
 const wrap=el('section','tools-view');const heading=el('header','tools-header');heading.append(el('h2','creative-heading','MUSICTOOL · HERRAMIENTAS'));
 const tabs=el('div','tool-main-tabs');[['tuner','AFINADOR'],['metro','METRÓNOMO'],['study','ESTUDIO']].forEach(([v,l])=>{const b=el('button','tool-tab active',l);b.dataset.tool=v;b.onclick=()=>{tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));if(v!=='tuner')stopTuner();if(v!=='metro')stopMetro();if(v==='tuner')renderTuner(content);if(v==='metro')renderMetronome(content);if(v==='study')renderStudy(content);};tabs.append(b);});
 const content=el('div','tools-content-panel');content.id='tools-panel';wrap.append(heading,tabs,content);host.append(wrap);renderTuner(content);
}
