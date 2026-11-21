// MUSICTOOL DAW V6 — channel console, MIDI input and playable computer keyboard.
import { state, findTrack } from './state.js';
import { updateChannel, playInstrumentNote, stopInstrumentNote, resume, getChannelLevel } from './audio-engine.js';
import { saveProject } from './storage.js';
import { toast } from './transport.js';

const $ = (id) => document.getElementById(id);
let activeEditorTrackId = null;
let midiAccess = null;
let keyboardModes = { piano:'piano', drums:'drums' };
let qwertyEnabled = false;
let instrumentTone = 'piano';
let activeInstrumentView = 'piano';
let octave = 4;
let rootNote = 0;
let scaleName = 'chromatic';
let meterTimer = null;
const held = new Map();
const keyNotes = { a:0,w:1,s:2,e:3,d:4,f:5,t:6,g:7,y:8,h:9,u:10,j:11,k:12,o:13,l:14,p:15,';':16 };

function ensureChannelSettings(track) {
  track.eq ||= { low:0, lowMid:0, mid:0, highMid:0, high:0 };
  track.effects ||= [];
  track.inputGainDb ??= 0;
  track.inputDeviceId ??= null;
  track.compressor ||= { enabled:false, threshold:-18, ratio:3 };
  track.volume ??= 1;
  track.pan ??= 0;
}
function el(tag, cls, txt) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (txt !== undefined) node.textContent = txt;
  return node;
}
function slider(label, min, max, step, value, onInput, unit='') {
  const wrap = el('label','studio-control');
  const top = el('span','studio-control-label');
  const name = el('span','',label), out = el('output','',Number(value).toFixed(step < 1 ? 1 : 0)+unit);
  top.append(name,out);
  const input = el('input'); input.type='range'; input.min=min; input.max=max; input.step=step; input.value=value;
  input.addEventListener('input',()=>{ const v=Number(input.value); out.textContent=v.toFixed(step<1?1:0)+unit; onInput(v); });
  input.addEventListener('change',()=>saveProject().catch(console.error));
  wrap.append(top,input); return wrap;
}
function persist(track) { updateChannel(track); saveProject().catch(console.error); }

