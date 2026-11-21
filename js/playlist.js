// Playlist view: renders track headers and clip lanes.
// Handles track creation/deletion/rename/arm, clip placement, playhead.

import { state, createTrack, newId, findTrack, removeTrack, removeClip, addClip, songDuration } from './state.js';
import { fmtTime } from './transport.js';
import { updateChannel, ensureChannel, computePeaks } from './audio-engine.js';
import { saveProject } from './storage.js';
import { toast } from './transport.js';

const PX_PER_SEC = () => state.zoom; // 40..200

let zoomInput, snapBtn;
let clipClipboard = null;
const undoStack = [];
const redoStack = [];
const HISTORY_LIMIT = 40;

function takeSnapshot() {
  return {
    tracks: state.tracks.map(t => ({ ...t, clips: (t.clips || []).map(c => ({ ...c })) })),
    selectedTrackId: state.selectedTrackId,
    selectedClipId: state.selectedClipId,
    playhead: state.playhead,
  };
}
function pushHistory() {
  undoStack.push(takeSnapshot());
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
}
function restoreSnapshot(snapshot) {
  state.tracks = snapshot.tracks;
  state.selectedTrackId = snapshot.selectedTrackId;
  state.selectedClipId = snapshot.selectedClipId;
  state.playhead = snapshot.playhead;
  refreshAll();
  saveProject().catch(console.error);
}
export function undoEdit() {
  if (!undoStack.length) return toast('Nothing to undo');
  redoStack.push(takeSnapshot());
  restoreSnapshot(undoStack.pop());
  toast('Undo');
}
export function redoEdit() {
  if (!redoStack.length) return toast('Nothing to redo');
  undoStack.push(takeSnapshot());
  restoreSnapshot(redoStack.pop());
  toast('Redo');
}

export function mount() {
  zoomInput = document.getElementById('playlist-zoom');
  snapBtn = document.getElementById('btn-snap');

  zoomInput.addEventListener('input', () => {
    state.zoom = Number(zoomInput.value);
    refreshAll();
  });

  snapBtn.addEventListener('click', () => {
    state.snap = !state.snap;
    snapBtn.dataset.on = state.snap ? '1' : '0';
    toast(state.snap ? 'Snap ON' : 'Snap OFF');
  });

  document.getElementById('btn-add-track').addEventListener('click', () => {
    createTrack('audio');
    refreshAll();
    saveProject();
  });
  document.getElementById('btn-add-audio-track').addEventListener('click', () => {
    createTrack('audio');
    refreshAll();
    saveProject();
  });

  refreshAll();
}

export function renderMixer() {
  const host = document.getElementById('mixer-strips');
  if (!host) return;
  host.innerHTML = '';
  const input = document.createElement('section');
  input.className = 'mixer-input';
  const title = document.createElement('strong');
  title.textContent = 'INPUT GAIN · RECORD';
  const value = document.createElement('output');
  value.textContent = `${Number(state.inputGainDb || 0).toFixed(1)} dB`;
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '-12'; slider.max = '36'; slider.step = '0.5';
  slider.value = String(state.inputGainDb || 0);
  slider.addEventListener('input', () => {
    state.inputGainDb = Number(slider.value);
    value.textContent = `${state.inputGainDb.toFixed(1)} dB`;
    saveProject().catch(console.error);
  });
  const hint = document.createElement('small');
  hint.textContent = 'Ganancia de grabación: -12 a +36 dB. Sube poco a poco y evita saturación.';
  input.append(title, value, slider, hint);
  host.appendChild(input);

  for (const track of state.tracks) {
    updateChannel(track);
    const strip = document.createElement('section');
    strip.className = 'mixer-strip';
    const name = document.createElement('strong'); name.textContent = track.name;
    const volLabel = document.createElement('label'); volLabel.textContent = 'Volume';
    const vol = document.createElement('input'); vol.type = 'range'; vol.min = '0'; vol.max = '1.5'; vol.step = '0.01'; vol.value = String(track.volume ?? 1);
    const volOut = document.createElement('output'); volOut.textContent = `${Math.round((track.volume ?? 1) * 100)}%`;
    vol.addEventListener('input', () => { track.volume = Number(vol.value); volOut.textContent = `${Math.round(track.volume * 100)}%`; updateChannel(track); });
    vol.addEventListener('change', () => saveProject().catch(console.error));
    const panLabel = document.createElement('label'); panLabel.textContent = 'Pan';
    const pan = document.createElement('input'); pan.type = 'range'; pan.min = '-1'; pan.max = '1'; pan.step = '0.01'; pan.value = String(track.pan ?? 0);
    pan.addEventListener('input', () => { track.pan = Number(pan.value); updateChannel(track); });
    pan.addEventListener('change', () => saveProject().catch(console.error));
    strip.append(name, volLabel, vol, volOut, panLabel, pan);
    host.appendChild(strip);
  }
}

