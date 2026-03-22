import { Router } from 'express';
import * as db from '../../db.js';

export function createSettingsRouter() {
  const r = Router();

  r.get('/', (_req, res) => {
    res.json(db.getSettingsForAdmin());
  });

  r.patch('/', (req, res) => {
    const body = req.body || {};
    if (body.telegram_bot_token === '') {
      delete body.telegram_bot_token;
    }
    db.patchSettings(body);
    const restartHint =
      body.telegram_bot_token != null
        ? '已更新 Bot Token，請重啟 Node 程序後生效（若使用 pm2：pm2 restart <你的程序名稱>，預設可為 telegram-it-bot）。'
        : null;
    res.json({ ok: true, restartHint });
  });

  return r;
}
