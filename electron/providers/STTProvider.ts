import type { EventEmitter } from 'node:events';

export interface STTTestResult {
  ok: boolean;
  error?: string;
}

export interface STTProvider extends EventEmitter {
  readonly name: string;
  start(): void;
  stop(): void;
  pushPCM(chunk: Buffer): void;
  isRunning(): boolean;
  isServerReady(): boolean;
  getServerError(): string;
  getLastTranscript(): string;
  testConnection(): Promise<STTTestResult>;
}