export function refreshAll() {
  renderHeaders();
  renderTimeline();
}

function renderHeaders() {
  const host = document.getElementById('track-headers');
  host.innerHTML = '';
  for (const track of state.tracks) {
    host.appendChild(renderTrackHeader(track));
  }
  // fill remaining space with a "click to deselect" zone
  const filler = document.createElement('div');
  filler.style.cssText = 'height:60px;';
  host.appendChild(filler);
}

function renderTrackHeader(track) {
  const el = document.createElement('div');
  el.className = 'track-header' + (state.selectedTrackId === track.id ? ' selected' : '');
  el.dataset.id = track.id;

  const color = document.createElement('div');
  color.className = 'track-color';
  color.style.background = track.color;
  color.title = 'Change color';
  color.addEventListener('click', (e) => {
    e.stopPropagation();
    cycleColor(track);
  });

  const meta = document.createElement('div');
  meta.className = 'track-meta';

  const name = document.createElement('div');
  name.className = 'track-name';
  name.textContent = track.name;
  name.addEventListener('dblclick', () => renameTrack(track, meta, name));
  // Tap-to-rename on mobile
  name.addEventListener('click', (e) => {
    e.stopPropagation();
    if (Date.now() - (name._t || 0) < 400) renameTrack(track, meta, name);
    name._t = Date.now();
  });

  const ctr = document.createElement('div');
  ctr.className = 'track-controls';
  const muteBtn = mkToggle('M', 'mute', track.mute);
  muteBtn.onclick = (e) => {
    e.stopPropagation();
    track.mute = !track.mute;
    muteBtn.classList.toggle('on', track.mute);
    saveProject();
  };
  const soloBtn = mkToggle('S', 'solo', track.solo);
  soloBtn.onclick = (e) => {
    e.stopPropagation();
    track.solo = !track.solo;
    soloBtn.classList.toggle('on', track.solo);
    saveProject();
  };
  const recBtn = mkToggle('●', 'rec', track.armed);
  recBtn.onclick = (e) => {
    e.stopPropagation();
    // only one armed at a time
    for (const t of state.tracks) t.armed = false;
    track.armed = !track.armed;
    refreshAll();
    saveProject();
  };

  ctr.append(muteBtn, soloBtn, recBtn);
  meta.append(name, ctr);

  const actions = document.createElement('div');
  actions.className = 'track-actions';
  const del = document.createElement('button');
  del.textContent = '×';
  del.title = 'Delete track';
  del.onclick = (e) => {
    e.stopPropagation();
    if (confirm(`Delete track "${track.name}"?`)) {
      removeTrack(track.id);
      refreshAll();
      saveProject();
    }
  };
  actions.append(del);

  el.addEventListener('click', () => {
    state.selectedTrackId = track.id;
    refreshAll();
  });

  el.append(color, meta, actions);
  return el;
}

function mkToggle(text, cls, on) {
  const b = document.createElement('button');
  b.className = 'track-toggle ' + cls + (on ? ' on' : '');
  b.textContent = text;
  return b;
}

function cycleColor(track) {
  const colors = [
    'var(--track-1)', 'var(--track-2)', 'var(--track-3)', 'var(--track-4)',
    'var(--track-5)', 'var(--track-6)', 'var(--track-7)', 'var(--track-8)'
  ];
  const i = colors.indexOf(track.color);
  track.color = colors[(i + 1) % colors.length];
  refreshAll();
  saveProject();
}

