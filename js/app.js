// Entry point — connect controls before restoring saved data.
import { state, createTrack } from './state.js';
import * as transport from './transport.js';
import * as playlist from './playlist.js';
import { saveProject, loadProject } from './storage.js';
import { resume, preloadInstrumentSamples } from './audio-engine.js';
import { mountSamples } from './samples.js';
import { mountStudio, setInstrumentView } from './studio.js';
import { mountCreative } from './creative.js';
import { mountLaunchpad } from './launchpad.js';
import { mountTools } from './tools.js';

const byId = (id) => document.getElementById(id);

function wireTransport() {
  byId('btn-play').addEventListener('click', () => {
    if (state.isRecording) transport.stopRecord().catch((err) => showBootError(err));
    else if (state.isPlaying) transport.pause();
    else transport.play().catch((err) => showBootError(err));
  });
  byId('btn-stop').addEventListener('click', () => transport.stop());
  byId('btn-rewind').addEventListener('click', () => transport.rewind());
  byId('btn-rec').addEventListener('click', () => {
    if (state.isRecording) transport.stopRecord();
    else transport.startRecord();
  });
  byId('btn-metro').addEventListener('click', () => transport.toggleMetronome());
  byId('btn-undo').addEventListener('click', () => playlist.undoEdit());
  byId('btn-redo').addEventListener('click', () => playlist.redoEdit());
  const lightButton=byId('btn-lightbar');
  const lightStatus=document.querySelector('.beat-status');
  const lightOn=localStorage.getItem('musictool-lightbar')!=='off';
  if(lightStatus)lightStatus.hidden=!lightOn;
  if(lightButton){lightButton.classList.toggle('active',lightOn);lightButton.setAttribute('aria-pressed',String(lightOn));lightButton.addEventListener('click',()=>{const on=lightButton.getAttribute('aria-pressed')!=='true';lightButton.setAttribute('aria-pressed',String(on));lightButton.classList.toggle('active',on);if(lightStatus)lightStatus.hidden=!on;localStorage.setItem('musictool-lightbar',on?'on':'off');});}
  byId('btn-save').addEventListener('click', async () => {
    try { await saveProject(); transport.toast('Project saved'); }
    catch (err) { showBootError(err); }
  });
  byId('display-tempo').addEventListener('click', () => {
    const v = prompt('BPM (30–300):', state.bpm);
    if (v) transport.setTempo(parseInt(v, 10));
  });
  byId('display-sig').addEventListener('click', () => {
    const v = prompt('Time signature (e.g. 4/4):', state.timeSig.join('/'));
    if (v) {
      const parts = v.split('/').map(Number);
      if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
        transport.setTimeSig(parts[0], parts[1]);
        byId('display-sig').textContent = parts.join('/');
      }
    }
  });
}

function wireNavigation() {
  for (const btn of document.querySelectorAll('.nav-btn')) {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      setInstrumentView(target);
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === target));
      if (target === 'playlist') playlist.refreshAll();
      if (target === 'samples') mountSamples();
      if (target === 'mixer') playlist.renderMixer();
    });
  }
}

function syncUI() {
  byId('tempo-val').textContent = state.bpm;
  byId('display-sig').textContent = state.timeSig.join('/');
  byId('btn-metro').classList.toggle('active', state.metronome);
  byId('playlist-zoom').value = state.zoom;
  byId('btn-snap').dataset.on = state.snap ? '1' : '0';
}

function showBootError(err) {
  console.error('MUSICTOOL runtime error:', err);
  const message = err?.message || String(err);
  transport.toast('Error: ' + message.slice(0, 90));
}

async function boot() {
  // Critical controls are wired synchronously, before any storage/network wait.
  wireTransport();
  wireNavigation();

  const wake = async () => {
    try { await resume(); } catch (err) { console.warn('Audio resume:', err); }
  };
  document.addEventListener('pointerdown', wake, { once: true });
  document.addEventListener('touchstart', wake, { once: true });

  let hadSaved = false;
  let loadPromise;
  try {
    loadPromise = loadProject();
    // Do not let a slow or unavailable IndexedDB freeze the whole interface.
    hadSaved = await Promise.race([
      loadPromise,
      new Promise((resolve) => setTimeout(() => resolve(false), 2500))
    ]);
    if (loadPromise) loadPromise.then((restored) => {
      if (restored) {
        syncUI();
        playlist.refreshAll();
      }
    }).catch(showBootError);
  } catch (err) {
    showBootError(err);
  }

  if (state.tracks.length === 0) {
    const first = createTrack('audio', 'Guitar 1');
    createTrack('audio', 'Guitar 2');
    state.selectedTrackId = first.id;
  } else if (!state.selectedTrackId || !state.tracks.some((t) => t.id === state.selectedTrackId)) {
    state.selectedTrackId = state.tracks.find((t) => t.kind === 'audio')?.id || state.tracks[0].id;
  }

  try {
    syncUI();
    playlist.mount();
    mountStudio();
    mountCreative();
    mountLaunchpad();
    mountTools();
    playlist.renderMixer();
  } catch (err) {
    showBootError(err);
  }

  // Save in the background; storage failures must not break the controls.
  setInterval(() => saveProject().catch(showBootError), 10000);
  transport.toast(hadSaved ? 'Project restored' : 'MUSICTOOL ready');
  preloadInstrumentSamples().then(({ready,total})=>{console.info('MUSICTOOL audio bank ready',ready+'/'+total);transport.toast(ready===total?'Banco de instrumentos listo · muestras guardadas':'Banco parcial '+ready+'/'+total+' · conecta internet y recarga');}).catch(err=>{console.warn('Sample preload:',err);transport.toast('No se pudo descargar el banco de sonidos');});

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js?v=7.2.0',{updateViaCache:'none'}).catch((err) => console.warn('Service worker:', err));
  }
}

window.addEventListener('error', (event) => showBootError(event.error || event.message));
window.addEventListener('unhandledrejection', (event) => showBootError(event.reason));
document.addEventListener('DOMContentLoaded', () => {
  boot().catch(showBootError);
});
