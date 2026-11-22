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
Playlist, transport, microphone recording, Mixer controls and sample import/preview/placement are implemented in this branch. MIDI piano roll, programmable drum machine, effects, video capture and export workflows remain subsequent development stages.

## Validation status
Changes are committed to the feature branch. Runtime testing is still required on iOS Safari and Android Chrome, especially microphone permissions, monitoring/latency, multitrack synchronization, and IndexedDB restoration. Do not treat the project as device-tested until those checks have been completed.


## V7.4.1 — instrument workflow and responsive performance pads

- Added per-track identity metadata: vocal, electric/acoustic guitar, bass, drums, keys, strings, brass, audio/sample and MIDI.
- Added per-track genre/style labels: rock, metal, punk, heavy metal, ballad, waltz, ranchera, acoustic, electronic and orchestral.
- Expanded the 16-pad Launchpad banks with punk, heavy, ballad, waltz and ranchera layouts, using the existing sampled drum/percussion voices.
- Improved Launchpad sizing for narrow phones and landscape orientation, including safe-area handling for notches and home indicators.
- Bumped the app shell and service-worker cache version to avoid keeping the previous shell after deployment.

**Audio note:** the current public sample sources provide recorded voices for piano, electric/acoustic guitar, bass and drums. Piano and acoustic guitar now select velocity layers; other instruments still use the available mapped recordings and do not yet have full multisampling across every pitch/velocity. The sequencer exports its 16-step pattern to a MIDI clip. Real-device playback and sample-host availability still need verification.


## V7.6.0 — mobile audio engine and channel-locked performance

- Restored the V7.5 independent live-voice routing on top of the already merged V7.4.1 main branch.
- Every live note captures its instrument and selected track at note-on; note-off releases only that matching instrument/channel voice from Piano Roll and Creative Studio.
- Equal MIDI pitches can coexist on different channels or instrument types without replacing each other.
- Stop now releases sustained live voices as well as stopping scheduled audio clips.
- Sample Cache API lookup failures no longer prevent a network fetch; the sample cache namespace is versioned for this release.
- Existing per-track EQ, gain, pan, compressor, effects, groove banks and responsive safe-area layout are retained.

**Validation status:** source changes are committed on the V7.6 feature branch. Browser syntax/runtime and physical iPhone Safari / Android Chrome audio, recording latency, external sample host and offline-cache behavior must still be tested. A branch link is available for review; it is not a device-certified release.


## V7.7.0 — recording studio, drum kits and regional grooves

- Adds a dedicated ESTUDIO workspace with audio-track destination, input selection, microphone permission check, live input meter, per-track input gain and record/stop controls.
- The record action reuses the existing transport's four-beat count-in and places the recorded take as an audio clip on the selected track.
- Adds ten original drum-kit profiles based on the bundled CC0 acoustic one-shots, with distinct kick/snare/hat/cymbal/tom mappings and balanced hit velocities.
- Rebalances drum playback: stronger kick and snare fundamentals, reduced hi-hat/cymbal levels and lower auxiliary percussion to reduce masking.
- Expands the rhythm selector with country and regional traditions: Paraguayan polka and guarania, Argentine chacarera/zamba/tango, Mexican ranchera/norteño/mariachi, Colombian cumbia/vallenato, Caribbean salsa/merengue/reggaeton, Brazilian samba/bossa nova, Spanish flamenco/pasodoble, plus blues, country, jazz, funk and afrobeat.
- Applies a softer, rounded visual language with responsive recording cards, meters and animated recording state.

**Drum sound provenance:** the kits are original combinations and level profiles using the existing CC0 Phazite acoustic one-shots. They are not exact copies of named bands' proprietary studio drum recordings or player-specific kits. A truly faithful artist kit would require properly licensed multitrack samples or a recording session.

**Validation status:** source is on the V7.7 feature branch. Verify microphone permission and recording on iPhone Safari and Android Chrome, and audition every kit/groove on physical speakers/headphones before release.
