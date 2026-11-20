# MUSICTOOL DAW

A free, mobile-first digital audio workstation that runs in your browser.
Record real audio from your microphone, layer multiple takes, and build
songs — all with a dark retro-studio aesthetic.

> **Status: v0.1.0 — Stage 1 & 2 (Foundation + Audio Recording)**
> Playlist, transport, real microphone recording, and multitrack
> playback are functional. Mixer, Piano Roll, Drum Machine, and MUSICTOOL
> module are staged for v0.2–v0.4.

## Features (current)

- Real microphone recording via `getUserMedia` + `AudioWorklet` (with ScriptProcessor fallback)
- Multitrack recording: record a second track while the first plays back
- Timeline playlist with clips, drag-to-move, snap-to-beat
- Track create / delete / rename / color / mute / solo / arm
- Transport: play, stop, rewind, record, metronome, tempo, time signature
- Local autosave of project metadata (localStorage; IndexedDB lands in v0.3)
- Dark retro UI, mascot, PWA-installable
- No accounts, no paid APIs, no tracking

## What works vs. what is stubbed

| Feature | Status |
|---|---|
| Playlist, tracks, clips | ✅ Implemented |
| Transport, BPM, time sig | ✅ Implemented |
| Metronome | ✅ Implemented |
| Microphone recording | ✅ Implemented (needs HTTPS or localhost) |
| Record while playing back | ✅ Implemented |
| Autosave (metadata only) | ✅ Implemented |
| Mixer channel strips | 🟡 Minimal (per-track volume/pan gain nodes exist; UI arrives v0.2) |
| Piano Roll | ⬜ Not yet (v0.2) |
| Drum Machine | ⬜ Not yet (v0.2) |
| Tuner / Chords / Scales | ⬜ Not yet (v0.3) |
| IndexedDB persistence | ⬜ Not yet (v0.3) — audio is in memory only |
| WAV export | ⬜ Not yet (v0.3) |
| MIDI import/export | ⬜ Not yet (v0.4) |

## Requirements

- A browser with **Web Audio API** and **`getUserMedia`**
  - Chrome / Edge 90+, Firefox 90+, Safari 14.1+ (iOS 14.5+)
- **HTTPS** or **`localhost`** for microphone access
  (the browser will silently block the mic on plain HTTP origins)

## Installation

```bash
git clone <your-fork-url> musictool-daw
cd musictool-daw
# Serve it — any static server works
python3 -m http.server 8080
# or: npx serve .