const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const env = require('./env');

const dbDir = path.dirname(env.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;

function getDb() {
  if (!db) {
    db = new Database(env.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDatabase() {
  const d = getDb();
  const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');

  // Create migrations tracking table
  d.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // Run pending migrations in order
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const applied = new Set(
      d.prepare('SELECT filename FROM schema_migrations').all().map(r => r.filename)
    );

    for (const file of files) {
      if (!applied.has(file)) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        d.exec(sql);
        d.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
        console.log(`  Migration applied: ${file}`);
      }
    }
  }

  return d;
}

const dbHelper = {
  init: initDatabase,

  raw() {
    return getDb();
  },

  run(sql, params = []) {
    const stmt = getDb().prepare(sql);
    const result = stmt.run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  },

  get(sql, params = []) {
    return getDb().prepare(sql).get(...params);
  },

  all(sql, params = []) {
    return getDb().prepare(sql).all(...params);
  },

  exec(sql) {
    getDb().exec(sql);
  },

  transaction(fn) {
    return getDb().transaction(fn);
  },

  close() {
    if (db) {
      db.close();
      db = null;
    }
  },
};

if (require.main === module) {
  initDatabase();
  console.log('Database initialized successfully at:', env.dbPath);
}

module.exports = dbHelper;
