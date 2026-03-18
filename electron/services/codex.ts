import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';

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
  await fsPromises.writeFile(filePath, Buffer.from(imageBase64, 'base64'));
  return filePath;
}

class CodexRunner {
  private win: BrowserWindow | null = null;

  private busy = false;

  setWindow(win: BrowserWindow): void {
    this.win = win;
  }

  async run(prompt: string, imageBase64: string | null, extraFlags: string): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      if (this.busy) {
        reject(new Error('CodexRunner is already processing a request'));
        return;
      }

      this.busy = true;
      const win = this.win;
      const codexBinary = resolveCodexBinary();
      const args: string[] = ['exec', ...splitExtraFlags(extraFlags)];
      let imagePath: string | null = null;

      try {
        if (imageBase64) {
          imagePath = await writeImageFile(imageBase64);
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

      let pending = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      let fullText = '';
      let stderr = '';

      const flush = () => {
        if (pending && win && !win.isDestroyed()) {
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

      proc.on('close', (code) => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flush();
        }
        this.busy = false;

        if (code === 0 || code === null) {
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.aiComplete, { fullText });
          }
          resolve(fullText);
        } else {
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.aiError, stderr.trim() || `codex exited with code ${code}`);
          }
          reject(new Error(stderr.trim() || `codex exited with code ${code}`));
        }

        if (imagePath) {
          void fsPromises.rm(imagePath, { force: true });
        }
      });

      proc.on('error', (err) => {
        this.busy = false;
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.aiError, err.message);
        }
        if (imagePath) {
          void fsPromises.rm(imagePath, { force: true });
        }
        reject(err);
      });

      proc.stdin?.write(prompt.trim() ? prompt : 'Reply briefly.');
      proc.stdin?.end();
    });
  }
}

export const codexRunner = new CodexRunner();

export function setCodexWindow(win: BrowserWindow): void {
  codexRunner.setWindow(win);
}
