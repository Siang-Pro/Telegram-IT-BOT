import { Markup } from 'telegraf';
import { clearPendingTool, setPendingTool, takePendingTool } from './pendingTool.js';
import { runToolByName } from './commands.js';

const TOOL_LABEL = {
  ip: 'IP／地理',
  whois: 'Whois',
  dns: 'DNS',
  og: 'OG 預覽',
  ssl: 'SSL 憑證',
  http: 'HTTP 跳轉',
  port: '埠掃描',
  safe: '安全檢測',
};

const TOOL_HINT = {
  ip: '網域或 IP，例如 google.com 或 1.1.1.1',
  whois: '網域，例如 example.com',
  dns: '網域，例如 example.com',
  og: '完整網址，例如 https://example.com',
  ssl: '網域（可含 https://），例如 example.com',
  http: '網址，例如 https://example.com',
  port: 'IP 或網域',
  safe: '網址，例如 https://example.com',
};

export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🌍 IP／地理', 'tool:ip'),
      Markup.button.callback('📋 Whois', 'tool:whois'),
    ],
    [
      Markup.button.callback('🔍 DNS', 'tool:dns'),
      Markup.button.callback('🔗 OG 預覽', 'tool:og'),
    ],
    [
      Markup.button.callback('🔒 SSL', 'tool:ssl'),
      Markup.button.callback('↪️ HTTP 跳轉', 'tool:http'),
    ],
    [
      Markup.button.callback('🚪 埠掃描', 'tool:port'),
      Markup.button.callback('🛡️ 安全檢測', 'tool:safe'),
    ],
  ]);
}

/**
 * @param {import('telegraf').Telegraf} bot
 * @param {{ googleSafeBrowsingEnv: string }} opts
 */
export function registerInteractiveMenu(bot, opts) {
  bot.use(async (ctx, next) => {
    if (!('message' in ctx.update) || !ctx.message || !('text' in ctx.message)) {
      return next();
    }
    const text = ctx.message.text?.trim() ?? '';
    if (text.startsWith('/')) {
      return next();
    }
    const uid = ctx.from?.id;
    if (uid == null) {
      return next();
    }
    const tool = takePendingTool(uid);
    if (!tool) {
      return next();
    }
    try {
      await runToolByName(ctx, tool, text, opts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.reply(`執行失敗：${msg}`);
    }
  });

  bot.command('menu', async (ctx) => {
    await ctx.reply(
      [
        '點下面按鈕選功能，下一則訊息請直接傳要查的網址／網域／IP（不用打斜線指令）。',
        '隨時可傳 /cancel 取消等待輸入。',
      ].join('\n'),
      { ...mainMenuKeyboard(), disable_web_page_preview: true }
    );
  });

  bot.command('cancel', async (ctx) => {
    clearPendingTool(ctx.from.id);
    await ctx.reply('已取消：不再等待選單輸入。需要時請再傳 /menu。');
  });

  bot.action(/^tool:(ip|whois|dns|og|ssl|http|port|safe)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const tool = ctx.match[1];
    const uid = ctx.from?.id;
    if (uid == null) return;
    setPendingTool(uid, tool);
    const label = TOOL_LABEL[tool] || tool;
    const hint = TOOL_HINT[tool] || '';
    await ctx.reply(
      `已選「${label}」\n請下一則訊息傳送：${hint}\n\n/cancel 可取消。`,
      { disable_web_page_preview: true }
    );
  });
}
