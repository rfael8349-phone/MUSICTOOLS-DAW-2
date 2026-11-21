// Playlist view: renders track headers and clip lanes.
// Handles track creation/deletion/rename/arm, clip placement, playhead.

import { state, createTrack, newId, findTrack, removeTrack, removeClip, addClip, songDuration } from './state.js';
import { fmtTime } from './transport.js';
import { updateChannel, ensureChannel, computePeaks, setMasterVolume } from './audio-engine.js';
import { saveProject } from './storage.js';
import { toast } from './transport.js';
import { openChannelEditor, renderMixer as renderStudioMixer } from './studio.js';

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

  const addAudioTrack = () => {
    const track = createTrack('audio');
    state.selectedTrackId = track.id;
    refreshAll();
    renderMixer();
    saveProject();
    toast(`Created and selected "${track.name}"`);
  };
  document.getElementById('btn-add-track').addEventListener('click', addAudioTrack);
  document.getElementById('btn-add-audio-track').addEventListener('click', addAudioTrack);

  refreshAll();
}

export function renderMixer() { renderStudioMixer(); }

export function refreshAll() {
  renderHeaders();
  renderTimeline();
}

function renderHeaders() {
  const host = document.getElementById('track-headers');
  host.innerHTML = '';
  // Keep the track labels aligned with the 24px timeline ruler.
  const rulerSpacer = document.createElement('div');
  rulerSpacer.className = 'track-ruler-spacer';
  rulerSpacer.setAttribute('aria-hidden', 'true');
  host.appendChild(rulerSpacer);
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
    const now = Date.now();
    if (now - (name._t || 0) < 400) {
      renameTrack(track, meta, name);
    } else {
      // A tap on the track name must select the whole lane just like a tap
      // on the rest of its header. Update in place so a second tap can rename.
      state.selectedTrackId = track.id;
      for (const t of state.tracks) t.armed = t.id === track.id;
      document.querySelectorAll('.track-header').forEach(header => {
        const active = header.dataset.id === track.id;
        header.classList.toggle('selected', active);
        const arm = header.querySelector('.track-toggle.rec');
        if (arm) {
          arm.classList.toggle('on', active);
          arm.title = active ? 'Disarm recording on this track' : 'Arm this track for recording';
          arm.setAttribute('aria-label', arm.title);
        }
      });
      saveProject();
    }
    name._t = now;
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
  recBtn.title = track.armed ? 'Disarm recording on this track' : 'Arm this track for recording';
  recBtn.setAttribute('aria-label', recBtn.title);
  recBtn.onclick = (e) => {
    e.stopPropagation();
    // Toggle this track; never leave several tracks armed simultaneously.
    const shouldArm = !track.armed;
    for (const t of state.tracks) t.armed = false;
    track.armed = shouldArm;
    state.selectedTrackId = track.id;
    refreshAll();
    saveProject();
    toast(shouldArm ? `Recording armed: ${track.name}` : 'Recording disarmed');
  };

  const channelBtn = mkToggle('CH', 'channel', false);
  channelBtn.title = 'Open independent channel studio';
  channelBtn.setAttribute('aria-label', 'Open channel studio for ' + track.name);
  channelBtn.onclick = (e) => { e.stopPropagation(); openChannelEditor(track.id); };
  ctr.append(muteBtn, soloBtn, recBtn, channelBtn);
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
    // Selecting another channel transfers the record-arm target to that channel.
    for (const t of state.tracks) t.armed = t.id === track.id;
    refreshAll();
    saveProject();
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
  const secPerBeat = (60 / state.bpm) * (4 / (Number(state.timeSig?.[1]) || 4));
  const beatsPerBar = Math.max(1, Number(state.timeSig?.[0]) || 4);
  const barSec = secPerBeat * beatsPerBar;

  // Beat grid: strong bar lines, lighter beat lines, all sharing one time scale.
  const grid = document.createElement('div');
  grid.className = 'timeline-grid';
  grid.style.width = widthPx + 'px';
  for (let beat = 0; beat <= Math.ceil(dur / secPerBeat); beat++) {
    const line = document.createElement('div');
    line.className = beat % beatsPerBar === 0 ? 'grid-line major' : 'grid-line beat-line';
    line.style.left = (beat * secPerBeat * PX_PER_SEC()) + 'px';
    grid.appendChild(line);
  }
  host.appendChild(grid);
  renderRuler(dur, secPerBeat, beatsPerBar);

  for (const track of state.tracks) {
    const lane = document.createElement('div');
    lane.className = 'track-lane';
    lane.dataset.id = track.id;
    lane.style.width = widthPx + 'px';
    for (const clip of track.clips) lane.appendChild(renderClip(track, clip));
    lane.addEventListener('pointerdown', (e) => {
      if (e.target !== lane) return;
      const rect = lane.getBoundingClientRect();
      setPlayheadFromClick(e.clientX - rect.left);
    });
    host.appendChild(lane);
  }
  host.style.width = widthPx + 'px';
  host.style.minHeight = (state.tracks.length * 56 + 8) + 'px';
}

