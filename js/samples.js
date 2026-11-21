// V5.3 sample browser: import, preview and place audio files on the playlist.
import { state, createTrack, addClip } from './state.js';
import { decodeAudio, getContext, resume } from './audio-engine.js';
import { saveProject, saveSampleAsset, listSampleAssets, deleteSampleAsset } from './storage.js';
import { refreshAll } from './playlist.js';
import { toast } from './transport.js';

let samples = [];
let previewSource = null;
let mounted = false;

export async function mountSamples() {
  const picker = document.getElementById('sample-file');
  if (!picker || mounted) return;
  mounted = true;
  try {
    const saved=await listSampleAssets();
    for(const item of saved){try{const buffer=await decodeAudio(await item.blob.arrayBuffer());samples.push({id:item.id,name:item.name,blob:item.blob,buffer,trimStart:0,trimEnd:buffer.duration});}catch(error){console.warn('No se pudo restaurar sample',item.name,error);}}
  } catch(error){console.warn('Biblioteca local no disponible',error);}
  picker.addEventListener('change', async () => {
    const files = Array.from(picker.files || []);
    for (const file of files) {
      if (!file.type.startsWith('audio/') && !/\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(file.name)) continue;
      try {
        const buffer = await decodeAudio(await file.arrayBuffer());
        const sample={ id: 'sample_' + Date.now().toString(36) + '_' + samples.length, name: file.name, blob: file, buffer, trimStart: 0, trimEnd: buffer.duration }; samples.push(sample); try{await saveSampleAsset(sample.id,sample.name,file);}catch(error){console.warn('No se pudo guardar el sample',error);toast('Sample importado, pero no quedó guardado offline');}
      } catch (error) {
        console.error('Sample import failed', error);
        toast('No se pudo abrir: ' + file.name);
      }
    }
    picker.value = '';
    renderSamples();
  });
  renderSamples();
}

function renderSamples() {
  const host = document.getElementById('sample-list');
  if (!host) return;
  host.replaceChildren();
  if (!samples.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Todavía no hay samples importados.';
    host.appendChild(empty);
    return;
  }
  for (const sample of samples) {
    const row = document.createElement('article');
    row.className = 'sample-row';
    const info = document.createElement('div');
    info.className = 'sample-info';
    const name = document.createElement('strong');
    name.textContent = sample.name;
    const duration = document.createElement('small');
    duration.textContent = (sample.trimEnd-sample.trimStart).toFixed(2) + ' s seleccionados / ' + sample.buffer.duration.toFixed(2) + ' s';
    info.append(name, duration);
    const preview = document.createElement('button');
    preview.className = 'btn';
    preview.type = 'button';
    preview.textContent = '▶';
    preview.title = 'Escuchar sample';
    preview.addEventListener('click', () => playPreview(sample));
    const remove = document.createElement('button');
    remove.className = 'btn'; remove.type = 'button'; remove.textContent = '×'; remove.title = 'Eliminar de biblioteca';
    remove.addEventListener('click', async () => { samples=samples.filter(item=>item.id!==sample.id); try{await deleteSampleAsset(sample.id);}catch(error){console.warn(error);} renderSamples(); });
    const add = document.createElement('button');
    add.className = 'btn accent';
    add.type = 'button';
    add.textContent = '+ PISTA';
    add.addEventListener('click', () => placeSample(sample));
    row.append(info, preview, add, remove);
    const trim=document.createElement('div');trim.className='sample-trim';
    const startLabel=document.createElement('label');startLabel.textContent='INICIO '+sample.trimStart.toFixed(2)+' s';
    const start=document.createElement('input');start.type='range';start.min='0';start.max=String(Math.max(.01,sample.buffer.duration-.02));start.step='.01';start.value=String(sample.trimStart);
    const endLabel=document.createElement('label');endLabel.textContent='FINAL '+sample.trimEnd.toFixed(2)+' s';
    const end=document.createElement('input');end.type='range';end.min=String(Math.min(sample.buffer.duration,.02));end.max=String(sample.buffer.duration);end.step='.01';end.value=String(sample.trimEnd);
    start.addEventListener('input',()=>{sample.trimStart=Math.min(Number(start.value),sample.trimEnd-.02);startLabel.firstChild.textContent='INICIO '+sample.trimStart.toFixed(2)+' s';duration.textContent=(sample.trimEnd-sample.trimStart).toFixed(2)+' s seleccionados / '+sample.buffer.duration.toFixed(2)+' s';});
    end.addEventListener('input',()=>{sample.trimEnd=Math.max(Number(end.value),sample.trimStart+.02);endLabel.firstChild.textContent='FINAL '+sample.trimEnd.toFixed(2)+' s';duration.textContent=(sample.trimEnd-sample.trimStart).toFixed(2)+' s seleccionados / '+sample.buffer.duration.toFixed(2)+' s';});
    startLabel.append(start);endLabel.append(end);trim.append(startLabel,endLabel);row.append(trim);
    host.appendChild(row);
  }
}

async function playPreview(sample) {
  try {
    await resume();
    if (previewSource) { try { previewSource.stop(); } catch {} }
    const ctx = getContext();
    previewSource = ctx.createBufferSource();
    previewSource.buffer = sample.buffer;
    previewSource.connect(ctx.destination);
    previewSource.start(0,sample.trimStart,Math.max(.02,sample.trimEnd-sample.trimStart));
    previewSource.onended = () => { previewSource = null; };
  } catch (error) {
    console.error(error);
    toast('No se pudo reproducir el sample');
  }
}

async function placeSample(sample) {
  let track = state.tracks.find((item) => item.id === state.selectedTrackId);
  if (!track) track = state.tracks.find((item) => item.kind === 'audio');
  if (!track) track = createTrack('audio', 'Samples');
  addClip(track.id, {
    startSec: Math.max(0, state.playhead),
    lengthSec: Math.max(.02,sample.trimEnd-sample.trimStart),
    sourceOffsetSec: sample.trimStart,
    kind: 'audio',
    name: sample.name,
    blob: sample.blob,
    audioBuffer: sample.buffer,
  });
  refreshAll();
  await saveProject();
  toast('Sample añadido a ' + track.name);
}
