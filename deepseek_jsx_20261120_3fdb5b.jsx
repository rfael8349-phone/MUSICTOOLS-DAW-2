function TopBar() {
  const project = useProjectStore((s) => s.project);
  const actions = useProjectStore((s) => s.actions);
  const setView = useUIStore((s) => s.setView);
  const view = useUIStore((s) => s.editorView);
  const fileRef = useRef(null);

  const importAudio = async (file) => {
    await engine.resume();
    const buf = await decodeAudioFile(file, engine.ctx);
    const id = nanoid();
    engine.registerSample(id, buf);
    const track = actions.addTrack("audio", file.name.replace(/\.[^.]+$/, ""));
    const lengthBeats = (buf.duration / 60) * useProjectStore.getState().project.bpm;
    actions.addClip(track.id, {
      id: nanoid(), trackId: track.id, startBeat: 0, lengthBeats,
      offsetBeats: 0, bufferId: id, gain: 1, fadeInBeats: 0, fadeOutBeats: 0,
    });
  };

  const exportWav = async () => {
    const lastBeat = project.tracks.flatMap((t) => t.clips.map((c) => c.startBeat + c.lengthBeats))
      .reduce((a, b) => Math.max(a, b), 16);
    const sampleBuffers = new Map();
    for (const t of project.tracks) for (const c of t.clips) {
      if (c.bufferId) { const b = engine.getSample(c.bufferId); if (b) sampleBuffers.set(c.bufferId, b); }
    }
    const blob = await renderProjectToWav(project, sampleBuffers, lastBeat + 2);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = (project.name || "project") + ".wav"; a.click();
    URL.revokeObjectURL(url);
  };

  const saveProject = () => {
    const data = JSON.stringify(project, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = (project.name || "project") + ".json"; a.click();
    URL.revokeObjectURL(url);
  };

  const loadProjectFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { actions.loadProject(JSON.parse(reader.result)); } catch (e) { alert("Archivo inválido"); }
    };
    reader.readAsText(file);
  };

  return (
    <div className="h-auto flex flex-wrap items-center gap-2 px-2 py-2 border-b border-neutral-800 bg-neutral-900 text-xs">
      <div className="font-bold text-cyan-300 tracking-wide text-sm">MUSICTOOL DAW</div>
      <input value={project.name} onChange={(e) => actions.setProjectName(e.target.value)}
        className="bg-neutral-800 rounded px-2 py-1 text-xs flex-1 min-w-[100px]" />
      <div className="flex gap-1">
        {["timeline", "pianoroll", "mixer"].map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={"px-2 py-1 rounded " + (view === v ? "bg-cyan-700 text-white" : "bg-neutral-800")}>
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
      <label className="bg-neutral-800 rounded px-2 py-1 cursor-pointer">
        Importar
        <input type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files[0] && importAudio(e.target.files[0])} />
      </label>
      <label className="bg-neutral-800 rounded px-2 py-1 cursor-pointer">
        Cargar
        <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files[0] && loadProjectFile(e.target.files[0])} />
      </label>
      <button onClick={saveProject} className="bg-neutral-800 rounded px-2 py-1">Guardar</button>
      <button onClick={exportWav} className="bg-cyan-700 text-white rounded px-2 py-1">Exportar WAV</button>
    </div>
  );
}

function TransportBar() {
  const playing = useTransportStore((s) => s.playing);
  const playheadBeat = useTransportStore((s) => s.playheadBeat);
  const setPlaying = useTransportStore((s) => s.setPlaying);
  const setPlayhead = useTransportStore((s) => s.setPlayhead);
  const looping = useTransportStore((s) => s.looping);
  const toggleLoop = useTransportStore((s) => s.toggleLoop);
  const bpm = useProjectStore((s) => s.project.bpm);
  const setBpm = useProjectStore((s) => s.actions.setBpm);
  const bb = beatToBarBeat(playheadBeat, 4);
  const time = formatTime((playheadBeat / bpm) * 60);

  const play = async () => {
    await engine.resume();
    if (!playing) { engine.play(playheadBeat); setPlaying(true); }
    else { engine.stop(); setPlaying(false); }
  };

  return (
    <div className="flex items-center gap-2 px-2 py-2 border-b border-neutral-800 bg-neutral-900 text-xs flex-wrap">
      <button onClick={play} className="w-10 h-8 rounded bg-cyan-600 text-white font-bold">
        {playing ? "■" : "▶"}
      </button>
      <button onClick={toggleLoop} className={"px-2 h-8 rounded " + (looping ? "bg-cyan-700 text-white" : "bg-neutral-800")}>Loop</button>
      <button onClick={() => { engine.stop(); setPlaying(false); setPlayhead(0); }} className="px-2 h-8 rounded bg-neutral-800">⏮</button>
      <div className="font-mono text-cyan-300 text-sm">
        {String(bb[0]).padStart(2, "0")}:{String(bb[1]).padStart(2, "0")} <span className="text-neutral-500 text-[10px]">{time}</span>
      </div>
      <label className="text-neutral-400">BPM</label>
      <input type="number" value={bpm} min={30} max={300} onChange={(e) => setBpm(+e.target.value)}
        className="w-16 bg-neutral-800 rounded px-1 py-0.5 font-mono text-cyan-300" />
    </div>
  );
}

