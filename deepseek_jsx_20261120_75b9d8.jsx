class AudioEngine {
  constructor() {
    this.ctx = null;
    this.trackNodes = new Map();
    this.sampleBuffers = new Map();
    this.scheduledSources = new Set();
    this.schedulerId = null;
    this.nextScheduleBeat = 0;
    this.startCtxTime = 0;
    this.startBeat = 0;
    this.playing = false;
    this.project = null;
    this.scheduledAudioClipIds = new Set();
    this.scheduledMidiNoteIds = new Set();
  }

  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
  }

  async resume() {
    this.ensureCtx();
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  setProject(project) {
    this.project = project;
    if (!this.ctx) return;
    this.reconcileTracks(project.tracks);
  }

  reconcileTracks(tracks) {
    const seen = new Set();
    for (const t of tracks) {
      seen.add(t.id);
      let node = this.trackNodes.get(t.id);
      if (!node) {
        const input = this.ctx.createGain();
        const gain = this.ctx.createGain();
        const pan = this.ctx.createStereoPanner();
        input.connect(gain).connect(pan).connect(this.master);
        node = { input, gain, pan };
        this.trackNodes.set(t.id, node);
      }
      node.gain.gain.value = t.volume;
      node.pan.pan.value = t.pan;
      const anySolo = tracks.some((x) => x.soloed);
      const effMute = anySolo ? !t.soloed : t.muted;
      node.gain.gain.value = effMute ? 0 : t.volume;
    }
    for (const [id, node] of this.trackNodes) {
      if (!seen.has(id)) {
        try { node.input.disconnect(); node.gain.disconnect(); node.pan.disconnect(); } catch (e) {}
        this.trackNodes.delete(id);
      }
    }
  }

  registerSample(id, buffer) { this.sampleBuffers.set(id, buffer); }
  getSample(id) { return this.sampleBuffers.get(id); }
  beatToTime(b) { return this.project ? (b / this.project.bpm) * 60 : 0; }
  timeToBeat(s) { return this.project ? (s * this.project.bpm) / 60 : 0; }

  midiSynth(note, when, dur, vel, out) {
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel * 0.22, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g).connect(out);
    osc.start(when);
    osc.stop(when + dur + 0.05);
    this.scheduledSources.add(osc);
    osc.onended = () => this.scheduledSources.delete(osc);
  }

  play(fromBeat) {
    if (!this.project || !this.ctx) return;
    this.playing = true;
    this.startBeat = fromBeat;
    this.startCtxTime = this.ctx.currentTime + 0.05;
    this.nextScheduleBeat = fromBeat;
    this.scheduledAudioClipIds.clear();
    this.scheduledMidiNoteIds.clear();
    if (this.schedulerId) clearInterval(this.schedulerId);
    this.schedulerId = setInterval(() => this.tick(), 25);
    this.tick();
  }

  stop() {
    this.playing = false;
    if (this.schedulerId) clearInterval(this.schedulerId);
    this.schedulerId = null;
    for (const src of this.scheduledSources) {
      try { src.stop(); } catch (e) {}
    }
    this.scheduledSources.clear();
    this.scheduledAudioClipIds.clear();
    this.scheduledMidiNoteIds.clear();
  }

  currentBeat() {
    if (!this.playing || !this.project) return this.startBeat;
    const elapsed = this.ctx.currentTime - this.startCtxTime;
    return this.startBeat + this.timeToBeat(elapsed);
  }

  tick() {
    if (!this.playing || !this.project) return;
    const horizonTime = this.ctx.currentTime + 0.15;
    const horizonBeat = this.startBeat + this.timeToBeat(horizonTime - this.startCtxTime);
    for (const track of this.project.tracks) {
      const node = this.trackNodes.get(track.id);
      if (!node) continue;
      for (const clip of track.clips) {
        const clipEnd = clip.startBeat + clip.lengthBeats;
        if (clipEnd <= this.nextScheduleBeat) continue;
        if (clip.startBeat >= horizonBeat) continue;
        if (track.kind === "audio") this.scheduleAudioClip(clip, node);
        else this.scheduleMidiClip(clip, node, horizonBeat);
      }
    }
    this.nextScheduleBeat = horizonBeat;
  }

  scheduleAudioClip(clip, node) {
    if (this.scheduledAudioClipIds.has(clip.id)) return;
    const buf = this.sampleBuffers.get(clip.bufferId);
    if (!buf) return;
    const clipStartCtx = this.startCtxTime + this.beatToTime(clip.startBeat - this.startBeat);
    this.scheduledAudioClipIds.add(clip.id);
    if (clipStartCtx < this.ctx.currentTime - 0.02) return;
    const clipLengthSec = this.beatToTime(clip.lengthBeats);
    const offsetSec = this.beatToTime(clip.offsetBeats);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = clip.gain;
    src.connect(gain).connect(node.input);
    src.start(clipStartCtx, offsetSec, clipLengthSec);
    src.stop(clipStartCtx + clipLengthSec + 0.05);
    this.scheduledSources.add(src);
    src.onended = () => this.scheduledSources.delete(src);
  }

  scheduleMidiClip(clip, node, horizonBeat) {
    for (const note of clip.notes) {
      const key = clip.id + ":" + note.id;
      if (this.scheduledMidiNoteIds.has(key)) continue;
      const absStart = clip.startBeat + note.startBeat;
      const absEnd = absStart + note.lengthBeats;
      if (absEnd <= this.nextScheduleBeat) continue;
      if (absStart >= horizonBeat) continue;
      this.scheduledMidiNoteIds.add(key);
      const when = this.startCtxTime + this.beatToTime(absStart - this.startBeat);
      const dur = this.beatToTime(note.lengthBeats);
      if (when < this.ctx.currentTime - 0.02) continue;
      this.midiSynth(note.pitch, when, dur, note.velocity, node.input);
    }
  }
}

