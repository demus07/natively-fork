import path from 'path';
import Database from 'better-sqlite3';
import { app } from 'electron';
import type { Settings, UsageStats } from '../../renderer/types';

type SettingRecord = {
  key: keyof Settings;
  value: string;
};

const DEFAULT_SETTINGS: Settings = {
  aiProvider: 'codex',
  llmProvider: 'ollama',
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  ollamaEndpoint: 'http://192.168.29.234:11434',
  ollamaModel: 'qwen3.5:35b',
  sttProvider: 'whisper',
  deepgramApiKey: '',
  deepgramModel: 'nova-2-meeting',
  googleServiceAccountPath: '',
  codexModel: 'codex-4',
  codexExtraFlags: '',
  transcriptLanguage: 'en',
  whisperModel: 'turbo',
  whisperLanguage: 'en',
  whisperComputeType: 'int8',
  whisperDevice: 'cpu',
  whisperPythonBin: '',
  windowOpacity: 0.9,
  rollingContextSize: 20,
  includeOverlayInScreenshots: false
};

let db: Database.Database | null = null;
let settingsCache: Settings = { ...DEFAULT_SETTINGS };

function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'natively.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initDatabase(): void {
  const database = getDb();
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

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      message_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS usage (
      date TEXT PRIMARY KEY,
      tokens_used INTEGER DEFAULT 0,
      requests INTEGER DEFAULT 0
    );
  `);

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

  loadSettingsCache();
}

export function loadSettingsCache(): Settings {
  const database = getDb();
  const rows = database.prepare('SELECT key, value FROM settings').all() as SettingRecord[];
  const merged = { ...DEFAULT_SETTINGS };

  for (const row of rows) {
    try {
      (merged as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    } catch {
      (merged as Record<string, unknown>)[row.key] = row.value;
    }
  }

  settingsCache = merged;
  return settingsCache;
}

export function getSettingsCache(): Settings {
  return settingsCache;
}

export function saveMessage(
  role: 'user' | 'assistant',
  content: string,
  sessionId: string,
  tokensUsed = 0
): number {
  const database = getDb();
  const timestamp = new Date().toISOString();
  database
    .prepare(
      'INSERT INTO messages (role, content, timestamp, session_id, tokens_used) VALUES (?, ?, ?, ?, ?)'
    )
    .run(role, content, timestamp, sessionId, tokensUsed);

  database
    .prepare(
      `INSERT INTO sessions (id, started_at, message_count)
       VALUES (?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         message_count = message_count + 1,
         ended_at = excluded.started_at`
    )
    .run(sessionId, timestamp);

  const row = database.prepare('SELECT last_insert_rowid() AS id').get() as { id: number | bigint };
  return Number(row.id);
}

export function getMessages(sessionId?: string, limit = 100) {
  const database = getDb();
  if (sessionId) {
    return database
      .prepare(
        `SELECT id, role, content, timestamp
         FROM messages
         WHERE session_id = ?
         ORDER BY id DESC
         LIMIT ?`
      )
      .all(sessionId, limit)
      .reverse();
  }

  return database
    .prepare(
      `SELECT id, role, content, timestamp
       FROM messages
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit)
    .reverse();
}

export function clearMessages(): void {
  getDb().prepare('DELETE FROM messages').run();
}

export function getSetting<K extends keyof Settings>(key: K): Settings[K] | null {
  return settingsCache[key] ?? null;
}

export function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, JSON.stringify(value));
  settingsCache = { ...settingsCache, [key]: value };
}

export function getAllSettings(): Settings {
  return { ...settingsCache };
}

export function saveAllSettings(settings: Settings): Settings {
  const database = getDb();
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
  settingsCache = { ...settings };
  return getAllSettings();
}

export function trackUsage(tokensUsed: number): void {
  const today = new Date().toISOString().slice(0, 10);
  getDb()
    .prepare(
      `INSERT INTO usage (date, tokens_used, requests)
       VALUES (?, ?, 1)
       ON CONFLICT(date) DO UPDATE SET
         tokens_used = tokens_used + excluded.tokens_used,
         requests = requests + 1`
    )
    .run(today, tokensUsed);
}

export function getUsageStats(): UsageStats {
  const database = getDb();
  const totals = database
    .prepare('SELECT COALESCE(SUM(requests), 0) AS totalRequests, COALESCE(SUM(tokens_used), 0) AS totalTokens FROM usage')
    .get() as UsageStats;
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = database
    .prepare('SELECT COALESCE(requests, 0) AS todayRequests, COALESCE(tokens_used, 0) AS todayTokens FROM usage WHERE date = ?')
    .get(todayKey) as Pick<UsageStats, 'todayRequests' | 'todayTokens'> | undefined;

  return {
    totalRequests: totals.totalRequests ?? 0,
    totalTokens: totals.totalTokens ?? 0,
    todayRequests: today?.todayRequests ?? 0,
    todayTokens: today?.todayTokens ?? 0
  };
}
