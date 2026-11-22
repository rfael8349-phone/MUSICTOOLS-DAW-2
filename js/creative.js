// MUSICTOOL DAW V7.0 — Creative Studio
import { state, createTrack } from './state.js';
import { refreshAll } from './playlist.js';
import { playInstrumentNote, stopInstrumentNote, resume } from './audio-engine.js';
import { saveProject } from './storage.js';
import { toast } from './transport.js';

const $ = id => document.getElementById(id);
const held = new Map();
let octave = 4, tone = 'piano', qwerty = false, theme = 'xp';
let pattern = Array.from({length:10},()=>Array(16).fill(false));
let patternTimer = null, patternStep = 0, patternBpm = 100, drumStyle = 'CUMBIA', drumPatternInitialized = false, drumKit='arena-rock';
let midiCapture = null, midiAccess = null;
const activeCaptureNotes = new Map();
const tones = [['piano','PIANO'],['guitar','GUITARRA ELÉCTRICA'],['acoustic','GUITARRA ACÚSTICA'],['bass','BAJO'],['synth','SYNTH']];
const drumRows = [['KICK',36],['SNARE',38],['CLOSED HAT',42],['OPEN HAT',46],['CLAP',39],['LOW TOM',45],['MID TOM',47],['HIGH TOM',48],['CRASH',49],['RIDE',51]];
const keyMap = {a:0,w:1,s:2,e:3,d:4,f:5,t:6,g:7,y:8,h:9,u:10,j:11,k:12,o:13,l:14,p:15};

