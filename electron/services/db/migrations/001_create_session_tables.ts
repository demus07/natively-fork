import type Database from 'better-sqlite3';
import { SESSION_RUNTIME_CONFIG } from '../../../../src/config';
import type { DatabaseMigration } from './types';

type TableColumn = {
  name: string;
};

function renameLegacySessionsTable(database: Database.Database): void {
  const tableInfo = database
    .prepare("PRAGMA table_info('sessions')")
    .all() as TableColumn[];

  if (tableInfo.length === 0) {
    return;
  }

  const columnNames = new Set(tableInfo.map((column) => column.name));
  const isLegacyMessageSessionTable =
    columnNames.has('started_at') &&
    columnNames.has('message_count') &&
    !columnNames.has('created_at');

  if (isLegacyMessageSessionTable) {
    database.exec('ALTER TABLE sessions RENAME TO legacy_message_sessions');
  }
}

const createSessionTablesMigration: DatabaseMigration = {
  id: '001_create_session_tables',
  run(database) {
    renameLegacySessionsTable(database);

    database.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        ended_at INTEGER,
        duration_ms INTEGER,
        provider_llm TEXT NOT NULL,
        provider_stt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT '${SESSION_RUNTIME_CONFIG.statusActive}'
          CHECK(status IN ('${SESSION_RUNTIME_CONFIG.statusActive}', '${SESSION_RUNTIME_CONFIG.statusCompleted}')),
        summary_json TEXT,
        transcript TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS utterances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        started_ms INTEGER NOT NULL,
        ended_ms INTEGER NOT NULL,
        text TEXT NOT NULL,
        is_final INTEGER NOT NULL DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_utterances_session_id_started_ms
        ON utterances(session_id, started_ms ASC);
    `);
  }
};

export default createSessionTablesMigration;
