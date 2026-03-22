/**
 * NetworkCalc 對部分 TLD（如 .pro）whois 常為全 null，改查 IANA RDAP bootstrap 對應之註冊局 RDAP。
 * @see https://www.rfc-editor.org/rfc/rfc9082.html
 */

const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const FETCH_MS = 15000;
const BOOTSTRAP_TTL_MS = 86_400_000;

/** @type {Map<string, string> | null} */
let bootstrapMapCache = null;
let bootstrapFetchedAt = 0;

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: 'application/json, application/rdap+json, */*' },
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {unknown} json
 * @returns {Map<string, string>}
 */
function parseBootstrapToMap(json) {
  const map = new Map();
  if (!json || typeof json !== 'object' || !Array.isArray(json.services)) {
    return map;
  }
  for (const svc of json.services) {
    if (!Array.isArray(svc) || svc.length < 2) continue;
    const tlds = svc[0];
    const urls = svc[1];
    if (!Array.isArray(tlds) || !Array.isArray(urls)) continue;
    const base = String(urls[0] || '').replace(/\/$/, '');
    if (!base) continue;
    for (const raw of tlds) {
      map.set(String(raw).toLowerCase(), base);
    }
  }
  return map;
}

export async function getRdapBootstrapMap() {
  const now = Date.now();
  if (bootstrapMapCache && now - bootstrapFetchedAt < BOOTSTRAP_TTL_MS) {
    return bootstrapMapCache;
  }
  const res = await fetchJson(BOOTSTRAP_URL);
  if (!res.ok) {
    throw new Error(`RDAP bootstrap HTTP ${res.status}`);
  }
  const json = await res.json();
  bootstrapMapCache = parseBootstrapToMap(json);
  bootstrapFetchedAt = now;
  return bootstrapMapCache;
}

/**
 * @param {string} fqdn ASCII/punycode 小寫網域
 * @param {Map<string, string>} map
 */
export function resolveRdapDomainUrl(fqdn, map) {
  const lower = fqdn.toLowerCase().trim();
  const labels = lower.split('.').filter(Boolean);
  if (labels.length < 2) return null;
  for (let i = labels.length - 1; i >= 1; i--) {
    const suffix = labels.slice(i).join('.');
    const base = map.get(suffix);
    if (base) {
      return `${base}/domain/${encodeURIComponent(lower)}`;
    }
  }
  return null;
}

/**
 * @param {unknown} vcardArray
 */
function vcardFn(vcardArray) {
  if (!Array.isArray(vcardArray) || vcardArray[0] !== 'vcard') return '';
  const rows = vcardArray[1];
  if (!Array.isArray(rows)) return '';
  for (const row of rows) {
    if (Array.isArray(row) && row[0] === 'fn' && row[3]) {
      const v = String(row[3]).trim();
      if (v) return v;
    }
  }
  return '';
}

function formatIsoDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return `${d.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
  } catch {
    return String(iso);
  }
}

/**
 * @param {string} fqdn
 * @returns {Promise<string[] | null>} 可貼給使用者的文字行，失敗則 null
 */
export async function tryRdapWhoisLines(fqdn) {
  const map = await getRdapBootstrapMap();
  const rdapUrl = resolveRdapDomainUrl(fqdn, map);
  if (!rdapUrl) return null;

  const res = await fetchJson(rdapUrl);
  if (res.status === 404) return null;
  if (!res.ok) return null;

  const rdap = await res.json();
  if (rdap?.errorCode != null) return null;

  const name = rdap.ldhName || rdap.unicodeName || fqdn;

  let registrar = '';
  const entities = rdap.entities || [];
  for (const e of entities) {
    const roles = e.roles || [];
    if (roles.includes('registrar')) {
      registrar = vcardFn(e.vcardArray);
      if (registrar) break;
    }
  }

  let created = '';
  let expires = '';
  for (const ev of rdap.events || []) {
    const act = String(ev.eventAction || '').toLowerCase();
    if (act === 'registration' && ev.eventDate) created = formatIsoDate(ev.eventDate);
    if (act === 'expiration' && ev.eventDate) expires = formatIsoDate(ev.eventDate);
  }

  const status = Array.isArray(rdap.status) && rdap.status.length > 0 ? rdap.status.join(', ') : '';
  const ns = (rdap.nameservers || [])
    .map((n) => n.ldhName || n.unicodeName)
    .filter(Boolean)
    .join(', ');

  const hasAny = Boolean(registrar || created || expires || status || ns);
  if (!hasAny) return null;

  const lines = [
    `網域：${name}`,
    `註冊商：${registrar || '-'}`,
    `建立：${created || '-'}`,
    `到期：${expires || '-'}`,
  ];
  if (status) lines.push(`狀態：${status}`);
  if (ns) lines.push(`NS：${ns}`);
  lines.push('', '（資料來源：RDAP；IANA bootstrap）');

  return lines;
}
