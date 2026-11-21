// Microphone capture using getUserMedia + AudioWorklet (fallback ScriptProcessor).
// Records into an array of Float32Array chunks and, on stop, produces a Blob
// (WAV) plus a decoded AudioBuffer for the audio engine.

import { getContext, decodeAudio } from './audio-engine.js';

let stream = null;
let sourceNode = null;
let workletNode = null;
let scriptNode = null;
let monitorGain = null;
let captureGain = null;
let chunks = [];
let recording = false;
let acceptingChunks = false;
let workletStopResolver = null;
let sampleRate = 48000;

const WORKLET_URL = new URL('./worklets/recorder-processor.js', import.meta.url);
let workletReady = false;

export async function requestMic() {
  if (stream) return stream;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('getUserMedia not supported on this browser');
  }
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
    video: false,
  });
  return stream;
}

export function hasMic() { return !!stream; }
export function getStream() { return stream; }

export async function startRecording({ monitor = true, inputGainDb = 0 } = {}) {
  const ctx = getContext();
  await ctx.resume();
  await requestMic();
  sampleRate = ctx.sampleRate;
  chunks = [];
  recording = true;
  acceptingChunks = true;

  sourceNode = ctx.createMediaStreamSource(stream);

  // monitoring path (optional; user can hear themselves)
  monitorGain = ctx.createGain();
  monitorGain.gain.value = monitor ? 0.5 : 0;
  sourceNode.connect(monitorGain);
  monitorGain.connect(ctx.destination);

  // Dedicated input gain affects the recorded signal, not the monitor volume.
  captureGain = ctx.createGain();
  captureGain.gain.value = Math.pow(10, Math.max(-12, Math.min(12, Number(inputGainDb) || 0)) / 20);
  sourceNode.connect(captureGain);

  // capture path
  if (ctx.audioWorklet) {
    try {
      if (!workletReady) {
        await ctx.audioWorklet.addModule(WORKLET_URL);
        workletReady = true;
      }
      workletNode = new AudioWorkletNode(ctx, 'recorder-processor', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1 });
      workletNode.port.onmessage = (e) => {
        if (e.data instanceof Float32Array && acceptingChunks) chunks.push(e.data);
        if (e.data && e.data.type === 'stopped' && workletStopResolver) workletStopResolver();
      };
      captureGain.connect(workletNode);
      return { mode: 'worklet' };
    } catch (err) {
      console.warn('AudioWorklet unavailable, falling back', err);
    }
  }

  // Fallback: ScriptProcessor
  const bufSize = 4096;
  scriptNode = ctx.createScriptProcessor(bufSize, 1, 1);
  scriptNode.onaudioprocess = (ev) => {
    if (!recording) return;
    const inp = ev.inputBuffer.getChannelData(0);
    const copy = new Float32Array(inp.length);
    copy.set(inp);
    chunks.push(copy);
  };
  captureGain.connect(scriptNode);
  const silent = ctx.createGain(); silent.gain.value = 0;
  scriptNode.connect(silent); silent.connect(ctx.destination);
  return { mode: 'scriptprocessor' };
}

export function setMonitor(on) {
  if (monitorGain) monitorGain.gain.value = on ? 0.5 : 0;
}

export async function stopRecording() {
  recording = false;
  if (workletNode) {
    // Drain audio-thread messages before closing the port; otherwise the final blocks can be lost.
    await new Promise((resolve) => {
      const timeout = setTimeout(() => { workletStopResolver = null; resolve(); }, 300);
      workletStopResolver = () => { clearTimeout(timeout); workletStopResolver = null; resolve(); };
      try { workletNode.port.postMessage({ cmd: 'stop' }); } catch { clearTimeout(timeout); workletStopResolver = null; resolve(); }
    });
    acceptingChunks = false;
    try { workletNode.disconnect(); } catch {}
    workletNode = null;
  }
  acceptingChunks = false;
  if (scriptNode) {
    try { scriptNode.disconnect(); } catch {}
    scriptNode = null;
  }
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch {}
    sourceNode = null;
  }
  if (captureGain) {
    try { captureGain.disconnect(); } catch {}
    captureGain = null;
  }
  if (monitorGain) {
    try { monitorGain.disconnect(); } catch {}
    monitorGain = null;
  }

  if (chunks.length === 0) {
    return { wavBlob: null, audioBuffer: null, peaks: null };
  }

  const totalLen = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(totalLen);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  chunks = [];

  const wavBlob = encodeWav(merged, sampleRate);
  const arrayBuffer = await wavBlob.arrayBuffer();
  let audioBuffer = null;
  try {
    audioBuffer = await decodeAudio(arrayBuffer);
  } catch (e) {
    console.error('decode failed', e);
  }

  return { wavBlob, audioBuffer, peaks: null, duration: totalLen / sampleRate };
}

export function encodeWav(samples, sr) {
  const numSamples = samples.length;
  const buf = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buf);
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);
  let peak = 0;
  for (let i = 0; i < numSamples; i++) peak = Math.max(peak, Math.abs(samples[i]));
  // Preserve headroom if digital input gain produces samples outside full scale.
  const scale = peak > 0.98 ? 0.98 / peak : 1;
  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] * scale));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    off += 2;
  }
  return new Blob([view], { type: 'audio/wav' });
}

function writeStr(view, off, s) {
  for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
}