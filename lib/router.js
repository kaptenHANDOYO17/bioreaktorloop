'use strict';
/* Semua endpoint /api/* dalam satu berkas. Dipakai oleh Vercel (api/index.js) dan server lokal (server/index.js). */
const crypto = require('crypto');
const cfg = require('./config');
const db = require('./db');
const auth = require('./auth');
const reactor = require('./reactor');
const settings = require('./settings');
const reports = require('./reports');
const telegram = require('./telegram');
const gemini = require('./gemini');
const memory = require('./memory');

const VERSION = '3.2.0';

/* ---------- utilitas HTTP ---------- */
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function send(res, code, obj, headers = {}) {
  if (res.headersSent) return;
  const isBuf = Buffer.isBuffer(obj), isStr = typeof obj === 'string';
  res.writeHead(code, Object.assign({ 'Content-Type': isBuf ? 'application/octet-stream' : isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, headers));
  res.end(isBuf || isStr ? obj : JSON.stringify(obj));
}
async function readBody(req, limit = 200000) {
  if ('body' in req) {                       // Vercel sudah mengurai body
    let b; try { b = req.body; } catch (e) { throw new HttpError(400, 'JSON tidak valid'); }
    if (b == null) return {};
    if (Buffer.isBuffer(b)) b = b.toString('utf8');
    if (typeof b === 'string') { if (!b.trim()) return {}; try { return JSON.parse(b); } catch (e) { throw new HttpError(400, 'JSON tidak valid'); } }
    return b;
  }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Data terlalu besar')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { const t = Buffer.concat(chunks).toString('utf8'); if (!t.trim()) return resolve({}); try { resolve(JSON.parse(t)); } catch (e) { reject(new HttpError(400, 'JSON tidak valid')); } });
    req.on('error', reject);
  });
}
function pathOf(req) {
  const u = new URL(req.url, 'http://x');
  let p = u.pathname;
  const qp = u.searchParams.get('__path');                    // dari rewrite vercel.json
  if (qp !== null && (p === '/api' || p === '/api/index' || p === '/api/index.js')) p = '/api/' + qp.replace(/^\/+/, '');
  u.searchParams.delete('__path');
  return { path: p.replace(/\/+$/, '') || '/', query: Object.fromEntries(u.searchParams) };
}
const ip = req => String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || '').split(',')[0].trim();
function sameOrigin(req) {
  const o = req.headers.origin; if (!o) return true;          // bukan dari browser lintas situs
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try { return new URL(o).host === host; } catch (e) { return false; }
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const actorOf = u => u ? `${u.name || u.username} (@${u.username})` : 'Dasbor';

/* Alamat produksi untuk webhook Telegram (bukan alamat preview). */
function productionBase(req) {
  if (cfg.PUBLIC_URL) return cfg.PUBLIC_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (process.env.VERCEL_ENV === 'production') return 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);
  return null;
}
async function ensureWebhook(req, force) {
  try { return await telegram.autoWebhook(productionBase(req), force); } catch (e) { console.error('[webhook-otomatis]', e.message); return { error: e.message }; }
}
/* Membatasi lama menunggu layanan luar (Telegram) agar halaman tidak pernah menunggu sampai batas Vercel (504). */
function within(promise, ms, fallback) {
  let to; const timer = new Promise(res => { to = setTimeout(() => res(typeof fallback === 'function' ? fallback() : fallback), ms); });
  return Promise.race([Promise.resolve(promise).catch(e => ({ error: e.message })), timer]).finally(() => clearTimeout(to));
}

/* ---------- rute ---------- */
const routes = [];
const on = (method, pattern, access, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), access, fn });

on('GET', '/api/health', 'public', async ({ req }) => {
  const set = await settings.get(); const warnings = [];
  let dbOk = true, dbError = '';
  try { await db.init(); await db.ping(); } catch (e) { dbOk = false; dbError = e.message; warnings.push('Database tidak bisa dihubungi: ' + e.message); }
  if (cfg.IS_VERCEL && !cfg.DATABASE_URL) warnings.push('DATABASE_URL belum diisi. Data di Vercel akan hilang; hubungkan Supabase atau Neon.');
  return { ok: true, version: VERSION, site: set.site_name, db: db.kind, dbOk, dbError, vercel: cfg.IS_VERCEL, ai: gemini.info(), aiCanControl: cfg.AI_CAN_CONTROL,
    telegram: Object.assign(await within(telegram.info(), 4000, { enabled: !!cfg.TELEGRAM_BOT_TOKEN }), { webhook: dbOk ? await db.kvGet('tg_webhook_state').catch(() => null) : null }),
    guestChat: gemini.info().enabled, registration: set.allow_register, publicDashboard: set.public_dashboard, warnings };
});

