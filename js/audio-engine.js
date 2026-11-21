// Core Web Audio graph. One AudioContext for the whole app.
// Handles: master gain, metronome, per-track channel strips, scheduling.

import { state, isAudible } from './state.js';

let ctx = null;
let master = null;
let metronomeGain = null;
let clickBuffer = null;
let activeSources = [];     // { source, gain, startTime, clipId, trackId }

export function getContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = Number.isFinite(state.masterVolume) ? state.masterVolume : 0.9;
    master.connect(ctx.destination);

    metronomeGain = ctx.createGain();
    metronomeGain.gain.value = 0.5;
    metronomeGain.connect(master);

    clickBuffer = makeClickBuffer(ctx);

    // create channel strips for existing tracks
    for (const t of state.tracks) ensureChannel(t.id);
  }
  return ctx;
}

export function setMasterVolume(value) {
  state.masterVolume = Math.max(0, Math.min(1.5, Number(value) || 0));
  getContext();
  master.gain.value = state.masterVolume;
}

export function getMasterGain() {
  getContext();
  return master;
}

export async function resume() {
  const c = getContext();
  if (c.state === 'suspended') await c.resume();
  return c.state;
}

// per-track channel graph: source -> gain(volume) -> panner -> master
const channels = new Map();

export function ensureChannel(trackId) {
  getContext();
  if (channels.has(trackId)) return channels.get(trackId);
  const gain = ctx.createGain();
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (panner) {
    gain.connect(panner);
    panner.connect(master);
  } else {
    gain.connect(master);
  }
  const ch = { gain, panner };
  channels.set(trackId, ch);
  return ch;
}

export function removeChannel(trackId) {
  const ch = channels.get(trackId);
  if (ch) {
    try { ch.gain.disconnect(); } catch {}
    if (ch.panner) try { ch.panner.disconnect(); } catch {}
    channels.delete(trackId);
  }
}

export function updateChannel(track) {
  const ch = ensureChannel(track.id);
  ch.gain.gain.value = track.volume;
  if (ch.panner) ch.panner.pan.value = track.pan;
}

// --- metronome click ---
function makeClickBuffer(c) {
  const dur = 0.05;
  const sr = c.sampleRate;
  const buf = c.createBuffer(1, Math.floor(sr * dur), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] = Math.sin(2 * Math.PI * 1000 * t) * Math.exp(-t * 60);
  }
  return buf;
}

export function playClick(when, accent = false) {
  getContext();
  const src = ctx.createBufferSource();
  src.buffer = clickBuffer;
  const g = ctx.createGain();
  g.gain.value = accent ? 1.0 : 0.6;
  src.connect(g); g.connect(metronomeGain);
  src.start(when);
}

// --- clip playback scheduling ---
// Schedule all clips that start within [fromSec, fromSec + windowSec)
export function schedulePlayback(fromSec, windowSec = 30) {
  getContext();
  stopAll();
  const now = ctx.currentTime;
  const t0 = now + 0.05;

  for (const track of state.tracks) {
    if (!isAudible(track)) continue;
    const ch = ensureChannel(track.id);
    for (const clip of track.clips) {
      const clipStart = clip.startSec;
      const clipEnd = clip.startSec + clip.lengthSec;
      if (clipEnd <= fromSec) continue;
      if (clipStart >= fromSec + windowSec) continue;
      scheduleClip(track, clip, ch, fromSec, t0);
    }
  }
}

async function scheduleClip(track, clip, ch, fromSec, t0) {
  if (clip.kind !== 'audio' || !clip.audioBuffer) return;
  const when = t0 + Math.max(0, clip.startSec - fromSec);
  const offset = Math.max(0, fromSec - clip.startSec) + (clip.sourceOffsetSec || 0);
  const duration = Math.min(clip.lengthSec - Math.max(0, fromSec - clip.startSec), clip.audioBuffer.duration - offset);
  if (duration <= 0) return;

  const src = ctx.createBufferSource();
  src.buffer = clip.audioBuffer;
  const g = ctx.createGain();
  g.gain.value = 1.0;
  src.connect(g); g.connect(ch.gain);
  src.start(when, offset, duration);

  const entry = { source: src, gain: g, startTime: when, clipId: clip.id, trackId: track.id };
  src.onended = () => {
    const i = activeSources.indexOf(entry);
    if (i >= 0) activeSources.splice(i, 1);
  };
  activeSources.push(entry);
}

export function stopAll() {
  for (const e of activeSources) {
    try { e.source.stop(); } catch {}
    try { e.gain.disconnect(); } catch {}
  }
  activeSources = [];
}

// Decode audio data into an AudioBuffer
export async function decodeAudio(arrayBuffer) {
  getContext();
  return await ctx.decodeAudioData(arrayBuffer.slice(0));
}

// Compute peaks for waveform display
export function computePeaks(buffer, buckets = 200) {
  const ch = buffer.getChannelData(0);
  const per = Math.floor(ch.length / buckets) || 1;
  const peaks = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const start = i * per;
    const end = Math.min(start + per, ch.length);
    for (let j = start; j < end; j++) {
      const v = Math.abs(ch[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

// Current transport time in seconds (0 == song start)
export function nowSec() {
  getContext();
  return ctx.currentTime;
}