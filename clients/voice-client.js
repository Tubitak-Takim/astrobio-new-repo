// Framework-independent browser example, not a replacement frontend.
// Instantiate on your own page and invoke recording only from a user gesture.
// Requires localhost/HTTPS, microphone permission and explicit application consent.
export class AstrobioVoiceClient {
  constructor(token) {
    this.token = token;
    this.consent = false;
    this.controller = null;
    this.audio = null;
  }
  grantConsent() { this.consent = true; }
  revokeConsent() { this.consent = false; this.stop(); }
  stop() { this.controller?.abort(); if (this.audio) this.audio.pause(); }
  headers(extra = {}) {
    return { Authorization: `Bearer ${this.token}`, ...extra };
  }
  async request(path, options) {
    if (!this.consent) throw new Error('Explicit voice consent is required.');
    const response = await fetch(path, options);
    if (!response.ok) throw new Error((await response.json()).error || 'Voice request failed.');
    return response;
  }
  async record(seconds = 8) {
    if (!this.consent || !Number.isFinite(seconds) || seconds <= 0 || seconds > 30) throw new Error('Consent and a duration of 0–30 seconds are required.');
    this.stop();
    const controller = new AbortController();
    this.controller = controller;
    let stream, context, source, node, moduleUrl;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true }, video: false });
      controller.signal.throwIfAborted();
      context = new AudioContext();
      await context.resume();
      moduleUrl = URL.createObjectURL(new Blob([`
        class Capture extends AudioWorkletProcessor {
          process(inputs) {
            const samples = inputs[0]?.[0];
            if (samples) this.port.postMessage(new Float32Array(samples));
            return true;
          }
        }
        registerProcessor('astrobio-capture', Capture);
      `], { type: 'text/javascript' }));
      await context.audioWorklet.addModule(moduleUrl);
      controller.signal.throwIfAborted();
      const chunks = [];
      let count = 0;
      const max = Math.ceil(context.sampleRate * seconds);
      node = new AudioWorkletNode(context, 'astrobio-capture');
      node.port.onmessage = ({ data }) => {
        if (count >= max) return;
        const part = data.slice(0, max - count);
        chunks.push(part);
        count += part.length;
      };
      source = context.createMediaStreamSource(stream);
      source.connect(node);
      node.connect(context.destination); // Worklet output is silence; no mic feedback.
      await new Promise((resolve, reject) => {
        const cancel = () => { clearTimeout(timer); reject(new DOMException('Recording cancelled', 'AbortError')); };
        const timer = setTimeout(() => { controller.signal.removeEventListener('abort', cancel); resolve(); }, seconds * 1000);
        controller.signal.addEventListener('abort', cancel, { once: true });
        if (controller.signal.aborted) cancel();
      });
      if (!count) throw new Error('No audio was captured.');
      const samples = new Float32Array(count);
      let offset = 0;
      for (const part of chunks) { samples.set(part, offset); offset += part.length; }
      // Linear resampling for this diagnostic helper; evaluate resampling quality
      // and ASR accuracy on target microphones before production use.
      const length = Math.floor(count * 16000 / context.sampleRate);
      const buffer = new ArrayBuffer(44 + length * 2);
      const view = new DataView(buffer);
      const ascii = (at, text) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
      ascii(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); ascii(8, 'WAVEfmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      ascii(36, 'data'); view.setUint32(40, length * 2, true);
      for (let i = 0; i < length; i++) {
        const pos = i * context.sampleRate / 16000;
        const left = Math.floor(pos), weight = pos - left;
        const sample = Math.max(-1, Math.min(1, samples[left] * (1 - weight) + (samples[left + 1] ?? samples[left]) * weight));
        view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
      }
      return new Blob([buffer], { type: 'audio/wav' });
    } finally {
      source?.disconnect(); node?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      await context?.close();
      if (moduleUrl) URL.revokeObjectURL(moduleUrl);
    }
  }
  async transcribe(wav, language = 'tr') {
    if (!['tr', 'en'].includes(language)) throw new Error('Unsupported language.');
    this.controller = new AbortController();
    return (await this.request(`/api/voice/transcribe?language=${language}`, {
      method: 'POST', headers: this.headers({ 'Content-Type': 'audio/wav', 'X-Voice-Consent': 'true' }), body: wav, signal: this.controller.signal,
    })).json();
  }
  // Call only after displaying the transcript and obtaining user confirmation.
  async sendConfirmedText(text, context = {}) {
    this.controller = new AbortController();
    return (await this.request('/api/chat', {
      method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...context, message: text, inputOrigin: 'voice', transcriptConfirmed: true }), signal: this.controller.signal,
    })).json();
  }
  async speak(replyId) {
    this.stop();
    this.controller = new AbortController();
    const response = await this.request('/api/voice/speak', {
      method: 'POST', headers: this.headers({ 'Content-Type': 'application/json', 'X-Voice-Consent': 'true' }),
      body: JSON.stringify({ replyId }), signal: this.controller.signal,
    });
    const url = URL.createObjectURL(await response.blob());
    const audio = new Audio(url);
    this.audio = audio;
    const cleanup = () => { URL.revokeObjectURL(url); if (this.audio === audio) this.audio = null; };
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('pause', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });
    try { await audio.play(); } catch (error) { cleanup(); throw error; }
  }
}
