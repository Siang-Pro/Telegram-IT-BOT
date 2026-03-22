import 'dotenv/config';

function required(name, value) {
  if (value == null || String(value).trim() === '') {
    throw new Error(`缺少環境變數 ${name}，請參考 .env.example`);
  }
}

export function loadConfig() {
  const port = Number(process.env.PORT || 3000);
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const jwtSecret = process.env.JWT_SECRET;
  const databasePath = process.env.DATABASE_PATH || './data/app.db';

  required('ADMIN_USERNAME', adminUsername);
  required('ADMIN_PASSWORD', adminPassword);
  required('JWT_SECRET', jwtSecret);

  return {
    port,
    adminUsername,
    adminPassword,
    jwtSecret,
    databasePath,
    botTokenEnv: process.env.BOT_TOKEN?.trim() || '',
    googleSafeBrowsingEnv: process.env.GOOGLE_SAFE_BROWSING_API_KEY?.trim() || '',
  };
}
