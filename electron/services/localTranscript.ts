import { EventEmitter } from 'node:events';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { app } from 'electron';
import { getSettingsCache } from './database';

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const FAST_FLUSH_MS = 1500;
const FULL_FLUSH_MS = 5000;
const MIN_FAST_BUFFER_MS = 800;
const MIN_CHUNK_MS = 5000;
const MAX_CHUNK_MS = 8000;
const SILENCE_THRESHOLD = 0.01;
const SILENCE_FLUSH_MS = 800;

function writeWav(filePath: string, pcmInt16: Buffer): void {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmInt16.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28);
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmInt16.length, 40);
  fs.writeFileSync(filePath, Buffer.concat([header, pcmInt16]));
}

function pcmDurationMs(pcmBytes: number): number {
  return (pcmBytes / (SAMPLE_RATE * BYTES_PER_SAMPLE)) * 1000;
}

function bufferToInt16View(chunk: Buffer): Int16Array {
  return new Int16Array(chunk.buffer, chunk.byteOffset, Math.floor(chunk.byteLength / 2));
}

function computeRms(input: Buffer | Int16Array): number {
  const samples = input instanceof Int16Array ? input : bufferToInt16View(input);
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] / 32768;
    sum += sample * sample;
  }

  return Math.sqrt(sum / samples.length);
}

function normalizeModelName(model: string): string {
  if (!model) {
    return 'turbo';
  }
  return model.endsWith('.en') ? model.slice(0, -3) : model;
}

type InflightRecord = {
  path: string;
  mode: 'FAST' | 'FULL';
};

export class LocalTranscriptService extends EventEmitter {
  private serverProc: ChildProcess | null = null;

  private serverReady = false;

  private serverError = '';

  private running = false;

  private language = 'en';

  private pcmChunks: Buffer[] = [];

  private totalPcmBytes = 0;

  private fastFlushTimer: NodeJS.Timeout | null = null;

  private fullFlushTimer: NodeJS.Timeout | null = null;

  private chunkCounter = 0;

  private inflight: InflightRecord[] = [];

  private pending: InflightRecord[] = [];

  private lastTranscript = '';

  private silenceStart: number | null = null;

  setLanguage(lang: string): void {
    this.language = lang;
    if (this.running) {
      this.stop();
      setTimeout(() => this.start(), 300);
    }
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.serverReady = false;
    this.serverError = '';
    this.pcmChunks = [];
    this.totalPcmBytes = 0;
    this.pending = [];
    this.inflight = [];
    this.silenceStart = null;

    this.spawnServer();
    this.scheduleFastFlush();
    this.scheduleFullFlush();

    console.log('[TRANSCRIPT] LocalTranscriptService started');
    this.emit('status', 'starting');
  }

  stop(): void {
    this.running = false;
    this.serverReady = false;

    if (this.fastFlushTimer) {
      clearTimeout(this.fastFlushTimer);
      this.fastFlushTimer = null;
    }

    if (this.fullFlushTimer) {
      clearTimeout(this.fullFlushTimer);
      this.fullFlushTimer = null;
    }

    if (this.serverProc) {
      try {
        this.serverProc.stdin?.end();
        this.serverProc.kill('SIGTERM');
      } catch {
        // ignore shutdown errors
      }
      this.serverProc = null;
    }

    for (const item of [...this.pending, ...this.inflight]) {
      try {
        fs.unlinkSync(item.path);
      } catch {
        // ignore cleanup errors
      }
    }

    this.pcmChunks = [];
    this.totalPcmBytes = 0;
    this.pending = [];
    this.inflight = [];
    this.silenceStart = null;
    console.log('[TRANSCRIPT] Stopped');
    this.emit('status', 'stopped');
  }

