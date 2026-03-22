import { Router } from 'express';
import * as db from '../../db.js';

export function createLogsRouter() {
  const r = Router();

  r.get('/', (req, res) => {
    const page = req.query.page;
    const pageSize = req.query.pageSize;
    const userId = req.query.user_id;
    const result = db.listUsageLogs({ page, pageSize, userId });
    res.json({
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      items: result.rows.map((row) => ({
        id: row.id,
        telegram_user_id: row.telegram_user_id,
        username: row.username,
        is_whitelisted: Boolean(row.is_whitelisted),
        message_text: row.message_text,
        created_at: row.created_at,
      })),
    });
  });

  r.delete('/', (_req, res) => {
    const deleted = db.deleteAllUsageLogs();
    res.json({ ok: true, deleted });
  });

  r.post('/:logId/add-to-whitelist', (req, res) => {
    const logId = Number(req.params.logId);
    if (!Number.isFinite(logId)) {
      return res.status(400).json({ error: 'logId 無效' });
    }
    const log = db.getLogById(logId);
    if (!log) {
      return res.status(404).json({ error: '找不到日誌' });
    }
    const uid = log.telegram_user_id;
    if (db.isUserWhitelisted(uid)) {
      return res.status(409).json({ error: '此使用者已在有效白名單中' });
    }
    db.upsertWhitelistUser(uid, log.username);
    res.json({ ok: true });
  });

  return r;
}