/* ----- akun ----- */
on('GET', '/api/me', 'public', async ({ user }) => {
  const set = await settings.get();
  return { user: auth.publicUser(user), registration: set.allow_register, publicDashboard: set.public_dashboard, site: set.site_name };
});
on('POST', '/api/auth/login', 'public', async ({ req, res, body }) => {
  const r = await auth.login(body.username, body.password);
  if (!r.ok) throw new HttpError(401, r.message);
  res.setHeader('Set-Cookie', auth.cookieHeader(req, r.token, auth.SESSION_DAYS * 86400));
  return { ok: true, user: r.user };
});
on('POST', '/api/auth/logout', 'public', async ({ req, res }) => { res.setHeader('Set-Cookie', auth.cookieHeader(req, '', 0)); return { ok: true }; });
on('POST', '/api/auth/register', 'public', async ({ body }) => {
  const set = await settings.get(); if (!set.allow_register) throw new HttpError(403, 'Pendaftaran sedang ditutup. Minta admin membuatkan akun.');
  const r = await auth.register(body); if (!r.ok) throw new HttpError(400, r.message);
  await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'info', type: 'register', title: `Pendaftaran baru: ${r.user.username}`, body: 'Menunggu persetujuan admin.', actor: r.user.username }]).catch(() => {});
  return { ok: true, message: 'Pendaftaran berhasil. Akun Anda aktif setelah disetujui admin.' };
});
on('POST', '/api/auth/password', 'user', async ({ req, res, user, body }) => {
  const r = await auth.changePassword(user, body.old, body.new); if (!r.ok) throw new HttpError(400, r.message);
  res.setHeader('Set-Cookie', auth.cookieHeader(req, r.token, auth.SESSION_DAYS * 86400));
  return { ok: true, user: r.user };
});

/* ----- dasbor ----- */
on('GET', '/api/sources', 'viewer', async () => ({ sources: await reactor.sources(), default: await reactor.resolveSource() }));
on('GET', '/api/state', 'viewer', async ({ query }) => {
  const source = await reactor.resolveSource(query.source);
  const { state } = await reactor.tick(source);
  const snap = reactor.snapshot(source, state);
  const since = query.since !== undefined && query.since !== '' ? +query.since : null;
  const reset = since != null && since > state.t + 0.01;
  const full = since == null || !Number.isFinite(since) || reset;
  const hist = full ? state.hist : state.hist.filter(p => p.t > since);
  const after = +query.after || 0;
  const events = after > 0 ? await db.events({ source, afterId: after, desc: false, limit: 100 }) : await db.events({ source, limit: 60 });
  const lastEventId = events.reduce((m, e) => Math.max(m, e.id), after);
  return { state: snap, hist, full, events, eventsOrder: after > 0 ? 'asc' : 'desc', lastEventId, serverTime: Date.now() };
});
on('POST', '/api/control', 'user', async ({ user, body }) => {
  const source = await reactor.resolveSource(body.source);
  if (['reset'].includes(body.action) && user.role !== 'admin') throw new HttpError(403, 'Hanya admin yang boleh memulai ulang simulasi.');
  const p = Object.assign({}, body); delete p.source; delete p.action;
  return reactor.control(source, String(body.action || ''), p, { origin: 'manual', actor: actorOf(user) });
});

/* ----- asisten ----- */
/* Asisten: pengguna terdaftar (boleh mengendalikan, ingatan per akun) atau pengunjung umum
   (hanya bertanya, ingatan per browser, dibatasi agar kuota Gemini aman). */
const GUEST_RE = /^[a-z0-9]{16,40}$/i, GUEST_PER_HOUR = 15, GUEST_PER_DAY = 300;
function chatKey(user, guestId) {
  if (user) return 'user:' + user.id;
  if (!GUEST_RE.test(String(guestId || ''))) throw new HttpError(400, 'Muat ulang halaman lalu coba lagi.');
  return 'guest:' + guestId;
}
on('POST', '/api/chat', 'public', async ({ user, body }) => {
  const msg = String(body.message || '').trim().slice(0, 2000); if (!msg) throw new HttpError(400, 'Pesan kosong');
  const ai = require('./ai');
  const key = chatKey(user, body.guestId);
  if (user) return ai.chat(key, msg, { channel: 'web', canControl: cfg.AI_CAN_CONTROL, who: user.name || user.username, role: user.role, source: body.source });
  const c = await memory.get(key), hourAgo = Date.now() - 3.6e6;
  if (c.messages.filter(m => m.r === 'user' && +new Date(m.at) > hourAgo).length >= GUEST_PER_HOUR)
    return { reply: `Batas ${GUEST_PER_HOUR} pertanyaan per jam untuk pengunjung sudah tercapai. Silakan coba lagi nanti, atau masuk dengan akun petugas.`, actions: [], error: true };
  const day = new Date().toISOString().slice(0, 10), cnt = (await db.kvGet('guest_chat_day')) || {};
  const n = cnt.day === day ? cnt.n : 0;
  if (n >= GUEST_PER_DAY) return { reply: 'Asisten untuk pengunjung sedang ramai hari ini. Silakan coba lagi besok, atau masuk dengan akun petugas.', actions: [], error: true };
  await db.kvSet('guest_chat_day', { day, n: n + 1 });
  return ai.chat(key, msg, { channel: 'web', canControl: false, who: 'Pengunjung website', role: 'guest', source: body.source });
});
on('GET', '/api/chat/history', 'public', async ({ user, query }) => {
  const c = await memory.get(chatKey(user, query.guestId));
  return { messages: c.messages.slice(-40), facts: c.facts, summary: c.summary, total: c.total, guest: !user };
});
on('POST', '/api/chat/forget', 'public', async ({ user, body }) => { await memory.forget(chatKey(user, body.guestId)); return { ok: true }; });

