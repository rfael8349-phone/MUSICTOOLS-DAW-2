# MUSICTOOL DAW V5.3

Mobile-first web DAW. This branch repairs the original repository layout and adds durable audio-clip persistence.

## Run
Serve this folder over HTTPS (required for microphone access) or localhost. Open `index.html`.

## Foundation repair
- Restored conventional `css/`, `js/`, and `assets/` paths.
- Added `js/storage.js`: project metadata is stored in localStorage and recorded audio blobs in IndexedDB.
- Audio clips are decoded back into Web Audio buffers when a project is restored.
- PWA manifest is available at `manifest.webmanifest`.

## V5.1 recording workflow
- Tap Record and grant microphone permission when the browser asks.
- The current backing tracks play during a one-bar count-in.
- Count-in clicks follow the project tempo and the numerator of the selected time signature (four clicks in 4/4).
- Microphone capture starts after the count-in; the new take is placed at the current playhead.
- Pausing or stopping during the count-in cancels the pending recording.
- The metronome toggle now controls normal playback clicks; count-in clicks remain audible when recording.

## V5.3 repairs and additions
- Recording count-in is exactly four beats, independent of the selected time-signature numerator.
- Continuous metronome is not started during the recording count-in or while recording; the transport metronome button remains an independent ON/OFF control for playback.
- Recording input gain now spans -12 to +36 dB, with a modest +6 dB default for new projects. Adjust carefully to avoid clipping.
- Mixer includes per-track volume and pan, recording input gain, and master output level.
- Samples workspace imports supported audio files, previews them, and places them at the playhead on the selected audio track; sample blobs use the existing IndexedDB clip persistence.

## Current scope
Playlist, transport, microphone recording and playback are the current foundation. Mixer UI, MIDI piano roll, drum machine, effects, video capture and export workflows remain subsequent development stages.

## Validation status
Changes are committed to the feature branch. Runtime testing is still required on iOS Safari and Android Chrome, especially microphone permissions, monitoring/latency, multitrack synchronization, and IndexedDB restoration. Do not treat the project as device-tested until those checks have been completed.
