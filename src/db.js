import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DEFAULT_NON_WHITELIST =
  '您尚未開通權限。您的 Telegram ID 為 {user_id}，使用者名稱：{username}。請聯絡管理員。';

let dbInstance = null;

/**
 * @param {string} databasePath
 */
export function openDatabase(databasePath) {
  const dir = path.dirname(path.resolve(databasePath));
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS whitelist (
      telegram_user_id INTEGER PRIMARY KEY,
      username TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      disabled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_user_id INTEGER NOT NULL,
      username TEXT,
      is_whitelisted INTEGER NOT NULL,
      message_text TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON usage_logs (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON usage_logs (telegram_user_id);
  `);

  const count = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
  if (count === 0) {
    const ins = db.prepare(
      'INSERT INTO settings (key, value) VALUES (@key, @value)'
    );
    ins.run({ key: 'non_whitelist_reply', value: DEFAULT_NON_WHITELIST });
  }

  dbInstance = db;
  return db;
}

export function getDb() {
  if (!dbInstance) throw new Error('資料庫尚未初始化');
  return dbInstance;
}

export function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

export function setSetting(key, value) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (@key, @value, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run({ key, value: value ?? '' });
}

export function getSettingsForAdmin() {
  const rows = getDb().prepare('SELECT key, value FROM settings ORDER BY key').all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const token = map.telegram_bot_token || '';
  return {
    non_whitelist_reply: map.non_whitelist_reply ?? DEFAULT_NON_WHITELIST,
    google_safe_browsing_key: map.google_safe_browsing_key ?? '',
    telegram_bot_token_masked: token ? `${token.slice(0, 8)}…（已設定）` : '',
    has_telegram_bot_token: Boolean(token),
  };
}

export function patchSettings(body) {
  const allowed = ['non_whitelist_reply', 'google_safe_browsing_key', 'telegram_bot_token'];
  for (const k of allowed) {
    if (body[k] !== undefined) {
      setSetting(k, String(body[k]));
    }
  }
}

export function isUserWhitelisted(telegramUserId) {
  const row = getDb()
    .prepare(
      'SELECT 1 FROM whitelist WHERE telegram_user_id = ? AND disabled_at IS NULL'
    )
    .get(telegramUserId);
  return Boolean(row);
}

export function listWhitelist() {
  return getDb()
    .prepare(
      `SELECT telegram_user_id, username, created_at, disabled_at
       FROM whitelist
       ORDER BY created_at DESC`
    )
    .all();
}

export function upsertWhitelistUser(telegramUserId, username = null) {
  getDb()
    .prepare(
      `INSERT INTO whitelist (telegram_user_id, username, created_at, disabled_at)
       VALUES (?, ?, datetime('now'), NULL)
       ON CONFLICT(telegram_user_id) DO UPDATE SET
         username = COALESCE(excluded.username, whitelist.username),
         disabled_at = NULL`
    )
    .run(telegramUserId, username);
}

export function disableWhitelistUser(telegramUserId) {
  const r = getDb()
    .prepare(
      `UPDATE whitelist SET disabled_at = datetime('now') WHERE telegram_user_id = ?`
    )
    .run(telegramUserId);
  return r.changes > 0;
}

export function deleteWhitelistUser(telegramUserId) {
  const r = getDb()
    .prepare('DELETE FROM whitelist WHERE telegram_user_id = ?')
    .run(telegramUserId);
  return r.changes > 0;
}

export function updateWhitelistUsername(telegramUserId, username) {
  const r = getDb()
    .prepare('UPDATE whitelist SET username = ? WHERE telegram_user_id = ?')
    .run(username, telegramUserId);
  return r.changes > 0;
}

export function insertUsageLog({ telegramUserId, username, isWhitelisted, messageText }) {
  const text =
    messageText && messageText.length > 4000 ? messageText.slice(0, 4000) + '…' : messageText;
  getDb()
    .prepare(
      `INSERT INTO usage_logs (telegram_user_id, username, is_whitelisted, message_text)
       VALUES (?, ?, ?, ?)`
    )
    .run(telegramUserId, username ?? null, isWhitelisted ? 1 : 0, text ?? '');
}

export function listUsageLogs({ page = 1, pageSize = 30, userId = null }) {
  const limit = Math.min(Math.max(Number(pageSize) || 30, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const db = getDb();
  if (userId != null && userId !== '') {
    const uid = Number(userId);
    const total = db
      .prepare('SELECT COUNT(*) AS c FROM usage_logs WHERE telegram_user_id = ?')
      .get(uid).c;
    const rows = db
      .prepare(
        `SELECT id, telegram_user_id, username, is_whitelisted, message_text, created_at
         FROM usage_logs WHERE telegram_user_id = ?
         ORDER BY id DESC LIMIT ? OFFSET ?`
      )
      .all(uid, limit, offset);
    return { total, rows, page: Math.max(Number(page) || 1, 1), pageSize: limit };
  }
  const total = db.prepare('SELECT COUNT(*) AS c FROM usage_logs').get().c;
  const rows = db
    .prepare(
      `SELECT id, telegram_user_id, username, is_whitelisted, message_text, created_at
       FROM usage_logs
       ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(limit, offset);
  return { total, rows, page: Math.max(Number(page) || 1, 1), pageSize: limit };
}

export function getLogById(id) {
  return getDb()
    .prepare(
      `SELECT id, telegram_user_id, username, is_whitelisted, message_text, created_at
       FROM usage_logs WHERE id = ?`
    )
    .get(id);
}

/** 刪除所有對話日誌（管理後台「全部清除」） */
export function deleteAllUsageLogs() {
  const r = getDb().prepare('DELETE FROM usage_logs').run();
  return r.changes;
}

export function getBotTokenFromStore(botTokenEnv) {
  if (botTokenEnv) return botTokenEnv;
  const fromDb = getSetting('telegram_bot_token');
  if (fromDb && fromDb.trim()) return fromDb.trim();
  return '';
}

export function getGoogleSafeBrowsingKey(envKey) {
  const fromDb = getSetting('google_safe_browsing_key');
  if (fromDb && fromDb.trim()) return fromDb.trim();
  return envKey || '';
}
