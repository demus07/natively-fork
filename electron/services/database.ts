import path from 'path';
import Database from 'better-sqlite3';
import { app } from 'electron';
import type { Settings, UsageStats } from '../../renderer/types';
import { SETTINGS_DEFAULTS } from '../../src/config';
import { runMigrations } from './db/migrations/runner';

type SettingRecord = {
  key: keyof Settings;
  value: string;
};

const DEFAULT_SETTINGS: Settings = SETTINGS_DEFAULTS;

let db: Database.Database | null = null;
let settingsCache: Settings = { ...DEFAULT_SETTINGS };
let databaseQueue: Promise<unknown> = Promise.resolve();

function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'natively.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function runDatabaseTask<T>(task: (database: Database.Database) => T): Promise<T> {
  const scheduledTask = databaseQueue.then(
    () =>
      new Promise<T>((resolve, reject) => {
        setImmediate(() => {
          try {
            resolve(task(getDb()));
          } catch (error) {
            reject(error);
          }
        });
      })
  );

  databaseQueue = scheduledTask.catch(() => undefined);
  return scheduledTask;
}

export async function initDatabase(): Promise<void> {
  await runDatabaseTask((database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        session_id TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS usage (
        date TEXT PRIMARY KEY,
        tokens_used INTEGER DEFAULT 0,
        requests INTEGER DEFAULT 0
      );
    `);

    runMigrations(database);

    const seedDefaults = database.transaction(() => {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        database
          .prepare(
            `INSERT INTO settings (key, value)
             VALUES (?, ?)
             ON CONFLICT(key) DO NOTHING`
          )
          .run(key, JSON.stringify(value));
      }
    });

    seedDefaults();
  });

  await loadSettingsCache();
}

export async function loadSettingsCache(): Promise<Settings> {
  const merged = await runDatabaseTask((database) => {
    const rows = database.prepare('SELECT key, value FROM settings').all() as SettingRecord[];
    const nextSettings = { ...DEFAULT_SETTINGS };

    for (const row of rows) {
      try {
        (nextSettings as Record<string, unknown>)[row.key] = JSON.parse(row.value);
      } catch {
        (nextSettings as Record<string, unknown>)[row.key] = row.value;
      }
    }

    return nextSettings;
  });

  settingsCache = merged;
  return settingsCache;
}

export function getSettingsCache(): Settings {
  return settingsCache;
}

export async function saveMessage(
  role: 'user' | 'assistant',
  content: string,
  sessionId: string,
  tokensUsed = 0
): Promise<number> {
  return runDatabaseTask((database) => {
    const timestamp = new Date().toISOString();
    database
      .prepare(
        'INSERT INTO messages (role, content, timestamp, session_id, tokens_used) VALUES (?, ?, ?, ?, ?)'
      )
      .run(role, content, timestamp, sessionId, tokensUsed);

    const row = database.prepare('SELECT last_insert_rowid() AS id').get() as { id: number | bigint };
    return Number(row.id);
  });
}

export async function getMessages(sessionId?: string, limit = 100): Promise<Array<{
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}>> {
  return runDatabaseTask((database) => {
    if (sessionId) {
      return (database
        .prepare(
          `SELECT id, role, content, timestamp
           FROM messages
           WHERE session_id = ?
           ORDER BY id DESC
           LIMIT ?`
        )
        .all(sessionId, limit) as Array<{
          id: number;
          role: 'user' | 'assistant';
          content: string;
          timestamp: string;
        }>).reverse();
    }

    return (database
      .prepare(
        `SELECT id, role, content, timestamp
         FROM messages
         ORDER BY id DESC
         LIMIT ?`
      )
      .all(limit) as Array<{
        id: number;
        role: 'user' | 'assistant';
        content: string;
        timestamp: string;
      }>).reverse();
  });
}

export async function clearMessages(): Promise<void> {
  await runDatabaseTask((database) => {
    database.prepare('DELETE FROM messages').run();
  });
}

export function getAllSettings(): Settings {
  return { ...settingsCache };
}

export async function saveAllSettings(settings: Settings): Promise<Settings> {
  await runDatabaseTask((database) => {
    const transaction = database.transaction((current: Settings) => {
      for (const [key, value] of Object.entries(current) as Array<[keyof Settings, Settings[keyof Settings]]>) {
        database
          .prepare(
            `INSERT INTO settings (key, value)
             VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`
          )
          .run(key, JSON.stringify(value));
      }
    });

    transaction(settings);
  });

  settingsCache = { ...settings };
  return getAllSettings();
}

export async function trackUsage(tokensUsed: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await runDatabaseTask((database) => {
    database
      .prepare(
        `INSERT INTO usage (date, tokens_used, requests)
         VALUES (?, ?, 1)
         ON CONFLICT(date) DO UPDATE SET
           tokens_used = tokens_used + excluded.tokens_used,
           requests = requests + 1`
      )
      .run(today, tokensUsed);
  });
}

export async function getUsageStats(): Promise<UsageStats> {
  return runDatabaseTask((database) => {
    const totals = database
      .prepare(
        'SELECT COALESCE(SUM(requests), 0) AS totalRequests, COALESCE(SUM(tokens_used), 0) AS totalTokens FROM usage'
      )
      .get() as UsageStats;
    const todayKey = new Date().toISOString().slice(0, 10);
    const today = database
      .prepare(
        'SELECT COALESCE(requests, 0) AS todayRequests, COALESCE(tokens_used, 0) AS todayTokens FROM usage WHERE date = ?'
      )
      .get(todayKey) as Pick<UsageStats, 'todayRequests' | 'todayTokens'> | undefined;

    return {
      totalRequests: totals.totalRequests ?? 0,
      totalTokens: totals.totalTokens ?? 0,
      todayRequests: today?.todayRequests ?? 0,
      todayTokens: today?.todayTokens ?? 0
    };
  });
}
