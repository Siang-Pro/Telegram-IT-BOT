import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import * as cheerio from 'cheerio';
import { chunkText } from '../util/messageChunk.js';
import {
  validatePublicHttpUrl,
  assertResolvablePublicHost,
  isBlockedIp,
} from '../util/ssrf.js';
import * as db from '../db.js';
import { tryRdapWhoisLines } from '../util/rdapWhois.js';

const FETCH_TIMEOUT_MS = 15000;
const COMMON_PORTS = [21, 22, 25, 53, 80, 110, 143, 443, 445, 3306, 3389, 5432, 8080, 8443];
const PORT_PROBE_MS = 2500;

function argFromCtx(ctx) {
  const text = ctx.message?.text || '';
  return text.split(/\s+/).slice(1).join(' ').trim();
}

/** 選單流程會傳入上一則純文字當參數；否則沿用指令後方參數 */
function resolveArg(ctx, argOverride) {
  if (argOverride !== undefined && argOverride !== null && String(argOverride).trim() !== '') {
    return String(argOverride).trim();
  }
  return argFromCtx(ctx);
}

async function replyChunks(ctx, text) {
  const parts = chunkText(text);
  for (const p of parts) {
    await ctx.reply(p, { disable_web_page_preview: true });
  }
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {string} hostOrQuery
 */
function assertNotPrivateHostLiteral(hostOrQuery) {
  const h = hostOrQuery.trim();
  if (net.isIP(h) && isBlockedIp(h)) {
    throw new Error('不允許查詢內網或保留位址');
  }
}

export async function cmdIp(ctx, argOverride) {
  const q = resolveArg(ctx, argOverride);
  if (!q) {
    await ctx.reply('用法：/ip <網域或 IP>');
    return;
  }
  assertNotPrivateHostLiteral(q);
  const url = `http://ip-api.com/json/${encodeURIComponent(q)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`ip-api 回應 ${res.status}`);
  const data = await res.json();
  if (data.status === 'fail') {
    await ctx.reply(`查詢失敗：${data.message || 'unknown'}`);
    return;
  }
  const lines = [
    `查詢：${q}`,
    `國家：${data.country || '-'} (${data.countryCode || '-'})`,
    `地區：${data.regionName || '-'} / 城市：${data.city || '-'}`,
    `ISP：${data.isp || '-'}`,
    `座標：${data.lat ?? '-'}, ${data.lon ?? '-'}`,
    `ZIP：${data.zip || '-'}`,
  ];
  await replyChunks(ctx, lines.join('\n'));
}

function pickFirstNonEmpty(...vals) {
  for (const v of vals) {
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '-';
}

export async function cmdWhois(ctx, argOverride) {
  const domain = resolveArg(ctx, argOverride);
  if (!domain) {
    await ctx.reply('用法：/whois <網域>');
    return;
  }
  assertNotPrivateHostLiteral(domain);
  const url = `https://networkcalc.com/api/dns/whois/${encodeURIComponent(domain)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Whois API 回應 ${res.status}`);
  const data = await res.json();
  if (data?.status && String(data.status).toUpperCase() !== 'OK') {
    await ctx.reply(`Whois API：${data.status}${data.message ? ` — ${data.message}` : ''}`);
    return;
  }
  const w = data?.whois || data?.data?.whois || data;
  const registrar = pickFirstNonEmpty(
    w?.registrar,
    w?.Registrar,
    data?.registrar,
    data?.registrar_name
  );
  /** NetworkCalc 使用 registry_* 欄位 */
  const created = pickFirstNonEmpty(
    w?.registry_created_date,
    w?.creation_date,
    w?.created,
    w?.createdDate,
    data?.creation_date
  );
  const expires = pickFirstNonEmpty(
    w?.registry_expiration_date,
    w?.expiration_date,
    w?.expires,
    w?.expiryDate,
    data?.expiration_date
  );
  const status = pickFirstNonEmpty(w?.domain_status, w?.domain_status_description);
  const registryId = pickFirstNonEmpty(w?.registry_domain_id);
  const abuse = pickFirstNonEmpty(w?.abuse_email, w?.abuse_phone);

  let lines = [
    `網域：${data?.hostname || domain}`,
    `註冊商：${registrar}`,
    `建立：${created}`,
    `到期：${expires}`,
  ];
  if (status !== '-') lines.push(`狀態：${status}`);
  if (registryId !== '-') lines.push(`Registry ID：${registryId}`);
  if (abuse !== '-') lines.push(`濫用通報：${abuse}`);

  const coreEmpty = registrar === '-' && created === '-' && expires === '-';
  if (coreEmpty) {
    try {
      const rdapLines = await tryRdapWhoisLines(domain.trim().toLowerCase());
      if (rdapLines?.length) {
        await replyChunks(ctx, rdapLines.join('\n'));
        return;
      }
    } catch {
      /* RDAP／bootstrap 失敗則沿用 NetworkCalc 輸出 */
    }
  }

  const allDash =
    registrar === '-' && created === '-' && expires === '-' && status === '-' && registryId === '-';
  if (allDash && w && typeof w === 'object') {
    lines.push('', '（NetworkCalc 無資料且 RDAP 未取回，以下為 API 原始 whois 物件）');
    lines.push(JSON.stringify(w, null, 2).slice(0, 3500));
  }
  await replyChunks(ctx, lines.join('\n'));
}

async function dnsViaDoh(name, type) {
  const u = new URL('https://cloudflare-dns.com/dns-query');
  u.searchParams.set('name', name);
  u.searchParams.set('type', type);
  const res = await fetchWithTimeout(u.toString(), {
    headers: { accept: 'application/dns-json' },
  });
  if (!res.ok) throw new Error(`DoH ${type} ${res.status}`);
  return res.json();
}

function formatDohAnswer(json) {
  const ans = json?.Answer || [];
  return ans.map((a) => `${a.type} ${a.data}`).join('\n') || '（無紀錄）';
}

export async function cmdDns(ctx, argOverride) {
  const name = resolveArg(ctx, argOverride);
  if (!name) {
    await ctx.reply('用法：/dns <網域>');
    return;
  }
  assertNotPrivateHostLiteral(name);
  const sections = [];
  let nativeError = null;
  let a = [];
  let aaaa = [];
  let mx = [];
  let txt = [];
  try {
    a = await dns.resolve4(name).catch(() => []);
    aaaa = await dns.resolve6(name).catch(() => []);
    mx = await dns.resolveMx(name).catch(() => []);
    txt = await dns.resolveTxt(name).catch(() => []);
  } catch (e) {
    nativeError = e instanceof Error ? e.message : String(e);
  }
  if (nativeError) {
    sections.push(`系統 DNS 錯誤：${nativeError}`);
  } else {
    sections.push(`A:\n${a.length ? a.join('\n') : '（無）'}`);
    sections.push(`AAAA:\n${aaaa.length ? aaaa.join('\n') : '（無）'}`);
    sections.push(
      `MX:\n${mx.length ? mx.map((m) => `${m.priority} ${m.exchange}`).join('\n') : '（無）'}`
    );
    sections.push(
      `TXT:\n${txt.length ? txt.map((arr) => arr.join('')).join('\n') : '（無）'}`
    );
  }
  const anyNative =
    !nativeError && (a.length > 0 || aaaa.length > 0 || mx.length > 0 || txt.length > 0);
  if (!anyNative) {
    try {
      const [aj, amx, atxt] = await Promise.all([
        dnsViaDoh(name, 'A'),
        dnsViaDoh(name, 'MX'),
        dnsViaDoh(name, 'TXT'),
      ]);
      sections.push('— Cloudflare DoH 備援 —');
      sections.push(`A:\n${formatDohAnswer(aj)}`);
      sections.push(`MX:\n${formatDohAnswer(amx)}`);
      sections.push(`TXT:\n${formatDohAnswer(atxt)}`);
    } catch (e2) {
      sections.push(`DoH 亦失敗：${e2 instanceof Error ? e2.message : String(e2)}`);
    }
  }
  await replyChunks(ctx, `網域：${name}\n\n${sections.join('\n\n')}`);
}

export async function cmdOg(ctx, argOverride) {
  const raw = resolveArg(ctx, argOverride);
  if (!raw) {
    await ctx.reply('用法：/og <URL>');
    return;
  }
  let urlStr = raw;
  if (!/^https?:\/\//i.test(urlStr)) urlStr = `https://${urlStr}`;
  const v = validatePublicHttpUrl(urlStr);
  if (!v.ok) {
    await ctx.reply(v.reason);
    return;
  }
  await assertResolvablePublicHost(v.url.hostname);
  try {
    const res = await fetchWithTimeout(v.url.toString(), {
      headers: {
        'user-agent': 'Telegram-IT-BOT/1.0 (+https://telegram.org)',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    const html = await res.text();
    const max = 800_000;
    const $ = cheerio.load(html.length > max ? html.slice(0, max) : html);
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      '-';
    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      '-';
    const desc =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '-';
    await replyChunks(
      ctx,
      `URL：${v.url.toString()}\n\nog:title：${title}\n\nog:image：${image}\n\n描述：${desc}`
    );
  } catch (e) {
    const micUrl = `https://api.microlink.io?url=${encodeURIComponent(v.url.toString())}`;
    const mres = await fetchWithTimeout(micUrl);
    if (!mres.ok) throw e;
    const mj = await mres.json();
    const d = mj?.data || {};
    await replyChunks(
      ctx,
      `（Microlink 備援）\n標題：${d.title || '-'}\n圖片：${d.image?.url || d.image || '-'}\n描述：${d.description || '-'}`
    );
  }
}

export async function cmdSsl(ctx, argOverride) {
  const host = resolveArg(ctx, argOverride)
    .replace(/^https?:\/\//i, '')
    .split('/')[0];
  if (!host) {
    await ctx.reply('用法：/ssl <網域>');
    return;
  }
  assertNotPrivateHostLiteral(host);
  await assertResolvablePublicHost(host);
  const result = await new Promise((resolve, reject) => {
    const socket = tls.connect(
      443,
      host,
      { servername: host, rejectUnauthorized: false },
      () => {
        try {
          const cert = socket.getPeerCertificate(true);
          socket.end();
          resolve(cert);
        } catch (err) {
          try {
            socket.destroy();
          } catch {
            /* ignore */
          }
          reject(err);
        }
      }
    );
    socket.setTimeout(10000, () => {
      socket.destroy();
      reject(new Error('連線逾時'));
    });
    socket.on('error', (err) => {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      reject(err);
    });
  });
  if (!result || Object.keys(result).length === 0) {
    await ctx.reply('無法取得憑證資訊');
    return;
  }
  const validTo = result.valid_to || '-';
  const issuer =
    typeof result.issuer === 'object'
      ? result.issuer.O || JSON.stringify(result.issuer)
      : result.issuer || '-';
  let days = '-';
  if (validTo && validTo !== '-') {
    const end = new Date(validTo).getTime();
    if (!Number.isNaN(end)) {
      days = String(Math.ceil((end - Date.now()) / 86400000));
    }
  }
  await ctx.reply(
    `主機：${host}\n到期：${validTo}\n剩餘約 ${days} 天\n發證者：${issuer}`,
    { disable_web_page_preview: true }
  );
}

export async function cmdHttp(ctx, argOverride) {
  const raw = resolveArg(ctx, argOverride);
  if (!raw) {
    await ctx.reply('用法：/http <URL>');
    return;
  }
  let urlStr = raw;
  if (!/^https?:\/\//i.test(urlStr)) urlStr = `https://${urlStr}`;
  const v = validatePublicHttpUrl(urlStr);
  if (!v.ok) {
    await ctx.reply(v.reason);
    return;
  }
  await assertResolvablePublicHost(v.url.hostname);
  const chain = [];
  let current = v.url.toString();
  const seen = new Set();
  for (let i = 0; i < 15; i++) {
    if (seen.has(current)) {
      chain.push('（偵測到重定向迴圈）');
      break;
    }
    seen.add(current);
    const res = await fetchWithTimeout(current, {
      redirect: 'manual',
      headers: { 'user-agent': 'Telegram-IT-BOT/1.0' },
    });
    const loc = res.headers.get('location');
    chain.push(`${res.status} ${current}`);
    if (res.status >= 300 && res.status < 400 && loc) {
      const nextUrl = new URL(loc, current).toString();
      const check = validatePublicHttpUrl(nextUrl);
      if (!check.ok) {
        chain.push(`已阻擋跳轉：${check.reason}`);
        break;
      }
      await assertResolvablePublicHost(check.url.hostname);
      current = check.url.toString();
      continue;
    }
    break;
  }
  await replyChunks(ctx, `跳轉鏈：\n${chain.join('\n→\n')}`);
}

function probePort(host, port, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.createConnection({ host, port });

    const done = (open) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(open);
    };

    const timer = setTimeout(() => done(false), timeoutMs);
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}

export async function cmdPort(ctx, argOverride) {
  const target = resolveArg(ctx, argOverride)
    .replace(/^https?:\/\//i, '')
    .split('/')[0];
  if (!target) {
    await ctx.reply('用法：/port <IP 或網域>');
    return;
  }
  assertNotPrivateHostLiteral(target);
  await assertResolvablePublicHost(target);
  const results = [];
  for (const p of COMMON_PORTS) {
    const open = await probePort(target, p, PORT_PROBE_MS);
    if (open) results.push(String(p));
  }
  const msg =
    results.length > 0
      ? `主機：${target}\n開放埠（常見清單）：${results.join(', ')}`
      : `主機：${target}\n常見埠未偵測到開放（或遭防火牆阻擋）`;
  await ctx.reply(msg, { disable_web_page_preview: true });
}

export async function cmdSafe(ctx, googleApiKey, argOverride) {
  const raw = resolveArg(ctx, argOverride);
  if (!raw) {
    await ctx.reply('用法：/safe <URL>');
    return;
  }
  let urlStr = raw;
  if (!/^https?:\/\//i.test(urlStr)) urlStr = `https://${urlStr}`;
  const v = validatePublicHttpUrl(urlStr);
  if (!v.ok) {
    await ctx.reply(v.reason);
    return;
  }
  await assertResolvablePublicHost(v.url.hostname);
  const key = googleApiKey?.trim();
  if (!key) {
    await ctx.reply('尚未設定 Google Safe Browsing API Key（後台或環境變數）。');
    return;
  }
  const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`;
  const body = {
    client: { clientId: 'telegram-it-bot', clientVersion: '1.0.0' },
    threatInfo: {
      threatTypes: [
        'MALWARE',
        'SOCIAL_ENGINEERING',
        'UNWANTED_SOFTWARE',
        'POTENTIALLY_HARMFUL_APPLICATION',
      ],
      platformTypes: ['ANY_PLATFORM'],
      threatEntryTypes: ['URL'],
      threatEntries: [{ url: v.url.toString() }],
    },
  };
  const res = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    await ctx.reply(`Safe Browsing API 錯誤：${res.status} ${text.slice(0, 500)}`);
    return;
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    await ctx.reply('API 回應非 JSON');
    return;
  }
  const matches = json?.matches;
  if (matches && matches.length > 0) {
    await replyChunks(
      ctx,
      `URL：${v.url.toString()}\n偵測到威脅資訊（請謹慎）：\n${JSON.stringify(matches, null, 2).slice(0, 3800)}`
    );
  } else {
    await ctx.reply(`URL：${v.url.toString()}\n未在 Safe Browsing 報告中發現已知威脅類型。`);
  }
}

export async function cmdStart(ctx) {
  await ctx.reply(
    [
      '歡迎使用 Telegram IT BOT。',
      '可傳 /menu 用按鈕選功能，下一則訊息再輸入網址或 IP；亦可點「選單」或 / 使用斜線指令。',
      '完整列表請用 /help。（須管理員將您加入白名單後方可使用各項查詢。）',
    ].join('\n'),
    { disable_web_page_preview: true }
  );
}

export async function cmdHelp(ctx) {
  await ctx.reply(
    [
      '可用指令（須具白名單）：',
      '/menu — 圖形按鈕選功能，下一則訊息再傳查詢目標；/cancel 取消等待。',
      '亦可點「選單」或輸入 / 快速帶出斜線指令。',
      '',
      '/ip <網域或IP>',
      '/whois <網域>',
      '/dns <網域>',
      '/og <URL>',
      '/ssl <網域>',
      '/http <URL>',
      '/port <IP或網域>',
      '/safe <URL>',
    ].join('\n'),
    { disable_web_page_preview: true }
  );
}

/**
 * 選單流程：依工具名稱執行與斜線指令相同的邏輯
 * @param {string} tool ip|whois|dns|og|ssl|http|port|safe
 * @param {string} input 使用者下一則訊息全文
 * @param {{ googleSafeBrowsingEnv: string }} opts
 */
export async function runToolByName(ctx, tool, input, opts) {
  const key = db.getGoogleSafeBrowsingKey(opts.googleSafeBrowsingEnv);
  switch (tool) {
    case 'ip':
      return cmdIp(ctx, input);
    case 'whois':
      return cmdWhois(ctx, input);
    case 'dns':
      return cmdDns(ctx, input);
    case 'og':
      return cmdOg(ctx, input);
    case 'ssl':
      return cmdSsl(ctx, input);
    case 'http':
      return cmdHttp(ctx, input);
    case 'port':
      return cmdPort(ctx, input);
    case 'safe':
      return cmdSafe(ctx, key, input);
    default:
      await ctx.reply('未知工具');
  }
}

/**
 * @param {import('telegraf').Telegraf} bot
 * @param {{ googleSafeBrowsingEnv: string }} opts
 */
export function registerCommandHandlers(bot, opts) {
  const wrap =
    (fn) =>
    async (ctx) => {
      try {
        await fn(ctx);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await ctx.reply(`執行失敗：${msg}`);
      }
    };

  bot.command('start', wrap(cmdStart));
  bot.command('help', wrap(cmdHelp));
  bot.command('ip', wrap(cmdIp));
  bot.command('whois', wrap(cmdWhois));
  bot.command('dns', wrap(cmdDns));
  bot.command('og', wrap(cmdOg));
  bot.command('ssl', wrap(cmdSsl));
  bot.command('http', wrap(cmdHttp));
  bot.command('port', wrap(cmdPort));
  bot.command('safe', wrap((ctx) => cmdSafe(ctx, db.getGoogleSafeBrowsingKey(opts.googleSafeBrowsingEnv))));
}
