import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'janasabha.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS petitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      citizen_name TEXT NOT NULL DEFAULT 'Anonymous',
      transcript TEXT NOT NULL,
      draft_text TEXT NOT NULL,
      final_text TEXT,
      category TEXT NOT NULL DEFAULT 'General',
      member_name TEXT NOT NULL DEFAULT 'Ward Councillor (Demo)',
      status TEXT NOT NULL DEFAULT 'New',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
