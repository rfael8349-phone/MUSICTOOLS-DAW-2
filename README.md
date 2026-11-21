# MUSICTOOL DAW V5

Mobile-first web DAW. This branch repairs the original repository layout and adds durable audio-clip persistence.

## Run
Serve this folder over HTTPS (required for microphone access) or localhost. Open `index.html`.

## Foundation repair
- Restored conventional `css/`, `js/`, `assets/` paths.
- Added `js/storage.js`: project metadata is stored in localStorage and recorded audio blobs in IndexedDB.
- Audio clips are decoded back into Web Audio buffers when a project is restored.
- PWA manifest is available at `manifest.webmanifest`.

## Current scope
Playlist, transport, microphone recording and playback are the inherited foundation. Mixer UI, MIDI piano roll, drum machine, effects, video capture and export workflows remain subsequent development stages.

## Important
This is a code-level foundation repair. It still requires runtime testing on iOS Safari and Android Chrome, especially microphone permission, multitrack sync and IndexedDB restoration.
