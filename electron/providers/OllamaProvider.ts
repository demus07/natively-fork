import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';
import { AI_RUNTIME_CONFIG } from '../../src/config';
import type { LLMProvider, LLMTestResult } from './LLMProvider';

export interface OllamaConfig {
  endpoint: string;
  model: string;
  numCtx?: number;
  maxTokens?: number;
}

function stripThinkingContent(
  chunk: string,
  inThinkingBlock: boolean
): { visibleText: string; inThinkingBlock: boolean } {
  let visibleText = '';
  let cursor = 0;
  let insideThinking = inThinkingBlock;

  while (cursor < chunk.length) {
    if (insideThinking) {
      const closingTagIndex = chunk.indexOf('</think>', cursor);
      if (closingTagIndex === -1) {
        return { visibleText, inThinkingBlock: true };
      }
      cursor = closingTagIndex + '</think>'.length;
      insideThinking = false;
      continue;
    }

    const openingTagIndex = chunk.indexOf('<think>', cursor);
    if (openingTagIndex === -1) {
      visibleText += chunk.slice(cursor);
      return { visibleText, inThinkingBlock: false };
    }

    visibleText += chunk.slice(cursor, openingTagIndex);
    cursor = openingTagIndex + '<think>'.length;
    insideThinking = true;
  }

  return { visibleText, inThinkingBlock: insideThinking };
}

function readTextParts(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (typeof item === 'object' && item !== null) {
          const candidate = item as { text?: unknown };
          return typeof candidate.text === 'string' ? candidate.text : '';
        }

        return '';
      })
      .join('');
  }

  return '';
}

function extractChunkText(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) {
    return '';
  }

  const choice = (payload as {
    choices?: Array<{
      delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown };
      message?: { content?: unknown };
    }>;
  }).choices?.[0];

  if (choice) {
    const deltaContent = readTextParts(choice.delta?.content);
    if (deltaContent) {
      return deltaContent;
    }

    const messageContent = readTextParts(choice.message?.content);
    if (messageContent) {
      return messageContent;
    }

    const reasoningContent = readTextParts(choice.delta?.reasoning_content);
    if (reasoningContent) {
      return reasoningContent;
    }

    const reasoning = readTextParts(choice.delta?.reasoning);
    if (reasoning) {
      return reasoning;
    }
  }

  const message = (payload as { message?: { content?: unknown } }).message;
  if (message) {
    return readTextParts(message.content);
  }

  const response = (payload as { response?: unknown }).response;
  return readTextParts(response);
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly supportsVision = true;

  constructor(private readonly config: OllamaConfig) {}

  async stream(
    prompt: string,
    screenshotBase64: string | null,
    win: BrowserWindow,
    options?: { timeoutMs?: number }
  ): Promise<string> {
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
      temperature: AI_RUNTIME_CONFIG.ollamaTemperature,
      max_tokens: this.config.maxTokens ?? AI_RUNTIME_CONFIG.ollamaMaxTokens,
      thinking: false,
      options: {
        think: false,
        num_ctx: this.config.numCtx ?? AI_RUNTIME_CONFIG.ollamaContextWindow
      }
    };

    let fullText = '';
    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? AI_RUNTIME_CONFIG.ollamaRequestTimeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
          ? `Request timed out after ${Math.round(timeoutMs / 1000)} seconds — is your GPU PC responsive?`
          : isUnreachable
            ? `Local AI server unreachable — is your GPU PC on at ${this.config.endpoint}? (${err.message})`
            : `Network error: ${err.message}`;
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.aiError, msg);
        }
        throw new Error(msg);
      }
      if (!response.ok) {
        clearTimeout(timeoutId);
        const errorText = await response.text();
        throw new Error(`Ollama API error ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        clearTimeout(timeoutId);
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
            const delta = extractChunkText(json);
            if (delta && typeof delta === 'string') {
              const next = stripThinkingContent(delta, inThinkingBlock);
              inThinkingBlock = next.inThinkingBlock;
              if (!next.visibleText) {
                continue;
              }
              fullText += next.visibleText;
              if (!win.isDestroyed()) {
                win.webContents.send(IPC_CHANNELS.aiChunk, next.visibleText);
              }
            }
          } catch {
            // Skip malformed SSE lines.
          }
        }
      }

      clearTimeout(timeoutId);

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
