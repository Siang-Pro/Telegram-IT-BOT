/** pm2 範例（預設依 ~4GB RAM 主機調整）
 *
 * - max_memory_restart：程序 RSS 超過此值時 pm2 會重啟（防記憶體外洩）。4G 機器可設 1G～1.5G；僅 512MB～1G 小主機請改回 280M～512M。
 * - NODE_OPTIONS --max-old-space-size：V8 堆積上限，需在「啟動 Node 前」由環境帶入才有效；用 pm2 時宜寫在此檔或主機面板環境變數。4G 機器設 2048 通常足夠；若與 .env 重複定義，以實際啟動時載入為準（建議只留一處）。
 *
 * 更新 Token 後請重啟：pm2 restart telegram-it-bot
 */
module.exports = {
  apps: [
    {
      name: 'telegram-it-bot',
      script: 'index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=2048',
      },
    },
  ],
};