function TrackHeader({ track, selected, onSelect }) {
  const update = useProjectStore((s) => s.actions.updateTrack);
  const remove = useProjectStore((s) => s.actions.removeTrack);
  return (
    <div onClick={onSelect}
      className={"p-2 border-b border-neutral-800 cursor-pointer " + (selected ? "bg-neutral-800" : "")}>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ background: track.color }} />
        <input value={track.name} onChange={(e) => update(track.id, { name: e.target.value })}
          onClick={(e) => e.stopPropagation()} className="bg-transparent text-xs flex-1 outline-none min-w-0" />
      </div>
      <div className="flex items-center gap-1 text-[10px]">
        <button onClick={(e) => { e.stopPropagation(); update(track.id, { muted: !track.muted }); }}
          className={"px-1.5 rounded " + (track.muted ? "bg-red-700 text-white" : "bg-neutral-700")}>M</button>
        <button onClick={(e) => { e.stopPropagation(); update(track.id, { soloed: !track.soloed }); }}
          className={"px-1.5 rounded " + (track.soloed ? "bg-yellow-600 text-white" : "bg-neutral-700")}>S</button>
        <button onClick={(e) => { e.stopPropagation(); remove(track.id); }} className="text-neutral-500 ml-auto px-1">×</button>
      </div>
    </div>
  );
}

function TrackList() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const addTrack = useProjectStore((s) => s.actions.addTrack);
  const selected = useUIStore((s) => s.selectedTrackId);
  const select = useUIStore((s) => s.selectTrack);
  return (
    <aside className="w-32 border-r border-neutral-800 flex flex-col bg-neutral-900 shrink-0">
      <div className="h-6 flex items-center px-2 text-[10px] text-neutral-500 border-b border-neutral-800">TRACKS</div>
      <div className="flex-1 overflow-y-auto">
        {tracks.map((t) => (
          <TrackHeader key={t.id} track={t} selected={selected === t.id} onSelect={() => select(t.id)} />
        ))}
      </div>
      <div className="p-1 border-t border-neutral-800 flex gap-1 text-[10px]">
        <button onClick={() => addTrack("audio")} className="flex-1 bg-neutral-800 rounded px-1 py-1">+A</button>
        <button onClick={() => addTrack("midi")} className="flex-1 bg-neutral-800 rounded px-1 py-1">+M</button>
      </div>
    </aside>
  );
}

function ClipView({ clip, track }) {
  const ppb = useUIStore((s) => s.pixelsPerBeat);
  const selectClip = useUIStore((s) => s.selectClip);
  const openMidi = useUIStore((s) => s.openMidiClip);
  const update = useProjectStore((s) => s.actions.updateClip);
  const removeClip = useProjectStore((s) => s.actions.removeClip);
  const dragging = useRef(null);
  const left = clip.startBeat * ppb;
  const width = Math.max(8, clip.lengthBeats * ppb);

  const onPointerDown = (e) => {
    e.stopPropagation();
    selectClip(clip.id);
    dragging.current = { x: e.clientX, startBeat: clip.startBeat };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const delta = (e.clientX - dragging.current.x) / ppb;
    update(track.id, clip.id, { startBeat: Math.max(0, dragging.current.startBeat + delta) });
  };
  const onPointerUp = () => { dragging.current = null; };

  return (
    <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onDoubleClick={() => track.kind === "midi" && clip.notes && openMidi(track.id, clip.id)}
      onContextMenu={(e) => { e.preventDefault(); removeClip(track.id, clip.id); }}
      className="absolute top-1 bottom-1 rounded cursor-move overflow-hidden text-[9px] text-white/90"
      style={{ left, width, background: track.color + "cc", border: "1px solid " + track.color }}>
      <div className="px-1 truncate bg-black/20">{track.kind === "midi" ? "MIDI" : "Audio"}</div>
    </div>
  );
}

function TrackLane({ track }) {
  const ppb = useUIStore((s) => s.pixelsPerBeat);
  const selectTrack = useUIStore((s) => s.selectTrack);
  const barPx = ppb * 4;
  return (
    <div onClick={() => selectTrack(track.id)}
      className="border-b border-neutral-800 relative h-16"
      style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent " + (barPx - 1) + "px, #1a1a1a " + (barPx - 1) + "px, #1a1a1a " + barPx + "px)" }}>
      {track.clips.map((c) => <ClipView key={c.id} clip={c} track={track} />)}
    </div>
  );
}

function Playhead() {
  const ppb = useUIStore((s) => s.pixelsPerBeat);
  const beat = useTransportStore((s) => s.playheadBeat);
  return <div className="absolute top-0 bottom-0 w-px bg-cyan-400 pointer-events-none z-10" style={{ left: beat * ppb }} />;
}

function Timeline() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const ppb = useUIStore((s) => s.pixelsPerBeat);
  const setPlayhead = useTransportStore((s) => s.setPlayhead);
  const playhead = useTransportStore((s) => s.playheadBeat);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      <div className="h-6 border-b border-neutral-800 relative overflow-hidden bg-neutral-900 cursor-pointer"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPlayhead(Math.max(0, (e.clientX - r.left) / ppb)); }}>
        {Array.from({ length: 32 }).map((_, i) => (
          <div key={i} className="absolute top-0 text-[9px] text-neutral-500 border-l h-full"
            style={{ left: i * ppb * 4, borderColor: "#404040", paddingLeft: 1 }}>{i + 1}</div>
        ))}
        <div className="absolute top-0 h-full w-px bg-cyan-400" style={{ left: playhead * ppb }} />
      </div>
      <div className="flex-1 overflow-auto relative bg-neutral-950">
        <div style={{ width: Math.max(32 * 4 * ppb, 800), position: "relative" }}>
          {tracks.map((t) => <TrackLane key={t.id} track={t} />)}
          <Playhead />
        </div>
      </div>
    </div>
  );
}

function PianoRoll() {
  const activeMidiClipId = useUIStore((s) => s.activeMidiClipId);
  const selectedTrackId = useUIStore((s) => s.selectedTrackId);
  const closeMidiClip = useUIStore((s) => s.closeMidiClip);
  const project = useProjectStore((