/* ----- perangkat ESP32 ----- */
async function deviceFrom(req) {
  const key = req.headers['x-device-key']; if (!key) throw new HttpError(401, 'Header X-Device-Key kosong');
  const dev = await db.deviceByKeyHash(sha(key));
  if (!dev) throw new HttpError(401, 'Kunci perangkat tidak dikenal');
  if (dev.status !== 'active') throw new HttpError(403, 'Perangkat dinonaktifkan admin');
  return dev;
}
on('POST', '/api/sensor', 'device', async ({ req, body }) => reactor.ingest(await deviceFrom(req), body, ip(req)));
on('GET', '/api/device/commands', 'device', async ({ req }) => { const dev = await deviceFrom(req); return { commands: await db.takeCommands(dev.id) }; });

/* ----- Telegram webhook ----- */
on('POST', '/api/telegram/webhook', 'none', async ({ req, body }) => {
  if (!(await telegram.checkSecret(req.headers['x-telegram-bot-api-secret-token']))) throw new HttpError(401, 'secret salah');
  try { await telegram.handleUpdate(body); } catch (e) { console.error('[webhook]', e.message); }
  return { ok: true };
});

/* ----- cron: memajukan simulasi, cek perangkat diam, laporan berkala, bersih-bersih ----- */
async function cron(req) {
  const out = { ticked: [], report: false, pruned: null, schedules: [], webhook: null };
  await db.kvSet('last_cron', Date.now());
  if (req) out.webhook = await within(ensureWebhook(req), 15000, { error: 'Telegram lambat menjawab' });
  try { out.schedules = await telegram.runSchedules(); } catch (e) { out.schedules = e.message; }
  const srcs = await reactor.sources();
  for (const s of srcs) { try { await reactor.tick(s.id); out.ticked.push(s.id); } catch (e) { out.ticked.push(s.id + ': ' + e.message); } }
  const set = await settings.get(); const now = Date.now();
  if (cfg.TELEGRAM_BOT_TOKEN && set.report_every_hours > 0) {
    const last = (await db.kvGet('last_report')) || 0;
    if (now - last >= set.report_every_hours * 3600000 - 60000) {
      await db.kvSet('last_report', now);
      if (last) { try { await telegram.broadcast(await telegram.statusFor()); out.report = true; } catch (e) { out.report = e.message; } }
    }
  }
  const lastPrune = (await db.kvGet('last_prune')) || 0;
  if (now - lastPrune > 6 * 3600000) {
    await db.kvSet('last_prune', now);
    const before = now - set.retention_days * 864e5;
    out.pruned = { readings: await db.pruneReadings(before), events: await db.pruneEvents(before) };
    await db.pruneTgUpdates(now - 3 * 864e5);
  }
  return out;
}
on('GET', '/api/cron', 'cron', async ({ req }) => cron(req));
on('POST', '/api/cron', 'cron', async ({ req }) => cron(req));

/* ----- admin: ringkasan ----- */
on('GET', '/api/admin/overview', 'admin', async ({ req, user }) => {
  const [users, devices, chats, recent, stats, srcs] = await Promise.all([db.listUsers(), db.listDevices(), db.listTgChats(), db.events({ limit: 15 }), db.stats().catch(() => null), reactor.sources()]);
  const since = Date.now() - 864e5;
  const alerts24 = await db.events({ from: since, to: Date.now(), limit: 2000 });
  const rep = await reports.build({ from: Date.now() - 7 * 864e5, to: Date.now(), source: 'all' });
  const online = srcs.filter(s => s.kind === 'sensor' && s.online).length;
  return {
    me: auth.publicUser(user), passwordIsDefault: !!user.must_change,
    users: { total: users.length, pending: users.filter(u => u.status === 'pending').length, admins: users.filter(u => u.role === 'admin').length },
    devices: { total: devices.length, active: devices.filter(d => d.status === 'active').length, online },
    telegram: { total: chats.length, pending: chats.filter(c => !c.approved).length, subscribed: chats.filter(c => c.approved && c.subscribed).length },
    alerts24: { bad: alerts24.filter(e => e.cat === 'alert' && e.lvl === 'bad').length, warn: alerts24.filter(e => e.cat === 'alert' && e.lvl === 'warn').length },
    week: rep.total, weekDaily: rep.daily, recent, stats, db: db.kind,
    ready: await readiness(req, user, chats, devices)
  };
});