function renameTrack(track, meta, nameEl) {
  const input = document.createElement('input');
  input.className = 'track-name-input';
  input.value = track.name;
  meta.replaceChild(input, nameEl);
  input.focus();
  input.select();
  const commit = () => {
    const v = input.value.trim();
    if (v) track.name = v;
    refreshAll();
    saveProject();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
}

function renderTimeline() {
  const host = document.getElementById('timeline');
  host.innerHTML = '';
  const dur = Math.max(songDuration(), 30);
  const widthPx = dur * PX_PER_SEC();

  // Grid lines
  const grid = document.createElement('div');
  grid.style.position = 'absolute';
  grid.style.top = '0';
  grid.style.bottom = '0';
  grid.style.left = '0';
  grid.style.width = widthPx + 'px';
  grid.style.pointerEvents = 'none';
  const secPerBeat = 60 / state.bpm;
  const beatsPerBar = state.timeSig[0];
  const barSec = secPerBeat * beatsPerBar;
  for (let b = 0; b <= dur / barSec + 1; b++) {
    const line = document.createElement('div');
    line.className = 'grid-line major';
    line.style.left = (b * barSec * PX_PER_SEC()) + 'px';
    grid.appendChild(line);
  }
  for (let sec = 0; sec <= dur + 1; sec++) {
    if (sec % barSec === 0) continue;
    const line = document.createElement('div');
    line.className = 'grid-line';
    line.style.left = (sec * PX_PER_SEC()) + 'px';
    grid.appendChild(line);
  }
  host.appendChild(grid);

  // Ruler
  renderRuler(dur);

  // Track lanes
  for (const track of state.tracks) {
    const lane = document.createElement('div');
    lane.className = 'track-lane';
    lane.dataset.id = track.id;
    lane.style.width = widthPx + 'px';

    for (const clip of track.clips) {
      lane.appendChild(renderClip(track, clip));
    }

    // Click empty space = move playhead
    lane.addEventListener('mousedown', (e) => {
      if (e.target !== lane) return;
      const rect = lane.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setPlayheadFromClick(x);
    });
    lane.addEventListener('touchstart', (e) => {
      if (e.target !== lane) return;
      const rect = lane.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      setPlayheadFromClick(x);
    }, { passive: true });

    host.appendChild(lane);
  }

  // Set timeline width
  host.style.width = widthPx + 'px';
  host.style.minHeight = (state.tracks.length * 56 + 8) + 'px';
}

function renderRuler(dur) {
  const host = document.getElementById('ruler');
  host.innerHTML = '';
  host.style.width = (dur * PX_PER_SEC()) + 'px';
  host.style.position = 'sticky';
  const secPerBeat = 60 / state.bpm;
  const barSec = secPerBeat * state.timeSig[0];
  const bars = Math.ceil(dur / barSec) + 1;
  for (let b = 0; b < bars; b++) {
    const label = document.createElement('span');
    label.textContent = String(b + 1);
    label.style.position = 'absolute';
    label.style.left = (b * barSec * PX_PER_SEC() + 3) + 'px';
    label.style.top = '4px';
    label.style.fontSize = '9px';
    label.style.color = 'var(--text-faint)';
    host.appendChild(label);
  }
}

function renderClip(track, clip) {
  const el = document.createElement('div');
  el.className = 'clip' + (state.selectedClipId === clip.id ? ' selected' : '');
  el.style.left = (clip.startSec * PX_PER_SEC()) + 'px';
  el.style.width = (clip.lengthSec * PX_PER_SEC()) + 'px';
  el.style.background = `linear-gradient(180deg, ${track.color} 0%, ${shade(track.color, -25)} 100%)`;
  el.dataset.clipId = clip.id;

  const label = document.createElement('div');
  label.className = 'clip-label';
  label.textContent = clip.name || 'Audio';
  el.appendChild(label);

  // Waveform drawing
  if (clip.audioBuffer) {
    if (!clip._peaks) clip._peaks = computePeaks(clip.audioBuffer, 120);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(20, Math.floor(clip.lengthSec * PX_PER_SEC()));
    canvas.height = 28;
    canvas.style.cssText = 'position:absolute;bottom:2px;left:0;right:0;width:100%;height:60%;';
    drawWaveform(canvas, clip._peaks, track.color);
    el.appendChild(canvas);
  }

  // Tap selects and opens editing actions; drag moves the clip.
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    state.selectedClipId = clip.id;
    state.selectedTrackId = track.id;
    el.classList.add('selected');
    drag = { startX: e.clientX, startClipStart: clip.startSec, moved: false, pointerId: e.pointerId };
    try { el.setPointerCapture(e.pointerId); } catch {}
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 5 && !drag.moved) { drag.moved = true; pushHistory(); }
    if (!drag.moved) return;
    let newStart = drag.startClipStart + dx / PX_PER_SEC();
    if (state.snap) newStart = Math.round(newStart * 4) / 4;
    clip.startSec = Math.max(0, newStart);
    el.style.left = (clip.startSec * PX_PER_SEC()) + 'px';
  });
  const finishDrag = (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const moved = drag.moved;
    drag = null;
    if (moved) {
      saveProject().catch(console.error);
      refreshAll();
    } else {
      showClipMenu(track, clip);
    }
  };
  el.addEventListener('pointerup', finishDrag);
  el.addEventListener('pointercancel', () => { drag = null; });

  return el;
}

