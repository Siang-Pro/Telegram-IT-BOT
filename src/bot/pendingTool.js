/** 使用者點選選單後，下一則純文字當作查詢參數 */

const pending = new Map();
const TTL_MS = 10 * 60 * 1000;

/**
 * @param {number} userId
 * @param {string} tool ip|whois|dns|og|ssl|http|port|safe
 */
export function setPendingTool(userId, tool) {
  pending.set(userId, { tool, at: Date.now() });
}

export function clearPendingTool(userId) {
  pending.delete(userId);
}

/**
 * 讀取並清除（處理下一則訊息時呼叫）
 * @returns {string | null}
 */
export function takePendingTool(userId) {
  const rec = pending.get(userId);
  if (!rec) return null;
  if (Date.now() - rec.at > TTL_MS) {
    pending.delete(userId);
    return null;
  }
  pending.delete(userId);
  return rec.tool;
}
