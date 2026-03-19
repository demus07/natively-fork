import { DATABASE_RUNTIME_CONFIG } from '../../../../src/config';
import type Database from 'better-sqlite3';
import createSessionTablesMigration from './001_create_session_tables';
import type { DatabaseMigration } from './types';

const MIGRATIONS: DatabaseMigration[] = [
  createSessionTablesMigration
];

function ensureMigrationTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${DATABASE_RUNTIME_CONFIG.migrationTableName} (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
}

export function runMigrations(database: Database.Database): void {
  ensureMigrationTable(database);

  const appliedRows = database
    .prepare(`SELECT id FROM ${DATABASE_RUNTIME_CONFIG.migrationTableName}`)
    .all() as Array<{ id: string }>;
  const appliedIds = new Set(appliedRows.map((row) => row.id));

  for (const migration of MIGRATIONS) {
    if (appliedIds.has(migration.id)) {
      continue;
    }

    const applyMigration = database.transaction(() => {
      migration.run(database);
      database
        .prepare(
          `INSERT INTO ${DATABASE_RUNTIME_CONFIG.migrationTableName} (id, applied_at)
           VALUES (?, ?)`
        )
        .run(migration.id, Date.now());
    });

    applyMigration();
  }
}
