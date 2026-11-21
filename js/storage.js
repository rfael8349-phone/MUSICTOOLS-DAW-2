// Project persistence: metadata in localStorage, recorded audio in IndexedDB.
import { state } from './state.js';
import { decodeAudio } from './audio-engine.js';

const META_KEY = 'musicttool-daw-project-v5';
const DB_NAME = 'musicttool-daw-audio';
const STORE = 'clips';

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function requestDone(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function putClip(id, blob) {
  const db = await openDB();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id, blob });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function getClip(id) {
  const db = await openDB();
  try {
    const tx = db.transaction(STORE, 'readonly');
    return await requestDone(tx.objectStore(STORE).get(id));
  } finally { db.close(); }
}

export async function saveProject() {
  const clean = {
    projectId: state.projectId, projectName: state.projectName, bpm: state.bpm,
    timeSig: state.timeSig, snap: state.snap, zoom: state.zoom,
    selectedTrackId: state.selectedTrackId, selectedClipId: state.selectedClipId,
    metronome: state.metronome, inputGainDb: state.inputGainDb ?? 0, playhead: state.playhead, version: 5,
    tracks: state.tracks.map(track => ({
      ...track, input: null, takes: [],
      clips: track.clips.map(({ audioBuffer, blob, ...clip }) => clip)
    }))
  };
  localStorage.setItem(META_KEY, JSON.stringify(clean));
  // Persist each recorded clip independently so large audio blobs never enter localStorage.
  if ('indexedDB' in window) {
    for (const track of state.tracks) for (const clip of track.clips) {
      if (clip.blob instanceof Blob) await putClip(clip.id, clip.blob);
    }
  }
  return true;
}

export async function loadProject() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(META_KEY) || 'null'); }
  catch { return false; }
  if (!saved || !Array.isArray(saved.tracks)) return false;
  Object.assign(state, saved, { isPlaying: false, isRecording: false, recordArmedTrackId: null });
  for (const track of state.tracks) {
    for (const clip of track.clips || []) {
      try {
        const stored = await getClip(clip.id);
        if (stored?.blob) {
          clip.blob = stored.blob;
          clip.audioBuffer = await decodeAudio(await stored.blob.arrayBuffer());
        }
      } catch (err) {
        console.warn('Could not restore audio clip', clip.id, err);
      }
    }
  }
  return true;
}
