# Natively Audio Architecture

This document describes the current audio architecture in the repo exactly as it works right now.

There are now **two audio capture paths**:

1. **Native Rust capture path** in Electron main
2. **Browser fallback capture path** in the renderer

Both paths eventually feed the same Deepgram streaming transcript service in Electron main.

This file documents:

- what captures input audio
- what captures output/system audio
- how PCM is transformed
- how it reaches Deepgram
- where delays happen
- where the current limitations are

## High-Level Overview

The live system is split into:

- **capture**
  - native Rust module or browser `getUserMedia`
- **transport**
  - IPC from renderer to main, or direct main-process native push
- **STT**
  - Deepgram WebSocket in Electron main
- **UI display**
  - renderer transcript hook + transcript panel

## Current Files Involved

### Native audio path

- [electron/services/nativeAudio.ts](/Users/sumedh/cluely-natively/electron/services/nativeAudio.ts)
- [native-module/index.js](/Users/sumedh/cluely-natively/native-module/index.js)
- [native-module/index.d.ts](/Users/sumedh/cluely-natively/native-module/index.d.ts)
- [native-module/src/lib.rs](/Users/sumedh/cluely-natively/native-module/src/lib.rs)

### Browser fallback path

- [renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)
- [public/audioWorklet.js](/Users/sumedh/cluely-natively/public/audioWorklet.js)

### Main-process transcript transport

- [electron/ipc/audioHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/audioHandlers.ts)
- [electron/services/localTranscript.ts](/Users/sumedh/cluely-natively/electron/services/localTranscript.ts)

### Renderer transcript display

- [renderer/hooks/useTranscript.ts](/Users/sumedh/cluely-natively/renderer/hooks/useTranscript.ts)
- [renderer/components/TranscriptPanel.tsx](/Users/sumedh/cluely-natively/renderer/components/TranscriptPanel.tsx)

## Shared STT Target

Regardless of which capture path is active, the active transcription backend is:

- **Deepgram over WebSocket**
- implemented in [electron/services/localTranscript.ts](/Users/sumedh/cluely-natively/electron/services/localTranscript.ts)

Current Deepgram URL:

```ts
const DEEPGRAM_URL =
  'wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&model=nova-2-meeting&language=en-US&channels=1&interim_results=true&smart_format=true&endpointing=100';
```

Deepgram expects:

- mono
- signed 16-bit little-endian PCM
- 16000 Hz sample rate

## Path 1: Native Rust Audio Capture

This is now the **preferred** path.

### Where it starts

The native path is started from:

- [electron/ipc/audioHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/audioHandlers.ts)

Current start flow:

1. `transcriptService.start()` starts the Deepgram WebSocket service
2. main waits for Deepgram to become `running`, up to 3 seconds
3. if Deepgram is ready, it starts native capture
4. if native capture starts successfully:
   - `usingNativeCapture = true`
   - renderer PCM pushed over IPC is ignored

Current readiness wait:

```ts
await new Promise<void>((resolve) => {
  const timeout = setTimeout(() => {
    transcriptService.removeListener('status', onStatus);
    console.log('[AUDIO] Deepgram connect timeout — starting native capture anyway');
    resolve();
  }, 3000);
  ...
});
```

So native capture starts:

- immediately after Deepgram is ready
- or after a 3 second timeout fallback

### What the Rust module exports

From [native-module/index.d.ts](/Users/sumedh/cluely-natively/native-module/index.d.ts):

```ts
export declare function startAudioCapture(callback: (...args: any[]) => any): void
export declare function stopAudioCapture(): void
```

### What the Rust code actually does

From [native-module/src/lib.rs](/Users/sumedh/cluely-natively/native-module/src/lib.rs):

- chooses `default_input_device()`
- if that fails, falls back to `default_output_device()`
- builds a CPAL stream
- converts to mono
- converts to signed int16 little-endian bytes
- invokes the JS callback with a `Buffer`

Important detail:

- it uses the **device native sample rate**
- it does **not** explicitly expose the sample rate to JS
- it does **not** explicitly select BlackHole by name
- it does **not** implement true macOS loopback/system-output capture

### What format Rust outputs

The Rust module outputs:

