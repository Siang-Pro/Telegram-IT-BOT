import jwt from 'jsonwebtoken';

/**
 * @param {string} jwtSecret
 */
export function createAuthMiddleware(jwtSecret) {
  return function authMiddleware(req, res, next) {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授權' });
    }
    const token = h.slice(7);
    try {
      jwt.verify(token, jwtSecret);
      next();
    } catch {
      return res.status(401).json({ error: 'Token 無效或已過期' });
    }
  };
}
