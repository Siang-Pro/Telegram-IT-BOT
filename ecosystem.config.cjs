/** pm2 程序名稱可自訂；更新 Token 後請重啟程序，例如：pm2 restart telegram-it-bot
 *  記憶體極小主機（如 512MB 級）可改低 max_memory_restart，或靠 .env 的 NODE_OPTIONS 限堆積
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
      max_memory_restart: '280M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
