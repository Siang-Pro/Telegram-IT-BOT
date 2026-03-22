import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

/**
 * @param {{ adminUsername: string, adminPassword: string, jwtSecret: string }} config
 */
export function createAuthRouter(config) {
  const r = Router();

  function timingSafeEqual(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  }

  r.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: '需要 username 與 password' });
    }
    const okUser = timingSafeEqual(username, config.adminUsername);
    const okPass = timingSafeEqual(password, config.adminPassword);
    if (!okUser || !okPass) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }
    const token = jwt.sign({ role: 'admin' }, config.jwtSecret, { expiresIn: '12h' });
    return res.json({ token });
  });

  r.post('/logout', (_req, res) => {
    res.json({ ok: true });
  });

  return r;
}
