import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';
import { getSettingsCache } from './database';

async function writeImageFile(imageBase64: string): Promise<string> {
  const filePath = path.join(os.tmpdir(), `natively-${Date.now()}.png`);
  await fs.writeFile(filePath, Buffer.from(imageBase64, 'base64'));
  return filePath;
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

  return candidates.find((candidate) => candidate === 'codex' || fsSync.existsSync(candidate)) ?? 'codex';
}

export async function runCodex(
  prompt: string,
  imageBase64: string | undefined,
  win: BrowserWindow
): Promise<string> {
  const settings = getSettingsCache();
  const codexBinary = resolveCodexBinary();
  const args = ['exec', '-m', settings.codexModel || 'codex-4', ...splitExtraFlags(settings.codexExtraFlags)];
  let imagePath: string | null = null;

  if (imageBase64) {
    imagePath = await writeImageFile(imageBase64);
    args.push('-i', imagePath);
  }

  return new Promise<string>((resolve, reject) => {
    const child = spawn(codexBinary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
        HOME: process.env.HOME || os.homedir()
      }
    });

    let stderr = '';
    let stdoutBuffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (!text) {
        return;
      }
      stdoutBuffer += text;
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.aiChunk, text);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.aiError, error.message);
      }
      reject(error);
    });

    child.stdin.write(prompt.trim() ? prompt : 'Reply briefly.');
    child.stdin.end();

    child.on('close', (code) => {
      if (code !== 0) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.aiError, stderr.trim() || `Codex CLI exited with code ${code}.`);
        }
        reject(new Error(stderr.trim() || `Codex CLI exited with code ${code}.`));
        return;
      }

      if (!stdoutBuffer.trim()) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.aiError, stderr.trim() || 'Codex CLI returned no output.');
        }
        reject(new Error(stderr.trim() || 'Codex CLI returned no output.'));
        return;
      }

      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.aiComplete, { fullText: stdoutBuffer });
      }
      resolve(stdoutBuffer);
    });
  }).finally(async () => {
    if (imagePath) {
      await fs.rm(imagePath, { force: true });
    }
  });
}
