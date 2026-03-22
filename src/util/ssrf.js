import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  'metadata',
]);

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(ip) {
  const norm = ip.toLowerCase();
  if (norm === '::1') return true;
  if (norm.startsWith('fe80:')) return true;
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true;
  if (norm.startsWith('::ffff:')) {
    const v4 = norm.slice(7);
    return isPrivateIpv4(v4);
  }
  return false;
}

export function isBlockedIp(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  if (net.isIPv6(ip)) return isPrivateIpv6(ip);
  return true;
}

/**
 * @param {string} rawUrl
 * @returns {{ ok: true, url: URL } | { ok: false, reason: string }}
 */
export function validatePublicHttpUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: 'URL 格式無效' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: '僅允許 http 或 https' };
  }
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: '此主機名稱不允許' };
  }
  if (host.endsWith('.local') || host.endsWith('.localhost')) {
    return { ok: false, reason: '此主機名稱不允許' };
  }
  if (net.isIP(host)) {
    if (isBlockedIp(host)) return { ok: false, reason: '不允許連線至內網或保留位址' };
    return { ok: true, url: u };
  }
  return { ok: true, url: u, hostname: host };
}

/**
 * 解析 hostname 後檢查是否全部為可連線的公網位址
 * @param {string} hostname
 */
export async function assertResolvablePublicHost(hostname) {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h) || h.endsWith('.local')) {
    throw new Error('此主機名稱不允許');
  }
  if (net.isIP(h)) {
    if (isBlockedIp(h)) throw new Error('不允許連線至內網或保留位址');
    return;
  }
  const results = await Promise.allSettled([
    dns.resolve4(h).catch(() => []),
    dns.resolve6(h).catch(() => []),
  ]);
  const ips = [
    ...(results[0].status === 'fulfilled' ? results[0].value : []),
    ...(results[1].status === 'fulfilled' ? results[1].value : []),
  ];
  if (ips.length === 0) throw new Error('無法解析網域');
  for (const ip of ips) {
    if (isBlockedIp(ip)) throw new Error('解析結果含內網或保留位址，已阻擋');
  }
}
