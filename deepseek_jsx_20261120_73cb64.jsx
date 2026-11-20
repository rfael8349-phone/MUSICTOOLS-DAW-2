const { useRef, useState, useEffect } = React;
const create = window.zustand.create;

const nanoid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

const beatToSec = (beat, bpm) => (beat / bpm) * 60;
const beatToBarBeat = (beat, num) => {
  const bar = Math.floor(beat / num) + 1;
  const b = Math.floor(beat % num) + 1;
  return [bar, b];
};
const formatTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") + "." + String(ms).padStart(3, "0");
};

const PALETTE = ["#4cc9f0", "#f72585", "#7209b7", "#3a0ca3", "#f8961e", "#90be6d", "#43aa8b", "#e63946"];

function newProject() {
  return {
    id: nanoid(),
    name: "Untitled",
    bpm: 120,
    timeSigNum: 4,
    timeSigDen: 4,
    sampleRate: 48000,
    tracks: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const useProjectStore = create((set, get) => ({
  project: newProject(),
  actions: {
    setProjectName: (name) => set((s) => ({ project: { ...s.project, name, updatedAt: Date.now() } })),
    setBpm: (bpm) => set((s) => ({ project: { ...s.project, bpm, updatedAt: Date.now() } })),
    addTrack: (kind, name) => {
      const p = get().project;
      const color = PALETTE[p.tracks.length % PALETTE.length];
      const t = {
        id: nanoid(),
        name: name || (kind[0].toUpperCase() + kind.slice(1) + " " + (p.tracks.length + 1)),
        kind, color, volume: 0.85, pan: 0, muted: false, soloed: false, armed: false, clips: [],
      };
      set((s) => ({ project: { ...s.project, tracks: [...s.project.tracks, t], updatedAt: Date.now() } }));
      return t;
    },
    removeTrack: (id) => set((s) => ({
      project: { ...s.project, tracks: s.project.tracks.filter((t) => t.id !== id), updatedAt: Date.now() },
    })),
    updateTrack: (id, patch) => set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        updatedAt: Date.now(),
      },
    })),
    addClip: (trackId, clip) => set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t)),
        updatedAt: Date.now(),
      },
    })),
    updateClip: (trackId, clipId, patch) => set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) =>
          t.id === trackId ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) } : t
        ),
        updatedAt: Date.now(),
      },
    })),
    removeClip: (trackId, clipId) => set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) =>
          t.id === trackId ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t
        ),
        updatedAt: Date.now(),
      },
    })),
    loadProject: (p) => set({ project: p }),
  },
}));

const useTransportStore = create((set) => ({
  playing: false,
  recording: false,
  looping: false,
  loopStart: 0,
  loopEnd: 16,
  playheadBeat: 0,
  setPlaying: (playing) => set({ playing }),
  setRecording: (recording) => set({ recording }),
  setPlayhead: (playheadBeat) => set({ playheadBeat }),
  setLoop: (loopStart, loopEnd) => set({ loopStart, loopEnd }),
  toggleLoop: () => set((s) => ({ looping: !s.looping })),
}));

const useUIStore = create((set) => ({
  selectedTrackId: null,
  selectedClipId: null,
  pixelsPerBeat: 40,
  editorView: "timeline",
  activeMidiClipId: null,
  selectTrack: (id) => set({ selectedTrackId: id }),
  selectClip: (id) => set({ selectedClipId: id }),
  setZoom: (px) => set({ pixelsPerBeat: Math.max(8, Math.min(120, px)) }),
  setView: (editorView) => set({ editorView }),
  openMidiClip: (trackId, clipId) => set({ editorView: "pianoroll", selectedTrackId: trackId, activeMidiClipId: clipId }),
  closeMidiClip: () => set({ editorView: "timeline", activeMidiClipId: null }),
}));