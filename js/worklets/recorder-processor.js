// AudioWorklet processor: captures mono Float32 audio from the mic
// and emits it via port.postMessage as transferable ArrayBuffers.
// This is the low-latency capture path. It does not do any DSP.

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._recording = true;
    this.port.onmessage = (e) => {
      if (e.data && e.data.cmd === 'stop') {
        this._recording = false;
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    if (!this._recording) return true;
    const chan = input[0];
    // Copy — the buffer is reused by the audio thread.
    const copy = new Float32Array(chan.length);
    copy.set(chan);
    this.port.postMessage(copy, [copy.buffer]);
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);