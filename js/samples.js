// V5.3 sample browser: import, preview and place audio files on the playlist.
import { state, createTrack, addClip } from './state.js';
import { decodeAudio, getContext, resume } from './audio-engine.js';
import { saveProject } from './storage.js';
import { refreshAll } from './playlist.js';
import { toast } from './transport.js';

let samples = [];
let previewSource = null;

export function mountSamples() {
  const picker = document.getElementById('sample-file');
  if (!picker) return;
  picker.addEventListener('change', async () => {
    const files = Array.from(picker.files || []);
    for (const file of files) {
      if (!file.type.startsWith('audio/') && !/\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(file.name)) continue;
      try {
        const buffer = await decodeAudio(await file.arrayBuffer());
        samples.push({ id: 'sample_' + Date.now().toString(36) + '_' + samples.length, name: file.name, blob: file, buffer });
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
    duration.textContent = sample.buffer.duration.toFixed(2) + ' s';
    info.append(name, duration);
    const preview = document.createElement('button');
    preview.className = 'btn';
    preview.type = 'button';
    preview.textContent = '▶';
    preview.title = 'Escuchar sample';
    preview.addEventListener('click', () => playPreview(sample));
    const add = document.createElement('button');
    add.className = 'btn accent';
    add.type = 'button';
    add.textContent = '+ PISTA';
    add.addEventListener('click', () => placeSample(sample));
    row.append(info, preview, add);
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
    previewSource.start();
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
    lengthSec: sample.buffer.duration,
    kind: 'audio',
    name: sample.name,
    blob: sample.blob,
    audioBuffer: sample.buffer,
  });
  refreshAll();
  await saveProject();
  toast('Sample añadido a ' + track.name);
}
