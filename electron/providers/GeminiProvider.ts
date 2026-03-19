import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';
import type { LLMProvider, LLMTestResult } from './LLMProvider';

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  readonly supportsVision = true;

  constructor(private readonly config: GeminiConfig) {}

  async stream(
    prompt: string,
    screenshotBase64: string | null,
    win: BrowserWindow,
    options?: { timeoutMs?: number }
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;

    const parts: object[] = [{ text: prompt }];
    if (screenshotBase64 && screenshotBase64.length > 0) {
      const base64Data = screenshotBase64.startsWith('data:')
        ? screenshotBase64.replace(/^data:image\/\w+;base64,/, '')
        : screenshotBase64;
      parts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
    }

    const requestBody = {
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
    };

    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let fullText = '';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!response.ok) {
        clearTimeout(timeoutId);
        const errorText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        clearTimeout(timeoutId);
        throw new Error('Gemini API returned no response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(trimmed.slice(6));
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text && typeof text === 'string') {
              fullText += text;
              if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.aiChunk, text);
            }
          } catch {
            // Skip malformed SSE lines.
          }
        }
      }

      clearTimeout(timeoutId);

      if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.aiComplete, { fullText });
      return fullText;
    } catch (error) {
      clearTimeout(timeoutId);
      const msg = error instanceof Error ? error.message : String(error);
      if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.aiError, msg);
      throw error;
    }
  }

  async testConnection(): Promise<LLMTestResult> {
    const start = Date.now();
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
          generationConfig: { maxOutputTokens: 5 }
        }),
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) {
        const body = await response.text();
        return { ok: false, error: `HTTP ${response.status}: ${body.slice(0, 300)}` };
      }
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
