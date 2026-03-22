const TG_MAX = 4096;

/**
 * @param {string} text
 * @param {number} [maxLen]
 * @returns {string[]}
 */
export function chunkText(text, maxLen = TG_MAX - 64) {
  const s = String(text);
  if (s.length <= maxLen) return [s];
  const parts = [];
  for (let i = 0; i < s.length; i += maxLen) {
    parts.push(s.slice(i, i + maxLen));
  }
  return parts;
}
