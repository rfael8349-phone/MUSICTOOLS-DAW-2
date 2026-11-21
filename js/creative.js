// MUSICTOOL DAW V7.0 — Creative Studio
import { state, createTrack, saveProject as _unused } from './state.js';
import { playInstrumentNote, stopInstrumentNote, resume } from './audio-engine.js';
import { saveProject } from './storage.js';
import { toast } from './transport.js';

const $ = id => document.getElementById(id);
const held = new Map();
let octave = 4, tone = 'synth', qwerty = false, theme = 'xp';
let pattern = Array.from({length:6},()=>Array(16).fill(false));
let patternTimer = null, patternStep = 0, patternBpm = 100;
const tones = [['synth','SYNTH'],['guitar','GUITAR'],['bass','BASS']];
const drumRows = [['KICK',36],['SNARE',38],['CLOSED HAT',42],['OPEN HAT',46],['CLAP',39],['LOW TOM',45],['MID TOM',47],['HIGH TOM',48],['CRASH',49],['RIDE',51]];
const keyMap = {a:0,w:1,s:2,e:3,d:4,f:5,t:6,g:7,y:8,h:9,u:10,j:11,k:12,o:13,l:14,p:15};

function node(tag, cls='', text='') { const n=document.createElement(tag); if(cls)n.className=cls; if(text)n.textContent=text; return n; }
function noteName(n){return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][n%12];}
function press(note,key,vel=.8,kind=tone){ if(held.has(key))return; resume(); playInstrumentNote(kind,note,vel); held.set(key,note); }
function release(key){const n=held.get(key);if(n===undefined)return;stopInstrumentNote(n);held.delete(key);}
function whiteKeyIndex(semitone){return [0,2,4,5,7,9,11].indexOf(semitone);}
function renderPiano(host){
 host.replaceChildren();
 const toolbar=node('div','creative-toolbar');
 const instrument=node('select','studio-select');
 tones.forEach(([v,l])=>{const o=node('option','',l);o.value=v;instrument.append(o);});instrument.value=tone;
 instrument.onchange=()=>tone=instrument.value;
 const low=node('button','btn','− OCT');low.onclick=()=>{octave=Math.max(1,octave-1);renderPiano(host);};
 const high=node('button','btn','+ OCT');high.onclick=()=>{octave=Math.min(7,octave+1);renderPiano(host);};
 const q=node('button','btn'+(qwerty?' accent':''),qwerty?'QWERTY ON':'QWERTY OFF');q.onclick=()=>{qwerty=!qwerty;renderPiano(host);};
 const add=node('button','btn accent','+ MIDI TRACK');add.onclick=async()=>{const t=createTrack('midi','MIDI Instrument '+(state.tracks.length+1));state.selectedTrackId=t.id;await saveProject();toast('Pista MIDI creada: '+t.name);};
 const midi=node('button','btn','MIDI IN');midi.onclick=async()=>{if(!navigator.requestMIDIAccess){toast('Web MIDI no disponible en este navegador');return;}try{const access=await navigator.requestMIDIAccess();access.inputs.forEach(input=>input.onmidimessage=e=>{const [s,n,v]=e.data,c=s&240;if(c===144&&v)press(n,'midi:'+n,v/127,'synth');else if(c===128||(c===144&&!v))release('midi:'+n);});toast('MIDI conectado · '+access.inputs.size+' entrada(s)');}catch(e){toast('No se pudo conectar MIDI');}};
 toolbar.append(instrument,node('span','creative-label','OCT '+octave),low,high,q,add,midi);host.append(toolbar);
 const keyboard=node('div','piano-keyboard');
 const whites=14, whiteWidth=100/whites;
 for(let i=0;i<whites;i++){
  const semis=[0,2,4,5,7,9,11][i%7], note=octave*12+Math.floor(i/7)*12+semis;
  const key=node('button','piano-white',noteName(note));key.style.left=(i*whiteWidth)+'%';key.style.width=whiteWidth+'%';
  key.onpointerdown=e=>{e.preventDefault();key.setPointerCapture?.(e.pointerId);key.classList.add('pressed');press(note,'piano:'+i);};
  const off=()=>{key.classList.remove('pressed');release('piano:'+i);};key.onpointerup=off;key.onpointercancel=off;key.onlostpointercapture=off;keyboard.append(key);
 }
 // Black keys positioned between the appropriate white keys, as on a conventional piano.
 const blackAfter=[0,1,3,4,5];let whiteBefore=0;
 for(let oct=0;oct<2;oct++)for(const sem of blackAfter){
  const idx=oct*7+sem;const note=octave*12+oct*12+[1,3,6,8,10][blackAfter.indexOf(sem)];
  const key=node('button','piano-black',noteName(note));key.style.left=((idx+1)*whiteWidth-whiteWidth*.31)+'%';key.style.width=(whiteWidth*.62)+'%';
  const id='black:'+oct+':'+sem;key.onpointerdown=e=>{e.preventDefault();key.setPointerCapture?.(e.pointerId);key.classList.add('pressed');press(note,id);};const off=()=>{key.classList.remove('pressed');release(id);};key.onpointerup=off;key.onpointercancel=off;key.onlostpointercapture=off;keyboard.append(key);
 }
 host.append(keyboard);
 const legend=node('div','creative-footnote','Piano táctil · 2 octavas · polifonía · MIDI externo compatible cuando el navegador lo permite');host.append(legend);
 if(qwerty){const hint=node('p','studio-note','QWERTY opcional: A W S E D F T G Y H U J K O L P.');host.append(hint);}
}
function renderDrums(host){
 host.replaceChildren();
 const bar=node('div','creative-toolbar');
 const style=node('select','studio-select');['CUMBIA','ROCK','PUNK','POST-PUNK','REGGAE','ELECTRONIC'].forEach(x=>style.append(node('option','',x)));
 const bpm=node('input','studio-select');bpm.type='number';bpm.min=50;bpm.max=220;bpm.value=patternBpm;bpm.style.width='76px';bpm.onchange=()=>patternBpm=Math.max(50,Math.min(220,Number(bpm.value)||100));
 const play=node('button','btn accent','▶ PATTERN');play.onclick=()=>{if(patternTimer){clearInterval(patternTimer);patternTimer=null;play.textContent='▶ PATTERN';return;}patternStep=0;play.textContent='■ STOP';patternTimer=setInterval(()=>{drumRows.forEach((r,i)=>{if(pattern[i][patternStep]){resume();playInstrumentNote('drum',r[1],.85);}});host.querySelectorAll('[data-step]').forEach(x=>x.classList.toggle('playing',Number(x.dataset.step)===patternStep));patternStep=(patternStep+1)%16;},60000/patternBpm/4);};
 const clear=node('button','btn','CLEAR');clear.onclick=()=>{pattern=pattern.map(r=>r.map(()=>false));renderDrums(host);};
 bar.append(style,node('span','creative-label','BPM'),bpm,play,clear);host.append(bar);
 const grid=node('div','drum-sequencer');
 drumRows.forEach((r,i)=>{const label=node('div','drum-row-label',r[0]);grid.append(label);for(let s=0;s<16;s++){const b=node('button','drum-step'+(pattern[i][s]?' on':''));b.dataset.step=s;b.setAttribute('aria-label',r[0]+' step '+(s+1));b.onclick=()=>{pattern[i][s]=!pattern[i][s];b.classList.toggle('on',pattern[i][s]);};grid.append(b);}});
 host.append(grid);
 const pads=node('div','drum-pads');drumRows.slice(0,10).forEach(([name,n])=>{const b=node('button','drum-pad',name);b.onpointerdown=e=>{e.preventDefault();resume();playInstrumentNote('drum',n,.9);};pads.append(b);});host.append(pads);
 const importLabel=node('label','btn','IMPORTAR SAMPLES WAV / MP3');importLabel.htmlFor='sample-file';host.append(importLabel);
}
function renderThemes(){
 const themes=[['xp','Windows XP'],['classic','Macintosh Classic'],['dark','Studio Dark'],['winamp','Winamp Retro'],['analog','Analog 80s'],['modern','Modern Studio']];
 const box=node('div','theme-picker');const label=node('strong','','APARIENCIA');const select=node('select','studio-select');
 themes.forEach(([v,l])=>{const o=node('option','',l);o.value=v;select.append(o);});select.value=theme;
 select.onchange=()=>{theme=select.value;document.documentElement.dataset.theme=theme;localStorage.setItem('musictool-theme',theme);};
 box.append(label,select);return box;
}
export function mountCreative(){
 const piano=$('view-pianoroll');if(piano){piano.replaceChildren();const wrap=node('section','creative-view piano-view');wrap.append(node('h2','creative-heading','PIANO / VIRTUAL INSTRUMENT'));const host=node('div','creative-instrument');wrap.append(host);piano.append(wrap);renderPiano(host);}
 const drums=$('view-drummachine');if(drums){drums.replaceChildren();const wrap=node('section','creative-view');wrap.append(node('h2','creative-heading','DRUM STUDIO / STEP SEQUENCER'));const host=node('div','creative-instrument');wrap.append(host);drums.append(wrap);renderDrums(host);}
 const menu=$('btn-menu');if(menu&&!$('theme-picker')){const picker=renderThemes();picker.id='theme-picker';document.getElementById('topbar').append(picker);}
 theme=localStorage.getItem('musictool-theme')||'xp';document.documentElement.dataset.theme=theme;const sel=$('theme-picker')?.querySelector('select');if(sel)sel.value=theme;
 window.addEventListener('keydown',e=>{if(!qwerty||!$('view-pianoroll')?.classList.contains('active')||e.repeat||/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName||''))return;const k=e.key.toLowerCase();if(keyMap[k]!==undefined){e.preventDefault();press(octave*12+keyMap[k],'qwerty:'+k);}});
 window.addEventListener('keyup',e=>release('qwerty:'+e.key.toLowerCase()));
 window.addEventListener('blur',()=>{for(const k of held.keys())release(k);});
}
