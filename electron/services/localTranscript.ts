import { EventEmitter } from 'node:events';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { app } from 'electron';

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const FLUSH_INTERVAL_MS = 800;
const MAX_SAMPLES = 16000 * 3;
const SILENCE_RMS_THRESHOLD = 0.003;
const MIN_CHUNK_MS = 250;

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

function computeRms(pcmInt16: Buffer): number {
  const numSamples = pcmInt16.length / 2;
  if (numSamples === 0) {
    return 0;
  }

  let sumSquares = 0;
  for (let i = 0; i < pcmInt16.length; i += 2) {
    const sample = pcmInt16.readInt16LE(i) / 32768;
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / numSamples);
}

function pcmDurationMs(pcmBytes: number): number {
  return (pcmBytes / (SAMPLE_RATE * BYTES_PER_SAMPLE)) * 1000;
}

export class LocalTranscriptService extends EventEmitter {
  private serverProc: ChildProcess | null = null;

  private serverReady = false;

  private serverError = '';

  private running = false;

  private language = 'en';

  private pcmChunks: Buffer[] = [];

  private totalPcmBytes = 0;

  private flushTimer: NodeJS.Timeout | null = null;

  private chunkCounter = 0;

  private inflightPaths: string[] = [];

  private pendingPaths: string[] = [];

  private lastTranscript = '';

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
    this.pendingPaths = [];
    this.inflightPaths = [];

    this.spawnServer();
    this.scheduleFlushTimer();

    console.log('[TRANSCRIPT] LocalTranscriptService started');
    this.emit('status', 'starting');
  }

  stop(): void {
    this.running = false;
    this.serverReady = false;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
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

    for (const filePath of [...this.pendingPaths, ...this.inflightPaths]) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup errors
      }
    }

    this.pcmChunks = [];
    this.totalPcmBytes = 0;
    this.pendingPaths = [];
    this.inflightPaths = [];
    console.log('[TRANSCRIPT] Stopped');
    this.emit('status', 'stopped');
  }

  pushPCM(chunk: Buffer): void {
    if (!this.running) {
      return;
    }

    this.pcmChunks.push(chunk);
    this.totalPcmBytes += chunk.length;

    const durationMs = pcmDurationMs(this.totalPcmBytes);
    const merged = Buffer.concat(this.pcmChunks);
    const rms = computeRms(merged);

    if (durationMs >= MIN_CHUNK_MS && rms <= SILENCE_RMS_THRESHOLD && durationMs >= 600) {
      this.flush('silence');
      return;
    }

    const maxBytes = MAX_SAMPLES * BYTES_PER_SAMPLE;
    if (this.totalPcmBytes >= maxBytes) {
      this.flush('max-window');
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

    console.log('[TRANSCRIPT] Spawning', pythonBin, scriptPath);

    this.serverProc = spawn(pythonBin, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        WHISPER_MODEL: 'base.en',
        WHISPER_LANG: this.language,
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
          const pending = [...this.pendingPaths];
          this.pendingPaths = [];
          for (const pendingPath of pending) {
            this.sendPathToServer(pendingPath);
          }
          continue;
        }

        if (trimmed.startsWith('ERROR:')) {
          const message = trimmed.replace('ERROR:', '');
          this.serverError = message;
          this.emit('status', `error: ${message}`);
          this.emit('error', new Error(message));
          this.cleanupOldestInflight();
          continue;
        }

        this.lastTranscript = trimmed;
        console.log('[TRANSCRIPT]', trimmed);
        this.emit('transcript', trimmed);
        this.emit('status', 'running');
        this.cleanupOldestInflight();
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

  private scheduleFlushTimer(): void {
    if (!this.running) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      if (this.totalPcmBytes > 0) {
        this.flush('timer');
      }
      this.scheduleFlushTimer();
    }, FLUSH_INTERVAL_MS);
  }

  private flush(reason: string): void {
    if (this.pcmChunks.length === 0) {
      return;
    }

    const durationMs = pcmDurationMs(this.totalPcmBytes);
    if (durationMs < MIN_CHUNK_MS) {
      return;
    }

    const merged = Buffer.concat(this.pcmChunks);
    this.pcmChunks = [];
    this.totalPcmBytes = 0;

    const rms = computeRms(merged);
    console.log(
      `[TRANSCRIPT] Flush ${reason}: ${(durationMs / 1000).toFixed(2)}s rms=${rms.toFixed(5)} ready=${this.serverReady}`
    );

    if (rms <= SILENCE_RMS_THRESHOLD) {
      return;
    }

    const tmpPath = path.join(os.tmpdir(), `natively_audio_${Date.now()}_${++this.chunkCounter}.wav`);
    try {
      writeWav(tmpPath, merged);
    } catch (error) {
      console.error('[TRANSCRIPT] Failed to write WAV file:', error);
      return;
    }

    this.sendPathToServer(tmpPath);
  }

  private sendPathToServer(wavPath: string): void {
    if (!this.serverReady || !this.serverProc?.stdin) {
      this.pendingPaths.push(wavPath);
      return;
    }

    try {
      this.inflightPaths.push(wavPath);
      this.serverProc.stdin.write(`${wavPath}\n`);
    } catch (error) {
      console.error('[TRANSCRIPT] Failed to write to server stdin:', error);
      this.pendingPaths.push(wavPath);
    }
  }

  private cleanupOldestInflight(): void {
    const filePath = this.inflightPaths.shift();
    if (!filePath) {
      return;
    }
    try {
      fs.unlinkSync(filePath);
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
