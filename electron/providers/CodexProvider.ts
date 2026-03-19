import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';
import type { LLMProvider, LLMTestResult } from './LLMProvider';

export interface CodexConfig {
  model: string;
  extraFlags?: string;
}

function splitExtraFlags(flags: string): string[] {
  return (
    flags
      .match(/(?:[^\s"]+|"[^"]*")+/g)
      ?.map((part) => part.replace(/^"|"$/g, ''))
      .filter(Boolean) ?? []
  );
}

function resolveCodexBinary(): string {
  const candidates = [
    process.env.CODEX_BIN,
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    path.join(os.homedir(), '.local', 'bin', 'codex'),
    'codex'
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => candidate === 'codex' || fs.existsSync(candidate)) ?? 'codex';
}

async function writeImageFile(imageBase64: string): Promise<string> {
  const filePath = path.join(os.tmpdir(), `natively-${Date.now()}.png`);
  const normalizedImage = imageBase64.startsWith('data:')
    ? imageBase64.replace(/^data:image\/\w+;base64,/, '')
    : imageBase64;
  await fsPromises.writeFile(filePath, Buffer.from(normalizedImage, 'base64'));
  return filePath;
}

export class CodexProvider implements LLMProvider {
  readonly name = 'codex';
  readonly supportsVision = true;

  constructor(private readonly config: CodexConfig) {}

  async stream(
    prompt: string,
    screenshotBase64: string | null,
    win: BrowserWindow,
    options?: { timeoutMs?: number }
  ): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      const codexBinary = resolveCodexBinary();
      const args: string[] = ['exec', ...splitExtraFlags(this.config.extraFlags ?? '')];
      const selectedModel = this.config.model.trim();

      if (selectedModel) {
        args.push('--model', selectedModel);
      }
      let imagePath: string | null = null;
      let timeoutId: NodeJS.Timeout | null = null;

      try {
        if (screenshotBase64) {
          imagePath = await writeImageFile(screenshotBase64);
          args.push('-i', imagePath);
        }
      } catch (error) {
        console.warn('[codex] failed to prepare image attachment', error);
      }

      const proc: ChildProcess = spawn(codexBinary, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PATH: process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
          HOME: process.env.HOME || os.homedir()
        }
      });

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (imagePath) {
          void fsPromises.rm(imagePath, { force: true });
          imagePath = null;
        }
      };

      if (options?.timeoutMs) {
        timeoutId = setTimeout(() => {
          proc.kill('SIGTERM');
        }, options.timeoutMs);
      }

      let pending = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      let fullText = '';
      let stderr = '';
      let terminatedByTimeout = false;

      const flush = () => {
        if (pending && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.aiChunk, pending);
          fullText += pending;
          pending = '';
        }
        flushTimer = null;
      };

      proc.stdout?.on('data', (chunk: Buffer) => {
        pending += chunk.toString('utf8');
        if (!flushTimer) {
          flushTimer = setTimeout(flush, 16);
        }
        if (pending.length >= 80) {
          if (flushTimer) {
            clearTimeout(flushTimer);
          }
          flush();
        }
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stderr += text;
        console.error('[codex stderr]', text);
      });

      proc.on('close', (code, signal) => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flush();
        }

        if (signal === 'SIGTERM' && options?.timeoutMs) {
          terminatedByTimeout = true;
        }

        cleanup();

        if ((code === 0 || code === null) && !terminatedByTimeout) {
          if (!win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.aiComplete, { fullText });
          }
          resolve(fullText);
          return;
        }

        const errorMessage = terminatedByTimeout
          ? 'Codex request timed out'
          : stderr.trim() || `codex exited with code ${code}`;

        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.aiError, errorMessage);
        }
        reject(new Error(errorMessage));
      });

      proc.on('error', (err) => {
        cleanup();
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.aiError, err.message);
        }
        reject(err);
      });

      proc.stdin?.write(prompt.trim() ? prompt : 'Reply briefly.');
      proc.stdin?.end();
    });
  }

  async testConnection(): Promise<LLMTestResult> {
    const start = Date.now();
    const codexBinary = resolveCodexBinary();

    if (codexBinary.includes('/')) {
      const result = spawnSync('test', ['-x', codexBinary]);
      if (result.status !== 0) {
        return { ok: false, error: `Codex binary is not executable at ${codexBinary}` };
      }
    } else {
      const resolved = spawnSync('which', [codexBinary], { encoding: 'utf8' }).stdout.trim();
      if (!resolved) {
        return { ok: false, error: 'Codex CLI not found in PATH. Sign in with `codex login` first.' };
      }
    }

    const probe = spawnSync(
      codexBinary,
      (() => {
        const args = ['exec'];
        const selectedModel = this.config.model.trim();
        if (selectedModel) {
          args.push('--model', selectedModel);
        }
        return args;
      })(),
      {
        encoding: 'utf8',
        input: 'Reply with exactly: ok',
        env: {
          ...process.env,
          PATH: process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
          HOME: process.env.HOME || os.homedir()
        },
        timeout: 15_000
      }
    );

    if (probe.error) {
      return { ok: false, error: probe.error.message };
    }

    if (probe.status !== 0) {
      const stderr = probe.stderr?.trim();
      return { ok: false, error: stderr || `Codex exited with code ${probe.status}` };
    }

    const output = `${probe.stdout ?? ''}`.trim().toLowerCase();
    if (!output.includes('ok')) {
      return { ok: false, error: 'Codex CLI responded unexpectedly. Ensure your OAuth session is active.' };
    }

    return { ok: true, latencyMs: Date.now() - start };
  }
}