export function openChannelEditor(trackId) {
  const track = findTrack(trackId); if (!track) return;
  ensureChannelSettings(track); activeEditorTrackId=trackId;
  let modal=$('channel-editor');
  if (!modal) { modal=el('div','channel-editor-overlay'); modal.id='channel-editor'; document.body.appendChild(modal); }
  modal.replaceChildren();
  const panel=el('section','channel-editor-window');
  const head=el('header','channel-editor-head');
  const heading=el('div','', 'CHANNEL STUDIO · '+track.name);
  const close=el('button','btn','✕'); close.type='button'; close.onclick=()=>modal.classList.remove('open');
  head.append(heading,close); panel.append(head);
  const body=el('div','channel-editor-body');
  const inputBox=el('section','studio-card');inputBox.append(el('h3','','AUDIO INPUT · '+track.name));
  const inputLabel=el('label','studio-control');inputLabel.append(el('span','studio-control-label','ENTRADA DE GRABACIÓN'));
  const inputSelect=el('select','studio-select');inputSelect.setAttribute('aria-label','Entrada de audio para esta pista');
  const defaultOption=el('option','','Micrófono / entrada predeterminada');defaultOption.value='';inputSelect.append(defaultOption);
  inputSelect.value=track.inputDeviceId||'';
  inputSelect.addEventListener('change',()=>{track.inputDeviceId=inputSelect.value||null;persist(track);});
  inputLabel.append(inputSelect);inputBox.append(inputLabel);
  const inputHelp=el('p','studio-note','Cada pista conserva su propia entrada seleccionada. Si conectas una interfaz USB, actualiza la lista y elige su entrada antes de grabar.');
  const refreshInputs=el('button','mini-action','↻ ACTUALIZAR ENTRADAS');refreshInputs.type='button';
  refreshInputs.onclick=async()=>{
   if(!navigator.mediaDevices?.enumerateDevices){toast('El navegador no permite enumerar entradas');return;}
   try{
    const devices=await navigator.mediaDevices.enumerateDevices(),inputs=devices.filter(d=>d.kind==='audioinput');
    const selected=track.inputDeviceId||'';
    inputSelect.replaceChildren(defaultOption);
    inputs.forEach((device,index)=>{const option=el('option','',device.label||('Entrada de audio '+(index+1)));option.value=device.deviceId;inputSelect.append(option);});
    inputSelect.value=inputs.some(d=>d.deviceId===selected)?selected:'';
    if(selected&&!inputSelect.value){track.inputDeviceId=null;persist(track);}
    toast(inputs.length+' entrada(s) disponibles');
   }catch(error){toast('No se pudieron consultar las entradas');}
  };
  inputBox.append(refreshInputs,inputHelp);
  refreshInputs.click();
  const gainBox=el('section','studio-card'); gainBox.append(el('h3','','INPUT / OUTPUT'));
  gainBox.append(slider('Input gain',-12,12,.5,track.inputGainDb,v=>{track.inputGainDb=v;persist(track);},' dB'));
  gainBox.append(slider('Channel volume',0,150,1,(track.volume??1)*100,v=>{track.volume=v/100;updateChannel(track);},'%'));
  gainBox.append(slider('Pan',-1,1,.01,track.pan,v=>{track.pan=v;updateChannel(track);}));
  const eqBox=el('section','studio-card'); eqBox.append(el('h3','','5-BAND PARAMETRIC EQ'));
  const bands=[['low','LOW · 80 Hz'],['lowMid','LOW MID · 250 Hz'],['mid','MID · 1 kHz'],['highMid','HIGH MID · 4 kHz'],['high','AIR · 10 kHz']];
  for(const [key,label] of bands) eqBox.append(slider(label,-18,18,.5,track.eq[key],v=>{track.eq[key]=v;updateChannel(track);},' dB'));
  const compBox=el('section','studio-card'); compBox.append(el('h3','','COMPRESOR'));
  const compToggle=el('label','effect-row'); const compCheck=el('input'); compCheck.type='checkbox'; compCheck.checked=!!track.compressor.enabled;
  compToggle.append(compCheck,el('span','','DYNAMIC CONTROL')); compBox.append(compToggle);
  compCheck.addEventListener('change',()=>{track.compressor.enabled=compCheck.checked;persist(track);});
  compBox.append(slider('Threshold',-48,0,1,track.compressor.threshold,v=>{track.compressor.threshold=v;updateChannel(track);},' dB'));
  compBox.append(slider('Ratio',1,12,.5,track.compressor.ratio,v=>{track.compressor.ratio=v;updateChannel(track);},':1'));
  const fxBox=el('section','studio-card'); fxBox.append(el('h3','','PEDALES Y EFECTOS'));
  const effectTypes=[['overdrive','OVERDRIVE'],['distortion','DISTORTION'],['amp-cab','AMP / CAB'],['delay','DELAY'],['reverb','REVERB'],['chorus','CHORUS']];
  for(const [type,label] of effectTypes) {
    let fx=track.effects.find(x=>x.type===type);
    const row=el('label','effect-row');
    const check=el('input'); check.type='checkbox'; check.checked=!!(fx&&fx.enabled);
    const title=el('span','',label);
    const mix=el('input'); mix.type='range'; mix.min='0';mix.max='1';mix.step='.05';mix.value=fx?.mix??.35;mix.disabled=!check.checked;
    check.addEventListener('change',()=>{ if(!fx){fx={type,enabled:false,mix:.35};track.effects.push(fx);} fx.enabled=check.checked;mix.disabled=!check.checked;persist(track);});
    mix.addEventListener('input',()=>{if(!fx){fx={type,enabled:true,mix:.35};track.effects.push(fx);}fx.mix=Number(mix.value);fx.enabled=true;check.checked=true;updateChannel(track);});
    row.append(check,title,mix);fxBox.append(row);
  }
  const format=el('p','studio-note','Procesamiento no destructivo durante la reproducción. La grabación original se conserva; los efectos se aplican en la cadena del canal.');
  body.append(inputBox,gainBox,eqBox,compBox,fxBox,format); panel.append(body); modal.append(panel); modal.classList.add('open');
}