- mono PCM
- signed 16-bit little-endian
- variable chunk size
- device-native sample rate

So:

- **bit depth matches Deepgram**
- **channel count matches Deepgram**
- **sample rate usually does not match Deepgram**

### JS bridge for Rust capture

The bridge is [electron/services/nativeAudio.ts](/Users/sumedh/cluely-natively/electron/services/nativeAudio.ts)

It:

- loads `native-module/index.js`
- starts/stops the native capture stream
- resamples PCM from the assumed device sample rate down to 16000 Hz
- forwards resampled PCM into:
  - `transcriptService.pushPCM(resampled)`

### Current resampling implementation

Current resampler:

- simple linear interpolation
- pure TypeScript / Buffer math
- no third-party DSP library

Current constants:

```ts
const TARGET_SAMPLE_RATE = 16000;
let deviceSampleRate = 44100;
```

Important limitation:

- `deviceSampleRate` is currently assumed to be `44100`
- this is a heuristic, not queried from the native layer
- if the actual device rate is `48000`, resampling will be wrong

Current diagnostic logs in native path:

- first chunk byte size
- assumed sample rate
- expected chunk duration
- whether transcript service is running
- whether Deepgram is ready

### What audio source native path captures right now

In practice, the Rust path currently captures:

- the system default **input** device, usually the microphone

It does **not reliably capture output audio** because:

- opening a default output device is not the same thing as loopback capture
- macOS system audio capture generally needs:
  - BlackHole
  - CoreAudio loopback
  - ScreenCaptureKit audio
  - or another virtual/aggregate device strategy

So the native path is currently best described as:

- **native mic capture path**
- not a complete mic + output system-audio path

## Path 2: Browser Fallback Audio Capture

This path stays in the code and is used when native capture is unavailable.

### Where it starts

Defined in:

- [renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)

Renderer only uses this path when main reports:

- `usingNativeCapture !== true`

### Microphone capture

Current mic constraints:

```ts
audio: {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  sampleRate: 16000,
  channelCount: 1
}
```

Meaning:

- mono mic capture
- target 16kHz
- browser DSP disabled

### System/output audio capture on macOS

Current browser path still supports BlackHole.

Renderer behavior:

1. calls `enumerateDevices()`
2. searches for an `audioinput` device whose label contains `blackhole`
3. if found, opens it with `getUserMedia`

Current BlackHole constraints:

```ts
audio: {
  deviceId: { exact: blackholeDevice.deviceId },
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1
}
```

So the browser fallback path is the only current path that can capture:

- microphone
- and BlackHole/system audio

### Mixing behavior in browser path

Renderer uses one `AudioContext`:

```ts
const audioCtx = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
```

Current behavior:

- mic stream connects to the same downstream node
- BlackHole stream connects to the same downstream node
- the browser audio graph mixes them together

There is no:

- per-source gain control
- source separation
- adaptive mixing

So fallback browser capture is currently:

- **mixed mic + optional BlackHole into one mono stream**

### AudioWorklet path

Defined in:

- [public/audioWorklet.js](/Users/sumedh/cluely-natively/public/audioWorklet.js)

Current worklet behavior:

- collects float samples
- flushes every `800` samples
- converts to signed int16 PCM
- posts PCM buffers to renderer

Current constant:

```js
this._flushEvery = 800;
```

At 16kHz mono:

- `800` samples = about `50ms`
- `1600` bytes of PCM per flush

### ScriptProcessor fallback

If the worklet fails:

- renderer falls back to `ScriptProcessorNode`
- converts float samples to int16
- batches and sends PCM about every `200ms`

So the renderer fallback has two subpaths:

1. `AudioWorklet` preferred
2. `ScriptProcessorNode` compatibility fallback

## How Audio Gets Into Deepgram

### Native path

Flow:

1. Rust module callback emits PCM `Buffer`
2. `nativeAudio.ts` resamples to 16kHz
3. `nativeAudio.ts` calls:
   - `transcriptService.pushPCM(resampled)`
4. `localTranscript.ts` sends PCM to Deepgram over WebSocket

### Browser path

Flow:

1. `AudioWorklet` or `ScriptProcessorNode` emits PCM in renderer
2. renderer sends it over IPC channel:
   - `push-audio-chunk`
