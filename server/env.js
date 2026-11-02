/**
 * 极简 .env 加载器，避免引入 dotenv 依赖。
 * 被 server.js 和 tencent-wsa.js 共用，保证命令行调试时也能读到密钥。
 */

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    // 已存在的环境变量优先，便于临时用命令行覆盖
    if (key && !process.env[key]) process.env[key] = value;
  }
}

loadEnv();

module.exports = { loadEnv };
