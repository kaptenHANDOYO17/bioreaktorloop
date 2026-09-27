'use strict';
/* Pemeriksaan otomatis sebelum menjalankan server.
   Cara pakai (di folder proyek):  npm run cek
   Tidak menampilkan isi kunci/password; hanya memberi tahu mana yang sudah benar dan mana yang perlu diperbaiki. */
const fs = require('fs');
const path = require('path');
const net = require('net');

const ROOT = path.resolve(__dirname, '..');
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m, hint) => { console.log('  ✗ ' + m + (hint ? '\n      → ' + hint : '')); problems++; };
const warn = (m, hint) => console.log('  ! ' + m + (hint ? '\n      → ' + hint : ''));
let problems = 0;

(async () => {
  console.log('\nPemeriksaan MBG-BIOLOOP\n');

  // 1. Node.js
  const major = +process.versions.node.split('.')[0];
  if (major >= 20) ok(`Node.js v${process.versions.node}`);
  else bad(`Node.js v${process.versions.node} terlalu lama`, 'Pasang versi LTS terbaru dari https://nodejs.org lalu tutup-buka lagi VS Code.');

  // 2. Folder & .env
  if (!fs.existsSync(path.join(ROOT, 'package.json'))) bad('package.json tidak ditemukan', 'Jalankan perintah di folder yang berisi package.json.');
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) ok('File .env ditemukan');
  else warn('File .env belum ada (boleh, tetapi Gemini/Telegram tidak aktif)', 'Windows: Copy-Item .env.example .env   lalu   notepad .env');

  const cfg = require('../lib/config');

  // 3. Pustaka
  if (cfg.DATABASE_URL) {
    try { require.resolve('postgres'); ok('Pustaka postgres terpasang'); }
    catch (e) { bad('Pustaka postgres belum terpasang', 'Ketik: npm install'); }
  }

  // 4. Database
  if (!cfg.DATABASE_URL) ok('DATABASE_URL kosong: data disimpan di folder data/ (mode lokal)');
  else {
    const pg = require('../lib/db/pg');
    let url;
    try { url = pg.normalizeUrl(cfg.DATABASE_URL); } catch (e) { bad('DATABASE_URL: ' + e.message); }
    if (url) {
      const u = new URL(url);
      if (/[^A-Za-z0-9\-._~]/.test(decodeURIComponent(u.password))) ok('Password database berisi karakter khusus; sudah di-encode otomatis');
      const host = u.hostname, port = u.port || '5432';
      if (/supabase\.co$/.test(host) && port !== '6543') warn(`Supabase port ${port}`, 'Untuk Vercel pakai "Transaction pooler" port 6543 (…pooler.supabase.com:6543).');
      try {
        const t0 = Date.now(); await pg.init(); await pg.ping(); await pg.close();
        ok(`Database tersambung (${host}:${port}, ${Date.now() - t0} ms) dan tabel siap`);
      } catch (e) {
        const m = e.message || String(e);
        const hint = /password authentication failed|SASL/i.test(m) ? 'Password salah. Salin ulang password database dari Supabase (Project Settings → Database → Reset password bila lupa).'
          : /ENOTFOUND|getaddrinfo/i.test(m) ? 'Alamat server tidak ditemukan. Periksa ejaan host atau koneksi internet. Pakai alamat "Transaction pooler".'
          : /ETIMEDOUT|timeout|ECONNREFUSED/i.test(m) ? 'Tidak bisa menjangkau server. Periksa internet, firewall kantor/sekolah, atau proyek Supabase sedang "Paused" (Restore di dasbor Supabase).'
          : /Tenant or user not found/i.test(m) ? 'Nama pengguna/region salah. Salin ulang connection string lengkap dari tombol Connect di Supabase.'
          : /permission denied/i.test(m) ? 'Akun database tidak punya izin membuat tabel. Pakai user "postgres" bawaan Supabase.'
          : 'Salin ulang connection string dari Supabase → Connect → Transaction pooler.';
        bad('Database gagal: ' + m, hint);
      }
    }
  }

  // 5. Gemini
  if (!cfg.GEMINI_API_KEY) warn('GEMINI_API_KEY kosong: asisten AI tidak aktif', 'Buat kunci di https://aistudio.google.com/apikey');
  else {
    try {
      const r = await fetch(`${cfg.GEMINI_API_BASE}/models?pageSize=100`, { headers: { 'x-goog-api-key': cfg.GEMINI_API_KEY } });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const names = (j.models || []).map(m => String(m.name).replace(/^models\//, ''));
        ok('Kunci Gemini valid');
        if (names.length && !names.includes(cfg.GEMINI_MODEL)) warn(`Model "${cfg.GEMINI_MODEL}" tidak ada di daftar akun Anda`, 'Contoh model yang tersedia: ' + names.filter(n => /flash|pro/.test(n)).slice(0, 5).join(', ') + '. Ganti GEMINI_MODEL di .env.');
        else if (names.length) ok(`Model ${cfg.GEMINI_MODEL} tersedia`);
      } else if ([400, 401, 403].includes(r.status)) bad(`Kunci Gemini ditolak (${r.status}): ${(j.error && j.error.message) || ''}`.trim(), 'Buat kunci baru di AI Studio dan pastikan tidak ada spasi di awal/akhir.');
      else warn(`Kunci Gemini belum bisa diperiksa (HTTP ${r.status})`, 'Coba lagi nanti; bila asisten tetap gagal, periksa kunci di AI Studio.');
    } catch (e) { bad('Tidak bisa menghubungi Gemini: ' + e.message, 'Periksa koneksi internet.'); }
  }

  // 6. Telegram
  if (!cfg.TELEGRAM_BOT_TOKEN) warn('TELEGRAM_BOT_TOKEN kosong: bot tidak aktif', 'Buat bot di @BotFather dengan /newbot');
  else {
    try {
      const call = async (m) => { const r = await fetch(`${cfg.TELEGRAM_API_BASE}/bot${cfg.TELEGRAM_BOT_TOKEN}/${m}`); return r.json(); };
      const me = await call('getMe');
      if (!me.ok) bad('Token Telegram ditolak: ' + (me.description || ''), 'Salin ulang token dari @BotFather (format 123456789:ABC…).');
      else {
        ok(`Bot Telegram @${me.result.username}`);
        const wh = await call('getWebhookInfo');
        if (wh.ok && wh.result.url) warn(`Bot sedang memakai webhook ke ${wh.result.url}`, 'Bot online (Vercel) tetap dipakai; server lokal tidak akan merebutnya. Isi TELEGRAM_MODE=polling di .env hanya bila ingin menguji bot di komputer ini (setelahnya pasang ulang webhook dari panel admin online).');
      }
    } catch (e) { bad('Tidak bisa menghubungi Telegram: ' + e.message, 'Periksa koneksi internet.'); }
  }

  // 7. Port
  await new Promise(res => {
    const s = net.createServer();
    s.once('error', () => { warn(`Port ${cfg.PORT} sedang dipakai`, 'Server mungkin sudah berjalan di jendela lain (buka http://localhost:' + cfg.PORT + '), atau ubah PORT di .env.'); res(); });
    s.once('listening', () => { s.close(); ok(`Port ${cfg.PORT} bebas`); res(); });
    s.listen(cfg.PORT, '0.0.0.0');
  });

  console.log(problems ? `\n${problems} hal perlu diperbaiki (lihat tanda ✗ di atas).\n` : '\nSemua siap. Jalankan:  npm start   lalu buka http://localhost:' + cfg.PORT + '\n');
  process.exit(0);
})();