function showClipMenu(track, clip) {
  document.querySelector('.clip-menu-backdrop')?.remove();
  const backdrop = document.createElement('div');
  backdrop.className = 'clip-menu-backdrop';
  const panel = document.createElement('div');
  panel.className = 'clip-menu';
  const heading = document.createElement('strong');
  heading.textContent = clip.name || 'Audio clip';
  const actions = [
    ['Copy', () => { clipClipboard = { ...clip }; toast('Clip copied'); }],
    ['Cut', () => { pushHistory(); clipClipboard = { ...clip }; removeClip(track.id, clip.id); state.selectedClipId = null; refreshAll(); saveProject(); toast('Clip cut'); }],
    ['Paste at playhead', () => pasteClip(track)],
    ['Duplicate', () => { pushHistory(); const copy = { ...clip, id: newId('clip'), startSec: clip.startSec + clip.lengthSec, name: (clip.name || 'Audio') + ' copy' }; track.clips.push(copy); state.selectedClipId = copy.id; refreshAll(); saveProject(); }],
    ['Split at playhead', () => splitClip(track, clip)],
    ['Delete', () => { pushHistory(); removeClip(track.id, clip.id); state.selectedClipId = null; refreshAll(); saveProject(); toast('Clip deleted'); }],
    ['Cancel', () => {}],
  ];
  panel.appendChild(heading);
  const grid = document.createElement('div'); grid.className = 'clip-menu-actions';
  for (const [label, action] of actions) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => { backdrop.remove(); action(); });
    grid.appendChild(button);
  }
  panel.appendChild(grid);
  backdrop.appendChild(panel);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);
}

function pasteClip(targetTrack) {
  if (!clipClipboard) return toast('Clipboard is empty');
  const destination = findTrack(state.selectedTrackId) || targetTrack || state.tracks[0];
  if (!destination) return toast('Create a track first');
  pushHistory();
  const copy = { ...clipClipboard, id: newId('clip'), startSec: state.playhead, name: (clipClipboard.name || 'Audio') + ' pasted' };
  destination.clips.push(copy);
  state.selectedTrackId = destination.id;
  state.selectedClipId = copy.id;
  refreshAll(); saveProject(); toast('Clip pasted');
}

function splitClip(track, clip) {
  const splitAt = state.playhead;
  const relative = splitAt - clip.startSec;
  if (relative <= 0.03 || relative >= clip.lengthSec - 0.03) return toast('Move playhead inside the clip');
  pushHistory();
  const originalLength = clip.lengthSec;
  const originalOffset = clip.sourceOffsetSec || 0;
  const right = {
    ...clip,
    id: newId('clip'),
    startSec: splitAt,
    lengthSec: originalLength - relative,
    sourceOffsetSec: originalOffset + relative,
    name: (clip.name || 'Audio') + ' (B)',
  };
  clip.lengthSec = relative;
  clip.name = (clip.name || 'Audio') + ' (A)';
  track.clips.push(right);
  state.selectedClipId = right.id;
  refreshAll(); saveProject(); toast('Clip split');
}

function drawWaveform(canvas, peaks, color) {
  const ctx2 = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx2.clearRect(0, 0, w, h);
  ctx2.fillStyle = 'rgba(0,0,0,0.35)';
  const mid = h / 2;
  const step = w / peaks.length;
  for (let i = 0; i < peaks.length; i++) {
    const amp = peaks[i] * h * 0.9;
    ctx2.fillRect(i * step, mid - amp / 2, Math.max(1, step - 0.5), amp);
  }
}

function shade(color, percent) {
  // color is like "var(--track-1)". Pull from CSS var at runtime.
  try {
    const name = color.match(/--[\w-]+/)[0];
    const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!hex.startsWith('#')) return color;
    const num = parseInt(hex.slice(1), 16);
    let r = (num >> 16) + percent;
    let g = ((num >> 8) & 0xff) + percent;
    let b = (num & 0xff) + percent;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `rgb(${r},${g},${b})`;
  } catch { return color; }
}

function setPlayheadFromClick(x) {
  const sec = Math.max(0, x / PX_PER_SEC());
  state.playhead = sec;
  renderPlayhead(sec);
  onTransportTick(sec);
}

export function onTransportTick(sec) {
  renderPlayhead(sec);
  const el = document.getElementById('display-time');
  if (el) el.textContent = fmtTime(sec);
}

export function renderPlayhead(sec) {
  const ph = document.getElementById('playhead');
  const scroll = document.getElementById('timeline-scroll');
  if (!ph || !scroll) return;
  ph.style.left = (sec * PX_PER_SEC()) + 'px';
  // auto-follow during playback
  if (state.isPlaying) {
    const x = sec * PX_PER_SEC();
    const viewLeft = scroll.scrollLeft;
    const viewRight = viewLeft + scroll.clientWidth;
    if (x < viewLeft + 40 || x > viewRight - 80) {
      scroll.scrollLeft = Math.max(0, x - scroll.clientWidth / 3);
    }
  }
}

export function renderPlayheadLine() { /* legacy alias */ }