import { Router } from 'express';
import * as db from '../../db.js';

export function createWhitelistRouter() {
  const r = Router();

  r.get('/', (_req, res) => {
    const rows = db.listWhitelist();
    res.json({
      items: rows.map((row) => ({
        telegram_user_id: row.telegram_user_id,
        username: row.username,
        created_at: row.created_at,
        disabled: row.disabled_at != null,
      })),
    });
  });

  r.post('/', (req, res) => {
    const id = Number(req.body?.telegram_user_id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'telegram_user_id 無效' });
    }
    if (db.isUserWhitelisted(id)) {
      return res.status(409).json({ error: '此使用者已在有效白名單中' });
    }
    const username = req.body?.username != null ? String(req.body.username) : null;
    db.upsertWhitelistUser(id, username || null);
    res.status(201).json({ ok: true });
  });

  r.delete('/:telegramUserId', (req, res) => {
    const id = Number(req.params.telegramUserId);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID 無效' });
    }
    const deleted = db.deleteWhitelistUser(id);
    if (!deleted) {
      return res.status(404).json({ error: '找不到此使用者' });
    }
    res.json({ ok: true });
  });

  r.patch('/:telegramUserId', (req, res) => {
    const id = Number(req.params.telegramUserId);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID 無效' });
    }
    const { disabled, username } = req.body || {};
    if (disabled === true) {
      const ok = db.disableWhitelistUser(id);
      if (!ok) return res.status(404).json({ error: '找不到此使用者' });
      return res.json({ ok: true });
    }
    if (disabled === false) {
      db.upsertWhitelistUser(id, null);
      return res.json({ ok: true });
    }
    if (username != null) {
      const ok = db.updateWhitelistUsername(id, String(username));
      if (!ok) return res.status(404).json({ error: '找不到此使用者' });
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: '無有效欄位' });
  });

  return r;
}
