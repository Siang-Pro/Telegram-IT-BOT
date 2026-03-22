/**
 * Telegram 用戶端「選單」按鈕與輸入 / 時顯示的指令列表（setMyCommands）
 * @see https://core.telegram.org/bots/api#setmycommands
 */

/** @type {{ command: string, description: string }[]} */
export const TELEGRAM_BOT_COMMANDS = [
  { command: 'start', description: '開始使用（簡介）' },
  { command: 'help', description: '完整指令列表與用法' },
  { command: 'menu', description: '按鈕選功能，下一則訊息輸入查詢' },
  { command: 'cancel', description: '取消選單等待輸入' },
  { command: 'ip', description: 'IP／網域地理與 ISP' },
  { command: 'whois', description: '網域 Whois（註冊商、到期）' },
  { command: 'dns', description: 'DNS 紀錄 A／MX／TXT' },
  { command: 'og', description: '網頁 OG／社群預覽' },
  { command: 'ssl', description: 'SSL 憑證到期與發證者' },
  { command: 'http', description: 'HTTP 狀態與跳轉鏈' },
  { command: 'port', description: '常見埠連線偵測' },
  { command: 'safe', description: 'Safe Browsing 安全檢測' },
];

/**
 * @param {import('telegraf').Telegram} telegram
 */
export async function syncTelegramCommandMenu(telegram) {
  await telegram.setMyCommands(TELEGRAM_BOT_COMMANDS, {
    scope: { type: 'all_private_chats' },
  });
}
