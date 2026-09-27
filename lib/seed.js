'use strict';
/* Data riwayat awal (30 hari) untuk mengisi ringkasan, laporan, dan aktivitas pengguna.
   - Dihitung dengan MODEL yang sama dengan simulasi dasbor, dijalankan dengan jam nyata (1 jam = 1 jam),
     lalu disimpan sebagai sumber "Simulasi". Jadi tetap berlabel simulasi, bukan pengukuran alat.
   - Riwayat simulasi lama (yang dipercepat) diganti supaya grafik harian konsisten.
   - Simulasi di dasbor dilanjutkan dari hari terakhir dengan kecepatan 1× (sama dengan jam dinding).
   - Semua yang ditambahkan dicatat di kv 'seed_info' sehingga bisa dihapus lagi. */
const crypto = require('crypto');
const cfg = require('./config');
const db = require('./db');
const auth = require('./auth');
const reactor = require('./reactor');
const reports = require('./reports');
const { fmt } = require('./events');
const { SIM } = reactor;

/* Pengguna tambahan untuk mengisi menu Pengguna & aktivitas. Kata sandinya acak (reset di panel bila ingin dipakai). */
const EXTRA_USERS = [
  { username: 'siti', name: 'Siti Aminah', role: 'user' },
  { username: 'rahmat', name: 'Rahmat Hidayat', role: 'user' },
  { username: 'dewi', name: 'Dewi Lestari', role: 'user' }
];

/* Pembangkit acak yang bisa diulang (hasil sama setiap kali). */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

async function ensureUsers() {
  const created = [];
  for (const u of EXTRA_USERS) {
    if (await db.userByName(u.username)) continue;
    const x = await db.createUser({ username: u.username, name: u.name, role: u.role, status: 'active', must_change: true,
      password_hash: await auth.hashPassword(crypto.randomBytes(12).toString('base64url')) });
    created.push(x.id);
  }
  return created;
}
const actorName = u => u ? `${u.name || u.username} (@${u.username})` : 'Dasbor';

