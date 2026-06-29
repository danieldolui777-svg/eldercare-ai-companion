/**
 * AudioWorklet processor: captures microphone audio, downsamples to 24 kHz,
 * converts to PCM16, and emits 100 ms chunks via postMessage.
 *
 * This runs in the AudioWorklet global scope (a separate thread), so no DOM,
 * no fetch, no closures over main-thread variables.
 */

const TARGET_RATE = 24000;
const CHUNK_SAMPLES = 2400; // 100 ms at 24 kHz

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // sampleRate is a global in AudioWorkletGlobalScope
    this._ratio = TARGET_RATE / sampleRate;
    this._phase = 0;
    this._buf = [];
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) return true;

    // Linear resampling: emit one output sample every 1/_ratio input samples.
    for (let i = 0; i < channel.length; i++) {
      this._phase += this._ratio;
      if (this._phase >= 1) {
        this._phase -= 1;
        this._buf.push(channel[i]);
      }
    }

    // Emit complete chunks
    while (this._buf.length >= CHUNK_SAMPLES) {
      const chunk = this._buf.splice(0, CHUNK_SAMPLES);
      const pcm = new Int16Array(CHUNK_SAMPLES);
      for (let i = 0; i < CHUNK_SAMPLES; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      // Transfer the buffer to avoid a copy
      this.port.postMessage({ pcm16: pcm.buffer }, [pcm.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