export function renderMixer() {
  const host=$('mixer-strips'); if(!host)return; host.replaceChildren(); if(meterTimer)clearInterval(meterTimer);
  const master=el('section','mixer-strip master-strip'); master.append(el('strong','','MASTER'));
  master.append(slider('Master',0,150,1,(state.masterVolume??.9)*100,v=>{import('./audio-engine.js').then(m=>m.setMasterVolume(v/100));},'%'));
  host.append(master);
  for(const track of state.tracks) {
    ensureChannelSettings(track); updateChannel(track);
    const strip=el('section','mixer-strip v6-mixer-strip'); strip.dataset.trackId=track.id;
    const name=el('strong','mixer-track-name',track.name);
    const meter=el('div','mixer-meter'); const fill=el('i','');meter.append(fill);
    const vol=slider('LEVEL',0,150,1,(track.volume??1)*100,v=>{track.volume=v/100;updateChannel(track);},'%');
    const pan=slider('PAN',-1,1,.01,track.pan,v=>{track.pan=v;updateChannel(track);});
    const open=el('button','btn accent','CHANNEL STUDIO');open.type='button';open.onclick=()=>openChannelEditor(track.id);
    strip.append(name,meter,vol,pan,open);host.append(strip);
  }
  meterTimer=setInterval(()=>{
    host.querySelectorAll('.v6-mixer-strip').forEach(strip=>{
      const level=getChannelLevel(strip.dataset.trackId);
      const fill=strip.querySelector('.mixer-meter i');
      if(fill)fill.style.width=(level*100).toFixed(1)+'%';
    });
  },60);
}

