import { Telegraf } from 'telegraf';
import * as db from '../db.js';
import { registerCommandHandlers } from './commands.js';
import { registerInteractiveMenu } from './interactiveMenu.js';

function formatNonWhitelistReply(template, from) {
  const uname = from.username ? `@${from.username}` : '（無）';
  return String(template || '')
    .replaceAll('{user_id}', String(from.id))
    .replaceAll('{username}', uname);
}

/**
 * @param {{ token: string, googleSafeBrowsingEnv: string }} opts
 */
export function createBot(opts) {
  const bot = new Telegraf(opts.token);

  bot.use(async (ctx, next) => {
    const from = ctx.from;
    if (!from) {
      return next();
    }

    if ('callback_query' in ctx.update && ctx.callbackQuery) {
      const whitelisted = db.isUserWhitelisted(from.id);
      const cbData = ctx.callbackQuery.data ?? '';
      setImmediate(() => {
        try {
          db.insertUsageLog({
            telegramUserId: from.id,
            username: from.username ?? null,
            isWhitelisted: whitelisted,
            messageText: `[callback] ${cbData}`,
          });
        } catch (err) {
          console.error('[usage_logs]', err);
        }
      });
      if (!whitelisted) {
        await ctx.answerCbQuery('您尚未開通權限', { show_alert: true });
        return;
      }
      return next();
    }

    if (!('message' in ctx.update)) {
      return next();
    }
    const text =
      ctx.message && 'text' in ctx.message && ctx.message.text != null
        ? ctx.message.text
        : '';
    const whitelisted = db.isUserWhitelisted(from.id);
    setImmediate(() => {
      try {
        db.insertUsageLog({
          telegramUserId: from.id,
          username: from.username ?? null,
          isWhitelisted: whitelisted,
          messageText: text,
        });
      } catch (err) {
        console.error('[usage_logs]', err);
      }
    });
    if (!whitelisted) {
      const tpl =
        db.getSetting('non_whitelist_reply') ||
        '您尚未開通權限。您的 Telegram ID 為 {user_id}，請聯絡管理員。';
      await ctx.reply(formatNonWhitelistReply(tpl, from), {
        disable_web_page_preview: true,
      });
      return;
    }
    return next();
  });

  registerInteractiveMenu(bot, { googleSafeBrowsingEnv: opts.googleSafeBrowsingEnv });
  registerCommandHandlers(bot, { googleSafeBrowsingEnv: opts.googleSafeBrowsingEnv });

  return bot;
}
