class PCMExtractorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._sampleCount = 0;
    this._flushEvery = 3200;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    const channelData = input[0];
    const copy = new Float32Array(channelData.length);
    copy.set(channelData);
    this._buffer.push(copy);
    this._sampleCount += copy.length;

    if (this._sampleCount >= this._flushEvery) {
      const merged = new Float32Array(this._sampleCount);
      let offset = 0;
      for (const chunk of this._buffer) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const int16 = new Int16Array(merged.length);
      for (let i = 0; i < merged.length; i += 1) {
        const clamped = Math.max(-1.0, Math.min(1.0, merged[i]));
        int16[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
      }

      this.port.postMessage({ pcm: int16.buffer }, [int16.buffer]);
      this._buffer = [];
      this._sampleCount = 0;
    }

    return true;
  }
}

registerProcessor('pcm-extractor', PCMExtractorProcessor);
