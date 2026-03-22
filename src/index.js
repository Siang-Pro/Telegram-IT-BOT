import { loadConfig } from './config.js';
import { openDatabase, getBotTokenFromStore } from './db.js';
import { createHttpServer } from './http/server.js';
import { createBot } from './bot/createBot.js';
import { syncTelegramCommandMenu } from './bot/setMyCommands.js';

const config = loadConfig();
openDatabase(config.databasePath);

const token = getBotTokenFromStore(config.botTokenEnv);
if (!token) {
  console.error(
    '錯誤：未設定 Bot Token。請在 .env 設定 BOT_TOKEN，或於資料庫 settings 寫入 telegram_bot_token 後重啟。'
  );
  process.exit(1);
}

const app = createHttpServer(config);
const server = app.listen(config.port, () => {
  console.log(
    `HTTP 後台與 API 已監聽埠 ${config.port}（後台：http://<主機>:${config.port}/ 或 /admin/）`
  );
});

const bot = createBot({
  token,
  googleSafeBrowsingEnv: config.googleSafeBrowsingEnv,
});

async function shutdown(signal) {
  console.log(`收到 ${signal}，正在關閉…`);
  try {
    await Promise.resolve(bot.stop(signal));
  } catch {
    /* ignore */
  }
  await new Promise((resolve) => {
    server.close(() => resolve());
  });
  process.exit(0);
}

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    void shutdown(sig);
  });
});

bot
  .launch()
  .then(async () => {
    console.log('Telegram Bot 已啟動（Long Polling）');
    try {
      await syncTelegramCommandMenu(bot.telegram);
      console.log('Telegram 斜線指令選單（setMyCommands）已同步');
    } catch (e) {
      console.warn('[setMyCommands] 同步選單失敗，Bot 仍運作：', e);
    }
  })
  .catch((err) => {
    console.error('Bot 啟動失敗：', err);
    process.exit(1);
  });
