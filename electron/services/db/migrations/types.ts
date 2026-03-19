import type Database from 'better-sqlite3';

export interface DatabaseMigration {
  id: string;
  run(database: Database.Database): void;
}