/* Daftar periksa "siap dipakai" untuk ringkasan admin */
async function readiness(req, user, chats, devices) {
  const items = [];
  const lastCron = (await db.kvGet('last_cron')) || 0;
  let wh = null;
  if (cfg.TELEGRAM_BOT_TOKEN && telegram.mode() === 'webhook') { await within(ensureWebhook(req), 7000, null); wh = await telegram.webhookInfo(6000); }
  items.push({ ok: db.kind === 'postgres' || !cfg.IS_VERCEL, label: 'Database tersambung', hint: 'Isi DATABASE_URL di Vercel lalu Redeploy.' });
  items.push({ ok: !user.must_change, label: 'Kata sandi admin sudah diganti', hint: 'Klik nama Anda di kanan atas → Ganti kata sandi.' });
  items.push({ ok: !!cfg.GEMINI_API_KEY, label: 'Asisten AI (Gemini) aktif', hint: 'Isi GEMINI_API_KEY di Vercel lalu Redeploy.' });
  items.push({ ok: !!cfg.TELEGRAM_BOT_TOKEN, label: 'Token bot Telegram terisi', hint: 'Isi TELEGRAM_BOT_TOKEN di Vercel lalu Redeploy.' });
  if (cfg.TELEGRAM_BOT_TOKEN && telegram.mode() === 'webhook') items.push({ ok: !!(wh && wh.url && !wh.error), label: 'Webhook Telegram terpasang', hint: 'Menu Telegram & notifikasi → Pasang otomatis.', link: '#telegram' });
  items.push({ ok: chats.some(c => c.approved && c.subscribed), label: 'Minimal satu chat Telegram menerima notifikasi', hint: 'Buka bot di Telegram → Start, lalu setujui di menu Telegram.', link: '#telegram' });
  items.push({ ok: Date.now() - lastCron < 20 * 60000, label: 'Jadwal otomatis (cron) berjalan', hint: lastCron ? `Terakhir ${Math.round((Date.now() - lastCron) / 60000)} menit lalu. Pasang GitHub Actions atau cron-job.org (menu Panduan → Menyelesaikan pemasangan, langkah 7).` : 'Belum pernah berjalan. Pasang GitHub Actions atau cron-job.org (menu Panduan → Menyelesaikan pemasangan, langkah 7).', link: '#panduan' });
  items.push({ ok: devices.length > 0, optional: true, label: 'Perangkat ESP32 terdaftar (opsional)', hint: 'Daftarkan saat alat asli siap. Sebelum itu dasbor memakai simulasi.', link: '#perangkat' });
  return { items, lastCron };
}

/* ----- admin: laporan ----- */
function reportParams(q) { return { from: q.from ? +new Date(q.from) || +q.from : undefined, to: q.to ? +new Date(q.to) || +q.to : undefined, source: q.source || 'all' }; }
const stamp = () => new Date().toLocaleString('sv-SE', { timeZone: cfg.TZ }).slice(0, 16).replace(/[: ]/g, '-');
on('GET', '/api/admin/report', 'admin', async ({ query }) => reports.publicReport(await reports.build(reportParams(query))));
on('GET', '/api/admin/report.xlsx', 'admin', async ({ res, query }) => {
  const buf = await reports.toXlsx(await reports.build(reportParams(query)));
  send(res, 200, buf, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="Laporan_BIOLOOP_${stamp()}.xlsx"` });
});
on('GET', '/api/admin/report.csv', 'admin', async ({ res, query }) => {
  const rep = await reports.build(reportParams(query));
  const type = query.type === 'events' ? 'events' : 'readings';
  const text = type === 'events' ? reports.eventsCsv(rep) : reports.readingsCsv(rep);
  send(res, 200, text, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="BIOLOOP_${type === 'events' ? 'kejadian' : 'pembacaan'}_${stamp()}.csv"` });
});

