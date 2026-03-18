import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';
import type { LLMProvider, LLMTestResult } from './LLMProvider';

export interface OllamaConfig {
  endpoint: string;
  model: string;
  numCtx?: number;
  maxTokens?: number;
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly supportsVision = true;

  constructor(private readonly config: OllamaConfig) {}

  async stream(prompt: string, screenshotBase64: string | null, win: BrowserWindow): Promise<string> {
    const url = `${this.config.endpoint.replace(/\/$/, '')}/v1/chat/completions`;
    const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
      { type: 'text', text: prompt }
    ];

    if (screenshotBase64 && screenshotBase64.length > 0) {
      const imageUrl = screenshotBase64.startsWith('data:')
        ? screenshotBase64
        : `data:image/png;base64,${screenshotBase64}`;
      content.push({
        type: 'image_url',
        image_url: { url: imageUrl }
      });
    }

    const requestBody = {
      model: this.config.model,
      messages: [{ role: 'user', content }],
      stream: true,
      temperature: 0.2,
      max_tokens: this.config.maxTokens ?? 2048,
      thinking: false,
      options: {
        think: false,
        num_ctx: this.config.numCtx ?? 8192
      }
    };

    let fullText = '';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ollama'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
      } catch (error) {
        clearTimeout(timeoutId);
        const err = error as Error;
        const isTimeout = err.name === 'AbortError';
        const isUnreachable =
          err.message.includes('ECONNREFUSED') ||
          err.message.includes('fetch failed') ||
          err.message.includes('ENOTFOUND') ||
          err.message.includes('network');
        const msg = isTimeout
          ? 'Request timed out after 30 seconds — is your GPU PC responsive?'
          : isUnreachable
            ? `Local AI server unreachable — is your GPU PC on at ${this.config.endpoint}? (${err.message})`
            : `Network error: ${err.message}`;
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.aiError, msg);
        }
        throw new Error(msg);
      }
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Ollama API returned no response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let inThinkingBlock = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data: ')) {
            continue;
          }

          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json?.choices?.[0]?.delta?.content;
            if (delta && typeof delta === 'string') {
              if (delta.includes('<think>')) {
                inThinkingBlock = true;
              }
              if (inThinkingBlock) {
                if (delta.includes('</think>')) {
                  inThinkingBlock = false;
                }
                continue;
              }
              fullText += delta;
              if (!win.isDestroyed()) {
                win.webContents.send(IPC_CHANNELS.aiChunk, delta);
              }
            }
          } catch {
            // Skip malformed SSE lines.
          }
        }
      }

      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.aiComplete, { fullText });
      }

      return fullText;
    } catch (error) {
      clearTimeout(timeoutId);
      const msg = error instanceof Error ? error.message : String(error);
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.aiError, msg);
      }
      throw error;
    }
  }

  async testConnection(): Promise<LLMTestResult> {
    const start = Date.now();
    const endpoint = this.config.endpoint.replace(/\/$/, '');
    try {
      const response = await fetch(`${endpoint}/api/tags`, {
        signal: AbortSignal.timeout(3000)
      });
      if (!response.ok) {
        return { ok: false, error: `Ollama returned HTTP ${response.status}` };
      }
      const data = (await response.json()) as { models?: Array<{ name: string }> };
      const models = data.models?.map((m) => m.name) ?? [];
      const modelBase = this.config.model.split(':')[0];
      const hasModel = models.some((m) => m.startsWith(modelBase));
      if (!hasModel) {
        return {
          ok: false,
          error: `Model ${this.config.model} not found on this server. Available: ${models.slice(0, 5).join(', ')}`
        };
      }
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      const msg = (err as Error).message;
      const isUnreachable =
        msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('ENOTFOUND');
      return {
        ok: false,
        error: isUnreachable ? `Ollama not reachable at ${endpoint} — is it running?` : msg
      };
    }
  }
}
