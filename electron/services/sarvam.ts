import fs from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';

const SARVAM_API_URL = 'https://api.sarvam.ai/v1/chat/completions';

function readEnvValue(key: string): string {
  if (process.env[key]?.trim()) {
    return process.env[key]!.trim();
  }

  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return '';
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const [name, ...rest] = trimmed.split('=');
    if (name === key) {
      return rest.join('=').trim().replace(/^['"]|['"]$/g, '');
    }
  }

  return '';
}

export async function runSarvam(prompt: string, win: BrowserWindow): Promise<string> {
  const apiKey = readEnvValue('SARVAM_API_KEY');
  if (!apiKey) {
    const msg = 'SARVAM_API_KEY is not set in environment';
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.aiError, msg);
    }
    throw new Error(msg);
  }

  let fullText = '';

  try {
    const response = await fetch(SARVAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey
      },
      body: JSON.stringify({
        model: 'sarvam-105b',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        temperature: 0.2,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sarvam API error ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Sarvam API returned no response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

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
            fullText += delta;
            if (!win.isDestroyed()) {
              win.webContents.send(IPC_CHANNELS.aiChunk, delta);
            }
          }
        } catch {
          // Ignore malformed SSE lines and continue streaming.
        }
      }
    }

    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.aiComplete, { fullText });
    }

    return fullText;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.aiError, msg);
    }
    throw error;
  }
}