  pushPCM(chunk: Buffer): void {
    if (!this.running) {
      return;
    }

    this.pcmChunks.push(chunk);
    this.totalPcmBytes += chunk.length;

    const now = Date.now();
    const chunkRms = computeRms(chunk);
    const bufferDuration = this.getBufferDurationMs();

    if (chunkRms < SILENCE_THRESHOLD) {
      if (this.silenceStart === null) {
        this.silenceStart = now;
      }

      if (
        this.silenceStart !== null &&
        now - this.silenceStart >= SILENCE_FLUSH_MS &&
        bufferDuration >= MIN_CHUNK_MS
      ) {
        this.onSilenceDetected();
        return;
      }
    } else {
      this.silenceStart = null;
    }

    if (bufferDuration >= MAX_CHUNK_MS) {
      this.flushFull('max-window');
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  isServerReady(): boolean {
    return this.serverReady;
  }

  getServerError(): string {
    return this.serverError;
  }

  getLastTranscript(): string {
    return this.lastTranscript;
  }

  private getBufferDurationMs(): number {
    return pcmDurationMs(this.totalPcmBytes);
  }

  private spawnServer(): void {
    const scriptPath = path.join(
      app.isPackaged ? process.resourcesPath : app.getAppPath(),
      'scripts',
      'transcribe_server.py'
    );

    if (!fs.existsSync(scriptPath)) {
      const message = `transcribe_server.py not found at: ${scriptPath}`;
      this.serverError = message;
      this.emit('error', new Error(message));
      return;
    }

    const pythonBin = this.findPython();
    if (!pythonBin) {
      const message = 'python3 not found in PATH. Install with: brew install python3';
      this.serverError = message;
      this.emit('error', new Error(message));
      return;
    }

    const settings = getSettingsCache();
    const whisperModel = normalizeModelName(settings.whisperModel || 'turbo');

    console.log('[TRANSCRIPT] Spawning', pythonBin, scriptPath);

    this.serverProc = spawn(pythonBin, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        WHISPER_MODEL: whisperModel,
        WHISPER_LANGUAGE: this.language,
        WHISPER_COMPUTE: 'int8',
        WHISPER_DEVICE: 'cpu',
        PYTHONUNBUFFERED: '1'
      }
    });

    let stdoutBuffer = '';
    this.serverProc.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        if (trimmed === 'READY') {
          console.log('[TRANSCRIPT] faster-whisper server is ready');
          this.serverReady = true;
          this.emit('status', 'running');
          const pending = [...this.pending];
          this.pending = [];
          for (const item of pending) {
            this.sendToServer(item);
          }
          continue;
        }

        if (trimmed.startsWith('ERROR:')) {
          const message = trimmed.replace('ERROR:', '');
          this.serverError = message;
          this.emit('status', `error: ${message}`);
          this.emit('error', new Error(message));
          continue;
        }

        if (trimmed.startsWith('[transcribe_server] loaded model:')) {
          console.log('[TRANSCRIPT]', trimmed);
          continue;
        }

        if (trimmed.startsWith('INTERIM:')) {
          const text = trimmed.slice(8).trim();
          if (text) {
            this.emit('interim', text);
          }
          this.cleanupOldestInflight('FAST');
          continue;
        }

        if (trimmed.startsWith('FINAL:')) {
          const text = trimmed.slice(6).trim();
          if (text) {
            this.lastTranscript = text;
            console.log('[TRANSCRIPT]', text);
            this.emit('transcript', text);
            this.emit('status', 'running');
          }
          this.cleanupOldestInflight('FULL');
          continue;
        }
      }
    });

    this.serverProc.stderr?.on('data', (chunk: Buffer) => {
      const message = chunk.toString('utf8').trim();
      if (message) {
        console.log('[TRANSCRIPT server]', message);
      }
    });

    this.serverProc.on('close', (code) => {
      console.log(`[TRANSCRIPT] Python server exited with code ${code}`);
      this.serverReady = false;
      this.serverProc = null;
      if (this.running && code !== 0 && code !== null) {
        setTimeout(() => {
          if (this.running) {
            this.spawnServer();
          }
        }, 1200);
      }
    });

    this.serverProc.on('error', (error) => {
      this.serverError = error.message;
      this.emit('status', `error: ${error.message}`);
      this.emit('error', error);
    });
  }

  private scheduleFastFlush(): void {
    if (!this.running || this.fastFlushTimer) {
      return;
    }

    this.fastFlushTimer = setTimeout(() => {
      this.fastFlushTimer = null;
      const bufferDuration = this.getBufferDurationMs();
      if (bufferDuration >= MIN_FAST_BUFFER_MS) {
        const snapshot = this.writeBufferSnapshot();
        if (snapshot) {
          this.sendToServer({ path: snapshot, mode: 'FAST' });
        }
      }
      this.scheduleFastFlush();
    }, FAST_FLUSH_MS);
  }

  private scheduleFullFlush(): void {
    if (!this.running || this.fullFlushTimer) {
      return;
    }

    this.fullFlushTimer = setTimeout(() => {
      this.fullFlushTimer = null;
      if (this.getBufferDurationMs() >= MIN_CHUNK_MS) {
        this.flushFull('timer');
      }
      this.scheduleFullFlush();
    }, FULL_FLUSH_MS);
  }

  private onSilenceDetected(): void {
    if (this.fullFlushTimer) {
      clearTimeout(this.fullFlushTimer);
      this.fullFlushTimer = null;
    }
    this.flushFull('silence');
    this.scheduleFullFlush();
  }

  private writeBufferSnapshot(): string | null {
    if (this.pcmChunks.length === 0) {
      return null;
    }

    const snapshot = Buffer.concat(this.pcmChunks);
    const rms = computeRms(snapshot);
    if (rms < SILENCE_THRESHOLD) {
      return null;
    }

    const tmpPath = path.join(os.tmpdir(), `natively_fast_${Date.now()}_${++this.chunkCounter}.wav`);
    try {
      writeWav(tmpPath, snapshot);
      return tmpPath;
    } catch (error) {
      console.error('[TRANSCRIPT] Failed to write FAST WAV file:', error);
      return null;
    }
  }

  private drainBufferToWav(): string | null {
    if (this.pcmChunks.length === 0) {
      return null;
    }

    const durationMs = this.getBufferDurationMs();
    if (durationMs < MIN_CHUNK_MS) {
      return null;
    }

    const merged = Buffer.concat(this.pcmChunks);
    this.pcmChunks = [];
    this.totalPcmBytes = 0;
    this.silenceStart = null;

    const rms = computeRms(merged);
    if (rms < SILENCE_THRESHOLD) {
      return null;
    }

    const tmpPath = path.join(os.tmpdir(), `natively_full_${Date.now()}_${++this.chunkCounter}.wav`);
    try {
      writeWav(tmpPath, merged);
      return tmpPath;
    } catch (error) {
      console.error('[TRANSCRIPT] Failed to write FULL WAV file:', error);
      return null;
    }
  }

  private flushFull(reason: string): void {
    const wavPath = this.drainBufferToWav();
    if (!wavPath) {
      return;
    }

    console.log(`[TRANSCRIPT] FULL flush ${reason}: ${wavPath}`);
    this.sendToServer({ path: wavPath, mode: 'FULL' });
  }

  private sendToServer(item: InflightRecord): void {
    if (!this.serverReady || !this.serverProc?.stdin) {
      this.pending.push(item);
      return;
    }

    try {
      this.inflight.push(item);
      this.serverProc.stdin.write(`${item.mode}:${item.path}\n`);
    } catch (error) {
      console.error('[TRANSCRIPT] Failed to write to server stdin:', error);
      this.pending.push(item);
    }
  }

  private cleanupOldestInflight(mode: 'FAST' | 'FULL'): void {
    const index = this.inflight.findIndex((item) => item.mode === mode);
    if (index === -1) {
      return;
    }

    const [item] = this.inflight.splice(index, 1);
    try {
      fs.unlinkSync(item.path);
    } catch {
      // ignore cleanup errors
    }
  }

  private findPython(): string | null {
    const candidates = [
      '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3',
      '/opt/homebrew/bin/python3',
      '/usr/local/bin/python3',
      '/usr/bin/python3',
      'python3'
    ];

    for (const candidate of candidates) {
      try {
        const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
        if (result.status === 0) {
          return candidate;
        }
      } catch {
        // continue
      }
    }

    return null;
  }
}

export const transcriptService = new LocalTranscriptService();
