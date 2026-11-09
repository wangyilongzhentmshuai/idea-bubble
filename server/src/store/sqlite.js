import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const SCHEMA_VERSION = 1;

export function openDb(dbFile) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jars (
      id          TEXT PRIMARY KEY,
      theme       TEXT NOT NULL,
      theme_color TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recordings (
      id          TEXT PRIMARY KEY,
      audio_path  TEXT NOT NULL,
      duration    REAL,
      mime        TEXT,
      transcript  TEXT,
      status      TEXT NOT NULL DEFAULT 'uploaded'
                  CHECK (status IN ('uploaded', 'transcribed', 'failed')),
      error_code  TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bubbles (
      id             TEXT PRIMARY KEY,
      title          TEXT NOT NULL,
      content        TEXT NOT NULL,
      tags           TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'desk'
                     CHECK (status IN ('desk', 'archived')),
      source         TEXT,
      x              REAL,
      y              REAL,
      color          TEXT,
      jar_id         TEXT REFERENCES jars(id) ON DELETE SET NULL,
      recording_id   TEXT,
      origin         TEXT NOT NULL DEFAULT 'voice'
                     CHECK (origin IN ('voice', 'text', 'fusion')),
      unclassified   INTEGER NOT NULL DEFAULT 0,
      schema_version INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS association_scores (
      id               TEXT PRIMARY KEY,
      base_bubble_id   TEXT NOT NULL,
      target_bubble_id TEXT NOT NULL,
      semantic         INTEGER,
      tag_score        INTEGER,
      topic_score      INTEGER,
      keyword_score    INTEGER,
      total            INTEGER NOT NULL,
      passed           INTEGER NOT NULL,
      reason           TEXT,
      created_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fusion_records (
      id               TEXT PRIMARY KEY,
      result_bubble_id TEXT NOT NULL,
      participant_ids  TEXT NOT NULL,
      created_at       TEXT NOT NULL
    );
  `);

  const row = db.prepare(`SELECT value FROM schema_meta WHERE key = 'schemaVersion'`).get();
  if (!row) {
    db.prepare(`INSERT INTO schema_meta(key, value) VALUES ('schemaVersion', ?)`).run(String(SCHEMA_VERSION));
  }
}
