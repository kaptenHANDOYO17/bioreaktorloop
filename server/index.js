'use strict';
/* Server lokal (laptop, Raspberry Pi, VPS, Docker).
   Di Vercel file ini tidak dipakai; Vercel memakai api/index.js + folder public/.
   Tambahan di mode lokal: simulasi & pengecekan perangkat berjalan terus, dan bot Telegram memakai long polling. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('../lib/config');
const db = require('../lib/db');
const router = require('../lib/router');
const telegram = require('../lib/telegram');
const auth = require('../lib/auth');

const PUBLIC = path.join(cfg.ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.ino': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.sql': 'text/plain; charset=utf-8' };

function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const p = path.normalize(path.join(PUBLIC, rel));
  if (!p.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(p, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Tidak ditemukan'); }
    const ext = path.extname(p).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(p).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/api' || p.startsWith('/api/')) return router.handle(req, res);
  serveStatic(req, res);
});

server.listen(cfg.PORT, cfg.HOST, async () => {
  console.log('\n  MBG-BIOLOOP AI v' + router.VERSION);
  console.log(`  Website  : http://localhost:${cfg.PORT}`);
  console.log(`  Admin    : http://localhost:${cfg.PORT}/admin.html`);
  console.log(`  Database : ${db.kind === 'postgres' ? 'PostgreSQL' : 'berkas lokal di ' + cfg.DATA_DIR}`);
  console.log(`  Gemini   : ${cfg.GEMINI_API_KEY ? 'aktif, model ' + cfg.GEMINI_MODEL : 'BELUM diisi (GEMINI_API_KEY)'}`);
  console.log(`  Telegram : ${cfg.TELEGRAM_BOT_TOKEN ? 'mode ' + telegram.mode() : 'BELUM diisi (TELEGRAM_BOT_TOKEN)'}\n`);
  try { await db.init(); await auth.ensureAdmin(); } catch (e) { console.error('[db] Gagal menyiapkan database:', e.message); }
  // detak latar belakang: simulasi, perangkat diam, laporan berkala
  let lastErr = '';
  const beat = async () => {
    try { await router.cron(); if (lastErr) { console.log('[detak] Kembali normal.'); lastErr = ''; } }
    catch (e) { if (e.message !== lastErr) { lastErr = e.message; console.error('[detak] ' + e.message + '\n        (pesan ini tidak diulang; ketik "npm run cek" di terminal lain untuk diagnosis)'); } }
    setTimeout(beat, 5000);
  };
  beat();
  if (cfg.TELEGRAM_BOT_TOKEN && telegram.mode() === 'polling') telegram.startPolling();
});
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${cfg.PORT} sudah dipakai. Ubah PORT di .env.` : e.message); process.exit(1); });

async function shutdown() { console.log('\nMenyimpan data...'); telegram.stopPolling(); try { await db.close(); } catch (e) { /* abaikan */ } process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
