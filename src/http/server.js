import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthMiddleware } from './authMiddleware.js';
import { createAuthRouter } from './routes/auth.js';
import { createSettingsRouter } from './routes/settings.js';
import { createWhitelistRouter } from './routes/whitelist.js';
import { createLogsRouter } from './routes/logs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(__dirname, '../../public');

/** @param {{ port: number, jwtSecret: string, adminUsername: string, adminPassword: string }} config */
export function createHttpServer(config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '512kb' }));

  const auth = createAuthMiddleware(config.jwtSecret);

  app.use('/api/auth', createAuthRouter(config));
  app.use('/api/settings', auth, createSettingsRouter());
  app.use('/api/whitelist', auth, createWhitelistRouter());
  app.use('/api/logs', auth, createLogsRouter());

  const adminDir = path.resolve(publicRoot, 'admin');
  const adminIndexHtml = path.join(adminDir, 'index.html');

  /** 一律 200 + sendFile，不使用 302／static 的目錄導向，避免與 HidenCloud 代理疊加成 ERR_TOO_MANY_REDIRECTS */
  function sendAdminIndex(_req, res, next) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(adminIndexHtml, (err) => {
      if (err) next(err);
    });
  }

  app.get('/', sendAdminIndex);
  app.get('/admin', sendAdminIndex);
  app.get('/admin/', sendAdminIndex);

  app.use(
    express.static(adminDir, {
      index: false,
      redirect: false,
    })
  );

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return app;
}
