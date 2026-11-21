// MUSICTOOL DAW V6 — channel console, MIDI input and playable computer keyboard.
import { state, findTrack } from './state.js';
import { updateChannel, playInstrumentNote, stopInstrumentNote, resume } from './audio-engine.js';
import { saveProject } from './storage.js';
import { toast } from './transport.js';

const $ = (id) => document.getElementById(id);
let activeEditorTrackId = null;
let midiAccess = null;
let keyboardMode = 'piano';
let octave = 4;
let rootNote = 0;
let scaleName = 'chromatic';
const held = new Map();
const keyNotes = { a:0,w:1,s:2,e:3,d:4,f:5,t:6,g:7,y:8,h:9,u:10,j:11,k:12,o:13,l:14,p:15,';':16 };

function ensureChannelSettings(track) {
  track.eq ||= { low:0, lowMid:0, mid:0, highMid:0, high:0 };
  track.effects ||= [];
  track.inputGainDb ??= 0;
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
  const gainBox=el('section','studio-card'); gainBox.append(el('h3','','INPUT / OUTPUT'));
  gainBox.append(slider('Input gain',-24,24,.5,track.inputGainDb,v=>{track.inputGainDb=v;persist(track);},' dB'));
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
  const effectTypes=[['overdrive','OVERDRIVE'],['distortion','DISTORTION'],['delay','DELAY'],['reverb','REVERB'],['chorus','CHORUS']];
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
  body.append(gainBox,eqBox,compBox,fxBox,format); panel.append(body); modal.append(panel); modal.classList.add('open');
}

export function renderMixer() {
  const host=$('mixer-strips'); if(!host)return; host.replaceChildren();
  const master=el('section','mixer-strip master-strip'); master.append(el('strong','','MASTER'));
  master.append(slider('Master',0,150,1,(state.masterVolume??.9)*100,v=>{import('./audio-engine.js').then(m=>m.setMasterVolume(v/100));},'%'));
  host.append(master);
  for(const track of state.tracks) {
    ensureChannelSettings(track);
    const strip=el('section','mixer-strip v6-mixer-strip');
    const name=el('strong','mixer-track-name',track.name);
    const meter=el('div','mixer-meter'); const fill=el('i','');meter.append(fill);
    const vol=slider('LEVEL',0,150,1,(track.volume??1)*100,v=>{track.volume=v/100;updateChannel(track);},'%');
    const pan=slider('PAN',-1,1,.01,track.pan,v=>{track.pan=v;updateChannel(track);});
    const open=el('button','btn accent','CHANNEL STUDIO');open.type='button';open.onclick=()=>openChannelEditor(track.id);
    strip.append(name,meter,vol,pan,open);host.append(strip);
  }
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
  if(keyboardMode==='drums') { const note=36+index; playInstrumentNote('drum',note,velocity); held.set(key,{note});return; }
  if(keyboardMode==='launchpad') { const note=48+(index%16); playInstrumentNote('pad',note,velocity); held.set(key,{note});return; }
  const note=quantizedNote(index);playInstrumentNote('synth',note,velocity);held.set(key,{note});
}
function noteOff(key) { const item=held.get(key);if(!item)return;if(item.note!==undefined)stopInstrumentNote(item.note);held.delete(key); }
function renderInstrumentPanel(host, mode) {
  host.replaceChildren();
  const bar=el('div','instrument-toolbar');
  const modes=[['piano','PIANO'],['launchpad','LAUNCHPAD'],['drums','DRUMS']];
  for(const [id,label] of modes){const b=el('button','btn'+(keyboardMode===id?' accent':''),label);b.onclick=()=>{keyboardMode=id;renderInstrumentPanel(host,mode);};bar.append(b);}
  const octaveSel=el('select','studio-select');for(let i=1;i<=7;i++){const o=el('option','',String(i));o.value=i;o.selected=i===octave;octaveSel.append(o);}octaveSel.onchange=()=>octave=Number(octaveSel.value);
  const rootSel=el('select','studio-select');const roots=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];roots.forEach((n,i)=>{const o=el('option','',n);o.value=i;o.selected=i===rootNote;rootSel.append(o);});rootSel.onchange=()=>rootNote=Number(rootSel.value);
  const scaleSel=el('select','studio-select');Object.keys(scaleIntervals).forEach(s=>{const o=el('option','',s.toUpperCase());o.value=s;o.selected=s===scaleName;scaleSel.append(o);});scaleSel.onchange=()=>scaleName=scaleSel.value;
  const midi=el('button','btn','CONNECT MIDI');midi.onclick=connectMidi;
  bar.append(el('span','instrument-caption','MODE'),octaveSel,rootSel,scaleSel,midi);
  const help=el('p','studio-note','Teclado del ordenador: A W S E D F T G Y H U J K O L P. Usa el teclado físico o toca las teclas en pantalla.');
  const keys=el('div','computer-keys');
  const labels=Object.keys(keyNotes);
  labels.forEach((k,i)=>{const b=el('button','computer-key',k.toUpperCase());b.onpointerdown=e=>{e.preventDefault();resume();noteOn('touch'+i,i);};b.onpointerup=()=>noteOff('touch'+i);b.onpointerleave=()=>noteOff('touch'+i);keys.append(b);});
  host.append(bar,help,keys);
  if(keyboardMode==='launchpad'||keyboardMode==='drums'){
    const pads=el('div','launchpad-grid');
    for(let i=0;i<16;i++){const p=el('button','launch-pad',keyboardMode==='drums'?['KICK','SNARE','C.HAT','O.HAT','CLAP','TOM 1','TOM 2','CRASH'][i%8]:String(i+1).padStart(2,'0'));p.onpointerdown=e=>{e.preventDefault();resume();noteOn('pad'+i,i);};p.onpointerup=()=>noteOff('pad'+i);p.onpointerleave=()=>noteOff('pad'+i);pads.append(p);}
    host.append(pads);
  }
}
export function mountStudio() {
  const piano=$('view-pianoroll');if(piano){piano.replaceChildren(el('h2','','PIANO ROLL / VIRTUAL KEYBOARD'));const p=el('p','muted','Toca notas con el teclado del ordenador, la pantalla o un controlador MIDI. Selecciona tonalidad y escala.');const host=el('div','instrument-panel');piano.append(p,host);renderInstrumentPanel(host,'piano');}
  const drums=$('view-drummachine');if(drums){drums.replaceChildren(el('h2','','DRUM MACHINE / LAUNCHPAD'));const p=el('p','muted','Pads de percusión y disparo de sonidos desde teclado físico o pantalla.');const host=el('div','instrument-panel');drums.append(p,host);renderInstrumentPanel(host,'drums');}
  window.addEventListener('keydown',e=>{
    if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||''))return;
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
        if(data1===64&&data2>=64){track.effects||=[];let fx=track.effects.find(x=>x.type==='reverb');if(!fx){fx={type:'reverb',enabled:true,mix:.3};track.effects.push(fx);}else fx.enabled=!fx.enabled;updateChannel(track);saveProject();}
      }
    };
    midiAccess.inputs.forEach(attach);midiAccess.onstatechange=()=>midiAccess.inputs.forEach(attach);
    toast('MIDI conectado: '+midiAccess.inputs.size+' entrada(s)');
  }catch(e){console.error(e);toast('No se pudo conectar MIDI');}
}