async function isi({ days = 30 } = {}) {
  days = Math.max(3, Math.min(90, Math.round(+days || 30)));
  const t0ms = Date.now();
  const now = Date.now(), tz = cfg.TZ;
  const from = reports.startOfDay(now - days * 864e5, tz);
  const totalH = (now - from) / 3.6e6;
  const createdUsers = await ensureUsers();
  const U = {};
  for (const n of ['petugas', 'gizi', 'guru', 'admin', 'handoyo', 'siti', 'rahmat', 'dewi']) U[n] = await db.userByName(n);
  const who = (...names) => { for (const n of names) if (U[n]) return actorName(U[n]); return 'Dasbor'; };

  /* ---------- rencana kegiatan petugas (jam sejak awal periode) ---------- */
  const R = rng(20450817), plan = [];
  const at = (d, h) => d * 24 + h;
  const add = (d, h, actor, fn, label) => { if (d >= 0 && d < days) plan.push({ h: at(d, h), actor, fn, label }); };
  const ctl = (action, p, origin = 'manual') => s => reactor.simControl(s, action, p, origin);
  for (let d = 0; d < days; d++) {
    // cek & tambah sisa dapur pagi sesekali
    if (R() < .35) add(d, 8 + R() * 2, who('petugas', 'siti'), ctl('feed', { kg: +(1 + R() * 1.5).toFixed(1), type: ['nasi', 'sayur', 'campuran'][Math.floor(R() * 3)] }));
    if (R() < .18) add(d, 9 + R() * 3, who('gizi', 'dewi'), ctl('buffer', { grams: 150 + Math.round(R() * 3) * 50 }));
    if (d % 7 === 5) add(d, 9.5, who('rahmat', 'petugas'), ctl('stir', { on: true }));
  }
  const mid = Math.floor(days / 3), late = Math.floor(days * .6);
  // kejadian penting yang membuat laporan & notifikasi punya cerita
  add(mid, 14.5, who('petugas'), ctl('feed', { kg: 12, type: 'campuran' }), 'kelebihan umpan');
  add(mid + 1, 7.2, who('gizi'), ctl('buffer', { grams: 400 }));
  add(mid + 1, 7.4, who('admin', 'handoyo'), ctl('schedule', { feed: false }));
  add(mid + 2, 13.5, who('admin', 'handoyo'), ctl('schedule', { feed: true }));
  add(Math.floor(days * .45), 9.5, who('petugas', 'siti'), ctl('drain', { liters: 25 }));
  add(late, 18, 'sistem', s => { s.ambOff = -9; s.ambUntil = s.t + 12; }, 'malam dingin');
  add(Math.floor(days * .78), 9.5, who('rahmat', 'petugas'), ctl('drain', { liters: 25 }));
  add(Math.floor(days * .85), 7.5, 'sistem', s => { s.scrub = 13; }, 'scrubber jenuh');
  add(Math.floor(days * .85), 13, who('rahmat', 'petugas'), ctl('scenario', { k: 'fixscrub' }));
  add(Math.floor(days * .92), 11, who('guru', 'dewi'), ctl('stove', { on: true, burners: 2 }), 'kompor tambahan');
  add(Math.floor(days * .92), 11.6, who('guru', 'dewi'), ctl('stove', { on: false }));
  plan.sort((a, b) => a.h - b.h);

  /* ---------- menjalankan model ---------- */
  const st = reactor.fresh('sim');
  const tStart = 0;                    // pukul 00.00 hari pertama (from = tengah malam zona laporan)
  st.t = tStart; st._lastRead = tStart - .25;
  const readings = [], events = [];
  let actor = 'sistem';
  const atOf = t => Math.round(from + (t - tStart) * 3.6e6);
  SIM.setS(st);
  SIM.setEmitter((e, d) => {
    const m = fmt(e, d, SIM.getS()); if (!m) return;
    delete m.key; delete m.food;
    m.type = e; m.t = SIM.getS().t; m.at = atOf(m.t); m.source = 'sim';
    m.actor = m.cat === 'alert' ? 'sistem' : actor;
    events.push(m);
  });
  try {
    let pi = 0;
    while (st.t - tStart < totalH - 1e-9) {
      const d = Math.min(.02, totalH - (st.t - tStart));
      SIM.step(d);
      if (st.t - st._lastRead >= .25 - 1e-9) { st._lastRead = st.t; readings.push(reactor.reading('sim', st, atOf(st.t))); }
      while (pi < plan.length && plan[pi].h <= st.t - tStart) {
        actor = plan[pi].actor; try { plan[pi].fn(st); } catch (e) { /* abaikan */ } actor = 'sistem'; pi++;
      }
    }
  } finally { SIM.setEmitter(() => {}); }

  /* ---------- menyimpan ---------- */
  await db.deleteReadings({ source: 'sim' });
  await db.deleteEvents({ source: 'sim' });
  for (let i = 0; i < readings.length; i += 2000) await db.addReadings(readings.slice(i, i + 2000));
  for (let i = 0; i < events.length; i += 500) await db.addEvents(events.slice(i, i + 500));

  Object.assign(st, { _real: now, _speed: 1, _paused: false, _tg: {}, _lastReadAt: 0 });
  st.hist = (st.hist || []).slice(-480);
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db.getState('sim');
    const v = await db.putState('sim', st, row ? row.version : null);
    if (v !== false) break;
  }

  /* pengguna tampak aktif */
  const R2 = rng(7);
  for (const n of ['petugas', 'gizi', 'guru', 'siti', 'rahmat', 'dewi']) if (U[n]) await db.updateUser(U[n].id, { last_login: now - Math.round(R2() * 3 * 864e5) });

  const prev = (await db.kvGet('seed_info')) || {};
  const info = { at: now, from, to: now, days, readings: readings.length, events: events.length, users: (prev.users || []).concat(createdUsers) };
  await db.kvSet('seed_info', info);
  await db.addEvents([{ source: 'sistem', at: now, cat: 'action', lvl: 'info', type: 'seed', title: `Riwayat ${days} hari disiapkan`, body: `${readings.length} pembacaan dan ${events.length} kejadian simulasi.`, actor: 'sistem' }]);
  return Object.assign({ ok: true, ms: Date.now() - t0ms, message: `Riwayat ${days} hari siap: ${readings.length.toLocaleString('id-ID')} pembacaan, ${events.length} kejadian, ${createdUsers.length} pengguna baru.` }, info);
}

async function hapus() {
  const info = await db.kvGet('seed_info');
  if (!info) return { ok: true, message: 'Tidak ada data riwayat yang perlu dihapus.' };
  const r = await db.deleteReadings({ source: 'sim', from: info.from, to: info.to });
  const e = await db.deleteEvents({ source: 'sim', from: info.from, to: info.to });
  let u = 0; for (const id of info.users || []) { const x = await db.userById(id); if (x) { await db.deleteUser(id); u++; } }
  await db.kvSet('seed_info', null);
  return { ok: true, message: `Data riwayat dihapus: ${r} pembacaan, ${e} kejadian, ${u} pengguna.` };
}
async function status() { return (await db.kvGet('seed_info')) || null; }

module.exports = { isi, hapus, status };