/* ----- admin: perangkat ----- */
function newKey() { return 'blk_' + crypto.randomBytes(24).toString('base64url'); }
function devOut(d) { if (!d) return null; const o = Object.assign({}, d); delete o.key_hash; o.online = !!d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 120000; return o; }
on('GET', '/api/admin/devices', 'admin', async () => ({ devices: (await db.listDevices()).map(devOut) }));
on('POST', '/api/admin/devices', 'admin', async ({ user, body }) => {
  const name = String(body.name || '').trim().slice(0, 60); if (!name) throw new HttpError(400, 'Nama perangkat wajib diisi.');
  const id = 'esp-' + crypto.randomBytes(3).toString('hex'), key = newKey();
  const d = await db.createDevice({ id, name, location: String(body.location || '').slice(0, 120), notes: String(body.notes || '').slice(0, 500), key_hash: sha(key), key_hint: key.slice(-4), created_by: user.username });
  await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'info', type: 'device', title: `Perangkat didaftarkan: ${name}`, body: `ID ${id}`, actor: actorOf(user) }]);
  return { device: devOut(d), key };
});
on('GET', '/api/admin/devices/:id', 'admin', async ({ params }) => {
  const d = await db.deviceById(params.id); if (!d) throw new HttpError(404, 'Perangkat tidak ditemukan');
  const [readings, commands, events] = await Promise.all([db.lastReadings('dev:' + d.id, 30), db.listCommands(d.id, 20), db.events({ source: 'dev:' + d.id, limit: 20 })]);
  return { device: devOut(d), readings, commands, events };
});
on('POST', '/api/admin/devices/:id', 'admin', async ({ user, params, body }) => {
  const p = {}; for (const k of ['name', 'location', 'notes']) if (body[k] !== undefined) p[k] = String(body[k]).slice(0, k === 'notes' ? 500 : 120);
  if (body.status !== undefined) p.status = body.status === 'disabled' ? 'disabled' : 'active';
  const d = await db.updateDevice(params.id, p); if (!d) throw new HttpError(404, 'Perangkat tidak ditemukan');
  if (p.status) await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'info', type: 'device', title: `Perangkat ${d.name} ${p.status === 'active' ? 'diaktifkan' : 'dinonaktifkan'}`, body: '', actor: actorOf(user) }]);
  return { device: devOut(d) };
});
on('POST', '/api/admin/devices/:id/rotate', 'admin', async ({ user, params }) => {
  const key = newKey(); const d = await db.updateDevice(params.id, { key_hash: sha(key), key_hint: key.slice(-4) }); if (!d) throw new HttpError(404, 'Perangkat tidak ditemukan');
  await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'warn', type: 'device', title: `Kunci perangkat ${d.name} diganti`, body: 'Kunci lama tidak berlaku lagi.', actor: actorOf(user) }]);
  return { device: devOut(d), key };
});
on('DELETE', '/api/admin/devices/:id', 'admin', async ({ user, params }) => {
  const d = await db.deviceById(params.id); if (!d) throw new HttpError(404, 'Perangkat tidak ditemukan');
  await db.deleteDevice(d.id); await db.deleteState('dev:' + d.id);
  await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'warn', type: 'device', title: `Perangkat dihapus: ${d.name}`, body: 'Riwayat pembacaan tetap tersimpan untuk laporan.', actor: actorOf(user) }]);
  return { ok: true };
});

