import type { BrowserWindow } from 'electron';

export interface LLMTestResult {
  ok: boolean;
  error?: string;
  latencyMs?: number;
}

export interface LLMProvider {
  readonly name: string;
  readonly supportsVision: boolean;
  stream(
    prompt: string,
    screenshotBase64: string | null,
    win: BrowserWindow
  ): Promise<string>;
  testConnection(): Promise<LLMTestResult>;
}
