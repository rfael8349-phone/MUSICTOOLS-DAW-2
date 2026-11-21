// Central application state. Everything here is persisted to localStorage
// (Stage 5 will migrate this to IndexedDB with versioned migrations).

export const DEFAULT_SIG = [4, 4];
export const DEFAULT_BPM = 120;

let _nextId = 1;
export function newId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${(_nextId++).toString(36)}`;
}

export const state = {
  projectId: newId('proj'),
  projectName: 'Untitled Project',
  bpm: DEFAULT_BPM,
  timeSig: [...DEFAULT_SIG],
  snap: true,
  zoom: 80,           // px per second
  selectedTrackId: null,
  selectedClipId: null,
  metronome: false,
  inputGainDb: 0,
  masterVolume: 0.9,
  // tracks: array of track objects. Audio clips hold a Blob (Float32 or encoded).
  tracks: [],         // see createTrack()
  // clips are stored per-track
  // playheadPosition in seconds
  playhead: 0,
  isPlaying: false,
  isRecording: false,
  recordArmedTrackId: null,
  version: 1,
};

export function createTrack(kind = 'audio', name = null) {
  const colors = [
    'var(--track-1)', 'var(--track-2)', 'var(--track-3)', 'var(--track-4)',
    'var(--track-5)', 'var(--track-6)', 'var(--track-7)', 'var(--track-8)'
  ];
  const idx = state.tracks.length;
  const track = {
    id: newId('trk'),
    kind,                       // 'audio' | 'midi' | 'drum'
    name: name || `${kind === 'audio' ? 'Audio' : kind === 'midi' ? 'MIDI' : 'Drum'} ${idx + 1}`,
    color: colors[idx % colors.length],
    volume: 1.0,
    pan: 0,
    mute: false,
    solo: false,
    armed: false,               // record-armed
    input: null,                // MediaStream for recording
    clips: [],                  // { id, startSec, lengthSec, blob?, peaks? , kind }
    takes: [],                  // audio takes pending commit
    effects: [],                // Stage 3
  };
  state.tracks.push(track);
  return track;
}

export function findTrack(id) {
  return state.tracks.find((t) => t.id === id);
}

export function findClip(trackId, clipId) {
  const t = findTrack(trackId);
  return t && t.clips.find((c) => c.id === clipId);
}

export function removeTrack(id) {
  state.tracks = state.tracks.filter((t) => t.id !== id);
  if (state.selectedTrackId === id) state.selectedTrackId = null;
}

export function removeClip(trackId, clipId) {
  const t = findTrack(trackId);
  if (!t) return;
  t.clips = t.clips.filter((c) => c.id !== clipId);
}

export function addClip(trackId, clip) {
  const t = findTrack(trackId);
  if (!t) return null;
  const c = {
    id: newId('clip'),
    startSec: 0,
    lengthSec: 4,
    kind: 'audio',
    blob: null,
    peaks: null,
    name: 'Clip',
    ...clip
  };
  t.clips.push(c);
  return c;
}

export function anySolo() {
  return state.tracks.some((t) => t.solo);
}

export function isAudible(track) {
  if (track.mute) return false;
  if (anySolo() && !track.solo) return false;
  return true;
}

export function songDuration() {
  let max = 0;
  for (const t of state.tracks) {
    for (const c of t.clips) {
      const end = c.startSec + c.lengthSec;
      if (end > max) max = end;
    }
  }
  return Math.max(max, 8);
}