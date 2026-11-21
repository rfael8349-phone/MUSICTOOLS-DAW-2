// Entry point — wires UI to modules, boots the app.

import { state, createTrack } from './state.js';
import { getContext, resume, updateChannel } from './audio-engine.js';
import * as transport from './transport.js';
import * as playlist from './playlist.js';
import { saveProject, loadProject } from './storage.js';

let micGranted = false;

async function boot() {
  // Restore previous session (metadata only)
  const hadSaved = await loadProject();

  // If nothing saved, seed a demo track
  if (state.tracks.length === 0) {
    createTrack('audio', 'Guitar 1');
    createTrack('audio', 'Guitar 2');
  }

  // Sync UI
  document.getElementById('tempo-val').textContent = state.bpm;
  document.getElementById('display-sig').textContent = state.timeSig.join('/');
  document.getElementById('btn-metro').classList.toggle('active', state.metronome);
  document.getElementById('playlist-zoom').value = state.zoom;
  document.getElementById('btn-snap').dataset.on = state.snap ? '1' : '0';

  // Mount playlist
  playlist.mount();

  // Transport buttons
  document.getElementById('btn-play').addEventListener('click', () => {
    if (state.isPlaying) transport.pause();
    else transport.play();
  });
  document.getElementById('btn-stop').addEventListener('click', () => transport.stop());
  document.getElementById('btn-rewind').addEventListener('click', () => transport.rewind());
  document.getElementById('btn-rec').addEventListener('click', () => {
    if (state.isRecording) transport.stopRecord();
    else transport.startRecord();
  });
  document.getElementById('btn-metro').addEventListener('click', () => transport.toggleMetronome());
  document.getElementById('btn-save').addEventListener('click', () => {
    saveProject();
    transport.toast('Project saved');
  });

  // Tempo click-to-edit
  document.getElementById('display-tempo').addEventListener('click', () => {
    const v = prompt('BPM (30–300):', state.bpm);
    if (v) transport.setTempo(parseInt(v, 10));
  });
  document.getElementById('display-sig').addEventListener('click', () => {
    const v = prompt('Time signature (e.g. 4/4):', state.timeSig.join('/'));
    if (v) {
      const parts = v.split('/').map(Number);
      if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
        transport.setTimeSig(parts[0], parts[1]);
        document.getElementById('display-sig').textContent = `${parts[0]}/${parts[1]}`;
      }
    }
  });

  // Bottom navigation
  for (const btn of document.querySelectorAll('.nav-btn')) {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.view').forEach((v) => {
        v.classList.toggle('active', v.dataset.view === target);
      });
      if (target === 'playlist') playlist.refreshAll();
    });
  }

  // Mic gate (triggered on first record attempt)
  document.getElementById('btn-enable-mic').addEventListener('click', async () => {
    document.getElementById('mic-gate').classList.add('hidden');
    micGranted = true;
    // User already clicked — recording will proceed
    try {
      await resume();
      getContext();
    } catch (e) {
      transport.toast('Audio engine failed to start');
    }
  });
  document.getElementById('btn-cancel-mic').addEventListener('click', () => {
    document.getElementById('mic-gate').classList.add('hidden');
  });

  // Save periodically
  setInterval(saveProject, 10000);

  // Show a friendly note
  transport.toast(hadSaved ? 'Project restored from local save' : 'Welcome — press ● to record');

  // Register service worker (PWA)
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('service-worker.js'); } catch {}
  }

  // Boot the audio context on first interaction (mobile autoplay rules)
  const wake = async () => {
    try { await resume(); } catch {}
    document.removeEventListener('pointerdown', wake);
    document.removeEventListener('touchstart', wake);
  };
  document.addEventListener('pointerdown', wake, { once: true });
  document.addEventListener('touchstart', wake, { once: true });
}

document.addEventListener('DOMContentLoaded', boot);

// --- Microphone permission UX hook ---
// The first time the user taps Record we surface the gate. After that the
// browser's own prompt governs. This is a nicety, not required.
const origStartRecord = transport.startRecord;