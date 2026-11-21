// Transport controls: play / stop / record / rewind, metronome, tempo,
// count-in. Owns the scheduler loop.

import { state } from './state.js';
import {
  getContext, resume, schedulePlayback, stopAll, playClick, nowSec
} from './audio-engine.js';
import { startRecording, stopRecording } from './recorder.js';
import { onTransportTick, renderPlayhead } from './playlist.js';
import { saveProject } from './storage.js';

let schedulerTimer = null;
let recordStartSec = 0;
let recordArmedTrack = null;
let localRecTimer = null;

const bpmEl = () => document.getElementById('tempo-val');
const timeEl = () => document.getElementById('display-time');
const playBtn = () => document.getElementById('btn-play');
const recBtn = () => document.getElementById('btn-rec');

export function setTempo(bpm) {
  state.bpm = Math.max(30, Math.min(300, Math.round(bpm)));
  if (bpmEl()) bpmEl().textContent = state.bpm;
  saveProject();
}

export function setTimeSig(num, den) {
  state.timeSig = [num, den];
  saveProject();
}

export async function play() {
  if (state.isPlaying) return;
  await resume();
  getContext();
  state.isPlaying = true;
  playBtn().textContent = '⏸';
  playBtn().classList.add('active');

  const startFrom = state.playhead;
  schedulePlayback(startFrom, 300);
  scheduleMetronome(startFrom);

  const ctx = getContext();
  const ctxStart = ctx.currentTime;
  const audioStart = nowSec();

  schedulerTimer = setInterval(() => {
    const elapsed = nowSec() - audioStart;
    state.playhead = startFrom + elapsed;
    onTransportTick(state.playhead);
  }, 30);
}

export function pause() {
  if (!state.isPlaying) return;
  state.isPlaying = false;
  stopAll();
  stopMetronome();
  if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
  playBtn().textContent = '▶';
  playBtn().classList.remove('active');
}

export function stop() {
  pause();
  if (state.isRecording) stopRecord();
  state.playhead = 0;
  onTransportTick(0);
  renderPlayhead(0);
  if (timeEl()) timeEl().textContent = '00:00.0';
}

export function rewind() {
  state.playhead = 0;
  onTransportTick(0);
  renderPlayhead(0);
  if (state.isPlaying) { pause(); play(); }
}

// ---- Record ----
export async function startRecord() {
  if (state.isRecording) return;
  const track = state.tracks.find((t) => t.armed) || state.tracks.find((t) => t.kind === 'audio');
  if (!track) {
    toast('Arm an audio track first');
    return;
  }
  try {
    await resume();
    await startRecording({ monitor: true });
  } catch (err) {
    toast('Microphone access denied');
    return;
  }

  recordArmedTrack = track;
  state.recordArmedTrackId = track.id;
  state.isRecording = true;
  recBtn().classList.add('active');

  // start transport at current playhead
  await play();
  recordStartSec = state.playhead;

  // update time display frequently
  localRecTimer = setInterval(() => {
    if (timeEl()) timeEl().textContent = fmtTime(state.playhead);
  }, 50);
}

export async function stopRecord() {
  if (!state.isRecording) return;
  state.isRecording = false;
  recBtn().classList.remove('active');
  if (localRecTimer) { clearInterval(localRecTimer); localRecTimer = null; }

  const stopSec = state.playhead;
  const result = await stopRecording();
  pause();

  if (!result.wavBlob || !result.audioBuffer) {
    toast('No audio captured');
    return;
  }

  const lengthSec = result.audioBuffer.duration;
  const startSec = recordStartSec;

  // insert clip into armed track
  const clip = {
    id: 'clip_' + Date.now().toString(36),
    startSec,
    lengthSec,
    kind: 'audio',
    blob: result.wavBlob,
    audioBuffer: result.audioBuffer,
    name: 'Take',
  };
  recordArmedTrack.clips.push(clip);

  // update UI
  onTransportTick(state.playhead);
  const { refreshAll } = await import('./playlist.js');
  refreshAll();
  await saveProject();
  toast(`Recorded ${lengthSec.toFixed(1)}s on "${recordArmedTrack.name}"`);
}

// ---- Metronome ----
let metroTimer = null;
let nextClickTime = 0;
let clickCount = 0;

export function toggleMetronome() {
  state.metronome = !state.metronome;
  document.getElementById('btn-metro').classList.toggle('active', state.metronome);
  if (state.metronome && state.isPlaying) scheduleMetronome(state.playhead);
  if (!state.metronome) stopMetronome();
}

function scheduleMetronome(fromSec) {
  getContext();
  stopMetronome();
  const ctx = getContext();
  const beatDur = 60 / state.bpm;
  const beatsPerBar = state.timeSig[0];
  const startBeat = Math.ceil(fromSec / beatDur);
  let beat = startBeat;
  const t0 = ctx.currentTime;
  const nextT = () => t0 + (beat * beatDur - fromSec);
  nextClickTime = nextT();
  clickCount = beat % beatsPerBar;

  metroTimer = setInterval(() => {
    const ctx2 = getContext();
    while (nextClickTime < ctx2.currentTime + 0.15) {
      const accent = (beat % beatsPerBar) === 0;
      try { playClick(nextClickTime, accent); } catch {}
      beat++;
      nextClickTime = t0 + (beat * beatDur - fromSec);
    }
  }, 40);
}

function stopMetronome() {
  if (metroTimer) { clearInterval(metroTimer); metroTimer = null; }
}

// ---- Helpers ----
export function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const t = Math.floor((sec * 10) % 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${t}`;
}

export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2400);
}