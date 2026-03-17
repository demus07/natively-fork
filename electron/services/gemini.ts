import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';

const OLLAMA_API_URL = 'http://192.168.29.234:11434/v1/chat/completions';
const OLLAMA_MODEL = 'qwen3.5:35b';
export const supportsVision = true; // qwen3.5:35b supports Text and Image input natively
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('[GEMINI_TS] module loaded — using local Ollama qwen3.5:35b');

function readEnvValue(key: string): string {
  if (process.env[key]?.trim()) {
    return process.env[key]!.trim();
  }
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '..', '..', '.env'),
    path.join(__dirname, '..', '..', '.env'),
    path.join(__dirname, '..', '.env'),
  ];
  for (const envPath of candidates) {
    const normalised = path.normalize(envPath);
    if (!fs.existsSync(normalised)) continue;
    try {
      const lines = fs.readFileSync(normalised, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [name, ...rest] = trimmed.split('=');
        if (name.trim() === key) {
          const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
          if (value) return value;
        }
      }
    } catch {
      continue;
    }
  }
  return '';
}

export async function runGemini(
  prompt: string,
  screenshotBase64: string | null,
  win: BrowserWindow
): Promise<string> {
  console.log('[GEMINI_TS] runGemini called');
  console.log('[OLLAMA] Using model:', OLLAMA_MODEL, 'at', OLLAMA_API_URL);

  type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

  const content: ContentPart[] = [{ type: 'text', text: prompt }];

  if (screenshotBase64 && screenshotBase64.length > 0) {
    const imageUrl = screenshotBase64.startsWith('data:')
      ? screenshotBase64
      : `data:image/png;base64,${screenshotBase64}`;
    content.push({
      type: 'image_url',
      image_url: { url: imageUrl },
    });
  }

  const requestBody = {
    model: OLLAMA_MODEL,
    messages: [{ role: 'user', content }],
    stream: true,
    temperature: 0.2,
    max_tokens: 2048,
    thinking: false,
    options: {
      think: false,
      num_ctx: 8192,
    },
  };

  let fullText = '';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch(OLLAMA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ollama',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
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
          ? `Local AI server unreachable — is your GPU PC on at 192.168.29.234? (${err.message})`
          : `Network error: ${err.message}`;
      console.log('[OLLAMA] Connection error:', msg);
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.aiError, msg);
      }
      throw new Error(msg);
    }
    clearTimeout(timeoutId);

    console.log('[OLLAMA] Response status:', response.status, response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('[OLLAMA] Error body:', errorText);
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
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

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
          // malformed SSE line — skip silently
        }
      }
    }

    console.log('[OLLAMA] Stream complete, fullText length:', fullText.length);

    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.aiComplete, { fullText });
    }

    return fullText;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('[OLLAMA] Error:', msg);
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.aiError, msg);
    }
    throw error;
  }
}