/* ----- admin: pengguna ----- */
on('GET', '/api/admin/users', 'admin', async () => ({ users: (await db.listUsers()).map(auth.publicUser) }));
on('POST', '/api/admin/users', 'admin', async ({ user, body }) => {
  const username = String(body.username || '').trim();
  if (!auth.USER_RE.test(username)) throw new HttpError(400, 'Nama pengguna 3-32 karakter: huruf, angka, titik, garis bawah, atau strip.');
  const pw = body.password ? String(body.password) : auth.tempPassword();
  if (body.password) { const bad = auth.checkNewPassword(pw); if (bad) throw new HttpError(400, bad); }
  const u = await db.createUser({ username, name: String(body.name || username).slice(0, 80), password_hash: await auth.hashPassword(pw), role: body.role === 'admin' ? 'admin' : 'user', status: 'active', must_change: true });
  if (!u) throw new HttpError(409, 'Nama pengguna sudah dipakai.');
  await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'info', type: 'user', title: `Akun dibuat: ${username} (${u.role})`, body: '', actor: actorOf(user) }]);
  return { user: auth.publicUser(u), password: body.password ? undefined : pw };
});
async function guardLastAdmin(target, patch) {
  if (target.role !== 'admin' || target.status !== 'active') return;
  const demote = (patch.role && patch.role !== 'admin') || (patch.status && patch.status !== 'active') || patch.delete;
  if (demote && await db.countAdmins() <= 1) throw new HttpError(400, 'Ini admin aktif terakhir. Buat admin lain dulu.');
}
on('POST', '/api/admin/users/:id', 'admin', async ({ user, params, body }) => {
  const t = await db.userById(params.id); if (!t) throw new HttpError(404, 'Pengguna tidak ditemukan');
  const p = {};
  if (body.name !== undefined) p.name = String(body.name).slice(0, 80);
  if (body.role !== undefined) p.role = body.role === 'admin' ? 'admin' : 'user';
  if (body.status !== undefined) p.status = ['active', 'pending', 'disabled'].includes(body.status) ? body.status : 'disabled';
  if (+t.id === +user.id && (p.status && p.status !== 'active' || p.role === 'user')) throw new HttpError(400, 'Anda tidak bisa menurunkan atau menonaktifkan akun sendiri.');
  await guardLastAdmin(t, p);
  if (p.status && p.status !== t.status) p.pw_version = (t.pw_version || 1) + 1;   // keluarkan sesi yang aktif
  const u = await db.updateUser(t.id, p);
  const what = p.status === 'active' && t.status === 'pending' ? 'disetujui' : p.status === 'disabled' ? 'dinonaktifkan' : p.status === 'active' ? 'diaktifkan' : p.role ? `dijadikan ${p.role}` : 'diubah';
  await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'info', type: 'user', title: `Akun ${t.username} ${what}`, body: '', actor: actorOf(user) }]);
  return { user: auth.publicUser(u) };
});
on('POST', '/api/admin/users/:id/reset', 'admin', async ({ user, params }) => {
  const t = await db.userById(params.id); if (!t) throw new HttpError(404, 'Pengguna tidak ditemukan');
  const pw = auth.tempPassword();
  await db.updateUser(t.id, { password_hash: await auth.hashPassword(pw), must_change: true, pw_version: (t.pw_version || 1) + 1, failed: 0, locked_until: null });
  await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'warn', type: 'user', title: `Kata sandi ${t.username} direset`, body: '', actor: actorOf(user) }]);
  return { password: pw };
});
on('DELETE', '/api/admin/users/:id', 'admin', async ({ user, params }) => {
  const t = await db.userById(params.id); if (!t) throw new HttpError(404, 'Pengguna tidak ditemukan');
  if (+t.id === +user.id) throw new HttpError(400, 'Anda tidak bisa menghapus akun sendiri.');
  await guardLastAdmin(t, { delete: true });
  await db.deleteUser(t.id); await memory.forget('user:' + t.id);
  await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'warn', type: 'user', title: `Akun dihapus: ${t.username}`, body: '', actor: actorOf(user) }]);
  return { ok: true };
});

/* ----- admin: Telegram ----- */
on('GET', '/api/admin/telegram', 'admin', async ({ req }) => {
  const slow = { error: 'Telegram lambat menjawab. Coba muat ulang atau klik Cek koneksi.' };
  const [, info] = await Promise.all([within(ensureWebhook(req), 9000, slow), within(telegram.info(), 6000, { enabled: !!cfg.TELEGRAM_BOT_TOKEN, mode: telegram.mode(), error: slow.error })]);
  const wh = cfg.TELEGRAM_BOT_TOKEN && telegram.mode() === 'webhook' ? await telegram.webhookInfo(7000) : null;
  const host = req.headers['x-forwarded-host'] || req.headers.host; const proto = req.headers['x-forwarded-proto'] || 'http';
  return { info, webhook: wh, suggestedUrl: productionBase(req) || `${proto}://${host}`, chats: await db.listTgChats(),
    schedules: (await db.kvGet('tg_schedules')) || [], settings: await settings.get(), lastCron: (await db.kvGet('last_cron')) || 0, tz: cfg.TZ };
});
on('POST', '/api/admin/telegram/webhook', 'admin', async ({ req, body, user }) => {
  if (!cfg.TELEGRAM_BOT_TOKEN) throw new HttpError(400, 'TELEGRAM_BOT_TOKEN belum diisi.');
  if (body.action === 'delete') { await telegram.deleteWebhook(); return { ok: true, message: 'Webhook dihapus.' }; }
  if (body.action === 'auto') { const r = await ensureWebhook(req, true); if (r.error) throw new HttpError(400, r.error); if (r.skipped) throw new HttpError(400, 'Alamat produksi belum diketahui. Isi alamat website di kotak lalu klik Pasang webhook.'); return { ok: true, message: 'Webhook terpasang: ' + r.url }; }
  const host = req.headers['x-forwarded-host'] || req.headers.host; const proto = req.headers['x-forwarded-proto'] || 'http';
  const base = String(body.url || cfg.PUBLIC_URL || `${proto}://${host}`);
  if (!/^https:\/\//.test(base)) throw new HttpError(400, 'Telegram hanya menerima webhook HTTPS. Di komputer lokal bot memakai long polling, tidak perlu webhook.');
  const url = await telegram.setWebhook(base);
  await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'info', type: 'telegram', title: 'Webhook Telegram dipasang', body: url, actor: actorOf(user) }]);
  return { ok: true, message: 'Webhook terpasang: ' + url };
});
on('POST', '/api/admin/telegram/chats/:id', 'admin', async ({ params, body, user }) => {
  const p = {}; if (body.approved !== undefined) p.approved = !!body.approved; if (body.subscribed !== undefined) p.subscribed = !!body.subscribed;
  const c = await db.updateTgChat(params.id, p); if (!c) throw new HttpError(404, 'Chat tidak ditemukan');
  if (p.approved) telegram.html(c.chat_id, '✅ Chat ini sudah disetujui admin. Ketik /start untuk mulai.').catch(() => {});
  await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'info', type: 'telegram', title: `Chat Telegram ${c.title || c.chat_id} ${p.approved === true ? 'disetujui' : p.approved === false ? 'dicabut' : 'diubah'}`, body: '', actor: actorOf(user) }]);
  return { chat: c };
});
on('DELETE', '/api/admin/telegram/chats/:id', 'admin', async ({ params }) => { await db.delTgChat(params.id); await memory.forget('tg:' + params.id); return { ok: true }; });
on('POST', '/api/admin/telegram/test', 'admin', async ({ body }) => {
  try { await telegram.test(String(body.chatId || '')); return { ok: true, message: 'Pesan tes terkirim.' }; } catch (e) { throw new HttpError(400, 'Gagal: ' + e.message); }
});
on('POST', '/api/admin/telegram/broadcast', 'admin', async ({ body, user }) => {
  const text = String(body.text || '').trim().slice(0, 3500); if (!text) throw new HttpError(400, 'Pesan kosong');
  const n = await telegram.broadcast(`📢 <b>Pengumuman</b>\n${text.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}\n\n— ${user.name || user.username}`);
  return { ok: true, message: `Terkirim ke ${n} chat.` };
});

