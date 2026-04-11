import Database from 'better-sqlite3';
import { DB_PATH } from './config.js';

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Auto-checkpoint after every write transaction (100 pages ≈ 400KB)
// Ensures WAL is merged into the main .db file promptly,
// critical for single-file bind mounts where -wal/-shm are not mapped to host.
db.pragma('wal_autocheckpoint = 100');

// zVocab
db.exec(`
  CREATE TABLE IF NOT EXISTS zVocab (
    word        TEXT PRIMARY KEY,
    status      TEXT NOT NULL DEFAULT 'unknown',
    first_seen  TEXT,
    last_seen   TEXT,
    click_count INTEGER DEFAULT 0
  )
`);

// zArticles
db.exec(`
  CREATE TABLE IF NOT EXISTS zArticles (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT,
    content   TEXT NOT NULL,
    created   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )
`);

// zWordArticles
db.exec(`
  CREATE TABLE IF NOT EXISTS zWordArticles (
    word        TEXT NOT NULL,
    article_id  INTEGER NOT NULL,
    count       INTEGER DEFAULT 1,
    PRIMARY KEY (word, article_id),
    FOREIGN KEY (article_id) REFERENCES zArticles(id) ON DELETE CASCADE
  )
`);

console.log(`[db] 已连接: ${DB_PATH}`);
console.log(`[db] 表: zVocab, zArticles, zWordArticles`);

export default db;