const scaleIntervals={
  chromatic:[0,1,2,3,4,5,6,7,8,9,10,11],
  major:[0,2,4,5,7,9,11], minor:[0,2,3,5,7,8,10],
  pentatonic:[0,3,5,7,10], blues:[0,3,5,6,7,10]
};
function quantizedNote(index) {
  if(scaleName==='chromatic')return octave*12+rootNote+index;
  const scale=scaleIntervals[scaleName]; const oct=Math.floor(index/scale.length);
  return octave*12+rootNote+oct*12+scale[((index%scale.length)+scale.length)%scale.length];
}
function noteOn(key,index,velocity=0.8) {
  if(held.has(key))return;
  if(keyboardModes[activeInstrumentView]==='drums') { const note=36+index; playInstrumentNote('drum',note,velocity); held.set(key,{note});return; }
  if(keyboardModes[activeInstrumentView]==='launchpad') { const note=48+(index%16); playInstrumentNote('pad',note,velocity); held.set(key,{note});return; }
  const note=quantizedNote(index);playInstrumentNote(instrumentTone,note,velocity);held.set(key,{note});
}
function noteOff(key) { const item=held.get(key);if(!item)return;if(item.note!==undefined)stopInstrumentNote(item.note);held.delete(key); }
function renderInstrumentPanel(host, mode) {
  host.replaceChildren();
  const selectedMode=keyboardModes[mode]||'piano';
  const bar=el('div','instrument-toolbar');
  const modes=[['piano','PIANO'],['launchpad','LAUNCHPAD'],['drums','DRUMS']];
  for(const [id,label] of modes){const b=el('button','btn'+(selectedMode===id?' accent':''),label);b.onclick=()=>{keyboardModes[mode]=id;renderInstrumentPanel(host,mode);};bar.append(b);}
  const rootSel=el('select','studio-select');
  const roots=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  roots.forEach((n,i)=>{const o=el('option','',n);o.value=i;o.selected=i===rootNote;rootSel.append(o);});
  rootSel.onchange=()=>rootNote=Number(rootSel.value);
  const scaleSel=el('select','studio-select');
  Object.keys(scaleIntervals).forEach(s=>{const o=el('option','',s.toUpperCase());o.value=s;o.selected=s===scaleName;scaleSel.append(o);});
  scaleSel.onchange=()=>scaleName=scaleSel.value;
  const toneSel=el('select','studio-select');
  [['piano','PIANO'],['guitar','GUITAR'],['bass','BASS'],['synth','SYNTH PAD']].forEach(([v,l])=>{const o=el('option','',l);o.value=v;o.selected=v===instrumentTone;toneSel.append(o);});
  toneSel.onchange=()=>instrumentTone=toneSel.value;
  const qwerty=el('button','btn'+(qwertyEnabled?' accent':''),qwertyEnabled?'QWERTY ON':'QWERTY OFF');
  qwerty.onclick=()=>{qwertyEnabled=!qwertyEnabled;renderInstrumentPanel(host,mode);};
  const midi=el('button','btn','CONNECT MIDI');midi.onclick=connectMidi;
  bar.append(el('span','instrument-caption','INSTRUMENT'),toneSel,rootSel,scaleSel,qwerty,midi);
  host.append(bar);
  if(selectedMode==='piano'){
    const octaveBar=el('div','instrument-toolbar');
    const label=el('span','instrument-caption','RANGO · 2 OCTAVAS');
    const lower=el('button','btn','− OCT');lower.onclick=()=>{octave=Math.max(1,octave-1);renderInstrumentPanel(host,mode);};
    const upper=el('button','btn','+ OCT');upper.onclick=()=>{octave=Math.min(7,octave+1);renderInstrumentPanel(host,mode);};
    octaveBar.append(label,lower,el('span','instrument-caption','OCT '+octave),upper);host.append(octaveBar);
    const keys=el('div','touch-piano');
    for(let i=0;i<24;i++){
      const note=octave*12+rootNote+i;
      const pc=(note%12), black=[1,3,6,8,10].includes(pc);
      const key=el('button','piano-key'+(black?' black-key':''),roots[pc]);
      key.setAttribute('aria-label','Nota '+roots[pc]+' octava '+Math.floor(note/12));
      key.onpointerdown=e=>{e.preventDefault();resume();const k='touch-piano-'+i;playInstrumentNote(instrumentTone,note,.8);held.set(k,{note});};
      const off=()=>noteOff('touch-piano-'+i);
      key.onpointerup=off;key.onpointercancel=off;key.onpointerleave=off;
      keys.append(key);
    }
    host.append(keys);
    if(qwertyEnabled){
      const help=el('p','studio-note','QWERTY está activado: usa A W S E D F T G Y H U J K O L P en un teclado físico.');
      const computer=el('div','computer-keys');
      Object.keys(keyNotes).forEach((k,i)=>{const b=el('button','computer-key',k.toUpperCase());b.onpointerdown=e=>{e.preventDefault();resume();noteOn('touch-qwerty-'+i,i);};b.onpointerup=()=>noteOff('touch-qwerty-'+i);b.onpointercancel=b.onpointerup;computer.append(b);});
      host.append(help,computer);
    }
  } else {
    const pads=el('div','launchpad-grid');
    const drumNames=['KICK','SNARE','CLOSED HAT','OPEN HAT','CLAP','TOM LOW','TOM MID','TOM HIGH','CRASH','RIDE','RIM','PERC 1','PERC 2','FLOOR TOM','CHINA','SPLASH'];
    for(let i=0;i<16;i++){
      const name=selectedMode==='drums'?drumNames[i]:String(i+1).padStart(2,'0');
      const p=el('button','launch-pad',name);
      p.onpointerdown=e=>{e.preventDefault();resume();noteOn('pad'+i,i);};
      p.onpointerup=()=>noteOff('pad'+i);p.onpointercancel=p.onpointerup;p.onpointerleave=p.onpointerup;pads.append(p);
    }
    host.append(pads);
    if(selectedMode==='drums')host.append(el('p','studio-note','Kit de 16 pads con voces sintetizadas. Para batería acústica realista añadiremos un banco de samples con licencia verificable; no se incluyen MP3 de terceros sin permiso.'));
  }
}
export function setInstrumentView(target) { activeInstrumentView = target === 'drummachine' ? 'drums' : 'piano'; }
export function mountStudio() {
  const piano=$('view-pianoroll');if(piano){piano.replaceChildren(el('h2','','PIANO ROLL / VIRTUAL KEYBOARD'));const p=el('p','muted','Toca notas con el teclado del ordenador, la pantalla o un controlador MIDI. Selecciona tonalidad y escala.');const host=el('div','instrument-panel');piano.append(p,host);renderInstrumentPanel(host,'piano');}
  const drums=$('view-drummachine');if(drums){drums.replaceChildren(el('h2','','DRUM MACHINE / LAUNCHPAD'));const p=el('p','muted','Pads de percusión y disparo de sonidos desde teclado físico o pantalla.');const host=el('div','instrument-panel');drums.append(p,host);renderInstrumentPanel(host,'drums');}
  window.addEventListener('keydown',e=>{
    if(!qwertyEnabled||activeInstrumentView!=='piano'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||''))return;
    const k=e.key.toLowerCase();if(Object.prototype.hasOwnProperty.call(keyNotes,k)){e.preventDefault();resume();noteOn('kbd:'+k,keyNotes[k]);}
  });
  window.addEventListener('keyup',e=>{const k=e.key.toLowerCase();noteOff('kbd:'+k);});
  window.addEventListener('blur',()=>{for(const k of held.keys())noteOff(k);});
}
export async function connectMidi() {
  if(!navigator.requestMIDIAccess){toast('Este navegador no permite Web MIDI');return;}
  try{
    midiAccess=await navigator.requestMIDIAccess();
    const attach=input=>{input.onmidimessage=ev=>{
      const [status,data1,data2]=ev.data,cmd=status&0xf0;
      if(cmd===0x90&&data2>0){resume();playInstrumentNote('synth',data1,data2/127);}
      else if(cmd===0x80||(cmd===0x90&&data2===0)){stopInstrumentNote(data1);}
      else if(cmd===0xb0){
        const track=findTrack(state.selectedTrackId); if(!track)return;
        if(data1===7){track.volume=(data2/127)*1.5;updateChannel(track);saveProject();}
        if(data1===10){track.pan=(data2/63.5)-1;updateChannel(track);saveProject();}
        if(data1===64){track.effects||=[];let fx=track.effects.find(x=>x.type==='reverb');if(!fx){fx={type:'reverb',enabled:data2>=64,mix:.3};track.effects.push(fx);}else fx.enabled=data2>=64;updateChannel(track);saveProject();}
        if(data1===11){track.effects||=[];let fx=track.effects.find(x=>x.type==='delay');if(!fx){fx={type:'delay',enabled:data2>0,mix:data2/127};track.effects.push(fx);}else{fx.mix=data2/127;fx.enabled=data2>0;}updateChannel(track);saveProject();}
        if(data1===1){track.effects||=[];let fx=track.effects.find(x=>x.type==='chorus');if(!fx){fx={type:'chorus',enabled:data2>0,mix:data2/127};track.effects.push(fx);}else{fx.mix=data2/127;fx.enabled=data2>0;}updateChannel(track);saveProject();}
      }
    };};
    midiAccess.inputs.forEach(attach);midiAccess.onstatechange=()=>midiAccess.inputs.forEach(attach);
    toast('MIDI conectado: '+midiAccess.inputs.size+' entrada(s)');
  }catch(e){console.error(e);toast('No se pudo conectar MIDI');}
}