3. `audioHandlers.ts` converts to `Buffer`
4. `audioHandlers.ts` calls:
   - `transcriptService.pushPCM(resolved)`
5. `localTranscript.ts` sends PCM to Deepgram over WebSocket

### Shared rule in main

When `usingNativeCapture === true`:

- `push-audio-chunk` from renderer is ignored

This prevents duplicate audio from both paths being sent at once.

## Deepgram Transcript Service

Defined in:

- [electron/services/localTranscript.ts](/Users/sumedh/cluely-natively/electron/services/localTranscript.ts)

Current service behavior:

- opens a WebSocket to Deepgram on `start()`
- buffers PCM until socket is open
- sends PCM as raw binary frames
- sends keepalive every 8 seconds
- reconnects after unexpected close
- max reconnect attempts: 10

### PCM assumptions

```ts
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const SILENCE_THRESHOLD = 0.01;
```

So the Deepgram path expects:

- 16kHz
- int16
- mono

### Message handling

Current behavior:

- `Results`
  - emits `interim` when `is_final !== true`
  - emits `transcript` when `is_final === true`
- `Metadata`
  - emits status `running`
- `UtteranceEnd`
  - re-emits `lastTranscript` as fallback final
- `Error`
  - emits error event

### UI display

Renderer transcript UI uses:

- [renderer/hooks/useTranscript.ts](/Users/sumedh/cluely-natively/renderer/hooks/useTranscript.ts)
- [renderer/components/TranscriptPanel.tsx](/Users/sumedh/cluely-natively/renderer/components/TranscriptPanel.tsx)

Current behavior:

- `interimText` is displayed live
- `finalLines` are appended when final transcript events arrive
- if neither exists, UI shows:
  - `Waiting for live transcript`

So when you only see that message, it means:

- no final lines have arrived
- no interim text has arrived

That can happen because:

- native capture is not producing usable PCM
- Deepgram is not ready
- Deepgram is connected but not receiving speech
- native path is active and browser BlackHole path is bypassed

## Which Audio Architecture Is Active Right Now

### If native capture starts successfully

Then the active path is:

- Rust native capture
- resample in `nativeAudio.ts`
- Deepgram in `localTranscript.ts`
- renderer browser capture skipped

This usually means:

- mic only
- no browser BlackHole/system audio

### If native capture fails

Then the active path is:

- renderer `getUserMedia`
- mic + optional BlackHole
- `AudioWorklet` or `ScriptProcessorNode`
- IPC to main
- Deepgram in `localTranscript.ts`

This is slower and heavier, but more feature-complete for system audio.

## Main Delays In The Current Audio Stack

### Native path delays

- Deepgram readiness wait before native start:
  - up to `3000ms`
- resampling cost in JS
- network round-trip to Deepgram
- Deepgram endpointing:
  - `endpointing=100`

### Browser path delays

- `getUserMedia`
- `AudioContext` startup
- worklet module load
- PCM flush cadence:
  - `50ms` with worklet
  - about `200ms` with ScriptProcessor fallback
- network round-trip to Deepgram

## Current Limitations

### Native path limitations

- captures only one default device stream
- no explicit BlackHole selection
- no reliable output/loopback audio capture
- assumes `44100Hz` sample rate unless manually changed
- simple JS linear resampler only

### Browser path limitations

- more CPU overhead
- browser/media permission complexity
- mixed mic + system audio reduces transcript clarity

## Short Version

There are currently **two audio architectures**:

### Native-first path

- input capture: Rust native module
- format from Rust: mono int16 PCM at native device rate
- resampling: JS linear interpolation to 16kHz
- Deepgram feed: direct `transcriptService.pushPCM()`
- typical source: microphone only

### Browser fallback path

- input capture: `getUserMedia`
- optional output/system audio: BlackHole input device on macOS
- processing: `AudioContext` + `AudioWorklet`
- Deepgram feed: IPC `push-audio-chunk` -> `transcriptService.pushPCM()`
- typical source: mic + optional BlackHole mixed together

Both paths converge into:

- Deepgram WebSocket in `localTranscript.ts`
- transcript events to renderer
- transcript panel UI
