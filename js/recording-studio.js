// Dedicated mobile recording desk: explicit input selection, mic check and one-tap takes.
import { state } from './state.js';
import { requestMic, hasMic } from './recorder.js';
import { getContext } from './audio-engine.js';
import { startRecord, stopRecord, toast } from './transport.js';
import { saveProject } from './storage.js';

const $=id=>document.getElementById(id);
let host=null, meterTimer=null, analyser=null, meterData=null, meterSource=null, selectedInput=null;
const el=(tag,cls='',text='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
function audioTracks(){return state.tracks.filter(t=>t.kind==='audio');}
function selectedTrack(){return audioTracks().find(t=>t.id===state.selectedTrackId)||audioTracks()[0]||null;}
function stopMeter(){if(meterTimer)clearInterval(meterTimer);meterTimer=null;analyser=null;meterData=null;if(meterSource){try{meterSource.disconnect();}catch{}meterSource=null;}}
function startMeter(stream){
 stopMeter();const ctx=getContext();analyser=ctx.createAnalyser();analyser.fftSize=512;meterData=new Uint8Array(analyser.fftSize);meterSource=ctx.createMediaStreamSource(stream);meterSource.connect(analyser);
 const fill=$('recording-meter-fill'),value=$('recording-meter-value');
 meterTimer=setInterval(()=>{if(!analyser||!meterData)return;analyser.getByteTimeDomainData(meterData);let sum=0;for(const v of meterData){const n=(v-128)/128;sum+=n*n;}const rms=Math.sqrt(sum/meterData.length);const pct=Math.min(100,Math.round(rms*280));if(fill)fill.style.width=pct+'%';if(value)value.textContent=pct<2?'SIN SEÑAL':pct<72?'SEÑAL OK':'NIVEL ALTO';},70);
}
function render(){
 if(!host)return;host.replaceChildren();
 const wrap=el('section','recording-studio');
 const hero=el('header','recording-hero');hero.append(el('span','recording-eyebrow','MUSICTOOL · AUDIO DESK'),el('h2','','ESTUDIO DE GRABACIÓN'),el('p','','Graba voz, guitarra o cualquier entrada de audio en una pista independiente.'));
 const status=el('div','recording-status');status.id='recording-status';status.append(el('i','recording-status-dot'),el('span','','MICRÓFONO SIN COMPROBAR'));
 const card=el('section','recording-card');card.append(el('h3','','01 · DESTINO DE GRABACIÓN'));
 const trackLabel=el('label','recording-field');trackLabel.append(el('span','','PISTA DE DESTINO'));
 const trackSelect=el('select','studio-select');trackSelect.setAttribute('aria-label','Pista de destino de grabación');
 const tracks=audioTracks();tracks.forEach(t=>{const o=el('option','',t.name);o.value=t.id;trackSelect.append(o);});
 const current=selectedTrack();if(current)trackSelect.value=current.id;
 trackSelect.onchange=()=>{state.selectedTrackId=trackSelect.value;state.tracks.forEach(t=>t.armed=t.id===state.selectedTrackId);saveProject().catch(console.error);};
 trackLabel.append(trackSelect);card.append(trackLabel);
 const inputLabel=el('label','recording-field');inputLabel.append(el('span','','ENTRADA DE AUDIO'));
 const inputSelect=el('select','studio-select');inputSelect.setAttribute('aria-label','Micrófono o interfaz de audio');
 const def=el('option','','Micrófono / entrada predeterminada');def.value='';inputSelect.append(def);
 if(current?.inputDeviceId){const o=el('option','','Entrada guardada');o.value=current.inputDeviceId;inputSelect.append(o);inputSelect.value=current.inputDeviceId;}
 inputSelect.onchange=()=>{selectedInput=inputSelect.value||null;const t=selectedTrack();if(t){t.inputDeviceId=selectedInput;saveProject().catch(console.error);}};
 inputLabel.append(inputSelect);card.append(inputLabel);
 const refresh=el('button','btn','↻ DETECTAR ENTRADAS');refresh.type='button';
 refresh.onclick=async()=>{try{const stream=await requestMic(selectedTrack()?.inputDeviceId||selectedInput||null);startMeter(stream);const devices=await navigator.mediaDevices.enumerateDevices();const inputs=devices.filter(d=>d.kind==='audioinput');inputSelect.replaceChildren(def);inputs.forEach((d,i)=>{const o=el('option','',d.label||'Entrada '+(i+1));o.value=d.deviceId;inputSelect.append(o);});if(selectedTrack()?.inputDeviceId)inputSelect.value=selectedTrack().inputDeviceId;status.querySelector('span').textContent='MICRÓFONO CONECTADO · '+(stream.getAudioTracks()[0]?.label||'ENTRADA ACTIVA');status.classList.add('connected');toast('Entrada de audio preparada');}catch(e){status.querySelector('span').textContent='NO SE PUDO ACCEDER AL MICRÓFONO';toast(e.message||'Revisa los permisos del micrófono');}};
 card.append(refresh);
 const meter=el('div','recording-meter-wrap');const meterHead=el('div','recording-meter-head');meterHead.append(el('span','','NIVEL DE ENTRADA'),el('strong','','SIN SEÑAL'));meterHead.lastChild.id='recording-meter-value';const track=el('div','recording-meter');const fill=el('i','');fill.id='recording-meter-fill';track.append(fill);meter.append(meterHead,track);card.append(meter);
 const gainLabel=el('label','recording-field');gainLabel.append(el('span','','GANANCIA DE ENTRADA'));
 const gain=el('input');gain.type='range';gain.min='-12';gain.max='12';gain.step='1';gain.value=current?.inputGainDb??0;
 const gainValue=el('output','',gain.value+' dB');gain.oninput=()=>{gainValue.textContent=gain.value+' dB';const t=selectedTrack();if(t)t.inputGainDb=Number(gain.value);};gain.onchange=()=>saveProject().catch(console.error);gainLabel.append(gain,gainValue);card.append(gainLabel);
 const monitorNote=el('p','recording-note','La monitorización está desactivada durante la toma para evitar acoples. Usa auriculares y ajusta la ganancia para que el medidor no llegue continuamente al rojo.');
 const actions=el('div','recording-actions');const rec=el('button','record-main-button','●  EMPEZAR A GRABAR');rec.type='button';rec.onclick=async()=>{const t=selectedTrack();if(!t){toast('Crea primero una pista de audio');return;}state.selectedTrackId=t.id;try{if(state.isRecording){await stopRecord();rec.textContent='●  EMPEZAR A GRABAR';}else{await startRecord();} }catch(e){toast(e.message||'No se pudo iniciar la grabación');}};const stop=el('button','btn','■ DETENER');stop.type='button';stop.onclick=()=>stopRecord();
 actions.append(rec,stop);card.append(monitorNote,actions);
 const hint=el('div','recording-hint');hint.append(el('strong','','FLUJO DE GRABACIÓN'),el('p','','1. Selecciona la pista.  2. Comprueba el micrófono.  3. Pulsa Grabar: escucharás una cuenta de entrada de cuatro pulsos.  4. Pulsa Detener para guardar la toma como clip en la Playlist.'));
 wrap.append(hero,status,card,hint);host.append(wrap);
 if(hasMic()&&navigator.mediaDevices?.enumerateDevices){navigator.mediaDevices.enumerateDevices().then(ds=>{const inputs=ds.filter(d=>d.kind==='audioinput');if(inputs.length){status.querySelector('span').textContent='ENTRADA AUTORIZADA · '+(inputs[0].label||'MICRÓFONO DISPONIBLE');status.classList.add('connected');}}).catch(()=>{});}
 if(meterTimer===null&&hasMic()){const {getStream}=window.__musicToolRecorder||{};if(getStream)startMeter(getStream());}
}
export function mountRecordingStudio(){host=$('recording-studio-host');if(!host)return;render();if(!window.__musicToolRecordingPoll){window.__musicToolRecordingPoll=setInterval(()=>{const b=host?.querySelector('.record-main-button');if(!b)return;b.textContent=state.isRecording?'■  FINALIZAR TOMA':'●  EMPEZAR A GRABAR';b.classList.toggle('is-recording',state.isRecording);const s=host.querySelector('#recording-status span');if(s&&state.isRecording){s.textContent='GRABANDO · '+(selectedTrack()?.name||'PISTA');host.querySelector('#recording-status')?.classList.add('recording');}},250);}}