on('POST', '/api/admin/telegram/schedules', 'admin', async ({ body, user }) => {
  const list = (Array.isArray(body.schedules) ? body.schedules : []).slice(0, 30).map((x, i) => ({
    id: String(x.id || Date.now().toString(36) + i).slice(0, 20),
    kind: ['teks', 'status', 'laporan'].includes(x.kind) ? x.kind : 'teks',
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time) ? x.time : '07:00',
    days: Array.isArray(x.days) ? x.days.map(Number).filter(d => d >= 1 && d <= 7) : [],
    text: String(x.text || '').slice(0, 1500), enabled: x.enabled !== false, last: x.last || null }));
  await db.kvSet('tg_schedules', list);
  await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'info', type: 'telegram', title: `Jadwal notifikasi Telegram diperbarui (${list.length})`, body: '', actor: actorOf(user) }]);
  return { ok: true, schedules: list };
});
on('POST', '/api/admin/telegram/profile', 'admin', async ({ user }) => {
  if (!cfg.TELEGRAM_BOT_TOKEN) throw new HttpError(400, 'TELEGRAM_BOT_TOKEN belum diisi.');
  const done = await telegram.setProfile();
  await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'info', type: 'telegram', title: 'Profil bot Telegram diperbarui', body: done.join(', '), actor: actorOf(user) }]);
  return { ok: true, message: 'Profil bot diperbarui: ' + done.join(', ') + '.' };
});
on('POST', '/api/admin/telegram/send', 'admin', async ({ body }) => {
  const kind = body.kind === 'laporan' ? 'laporan' : body.kind === 'perangkat' ? 'perangkat' : 'status';
  const text = kind === 'laporan' ? await telegram.dailyReport() : kind === 'perangkat' ? await telegram.devicesMsg() : await telegram.statusFor();
  const n = await telegram.broadcast(text);
  return { ok: true, message: n ? `Terkirim ke ${n} chat.` : 'Belum ada chat yang disetujui dan berlangganan.' };
});

/* ----- admin: cek koneksi ----- */
async function probe(fn, ms) {
  const s = Date.now();
  const r = await within(Promise.resolve().then(fn).then(v => ({ ok: true, info: v })), ms, { ok: false, error: `tidak menjawab dalam ${ms / 1000} detik` });
  if (r.ok === undefined) r.ok = false;
  return Object.assign(r, { ms: Date.now() - s });
}
on('GET', '/api/admin/diag', 'admin', async ({ req, query }) => {
  const out = { region: process.env.VERCEL_REGION || null, base: productionBase(req), version: VERSION };
  out.database = await probe(async () => { await db.ping(); return db.kind; }, 8000);
  if (cfg.TELEGRAM_BOT_TOKEN) {
    out.telegram = await probe(async () => { const b = await telegram.api('getMe', {}, 8000); return '@' + b.username; }, 9000);
    out.webhook = await probe(async () => { const w = await telegram.api('getWebhookInfo', {}, 8000);
      if (w.last_error_message) throw new Error(`${w.last_error_message} (${new Date(w.last_error_date * 1000).toLocaleString('id-ID', { timeZone: cfg.TZ })})`);
      if (!w.url) throw new Error('belum terpasang'); return w.url + (w.pending_update_count ? ` · ${w.pending_update_count} pesan antre` : ''); }, 9000);
  } else out.telegram = { ok: false, error: 'TELEGRAM_BOT_TOKEN belum diisi', ms: 0 };
  if (cfg.GEMINI_API_KEY && query.ai !== '0') out.gemini = await probe(async () => { const t = await gemini.simple('Jawab hanya dengan kata OK.', 'tes koneksi'); return (gemini.info().model || '') + ': ' + String(t || '').slice(0, 40); }, 30000);
  else if (!cfg.GEMINI_API_KEY) out.gemini = { ok: false, error: 'GEMINI_API_KEY belum diisi', ms: 0 };
  out.cron = { ok: Date.now() - ((await db.kvGet('last_cron')) || 0) < 20 * 60000, info: (await db.kvGet('last_cron')) || null };
  return out;
});

