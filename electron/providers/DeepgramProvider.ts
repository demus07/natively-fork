import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { STTProvider, STTTestResult } from './STTProvider';

export interface DeepgramConfig {
  apiKey: string;
  model: string;
}

const DEEPGRAM_URL_BASE = 'wss://api.deepgram.com/v1/listen';

export class DeepgramProvider extends EventEmitter implements STTProvider {
  readonly name = 'deepgram';
  private running = false;
  private serverReady = false;
  private serverError = '';
  private lastTranscript = '';
  private socket: WebSocket | null = null;
  private pendingChunks: Buffer[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 10;
  private readonly RECONNECT_DELAY = 1500;
  private readonly KEEPALIVE_MS = 8000;
  private readonly MAX_PENDING = 50;

  constructor(private readonly config: DeepgramConfig) {
    super();
  }

  private get url(): string {
    return `${DEEPGRAM_URL_BASE}?encoding=linear16&sample_rate=16000&model=${this.config.model}&language=en-US&channels=1&interim_results=true&smart_format=true&endpointing=100`;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.serverReady = false;
    this.serverError = '';
    this.pendingChunks = [];
    this.reconnectAttempts = 0;
    this.emit('status', 'starting');
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.serverReady = false;
    this.pendingChunks = [];
    this.clearTimers();
    if (this.socket) {
      try {
        if (this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ type: 'CloseStream' }));
        }
        this.socket.terminate();
      } catch {
        // Ignore shutdown errors.
      }
      this.socket = null;
    }
    this.emit('status', 'stopped');
  }

  pushPCM(chunk: Buffer): void {
    if (!this.running || !chunk?.length) return;
    if (this.socket?.readyState === WebSocket.OPEN && this.serverReady) {
      try {
        this.socket.send(chunk);
      } catch {
        // Ignore send errors.
      }
      return;
    }
    this.pendingChunks.push(Buffer.from(chunk));
    if (this.pendingChunks.length > this.MAX_PENDING) this.pendingChunks.shift();
  }

  isRunning(): boolean { return this.running; }
  isServerReady(): boolean { return this.serverReady; }
  getServerError(): string { return this.serverError; }
  getLastTranscript(): string { return this.lastTranscript; }

  private connect(): void {
    if (!this.running) return;
    if (!this.config.apiKey) {
      this.serverError = 'DEEPGRAM_API_KEY not set';
      this.emit('error', new Error(this.serverError));
      this.running = false;
      return;
    }

    const socket = new WebSocket(this.url, {
      headers: { Authorization: `Token ${this.config.apiKey}` }
    });
    this.socket = socket;

    socket.on('open', () => {
      this.serverReady = true;
      this.serverError = '';
      this.reconnectAttempts = 0;
      this.emit('status', 'running');
      this.startKeepalive();
      for (const chunk of this.pendingChunks) {
        try {
          socket.send(chunk);
        } catch {
          // Ignore send errors.
        }
      }
      this.pendingChunks = [];
    });

    socket.on('message', (data) => {
      try {
        const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        const msg = JSON.parse(text);
        if (msg.type === 'Error') {
          this.serverError = msg.message || 'Deepgram error';
          this.emit('error', new Error(this.serverError));
          return;
        }
        if (msg.type === 'Metadata') {
          this.emit('status', 'running');
          return;
        }
        const transcript = msg.channel?.alternatives?.[0]?.transcript?.trim();
        if (!transcript) return;
        if (msg.is_final) {
          this.lastTranscript = transcript;
          this.emit('transcript', transcript);
        } else {
          this.emit('interim', transcript);
        }
      } catch {
        // Ignore malformed messages.
      }
    });

    socket.on('error', (err) => {
      this.serverError = err.message;
      this.emit('error', err);
      this.emit('status', `error: ${err.message}`);
    });

    socket.on('close', () => {
      this.serverReady = false;
      this.clearKeepalive();
      this.socket = null;
      if (!this.running) return;
      if (this.reconnectAttempts >= this.MAX_RECONNECT) {
        this.running = false;
        this.emit('error', new Error('Deepgram reconnection attempts exhausted'));
        this.emit('status', 'stopped');
        return;
      }
      this.reconnectAttempts += 1;
      this.emit('status', 'reconnecting');
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, this.RECONNECT_DELAY);
    });
  }

  private startKeepalive(): void {
    this.clearKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(JSON.stringify({ type: 'KeepAlive' }));
        } catch {
          // Ignore keepalive errors.
        }
      }
    }, this.KEEPALIVE_MS);
  }

  private clearTimers(): void {
    this.clearKeepalive();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  async testConnection(): Promise<STTTestResult> {
    return new Promise((resolve) => {
      if (!this.config.apiKey) {
        resolve({ ok: false, error: 'No API key provided' });
        return;
      }
      const ws = new WebSocket(
        `${DEEPGRAM_URL_BASE}?encoding=linear16&sample_rate=16000&model=${this.config.model}`,
        { headers: { Authorization: `Token ${this.config.apiKey}` } }
      );
      const timeout = setTimeout(() => {
        ws.terminate();
        resolve({ ok: false, error: 'Connection timed out after 5 seconds' });
      }, 5000);
      ws.on('open', () => {
        clearTimeout(timeout);
        ws.terminate();
        resolve({ ok: true });
      });
      ws.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ ok: false, error: err.message });
      });
    });
  }
}
