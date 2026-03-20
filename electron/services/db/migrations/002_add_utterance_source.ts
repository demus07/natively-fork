import type Database from 'better-sqlite3';
import type { DatabaseMigration } from './types';

type TableColumn = {
  name: string;
};

const addUtteranceSourceMigration: DatabaseMigration = {
  id: '002_add_utterance_source',
  run(database) {
    const tableInfo = database
      .prepare("PRAGMA table_info('utterances')")
      .all() as TableColumn[];

    const hasSourceColumn = tableInfo.some((column) => column.name === 'source');
    if (!hasSourceColumn) {
      database.exec(`
        ALTER TABLE utterances
        ADD COLUMN source TEXT NOT NULL DEFAULT 'unknown'
          CHECK(source IN ('me', 'them', 'unknown'));
      `);
    }
  }
};

export default addUtteranceSourceMigration;
