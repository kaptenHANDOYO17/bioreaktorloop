'use strict';
/* Pengaturan dari file .env (lokal) atau Environment Variables (Vercel).
   Tanpa pustaka tambahan. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    else val = val.replace(/\s+#.*$/, '');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv(path.join(ROOT, '.env'));

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const bool = (k, d) => { const v = env(k, d ? 'true' : 'false'); return /^(1|true|ya|yes|on)$/i.test(String(v)); };
const num = (k, d) => { const v = parseFloat(env(k, d)); return Number.isFinite(v) ? v : d; };
const list = k => String(env(k, '')).split(',').map(s => s.trim()).filter(Boolean);

const IS_VERCEL = !!process.env.VERCEL;
/* Supabase (integrasi Vercel) memberi POSTGRES_URL; Neon memberi DATABASE_URL. */
const DATABASE_URL = env('DATABASE_URL', env('POSTGRES_URL', ''));
/* Di Vercel hanya /tmp yang bisa ditulis (sementara). Tanpa DATABASE_URL data akan hilang. */
const DATA_DIR = IS_VERCEL && !DATABASE_URL ? '/tmp/bioloop-data' : path.resolve(ROOT, env('DATA_DIR', 'data'));

/* Kunci rahasia sesi. Bila tidak diisi: diturunkan dari DATABASE_URL (sudah rahasia),
   atau dibuat acak dan disimpan di data/.secret untuk mode lokal. */
function deriveSecret() {
  const s = env('SESSION_SECRET', '');
  if (s) return s;
  if (DATABASE_URL) return crypto.createHash('sha256').update('bioloop-session|' + DATABASE_URL).digest('hex');
  if (IS_VERCEL) return crypto.randomBytes(32).toString('hex');   // tanpa database: sesi hanya berlaku di instance ini
  const f = path.join(DATA_DIR, '.secret');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch (e) { /* belum ada */ }
  const v = crypto.randomBytes(32).toString('hex');
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(f, v); } catch (e) { /* abaikan */ }
  return v;
}
const SESSION_SECRET = deriveSecret();
const derived = label => crypto.createHmac('sha256', SESSION_SECRET).update(label).digest('hex').slice(0, 40);

module.exports = {
  ROOT, IS_VERCEL, DATA_DIR, DATABASE_URL,
  PORT: num('PORT', 3000),
  HOST: env('HOST', '0.0.0.0'),
  SITE_NAME: env('SITE_NAME', 'Bioreaktor SPPG'),
  TZ: env('REPORT_TIMEZONE', 'Asia/Jakarta'),
  PUBLIC_URL: env('PUBLIC_URL', process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : ''),

  /* akun & keamanan */
  SESSION_SECRET,
  ADMIN_USERNAME: env('ADMIN_USERNAME', 'Handoyo'),
  ADMIN_PASSWORD: env('ADMIN_PASSWORD', '12345'),
  ALLOW_REGISTER: bool('ALLOW_REGISTER', true),
  PUBLIC_DASHBOARD: bool('PUBLIC_DASHBOARD', true),
  CRON_SECRET: env('CRON_SECRET', ''),

  /* simulasi */
  SIM_SPEED: num('SIM_SPEED', 1),
  MAX_CATCHUP_MIN: num('MAX_CATCHUP_MIN', 10),   // simulasi mengejar paling lama 10 menit waktu nyata per panggilan
  RETENTION_DAYS: num('RETENTION_DAYS', 90),

  /* Telegram */
  TELEGRAM_BOT_TOKEN: env('TELEGRAM_BOT_TOKEN', ''),
  TELEGRAM_API_BASE: env('TELEGRAM_API_BASE', 'https://api.telegram.org'),
  TELEGRAM_MODE: env('TELEGRAM_MODE', 'auto').toLowerCase(),   // auto | webhook | polling
  TELEGRAM_WEBHOOK_SECRET: env('TELEGRAM_WEBHOOK_SECRET', derived('telegram-webhook')),
  TELEGRAM_ALLOWED_CHAT_IDS: list('TELEGRAM_ALLOWED_CHAT_IDS'),   // otomatis disetujui
  TELEGRAM_REQUIRE_APPROVAL: bool('TELEGRAM_REQUIRE_APPROVAL', true),
  NOTIFY_ALERTS: bool('NOTIFY_ALERTS', true),
  NOTIFY_ACTIONS: bool('NOTIFY_ACTIONS', true),
  NOTIFY_SCHEDULE: bool('NOTIFY_SCHEDULE', false),
  REPORT_EVERY_HOURS: num('REPORT_EVERY_HOURS', 12),
  ALERT_COOLDOWN_MIN: num('ALERT_COOLDOWN_MIN', 15),

  /* Gemini */
  GEMINI_API_KEY: env('GEMINI_API_KEY', ''),
  GEMINI_MODEL: env('GEMINI_MODEL', 'gemini-3.8-flash'),
  GEMINI_FALLBACK_MODEL: env('GEMINI_FALLBACK_MODEL', 'gemini-3.5-flash-lite'),
  GEMINI_API_BASE: env('GEMINI_API_BASE', 'https://generativelanguage.googleapis.com/v1beta'),
  GEMINI_API_STYLE: env('GEMINI_API_STYLE', 'auto').toLowerCase(),
  AI_CAN_CONTROL: bool('AI_CAN_CONTROL', true),
  MEMORY_RECENT: num('MEMORY_RECENT', 24),
  MEMORY_MAX: num('MEMORY_MAX', 40),

  derived
};