const engine = new AudioEngine();

function encodeWAV(channels, sampleRate) {
  const numCh = channels.length;
  const len = channels[0].length;
  const buffer = new ArrayBuffer(44 + len * numCh * 2);
  const view = new DataView(buffer);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); view.setUint32(4, 36 + len * numCh * 2, true);
  ws(8, "WAVE"); ws(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true);
  ws(36, "data"); view.setUint32(40, len * numCh * 2, true);
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function decodeAudioFile(file, ctx) {
  const arr = await file.arrayBuffer();
  return await ctx.decodeAudioData(arr);
}

async function renderProjectToWav(project, sampleBuffers, durationBeats, sampleRate) {
  sampleRate = sampleRate || 48000;
  const durationSec = (durationBeats / project.bpm) * 60;
  const frames = Math.ceil((durationSec + 1) * sampleRate);
  const offline = new OfflineAudioContext(2, frames, sampleRate);
  const master = offline.createGain();
  master.connect(offline.destination);
  const trackNodes = new Map();
  const anySolo = project.tracks.some((t) => t.soloed);
  for (const t of project.tracks) {
    const g = offline.createGain();
    const p = offline.createStereoPanner();
    p.pan.value = t.pan;
    g.gain.value = (anySolo && !t.soloed) || (!anySolo && t.muted) ? 0 : t.volume;
    g.connect(p).connect(master);
    trackNodes.set(t.id, g);
  }
  for (const track of project.tracks) {
    const out = trackNodes.get(track.id);
    for (const clip of track.clips) {
      if (track.kind === "audio" && clip.bufferId) {
        const buf = sampleBuffers.get(clip.bufferId);
        if (!buf) continue;
        const src = offline.createBufferSource();
        src.buffer = buf;
        const cg = offline.createGain();
        cg.gain.value = clip.gain;
        src.connect(cg).connect(out);
        src.start((clip.startBeat / project.bpm) * 60, (clip.offsetBeats / project.bpm) * 60, (clip.lengthBeats / project.bpm) * 60);
      } else if (clip.notes) {
        for (const n of clip.notes) {
          const when = ((clip.startBeat + n.startBeat) / project.bpm) * 60;
          const dur = (n.lengthBeats / project.bpm) * 60;
          const freq = 440 * Math.pow(2, (n.pitch - 69) / 12);
          const osc = offline.createOscillator();
          const g = offline.createGain();
          osc.type = "sawtooth";
          osc.frequency.value = freq;
          g.gain.setValueAtTime(0, when);
          g.gain.linearRampToValueAtTime(n.velocity * 0.22, when + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
          osc.connect(g).connect(out);
          osc.start(when);
          osc.stop(when + dur + 0.05);
        }
      }
    }
  }
  const rendered = await offline.startRendering();
  return encodeWAV([rendered.getChannelData(0), rendered.getChannelData(1)], sampleRate);
}