function renderRuler(dur, secPerBeat, beatsPerBar) {
  const host = document.getElementById('ruler');
  host.innerHTML = '';
  host.style.width = (dur * PX_PER_SEC()) + 'px';
  host.style.position = 'sticky';
  const totalBeats = Math.ceil(dur / secPerBeat);
  for (let beat = 0; beat <= totalBeats; beat++) {
    const bar = Math.floor(beat / beatsPerBar) + 1;
    const beatInBar = (beat % beatsPerBar) + 1;
    const tick = document.createElement('button');
    tick.type = 'button';
    tick.className = beat % beatsPerBar === 0 ? 'ruler-tick bar-tick' : 'ruler-tick';
    tick.textContent = beat % beatsPerBar === 0 ? String(bar) : String(beatInBar);
    tick.title = 'Compás ' + bar + ', pulso ' + beatInBar + ' · ir a este punto';
    tick.style.left = (beat * secPerBeat * PX_PER_SEC()) + 'px';
    tick.addEventListener('click', (e) => {
      e.stopPropagation();
      setPlayheadFromClick(beat * secPerBeat * PX_PER_SEC());
    });
    host.appendChild(tick);
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
    drag = { startX: e.clientX, startClipStart: clip.startSec, moved: false, pointerId: e.pointerId, targetTrackId: track.id };
    try { el.setPointerCapture(e.pointerId); } catch {}
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 5 && !drag.moved) { drag.moved = true; pushHistory(); el.classList.add('dragging'); }
    if (!drag.moved) return;
    let newStart = drag.startClipStart + dx / PX_PER_SEC();
    if (state.snap) {
      const beatSec = (60 / state.bpm) * (4 / (Number(state.timeSig?.[1]) || 4));
      newStart = Math.round(newStart / (beatSec / 4)) * (beatSec / 4);
    }
    clip.startSec = Math.max(0, newStart);
    el.style.left = (clip.startSec * PX_PER_SEC()) + 'px';
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.track-lane');
    if (under?.dataset.id) drag.targetTrackId = under.dataset.id;
  });
  const finishDrag = (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const moved = drag.moved;
    const destinationId = drag.targetTrackId;
    drag = null;
    el.classList.remove('dragging');
    if (moved) {
      const destination = findTrack(destinationId) || track;
      if (destination.id !== track.id) {
        const source = findTrack(track.id);
        if (source) source.clips = source.clips.filter(c => c.id !== clip.id);
        destination.clips.push(clip);
        state.selectedTrackId = destination.id;
      }
      state.selectedClipId = clip.id;
      saveProject().catch(console.error);
      refreshAll();
    } else {
      state.selectedTrackId = track.id;
      state.selectedClipId = clip.id;
      showClipMenu(track, clip);
    }
  };
  el.addEventListener('pointerup', finishDrag);
  el.addEventListener('pointercancel', () => { drag = null; el.classList.remove('dragging'); });

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
  const indicator = document.getElementById('beat-indicator');
  if (indicator) {
    const beatSec = (60 / state.bpm) * (4 / (Number(state.timeSig?.[1]) || 4));
    const phase = ((Math.max(0, sec) % beatSec) / beatSec);
    indicator.classList.toggle('lit', phase < 0.22);
    indicator.setAttribute('aria-label', 'Pulso ' + (Math.floor(sec / beatSec) + 1));
  }
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