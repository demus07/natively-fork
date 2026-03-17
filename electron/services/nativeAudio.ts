import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import { transcriptService } from './localTranscript';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_SAMPLE_RATE = 16000;

let deviceSampleRate = 44100;
let isCapturing = false;
let hasLoggedFirstChunk = false;
let nativeModule: {
  startAudioCapture: (cb: (buf: Buffer) => void) => void;
  stopAudioCapture: () => void;
} | null = null;

function resampleLinear(input: Buffer, sourceSampleRate: number, targetSampleRate: number): Buffer {
  if (sourceSampleRate === targetSampleRate) return input;

  const inputSamples = Math.floor(input.length / 2);
  const ratio = sourceSampleRate / targetSampleRate;
  const outputSamples = Math.floor(inputSamples / ratio);

  if (outputSamples <= 0) return Buffer.alloc(0);

  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i += 1) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;

    const srcByteIndex = srcIndex * 2;
    const nextByteIndex = Math.min(srcByteIndex + 2, Math.max(0, input.length - 2));

    const s0 = input.readInt16LE(srcByteIndex);
    const s1 = input.readInt16LE(nextByteIndex);
    const interpolated = Math.round(s0 + frac * (s1 - s0));
    const clamped = Math.max(-32768, Math.min(32767, interpolated));
    output.writeInt16LE(clamped, i * 2);
  }

  return output;
}

function loadNativeModule(): typeof nativeModule {
  if (nativeModule) return nativeModule;

  const candidates = [
    path.join(app.getAppPath(), 'native-module', 'index.js'),
    path.join(process.cwd(), 'native-module', 'index.js'),
    path.join(__dirname, '..', '..', 'native-module', 'index.js'),
    path.join(__dirname, '..', 'native-module', 'index.js'),
  ];

  for (const candidate of candidates) {
    try {
      const mod = require(candidate) as {
        startAudioCapture?: (cb: (buf: Buffer) => void) => void;
        stopAudioCapture?: () => void;
      };
      if (mod?.startAudioCapture && mod?.stopAudioCapture) {
        nativeModule = {
          startAudioCapture: mod.startAudioCapture,
          stopAudioCapture: mod.stopAudioCapture,
        };
        console.log('[NATIVE AUDIO] Loaded native module from:', candidate);
        return nativeModule;
      }
    } catch (err) {
      console.log('[NATIVE AUDIO] Could not load from:', candidate, (err as Error).message);
    }
  }

  console.error('[NATIVE AUDIO] Failed to load native module from any candidate path');
  return null;
}

export function startNativeAudioCapture(): boolean {
  if (isCapturing) {
    console.log('[NATIVE AUDIO] Already capturing');
    return true;
  }

  const mod = loadNativeModule();
  if (!mod) {
    console.error('[NATIVE AUDIO] Native module not available — falling back to browser capture');
    return false;
  }

  try {
    hasLoggedFirstChunk = false;
    mod.startAudioCapture((rawBuffer: Buffer) => {
      if (!isCapturing) return;
      if (!rawBuffer || rawBuffer.length === 0) return;

      if (!hasLoggedFirstChunk) {
        hasLoggedFirstChunk = true;
        console.log(`[NATIVE AUDIO] First chunk received: ${rawBuffer.length} bytes`);
        console.log(`[NATIVE AUDIO] Assuming device sample rate: ${deviceSampleRate}Hz`);
        console.log(
          `[NATIVE AUDIO] Expected chunk duration: ~${Math.round((rawBuffer.length / 2 / deviceSampleRate) * 1000)}ms`
        );
        console.log(`[NATIVE AUDIO] transcriptService.isRunning(): ${transcriptService.isRunning()}`);
        console.log(`[NATIVE AUDIO] transcriptService.isServerReady(): ${transcriptService.isServerReady()}`);
      }

      const resampled = resampleLinear(rawBuffer, deviceSampleRate, TARGET_SAMPLE_RATE);
      if (resampled.length > 0) {
        transcriptService.pushPCM(resampled);
      }
    });

    isCapturing = true;
    console.log(
      '[NATIVE AUDIO] Started native audio capture, resampling from',
      deviceSampleRate,
      'Hz to',
      TARGET_SAMPLE_RATE,
      'Hz'
    );
    return true;
  } catch (err) {
    console.error('[NATIVE AUDIO] Failed to start capture:', (err as Error).message);
    return false;
  }
}

export function stopNativeAudioCapture(): void {
  if (!isCapturing) return;

  isCapturing = false;

  try {
    const mod = loadNativeModule();
    mod?.stopAudioCapture();
    console.log('[NATIVE AUDIO] Stopped native audio capture');
  } catch (err) {
    console.error('[NATIVE AUDIO] Error stopping capture:', (err as Error).message);
  }
}

export function setDeviceSampleRate(rate: number): void {
  deviceSampleRate = rate;
  console.log('[NATIVE AUDIO] Device sample rate set to:', rate);
}

export function isNativeAudioCapturing(): boolean {
  return isCapturing;
}