function node(tag, cls='', text='') { const n=document.createElement(tag); if(cls)n.className=cls; if(text)n.textContent=text; return n; }
function noteName(n){return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][n%12];}
function press(note,key,vel=.8,kind=tone){ if(held.has(key))return; resume(); playInstrumentNote(kind,note,vel); held.set(key,{note,type:kind,trackId:state.selectedTrackId||null}); if(midiCapture)activeCaptureNotes.set(key,{pitch:note,time:Math.max(0,(performance.now()-midiCapture.started)/1000),velocity:vel}); }
function release(key){const item=held.get(key);if(item===undefined)return;stopInstrumentNote(item.note,item.type||null,item.trackId||null);held.delete(key);const started=activeCaptureNotes.get(key);if(started&&midiCapture){started.duration=Math.max(.06,(performance.now()-midiCapture.started)/1000-started.time);midiCapture.notes.push(started);activeCaptureNotes.delete(key);}}
function whiteKeyIndex(semitone){return [0,2,4,5,7,9,11].indexOf(semitone);}
function renderPiano(host){
 host.replaceChildren();
 const toolbar=node('div','creative-toolbar');
 const instrument=node('select','studio-select');
 tones.forEach(([v,l])=>{const o=node('option','',l);o.value=v;instrument.append(o);});instrument.value=tone;
 instrument.onchange=()=>tone=instrument.value;
 const low=node('button','btn','− OCT');low.onclick=()=>{octave=Math.max(1,octave-1);renderPiano(host);};
 const high=node('button','btn','+ OCT');high.onclick=()=>{octave=Math.min(7,octave+1);renderPiano(host);};
 const q=node('button','compact-toggle'+(qwerty?' active':''),'⌨');q.type='button';q.title=qwerty?'Desactivar teclado QWERTY':'Activar teclado QWERTY';q.setAttribute('aria-label',q.title);q.setAttribute('aria-pressed',String(qwerty));q.onclick=()=>{qwerty=!qwerty;renderPiano(host);};
 const midi=node('button','compact-toggle'+(midiAccess?' active':''),'MIDI');midi.type='button';midi.title=midiAccess?'Desconectar controlador MIDI':'Conectar controlador MIDI';midi.setAttribute('aria-pressed',String(!!midiAccess));midi.onclick=async()=>{
  if(midiAccess){midiAccess.inputs.forEach(input=>input.onmidimessage=null);midiAccess=null;renderPiano(host);toast('Controlador MIDI desconectado');return;}
  if(!navigator.requestMIDIAccess){toast('Web MIDI no está disponible en este navegador');return;}
  try{
   const access=await navigator.requestMIDIAccess();
   const attach=input=>{input.onmidimessage=e=>{const [status,n,v]=e.data,cmd=status&240;if(cmd===144&&v)press(n,'midi:'+n,v/127,tone);else if(cmd===128||(cmd===144&&!v))release('midi:'+n);};};
   access.inputs.forEach(attach);access.onstatechange=()=>access.inputs.forEach(attach);midiAccess=access;renderPiano(host);
   toast('MIDI conectado · '+access.inputs.size+' entrada(s)');
  }catch(e){toast('No se pudo conectar MIDI');}

  'POLKA-PARAGUAYA':[[0,8],[4,12],[0,2,4,6,8,10,12,14],[4,12],[8]],
  GUARANIA:[[0,8],[4,12],[0,4,8,12],[2,6,10,14],[8]],
  CHACARERA:[[0,6,8,14],[4,12],[0,2,4,6,8,10,12,14],[4,12],[8,14]],
  ZAMBA:[[0,8],[4,12],[0,4,8,12],[2,6,10,14],[8]],
  TANGO:[[0,4,8,12],[4,12],[0,4,8,12],[4,12],[8]],
  VALLENATO:[[0,8],[4,12],[0,2,4,6,8,10,12,14],[4,12],[8]],
  SALSA:[[0,8],[4,12],[0,2,4,6,8,10,12,14],[2,6,10,14],[4,12]],
  MERENGUE:[[0,4,8,12],[4,12],[0,2,4,6,8,10,12,14],[4,12],[8]],
  REGGAETON:[[0,4,8,12],[4,12],[0,2,4,6,8,10,12,14],[4,12],[8,12]],
  NORTENO:[[0,8],[4,12],[0,2,4,6,8,10,12,14],[4,12],[8]],
  MARIACHI:[[0,8],[4,12],[0,4,8,12],[4,12],[8,14]],
  SAMBA:[[0,4,8,12],[4,12],[0,2,4,6,8,10,12,14],[2,6,10,14],[8]],
  BOSSA:[[0,8],[4,12],[2,6,10,14],[4,12],[8]],
  FLAMENCO:[[0,4,8,12],[4,12],[0,2,4,6,8,10,12,14],[4,12],[8,14]],
  PASODOBLE:[[0,4,8,12],[4,12],[0,2,4,6,8,10,12,14],[4,12],[8]],
  BLUES:[[0,8],[4,12],[0,2,4,6,8,10,12,14],[4,12],[8]],
  COUNTRY:[[0,8],[4,12],[0,2,4,6,8,10,12,14],[4,12],[8]],
  JAZZ:[[0,8],[4,12],[0,4,8,12],[2,6,10,14],[8]],
  FUNK:[[0,4,8,12],[4,12],[0,2,4,6,8,10,12,14],[4,12],[8]],
  AFROBEAT:[[0,6,8,14],[4,12],[0,2,4,6,8,10,12,14],[2,6,10,14],[8,12]],
 };
 const rec=node('button','compact-toggle record-mini','●');rec.type='button';rec.title='Grabar interpretación MIDI';rec.setAttribute('aria-label',rec.title);
 rec.onclick=()=>{if(midiCapture){toast('Ya estás grabando MIDI');return;}let track=state.tracks.find(t=>t.id===state.selectedTrackId&&t.kind==='midi');if(!track)track=createTrack('midi','MIDI Instrument '+(state.tracks.length+1));state.selectedTrackId=track.id;midiCapture={trackId:track.id,started:performance.now(),startSec:Math.max(0,state.playhead),notes:[]};activeCaptureNotes.clear();rec.classList.add('active');rec.title='Grabando MIDI';toast('Grabación MIDI preparada · toca el teclado');};
 const stopRec=node('button','compact-toggle','■');stopRec.type='button';stopRec.title='Detener grabación MIDI';stopRec.setAttribute('aria-label',stopRec.title);
 stopRec.onclick=async()=>{if(!midiCapture)return toast('No hay grabación MIDI activa');const capture=midiCapture;midiCapture=null;for(const [key,note] of activeCaptureNotes){note.duration=Math.max(.08,(performance.now()-capture.started)/1000-note.time);capture.notes.push(note);}activeCaptureNotes.clear();if(!capture.notes.length){toast('No se grabaron notas');return;}const end=Math.max(...capture.notes.map(n=>n.time+(n.duration||.2)));const clip={id:'midi_'+Date.now().toString(36),kind:'midi',startSec:capture.startSec,lengthSec:Math.max(.25,end),name:'MIDI Performance',instrument:tone,notes:capture.notes};const track=state.tracks.find(t=>t.id===capture.trackId);if(track){track.clips.push(clip);await saveProject();refreshAll();renderMidiEditor();rec.classList.remove('active');rec.title='Grabar interpretación MIDI';toast('MIDI guardado en '+track.name+' · '+capture.notes.length+' notas');}else toast('No se encontró la pista MIDI');};
 const advanced=node('details','compact-options');const summary=node('summary','compact-options-summary','⋯');summary.title='Más opciones';advanced.append(summary);
 const add=node('button','mini-action','＋ PISTA MIDI');add.type='button';add.onclick=async()=>{const t=createTrack('midi','MIDI Instrument '+(state.tracks.length+1));state.selectedTrackId=t.id;await saveProject();refreshAll();toast('Pista MIDI creada: '+t.name);};advanced.append(add);
 toolbar.append(instrument,node('span','creative-label','OCT '+octave),low,high,q,midi,rec,stopRec,advanced);host.append(toolbar);
 const keyboard=node('div','piano-keyboard');
 const whites=14, whiteWidth=100/whites;
 for(let i=0;i<whites;i++){
  const semis=[0,2,4,5,7,9,11][i%7], note=(octave+1)*12+Math.floor(i/7)*12+semis;
  const key=node('button','piano-white',noteName(note));key.style.left=(i*whiteWidth)+'%';key.style.width=whiteWidth+'%';
  key.onpointerdown=e=>{e.preventDefault();key.setPointerCapture?.(e.pointerId);key.classList.add('pressed');press(note,'piano:'+i);};
  const off=()=>{key.classList.remove('pressed');release('piano:'+i);};key.onpointerup=off;key.onpointercancel=off;key.onlostpointercapture=off;keyboard.append(key);
 }
 // Black keys positioned between the appropriate white keys, as on a conventional piano.
 const blackAfter=[0,1,3,4,5];let whiteBefore=0;
 for(let oct=0;oct<2;oct++)for(const sem of blackAfter){
  const idx=oct*7+sem;const note=(octave+1)*12+oct*12+[1,3,6,8,10][blackAfter.indexOf(sem)];
  const key=node('button','piano-black',noteName(note));key.style.left=((idx+1)*whiteWidth-whiteWidth*.31)+'%';key.style.width=(whiteWidth*.62)+'%';
  const id='black:'+oct+':'+sem;key.onpointerdown=e=>{e.preventDefault();key.setPointerCapture?.(e.pointerId);key.classList.add('pressed');press(note,id);};const off=()=>{key.classList.remove('pressed');release(id);};key.onpointerup=off;key.onpointercancel=off;key.onlostpointercapture=off;keyboard.append(key);
 }
 host.append(keyboard);
 const legend=node('div','creative-footnote','Piano y guitarras con muestras grabadas · 2 octavas · polifonía · banco CC0');host.append(legend);
 if(qwerty){const hint=node('p','studio-note','QWERTY opcional: A W S E D F T G Y H U J K O L P.');host.append(hint);}
}
function renderMidiEditor(){
 const host=$('midi-note-editor');if(!host)return;host.replaceChildren();
 const title=node('h3','creative-heading','MIDI CLIPS / NOTE EDITOR');host.append(title);
 const clips=[];for(const track of state.tracks)for(const clip of track.clips||[])if(clip.kind==='midi'&&Array.isArray(clip.notes))clips.push({track,clip});
 if(!clips.length){host.append(node('p','creative-footnote','Todavía no hay clips MIDI. Pulsa REC MIDI, toca el teclado y detén la grabación para crear el primero.'));return;}
 clips.forEach(({track,clip})=>{
  const section=node('section','midi-clip-card');const head=node('div','creative-toolbar');
  head.append(node('strong','',clip.name||'MIDI Performance'),node('span','creative-footnote',track.name+' · '+clip.notes.length+' notas'));
  const quant=node('button','btn','CUANTIZAR 1/16');quant.onclick=async()=>{const step=60/Math.max(30,Number(state.bpm)||120)/4;clip.notes.forEach(n=>n.time=Math.max(0,Math.round(n.time/step)*step));clip.lengthSec=Math.max(.25,...clip.notes.map(n=>n.time+(n.duration||.2)));await saveProject();renderMidiEditor();toast('Notas cuantizadas a 1/16');};
  const remove=node('button','btn danger','ELIMINAR CLIP');remove.onclick=async()=>{track.clips=track.clips.filter(x=>x.id!==clip.id);await saveProject();refreshAll();renderMidiEditor();};
  head.append(quant,remove);section.append(head);
  const grid=node('div','midi-note-grid');const maxTime=Math.max(1,clip.lengthSec||1);
  clip.notes.forEach((note,index)=>{
   const row=node('div','midi-note-row');const label=node('span','creative-footnote',noteName(note.pitch)+' · '+(note.time||0).toFixed(2)+'s');
   const lane=node('div','midi-note-lane');const bar=node('div','midi-note-bar');bar.style.left=(Math.max(0,note.time)/maxTime*100)+'%';bar.style.width=(Math.max(.025,note.duration||.1)/maxTime*100)+'%';bar.title=noteName(note.pitch)+' · '+(note.duration||0).toFixed(2)+'s';lane.append(bar);
   const del=node('button','btn','×');del.setAttribute('aria-label','Eliminar nota');del.onclick=async()=>{clip.notes.splice(index,1);clip.lengthSec=Math.max(.25,...clip.notes.map(n=>n.time+(n.duration||.2)));await saveProject();renderMidiEditor();};
   row.append(label,lane,del);grid.append(row);
  });
  section.append(grid);host.append(section);
 });
}
function renderDrums(host){
 host.replaceChildren();
 const bar=node('div','creative-toolbar');
 const style=node('select','studio-select');
 const genres=[
  ['CUMBIA','Colombia · Cumbia'],['VALLENATO','Colombia · Vallenato'],['SALSA','Caribe · Salsa'],['MERENGUE','República Dominicana · Merengue'],['REGGAETON','Caribe · Reguetón'],
  ['POLKA-PARAGUAYA','Paraguay · Polca paraguaya'],['GUARANIA','Paraguay · Guarania'],['CHACARERA','Argentina · Chacarera'],['ZAMBA','Argentina · Zamba'],['TANGO','Argentina · Tango'],
  ['RANCHERA','México · Ranchera'],['NORTENO','México · Norteño'],['MARIACHI','México · Mariachi'],['SAMBA','Brasil · Samba'],['BOSSA','Brasil · Bossa nova'],
  ['FLAMENCO','España · Flamenco'],['PASODOBLE','España · Pasodoble'],['ROCK','Rock'],['METAL','Metal'],['PUNK','Punk'],['HEAVY','Heavy metal'],
  ['BALLAD','Balada'],['WALTZ','Vals'],['POST-PUNK','Post-punk'],['REGGAE','Reggae'],['ELECTRONIC','Electrónica'],['BLUES','Blues'],['COUNTRY','Country'],['JAZZ','Jazz'],['FUNK','Funk'],['AFROBEAT','Afrobeat']
 ];
 const kits=[['arena-rock','Arena Rock · grande y abierto'],['vintage-70','Vintage 70s · cálido'],['dry-punk','Punk seco · directo'],['heavy-metal','Heavy Metal · doble bombo'],['jazz-club','Jazz Club · ligero'],['funk-tight','Funk · preciso'],['latin-stage','Latin Stage · percusión'],['country-stage','Country · natural'],['post-punk-room','Post-punk · sala oscura'],['electro-hybrid','Electro · híbrido']];
 const kitMap={'arena-rock':[36,38,42,46,39,41,47,48,49,51],'vintage-70':[35,40,44,46,37,41,45,48,57,53],'dry-punk':[36,38,42,46,39,41,45,48,49,51],'heavy-metal':[36,40,42,46,39,41,45,48,52,53],'jazz-club':[35,37,44,46,39,41,45,48,49,51],'funk-tight':[36,38,42,46,39,45,47,48,49,51],'latin-stage':[35,38,44,46,54,41,45,48,57,53],'country-stage':[35,38,42,46,37,41,45,48,49,51],'post-punk-room':[36,40,42,46,39,41,45,48,52,51],'electro-hybrid':[36,39,42,46,39,45,47,48,49,51]};
 const kitSelect=node('select','studio-select');kits.forEach(([v,label])=>{const o=node('option','',label);o.value=v;kitSelect.append(o);});kitSelect.value=drumKit;kitSelect.onchange=()=>{drumKit=kitSelect.value;renderDrums(host);};
 const kitNotes=()=>kitMap[drumKit]||kitMap['arena-rock'];
 const applyPreset=()=>{const p=presets[style.value]||presets.ROCK;pattern=Array.from({length:10},(_,i)=>Array.from({length:16},(_,step)=>(p[i]||[]).includes(step)));};
 style.onchange=()=>{drumStyle=style.value;applyPreset();renderDrums(host);};
 const bpm=node('input','studio-select');bpm.type='number';bpm.min=50;bpm.max=220;bpm.value=patternBpm;bpm.style.width='76px';bpm.onchange=()=>patternBpm=Math.max(50,Math.min(220,Number(bpm.value)||100));
 const play=node('button','btn accent','▶ PATTERN');play.onclick=()=>{if(patternTimer){clearInterval(patternTimer);patternTimer=null;play.textContent='▶ PATTERN';return;}patternStep=0;play.textContent='■ STOP';patternTimer=setInterval(()=>{drumRows.forEach((r,i)=>{if(pattern[i][patternStep]){resume();const pitch=kitNotes()[i]??r[1],velocity=[.98,.9,.34,.42,.48,.62,.66,.66,.5,.46][i];playInstrumentNote('drum',pitch,velocity);}});host.querySelectorAll('[data-step]').forEach(x=>x.classList.toggle('playing',Number(x.dataset.step)===patternStep));patternStep=(patternStep+1)%16;},60000/patternBpm/4);};
 const clear=node('button','btn','CLEAR');clear.onclick=()=>{pattern=pattern.map(r=>r.map(()=>false));renderDrums(host);};
 const createClip=node('button','btn accent','＋ CREAR CLIP EN PLAYLIST');
 createClip.onclick=async()=>{
  const bpmValue=Math.max(30,Math.min(300,Number(patternBpm)||120));
  const secondsPerStep=60/bpmValue/4;
  const notes=[];
  pattern.forEach((steps,row)=>steps.forEach((active,step)=>{if(active)notes.push({pitch:kitNotes()[row]??drumRows[row][1],time:step*secondsPerStep,duration:.12,velocity:[.98,.9,.34,.42,.48,.62,.66,.66,.5,.46][row]});}));
  if(!notes.length){toast('Activa algunos pasos antes de crear el clip');return;}
  const track=createTrack('midi','Batería · '+drumStyle);
  track.instrumentRole='drums';track.genre=drumStyle.toLowerCase();
  track.clips.push({id:'drum_'+Date.now().toString(36),kind:'midi',startSec:Math.max(0,state.playhead),lengthSec:Math.max(1,16*secondsPerStep),name:'Ritmo '+drumStyle+' · '+drumKit,instrument:'drum',notes});
  state.selectedTrackId=track.id;await saveProject();refreshAll();
  toast('Patrón '+drumStyle+' creado como clip MIDI en '+track.name);
 };
 if(!drumPatternInitialized){applyPreset();drumPatternInitialized=true;}
 bar.append(style,kitSelect,node('span','creative-label','BPM'),bpm,play,clear,createClip);host.append(bar);
 const grid=node('div','drum-sequencer');
 drumRows.forEach((r,i)=>{const label=node('div','drum-row-label',r[0]);grid.append(label);for(let s=0;s<16;s++){const b=node('button','drum-step'+(pattern[i][s]?' on':''));b.dataset.step=s;b.setAttribute('aria-label',r[0]+' step '+(s+1));b.onclick=()=>{pattern[i][s]=!pattern[i][s];b.classList.toggle('on',pattern[i][s]);};grid.append(b);}});
 host.append(grid);
 const pads=node('div','drum-pads');drumRows.slice(0,10).forEach(([name,n])=>{const b=node('button','drum-pad',name);b.onpointerdown=e=>{e.preventDefault();resume();playInstrumentNote('drum',kitNotes()[drumRows.findIndex(r=>r[1]===n)]??n,.78);};pads.append(b);});host.append(pads);
 const importLabel=node('label','btn','IMPORTAR SAMPLES WAV / MP3');importLabel.htmlFor='sample-file';host.append(importLabel);
}
function renderThemes(){
 const themes=[['xp','Windows 11 · Fluent'],['classic','Classic Studio'],['dark','Studio Dark'],['winamp','Winamp Retro'],['analog','Analog 80s'],['modern','Modern Studio'],['fl','Color Beat'],['minimal','Media Minimal'],['cyber','Cyber Neon'],['metal','Industrial Metal']];
 const box=node('div','theme-picker');const label=node('strong','','TEMA');const select=node('select','studio-select');select.setAttribute('aria-label','Paleta de colores');
 themes.forEach(([v,l])=>{const o=node('option','',l);o.value=v;select.append(o);});select.value=theme;
 select.onchange=()=>{theme=select.value;document.documentElement.dataset.theme=theme;localStorage.setItem('musictool-theme',theme);};
 box.append(label,select);return box;
}
export function mountCreative(){
 const piano=$('view-pianoroll');if(piano){piano.replaceChildren();const wrap=node('section','creative-view piano-view');wrap.append(node('h2','creative-heading','PIANO / VIRTUAL INSTRUMENT'));const host=node('div','creative-instrument');wrap.append(host);const editor=node('div','midi-editor-panel');editor.id='midi-note-editor';wrap.append(editor);piano.append(wrap);renderPiano(host);renderMidiEditor();}
 const drums=$('view-drummachine');if(drums){drums.replaceChildren();const wrap=node('section','creative-view');wrap.append(node('h2','creative-heading','DRUM STUDIO / STEP SEQUENCER'));const host=node('div','creative-instrument');wrap.append(host);drums.append(wrap);renderDrums(host);}
 const menu=$('btn-menu');if(menu&&!$('theme-picker')){const picker=renderThemes();picker.id='theme-picker';document.querySelector('.top-actions').append(picker);}
 theme=localStorage.getItem('musictool-theme')||'xp';document.documentElement.dataset.theme=theme;const sel=$('theme-picker')?.querySelector('select');if(sel)sel.value=theme;
 window.addEventListener('keydown',e=>{if(!qwerty||!$('view-pianoroll')?.classList.contains('active')||e.repeat||/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName||''))return;const k=e.key.toLowerCase();if(keyMap[k]!==undefined){e.preventDefault();press((octave+1)*12+keyMap[k],'qwerty:'+k);}});
 window.addEventListener('keyup',e=>release('qwerty:'+e.key.toLowerCase()));
 window.addEventListener('blur',()=>{for(const k of held.keys())release(k);});
}
