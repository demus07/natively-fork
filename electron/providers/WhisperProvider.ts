import { EventEmitter } from 'node:events';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { PYTHON_RUNTIME_CONFIG, STT_RUNTIME_CONFIG } from '../../src/config';
import type { STTProvider, STTTestResult } from './STTProvider';

const SAMPLE_RATE = STT_RUNTIME_CONFIG.sampleRate;
const BYTES_PER_SAMPLE = STT_RUNTIME_CONFIG.bytesPerSample;
const FAST_FLUSH_MS = STT_RUNTIME_CONFIG.fastFlushMs;
const FULL_FLUSH_MS = STT_RUNTIME_CONFIG.fullFlushMs;
const MIN_FAST_BUFFER_MS = STT_RUNTIME_CONFIG.minFastBufferMs;
const MIN_CHUNK_MS = STT_RUNTIME_CONFIG.minChunkMs;
const MAX_CHUNK_MS = STT_RUNTIME_CONFIG.maxChunkMs;
const SILENCE_THRESHOLD = STT_RUNTIME_CONFIG.silenceThreshold;
const SILENCE_FLUSH_MS = STT_RUNTIME_CONFIG.silenceFlushMs;

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

export interface WhisperConfig {
  model: string;
  language: string;
  computeType?: string;
  device?: string;
  pythonBin?: string;
}

export class WhisperProvider extends EventEmitter implements STTProvider {
  readonly name = 'whisper';

  private serverProc: ChildProcess | null = null;
  private serverReady = false;
  private serverError = '';
  private running = false;
  private pcmChunks: Buffer[] = [];
  private totalPcmBytes = 0;
  private fastFlushTimer: NodeJS.Timeout | null = null;
  private fullFlushTimer: NodeJS.Timeout | null = null;
  private chunkCounter = 0;
  private inflight: InflightRecord[] = [];
  private pending: InflightRecord[] = [];
  private lastTranscript = '';
  private silenceStart: number | null = null;

  constructor(private readonly config: WhisperConfig) {
    super();
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
        // Ignore shutdown errors.
      }
      this.serverProc = null;
    }

    for (const item of [...this.pending, ...this.inflight]) {
      try {
        fs.unlinkSync(item.path);
      } catch {
        // Ignore cleanup errors.
      }
    }

    this.pcmChunks = [];
    this.totalPcmBytes = 0;
    this.pending = [];
    this.inflight = [];
    this.silenceStart = null;
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

  async testConnection(): Promise<STTTestResult> {
    const pythonBin = this.config.pythonBin || this.findPython();
    if (!pythonBin) {
      return { ok: false, error: 'Python not found. Install Python 3.8+ from python.org' };
    }

    return new Promise((resolve) => {
      const proc = spawn(pythonBin, ['-c', 'import faster_whisper; print("ok")']);
      let output = '';
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.kill();
        resolve({ ok: false, error: 'Python check timed out' });
      }, PYTHON_RUNTIME_CONFIG.checkTimeoutMs);

      proc.stdout.on('data', (d: Buffer) => {
        output += d.toString();
      });
      proc.on('close', (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (code === 0 && output.includes('ok')) {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: 'faster-whisper not installed. Run: pip install faster-whisper' });
        }
      });
      proc.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ ok: false, error: `Python error: ${err.message}` });
      });
    });
  }

  private getScriptPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'scripts', PYTHON_RUNTIME_CONFIG.scriptName);
    }
    return path.join(app.getAppPath(), 'scripts', PYTHON_RUNTIME_CONFIG.scriptName);
  }

  private getBufferDurationMs(): number {
    return pcmDurationMs(this.totalPcmBytes);
  }

  private spawnServer(): void {
    const scriptPath = this.getScriptPath();
    if (!fs.existsSync(scriptPath)) {
      const message = `transcribe_server.py not found at: ${scriptPath}`;
      this.serverError = message;
      this.emit('error', new Error(message));
      return;
    }

    const pythonBin = this.config.pythonBin || this.findPython();
    if (!pythonBin) {
      const message = 'python3 not found in PATH. Install with: brew install python3';
      this.serverError = message;
      this.emit('error', new Error(message));
      return;
    }

    const whisperModel = normalizeModelName(this.config.model || 'turbo');
    this.serverProc = spawn(pythonBin, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        WHISPER_MODEL: whisperModel,
        WHISPER_LANGUAGE: this.config.language,
        WHISPER_COMPUTE: this.config.computeType ?? 'int8',
        WHISPER_DEVICE: this.config.device ?? 'cpu',
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
        if (!trimmed) continue;

        if (trimmed === 'READY') {
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

        if (trimmed.startsWith('INTERIM:')) {
          const text = trimmed.slice(8).trim();
          if (text) this.emit('interim', text);
          this.cleanupOldestInflight('FAST');
          continue;
        }

        if (trimmed.startsWith('FINAL:')) {
          const text = trimmed.slice(6).trim();
          if (text) {
            this.lastTranscript = text;
            this.emit('transcript', text);
            this.emit('status', 'running');
          }
          this.cleanupOldestInflight('FULL');
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
      this.serverReady = false;
      this.serverProc = null;
      if (this.running && code !== 0 && code !== null) {
        setTimeout(() => {
          if (this.running) {
            this.spawnServer();
          }
        }, PYTHON_RUNTIME_CONFIG.restartDelayMs);
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
      if (this.getBufferDurationMs() >= MIN_FAST_BUFFER_MS) {
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
    if (computeRms(snapshot) < SILENCE_THRESHOLD) {
      return null;
    }

    const tmpPath = path.join(os.tmpdir(), `natively_fast_${Date.now()}_${++this.chunkCounter}.wav`);
    try {
      writeWav(tmpPath, snapshot);
      return tmpPath;
    } catch {
      return null;
    }
  }

  private drainBufferToWav(): string | null {
    if (this.pcmChunks.length === 0 || this.getBufferDurationMs() < MIN_CHUNK_MS) {
      return null;
    }

    const merged = Buffer.concat(this.pcmChunks);
    this.pcmChunks = [];
    this.totalPcmBytes = 0;
    this.silenceStart = null;

    if (computeRms(merged) < SILENCE_THRESHOLD) {
      return null;
    }

    const tmpPath = path.join(os.tmpdir(), `natively_full_${Date.now()}_${++this.chunkCounter}.wav`);
    try {
      writeWav(tmpPath, merged);
      return tmpPath;
    } catch {
      return null;
    }
  }

  private flushFull(reason: string): void {
    const wavPath = this.drainBufferToWav();
    if (!wavPath) return;
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
    } catch {
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
      // Ignore cleanup errors.
    }
  }

  private findPython(): string | null {
    const candidates = [
      this.config.pythonBin,
      ...PYTHON_RUNTIME_CONFIG.pathCandidates
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      try {
        const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
        if (result.status === 0) {
          return candidate;
        }
      } catch {
        // Try next candidate.
      }
    }
    return null;
  }
}