/* ----- admin: data riwayat ----- */
on('GET', '/api/admin/seed', 'admin', async () => ({ seed: await require('./seed').status() }));
on('POST', '/api/admin/seed', 'admin', async ({ body, user }) => {
  const seed = require('./seed');
  const r = body.action === 'hapus' ? await seed.hapus() : await seed.isi({ days: body.days || 30 });
  await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'info', type: 'seed', title: body.action === 'hapus' ? 'Data riwayat dihapus' : 'Data riwayat diisi', body: r.message, actor: actorOf(user) }]);
  return r;
});

/* ----- admin: pengaturan ----- */
on('GET', '/api/admin/settings', 'admin', async ({ req }) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host; const proto = req.headers['x-forwarded-proto'] || 'http';
  const base = cfg.PUBLIC_URL || `${proto}://${host}`;
  return { settings: await settings.get(), sources: await reactor.sources(), cronUrl: base + '/api/cron' + (cfg.CRON_SECRET ? '?key=•••' : ''), cronProtected: !!cfg.CRON_SECRET,
    sensorUrl: base + '/api/sensor', db: db.kind, vercel: cfg.IS_VERCEL, stats: await db.stats().catch(() => null), env: {
      gemini: !!cfg.GEMINI_API_KEY, telegram: !!cfg.TELEGRAM_BOT_TOKEN, database: !!cfg.DATABASE_URL, sessionSecret: !!process.env.SESSION_SECRET, cronSecret: !!cfg.CRON_SECRET } };
});
on('POST', '/api/admin/settings', 'admin', async ({ body, user }) => {
  const s = await settings.set(body);
  await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'info', type: 'settings', title: 'Pengaturan diubah', body: Object.keys(body).join(', '), actor: actorOf(user) }]);
  return { settings: s };
});
on('POST', '/api/admin/cron', 'admin', async ({ req }) => cron(req));

/* ---------- penangan utama ---------- */
async function handle(req, res) {
  const { path, query } = pathOf(req);
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  try {
    let match = null, params = {};
    for (const r of routes) { const m = r.re.exec(path); if (m) { if (r.method === method) { match = r; params = m.groups || {}; break; } match = match || { wrongMethod: true }; } }
    if (!match) throw new HttpError(404, 'Endpoint tidak ditemukan: ' + path);
    if (match.wrongMethod) throw new HttpError(405, 'Metode tidak diizinkan');
    if (path !== '/api/health') await auth.ensureAdmin();
    const needsBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
    if (needsBody && ['public', 'user', 'admin', 'viewer'].includes(match.access) && !sameOrigin(req)) throw new HttpError(403, 'Permintaan lintas situs ditolak');
    const user = ['public', 'user', 'admin', 'viewer'].includes(match.access) ? await auth.currentUser(req) : null;
    if (match.access === 'user' && !user) throw new HttpError(401, 'Silakan masuk terlebih dahulu.');
    if (match.access === 'admin' && (!user || user.role !== 'admin')) throw new HttpError(user ? 403 : 401, user ? 'Khusus admin.' : 'Silakan masuk sebagai admin.');
    if (match.access === 'viewer' && !user && !(await settings.get()).public_dashboard) throw new HttpError(401, 'Dasbor hanya untuk pengguna terdaftar. Silakan masuk.');
    if (match.access === 'cron' && cfg.CRON_SECRET) {
      const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || query.key || '';
      if (!safeEq(given, cfg.CRON_SECRET)) throw new HttpError(401, 'CRON_SECRET salah');
    }
    const body = needsBody ? await readBody(req) : {};
    const out = await match.fn({ req, res, path, query, params, body, user });
    if (out !== undefined) send(res, 200, out);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[api]', method, path, e.stack || e.message);
    send(res, status, { ok: false, error: e.message, message: e.message });
  }
}
module.exports = { handle, cron, VERSION, send };
