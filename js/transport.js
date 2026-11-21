// Transport controls: play / stop / record / rewind, metronome and count-in.

import { state } from './state.js';
import {
  getContext, resume, schedulePlayback, stopAll, playClick, nowSec
} from './audio-engine.js';
import { requestMic, startRecording, stopRecording } from './recorder.js';
import { onTransportTick, renderPlayhead } from './playlist.js';
import { saveProject } from './storage.js';

let schedulerTimer = null;
let recordStartSec = 0;
let recordArmedTrack = null;
let localRecTimer = null;
let recordStarting = false;
let recordStartToken = 0;

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
  if (state.metronome && !recordStarting) scheduleMetronome(startFrom);

  const audioStart = nowSec();
  schedulerTimer = setInterval(() => {
    const elapsed = nowSec() - audioStart;
    state.playhead = startFrom + elapsed;
    onTransportTick(state.playhead);
  }, 20);
}

export function pause() {
  if (recordStarting) recordStartToken++;
  if (!state.isPlaying) return;
  state.isPlaying = false;
  stopAll();
  stopMetronome();
  if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
  if (playBtn()) {
    playBtn().textContent = '▶';
    playBtn().classList.remove('active');
  }
}

export function stop() {
  if (recordStarting) recordStartToken++;
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

// ---- Record with one-bar count-in ----
// The backing track starts immediately. Four metronome beats are counted
// while it plays; microphone capture begins on the next bar.
export async function startRecord() {
  if (state.isRecording || recordStarting) return;
  // Destination priority: explicitly armed track, selected audio track, then first audio track.
  // Lock the destination ID before any async permission/count-in work begins.
  const armedTrack = state.tracks.find((t) => t.armed && t.kind === 'audio');
  const selectedTrack = state.tracks.find((t) => t.id === state.selectedTrackId && t.kind === 'audio');
  const track = armedTrack || selectedTrack || state.tracks.find((t) => t.kind === 'audio');
  if (!track) {
    toast('Arm an audio track first');
    return;
  }

  recordArmedTrack = track;
  state.recordArmedTrackId = track.id;
  recordStarting = true;
  const startToken = ++recordStartToken;
  recBtn().classList.add('counting-in');
  recBtn().title = 'Count-in…';

  let startedTransportHere = false;
  try {
    // Request permission immediately from the Record tap, before other awaits.
    const micPermission = requestMic();
    const audioReady = resume();
    await Promise.all([micPermission, audioReady]);

    if (!state.isPlaying) {
      await play();
      startedTransportHere = true;
    }

    const ctx = getContext();
    const beats = 4;
    const beatDuration = 60 / state.bpm;
    const firstClick = ctx.currentTime + 0.06;

    // Schedule the count-in against the Web Audio clock, not setInterval.
    for (let i = 0; i < beats; i++) {
      playClick(firstClick + i * beatDuration, i === 0);
    }

    await new Promise((resolve) => setTimeout(resolve, beats * beatDuration * 1000));
    if (startToken !== recordStartToken || !state.isPlaying) return;

    // The backing track has continued throughout the four-beat count-in.
    // Recording uses count-in only; the continuous metronome stays off.
    await startRecording({ monitor: true, inputGainDb: state.inputGainDb ?? 0 });
    if (startToken !== recordStartToken || !state.isPlaying) {
      await stopRecording();
      return;
    }
    recordStartSec = state.playhead;
    state.isRecording = true;
    recBtn().classList.add('active');

    localRecTimer = setInterval(() => {
      if (timeEl()) timeEl().textContent = fmtTime(state.playhead);
    }, 50);
    toast('Recording started');
  } catch (err) {
    console.error('Record start failed:', err);
    if (startedTransportHere) pause();
    toast(err?.message?.includes('getUserMedia') ? 'Microphone permission required' : 'Could not start recording');
  } finally {
    recordStarting = false;
    recBtn().classList.remove('counting-in');
    recBtn().title = 'Record';
  }
}

export async function stopRecord() {
  if (!state.isRecording) return;
  state.isRecording = false;
  recBtn().classList.remove('active');
  if (localRecTimer) { clearInterval(localRecTimer); localRecTimer = null; }

  const result = await stopRecording();
  const stopSec = state.playhead;
  pause();

  if (!result.wavBlob || !result.audioBuffer) {
    toast('No audio captured');
    return;
  }

  const lengthSec = result.audioBuffer.duration;
  const targetTrack = state.tracks.find((t) => t.id === state.recordArmedTrackId);
  if (!targetTrack) {
    recordArmedTrack = null;
    state.recordArmedTrackId = null;
    toast('Recording track no longer exists');
    return;
  }

  const clip = {
    id: 'clip_' + Date.now().toString(36),
    startSec: recordStartSec,
    lengthSec,
    kind: 'audio',
    blob: result.wavBlob,
    audioBuffer: result.audioBuffer,
    name: 'Take',
  };
  targetTrack.clips.push(clip);
  recordArmedTrack = null;
  state.recordArmedTrackId = null;

  onTransportTick(stopSec);
  const { refreshAll } = await import('./playlist.js');
  refreshAll();
  await saveProject();
  toast(`Recorded ${lengthSec.toFixed(1)}s on "${targetTrack.name}"`);
}

// ---- Metronome ----
let metroTimer = null;
let nextClickTime = 0;

export function toggleMetronome() {
  state.metronome = !state.metronome;
  document.getElementById('btn-metro').classList.toggle('active', state.metronome);
  if (state.metronome && state.isPlaying && !state.isRecording && !recordStarting) scheduleMetronome(state.playhead);
  if (!state.metronome || state.isRecording || recordStarting) stopMetronome();
}

function scheduleMetronome(fromSec) {
  stopMetronome();
  const ctx = getContext();
  const beatDur = 60 / state.bpm;
  const beatsPerBar = Math.max(1, Number(state.timeSig?.[0]) || 4);
  let beat = Math.ceil(fromSec / beatDur);
  const t0 = ctx.currentTime;
  nextClickTime = t0 + Math.max(0, beat * beatDur - fromSec);

  metroTimer = setInterval(() => {
    const ctx2 = getContext();
    while (nextClickTime < ctx2.currentTime + 0.15) {
      playClick(nextClickTime, (beat % beatsPerBar) === 0);
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
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2400);
}
