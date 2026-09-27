'use strict';
/* Inti bioreaktor tanpa proses yang berjalan terus (cocok untuk Vercel):
   - keadaan disimpan di database per sumber ('sim' atau 'dev:<id>')
   - setiap permintaan "mengejar" waktu yang terlewat lalu menyimpan lagi (optimistic locking)
   - kejadian dan pembacaan disimpan untuk laporan; peringatan diteruskan ke Telegram */
const SIM = require('../public/js/sim.js');
const cfg = require('./config');
const db = require('./db');
const settings = require('./settings');
const { fmt } = require('./events');

const MIN_TICK_MS = { sim: 1500, dev: 5000 };
const READ_EVERY_SIM_H = .25;          // simulasi: satu pembacaan tiap 15 menit waktu simulasi
const READ_EVERY_DEV_MS = 60000;       // perangkat: satu pembacaan tiap 1 menit
const isDev = id => String(id).startsWith('dev:');

/* ---------- keadaan ---------- */
function fresh(source) {
  const s = SIM.newState();
  s.source = isDev(source) ? 'sensor' : 'simulasi';
  s._real = Date.now(); s._speed = cfg.SIM_SPEED; s._paused = false; s._tg = {}; s._lastRead = s.t; s._lastReadAt = 0;
  if (isDev(source)) { s.lastSensor = 0; s.auto = true; }
  return s;
}
function normalize(st, source) {
  const f = fresh(source);
  const o = Object.assign(f, st);
  o.cum = Object.assign(SIM.newState().cum, st.cum || {});
  o.set = Object.assign(SIM.newState().set, st.set || {});
  o.sched = Object.assign(SIM.newState().sched, st.sched || {});
  o.wp = st.wp || f.wp; o.al = st.al || {}; o.hist = st.hist || []; o._tg = st._tg || {};
  return o;
}
async function load(source) {
  let row = await db.getState(source);
  if (!row) {
    const st = fresh(source);
    const v = await db.putState(source, st, null);
    if (v !== false) return { state: st, version: v };
    row = await db.getState(source);
  }
  return { state: normalize(row.state, source), version: row.version };
}

/* Menjalankan fungsi sinkron dengan SIM terikat pada keadaan ini dan mengumpulkan kejadiannya.
   Harus sinkron: SIM memakai variabel global. */
function withSim(st, fn) {
  const events = [];
  SIM.setS(st);
  SIM.setEmitter((e, d) => {
    const m = fmt(e, d, SIM.getS()); if (!m) return;
    m.type = e; m.t = SIM.getS().t; m.at = Date.now(); events.push(m);
  });
  try { return { result: fn(st, events), events }; }
  finally { SIM.setEmitter(() => {}); }
}

function reading(source, st, at) {
  const r4 = v => Math.round(v * 1e4) / 1e4;
  return { source, at, t: r4(st.t), d: {
    T: r4(st.T), pH: r4(st.pH), P: r4(st.press), x: r4(st.xCH4 * 100), Vg: r4(st.Vg / SIM.R.VgMax * 100), prod: r4(st.prod * 24),
    vfa: Math.round(st.vfa), h2s: Math.round(st.h2s), sl: r4(st.sludgeL), lel: r4(st.lel), stove: st.stove ? 1 : 0, hot: st.hot ? 1 : 0, cold: st.cold ? 1 : 0,
    bg: r4(st.cum.bg), used: r4(st.cum.used), feed: r4(st.cum.feed), fert: r4(st.cum.fert), compost: r4(st.cum.compost),
    buf: Math.round(st.cum.buf), vent: r4(st.cum.vent), boil: r4(st.cum.boil), liq: r4(st.cum.liq) } };
}

/* Memajukan waktu. Simulasi: langkah model; perangkat: jam nyata + cek "sensor diam". */
function advance(source, st, now, readings) {
  const elapsed = Math.max(0, Math.min(now - (st._real || now), cfg.MAX_CATCHUP_MIN * 60000));
  if (!isDev(source)) {
    if (!st._paused && elapsed > 0) {
      const total = elapsed / 1000 * (st._speed || cfg.SIM_SPEED) / 3600, t0 = st.t, start = now - elapsed;
      let h = total, g = 0;
      while (h > 1e-9 && g < 120000) {
        const d = Math.min(.02, h); SIM.step(d); h -= d; g++;
        if (st.t - st._lastRead >= READ_EVERY_SIM_H) { st._lastRead = st.t; readings.push(reading(source, st, Math.round(start + (st.t - t0) / total * elapsed))); }
      }
    }
  } else {
    const dtH = Math.max(0, now - (st._real || now)) / 3.6e6;
    st.t += dtH; SIM.evalAlerts(dtH);
  }
  st._real = now;
}

/* Memilih kejadian yang dikirim ke Telegram dan mencatat jeda (cooldown) di keadaan yang sama. */
function pickNotify(source, st, events, set) {
  if (!cfg.TELEGRAM_BOT_TOKEN) return [];
  if (!isDev(source) && !set.notify_sim) return [];
  const out = [], now = Date.now();
  for (const m of events) {
    if (m.cat === 'alert' && !set.notify_alerts) continue;
    if (m.cat === 'action' && !set.notify_actions) continue;
    if (m.cat === 'sched' && !set.notify_schedule) continue;
    if (m.cat === 'alert' && m.lvl === 'info') continue;
    if (m.key) {
      const k = m.key + ':' + m.lvl;
      if (m.lvl !== 'bad' && st._tg[k] && now - st._tg[k] < (set.alert_cooldown_min ?? cfg.ALERT_COOLDOWN_MIN) * 60000) continue;
      st._tg[k] = now;
    }
    out.push(m);
  }
  return out;
}

/* ---------- menjalankan satu perubahan secara aman ---------- */
async function run(source, fn, opt = {}) {
  const set = await settings.get();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { state: st, version } = await load(source);
    const now = Date.now();
    if (opt.tickOnly && now - (st._real || 0) < MIN_TICK_MS[isDev(source) ? 'dev' : 'sim']) return { state: st, events: [], changed: false };
    const readings = [];
    let actionFrom = 0;
    const out = withSim(st, (s, evs) => {
      advance(source, s, now, readings);
      actionFrom = evs.length;   // kejadian setelah ini berasal dari aksi pengguna
      return fn ? fn(s, { now, readings, source }) : undefined;
    });
    const events = out.events;
    if (opt.actor) events.forEach((e, i) => { if (i >= actionFrom && e.cat !== 'alert') e.actor = opt.actor; });
    events.forEach(e => { e.source = source; if (!e.actor) e.actor = 'sistem'; });
    if (opt.note) events.push(Object.assign({ source, t: st.t, at: now, actor: opt.actor || 'sistem', type: 'note' }, opt.note));
    const notify = pickNotify(source, st, events, set);
    const v = await db.putState(source, st, version);
    if (v === false) {
      if (opt.tickOnly) { const cur = await load(source); return { state: cur.state, events: [], changed: false }; }
      continue;     // bentrok dengan permintaan lain: ulangi dengan keadaan terbaru
    }
    let ids = [];
    try { ids = await db.addEvents(events); await db.addReadings(readings); }
    catch (e) { console.error('[reactor] gagal menyimpan kejadian/pembacaan:', e.message); }
    events.forEach((e, i) => { e.id = ids[i]; });
    if (notify.length) {
      try { await require('./telegram').notifyEvents(source, notify); }
      catch (e) { console.error('[reactor] gagal kirim Telegram:', e.message); }
    }
    return { state: st, version: v, events, result: out.result, changed: true };
  }
  throw Object.assign(new Error('Sistem sedang sibuk, coba lagi.'), { status: 503 });
}
const tick = source => run(source, null, { tickOnly: true });

/* ---------- ringkasan untuk website ---------- */
function snapshot(source, st) {
  return withSim(st, s => {
    const o = {};
    for (const k in s) if (k !== 'hist' && k[0] !== '_') o[k] = s[k];
    o.health = SIM.aiInsight().score; o.worst = SIM.worstStatus();
    o.speed = s._speed; o.paused = !!s._paused; o.mode = isDev(source) ? 'sensor' : 'simulasi'; o.sourceId = source;
    return o;
  }).result;
}
function describe(st) { return withSim(st, () => SIM.describe()).result; }

/* ---------- kendali ---------- */
const clamp = SIM.clamp;
function simControl(s, action, p, origin) {
  const say = (ok, message) => ({ ok, message });
  switch (action) {
    case 'buffer': { const g = clamp(+p.grams || 300, 50, 3000); SIM.dose(g, origin); return say(true, `${g} g NaHCO₃ sedang dipompa. pH sekarang ${s.pH.toFixed(2)}.`); }
    case 'feed': { const kg = clamp(+p.kg || 3, .5, 50); const type = SIM.FOOD[p.type] ? p.type : 'campuran'; const water = p.water !== undefined ? clamp(+p.water, 0, 100) : kg;
      SIM.feed(kg, type, water, origin); return say(true, `${kg} kg ${SIM.FOOD[type].n} + ${water} L air dimasukkan.${kg > 6 ? ' Jumlah ini di atas kapasitas harian ±3,5 kg; pantau pH.' : ''}`); }
    case 'drain': { const L = clamp(+p.liters || 20, 5, 200); if (s.sludgeL < 1) return say(false, 'Endapan sudah kosong.');
      SIM.drain(L, origin); return say(true, `Katup bawah dibuka, menguras ±${Math.min(L, s.sludgeL).toFixed(0)} L.`); }
    case 'stove': { const on = !!p.on; if (p.burners) s.burners = clamp(Math.round(+p.burners), 1, 2);
      const ok = SIM.stoveSet(on, origin);
      return ok ? say(true, on ? `Kompor menyala ${s.burners} tungku; gas cukup ±${(s.Vg / (SIM.R.burner * s.burners) * 60).toFixed(0)} menit.` : 'Kompor dimatikan.')
                : say(false, s.lel > 10 ? `Kompor diblokir: kebocoran gas ${s.lel.toFixed(0)}% LEL. Perbaiki dulu.` : 'Gas tidak cukup untuk menyalakan kompor. Pakai LPG cadangan.'); }
    case 'valve': { const m = ['panas', 'dingin', 'tutup'].includes(p.mode) ? p.mode : 'tutup'; if (m !== 'tutup') s.auto = false;
      if (m === 'panas') SIM.setHot(true, origin); else if (m === 'dingin') SIM.setCold(true, origin); else { SIM.setHot(false, origin); SIM.setCold(false, origin); }
      return say(true, m === 'tutup' ? 'Semua katup koil ditutup.' : `Mode manual; katup air ${m} dibuka.`); }
    case 'auto': s.auto = !!p.on; return say(true, `Mode ${s.auto ? 'otomatis' : 'manual'} aktif.`);
    case 'stir': s.stir = !!p.on; return say(true, `Pengaduk ${s.stir ? 'menyala' : 'mati'}.`);
    case 'schedule': if (p.feed !== undefined) s.sched.feed = !!p.feed; if (p.stove !== undefined) s.sched.stove = !!p.stove; return say(true, 'Jadwal diperbarui.');
    case 'setpoint': { for (const k of ['T', 'band', 'pHmin', 'pHmax', 'Pmax', 'sludgeMax', 'feedKg', 'porsi']) if (p[k] !== undefined && Number.isFinite(+p[k])) s.set[k] = +p[k]; return say(true, 'Batas normal diperbarui.'); }
    case 'scenario': return SIM.scenario(p.k) ? say(true, 'Skenario dijalankan: ' + (SIM.SCEN[p.k] || p.k)) : say(false, 'Skenario tidak dikenal.');
    case 'speed': s._speed = clamp(+p.speed || 60, 1, 7200); return say(true, `Kecepatan simulasi ${s._speed}×.`);
    case 'pause': s._paused = !!p.on; return say(true, s._paused ? 'Simulasi dijeda.' : 'Simulasi berjalan.');
    case 'reset': { const keep = { _speed: s._speed, _tg: {} }; const f = fresh('sim'); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, f, keep); SIM.setS(s); return say(true, 'Simulasi dimulai ulang.'); }
    default: return say(false, 'Aksi tidak dikenal: ' + action);
  }
}
const DEVICE_CMDS = { buffer: p => ({ cmd: 'buffer', grams: clamp(+p.grams || 300, 50, 3000) }), drain: p => ({ cmd: 'drain', liters: clamp(+p.liters || 20, 5, 200) }),
  stove: p => ({ cmd: 'stove', on: !!p.on, burners: p.burners ? clamp(Math.round(+p.burners), 1, 2) : undefined }), valve: p => ({ cmd: 'valve', mode: ['panas', 'dingin', 'tutup'].includes(p.mode) ? p.mode : 'tutup' }),
  auto: p => ({ cmd: 'auto', on: !!p.on }), stir: p => ({ cmd: 'stir', on: !!p.on }) };

async function control(source, action, p = {}, who = {}) {
  const origin = who.origin || 'manual', actor = who.actor || 'Dasbor';
  if (isDev(source)) {
    const id = source.slice(4); const dev = await db.deviceById(id);
    if (!dev) return { ok: false, message: 'Perangkat tidak ditemukan.' };
    if (dev.status !== 'active') return { ok: false, message: 'Perangkat sedang dinonaktifkan admin.' };
    if (action === 'setpoint' || action === 'schedule') {
      const r = await run(source, s => simControl(s, action, p, origin), { actor });
      if (action === 'setpoint') await db.addCommand(id, { cmd: 'setpoint', set: r.state.set }, actor);
      return r.result;
    }
    const mk = DEVICE_CMDS[action];
    if (!mk) return { ok: false, message: action === 'feed' ? 'Pengumpanan di alat nyata dilakukan manual oleh petugas.' : 'Aksi ini hanya tersedia di mode simulasi.' };
    const cmd = mk(p);
    await db.addCommand(id, cmd, actor);
    await run(source, null, { actor, note: { cat: 'action', lvl: 'info', title: `Perintah ${cmd.cmd} dikirim ke ${dev.name}`, body: JSON.stringify(cmd) } });
    return { ok: true, message: `Perintah ${cmd.cmd} dikirim ke ${dev.name}. Dijalankan saat perangkat mengirim data berikutnya (±10 detik).` };
  }
  const r = await run(source, s => simControl(s, action, p, origin), { actor });
  return r.result;
}

/* ---------- data dari ESP32 ---------- */
const FIELDS = { T: 'T', pH: 'pH', press: 'press', lel: 'lel', vg: 'Vg', ch4: 'xCH4', h2s: 'h2s', sludge: 'sludgeL', hot: 'hot', cold: 'cold', stove: 'stove', scrub: 'scrub', vfa: 'vfa' };
async function ingest(dev, body, ip) {
  const source = 'dev:' + dev.id;
  const r = await run(source, (s, ctx) => {
    const prev = s.lastSensor || 0, dtH = prev && ctx.now - prev < 600000 ? (ctx.now - prev) / 3.6e6 : 0;
    for (const [k, f] of Object.entries(FIELDS)) if (body[k] !== undefined && body[k] !== null && body[k] !== '') {
      let v = body[k];
      if (typeof s[f] === 'boolean') { s[f] = !!v; continue; }
      v = +v; if (!Number.isFinite(v)) continue;
      if (f === 'xCH4' && v > 1) v /= 100;
      if (f === 'Vg' && v > 5) v /= 1000;
      s[f] = v;
    }
    if (body.prod_m3_day !== undefined && Number.isFinite(+body.prod_m3_day)) s.prod = +body.prod_m3_day / 24;
    s.cum.bg += (s.prod || 0) * dtH;
    if (s.stove) s.cum.used += SIM.R.burner * (s.burners || 1) * dtH;
    s.source = 'sensor'; s.lastSensor = ctx.now;
    SIM.recordHist(); SIM.evalAlerts(0);
    if (ctx.now - (s._lastReadAt || 0) >= READ_EVERY_DEV_MS) { s._lastReadAt = ctx.now; ctx.readings.push(reading(source, s, ctx.now)); }
  });
  const last = { T: r.state.T, pH: r.state.pH, press: r.state.press, lel: r.state.lel, Vg: r.state.Vg, stove: r.state.stove };
  await db.updateDevice(dev.id, { last_seen: Date.now(), last_ip: ip || '', fw: body.fw ? String(body.fw).slice(0, 40) : dev.fw, last_data: last });
  const commands = await db.takeCommands(dev.id);
  return { ok: true, commands, set: r.state.set, auto: r.state.auto };
}

/* ---------- daftar sumber data ---------- */
async function sources() {
  const devs = await db.listDevices();
  const now = Date.now();
  return [{ id: 'sim', name: 'Simulasi', kind: 'simulasi', online: true }].concat(devs.filter(d => d.status === 'active').map(d => ({
    id: 'dev:' + d.id, name: d.name, location: d.location, kind: 'sensor',
    online: !!d.last_seen && now - new Date(d.last_seen).getTime() < 120000, last_seen: d.last_seen })));
}
async function resolveSource(src) {
  const set = await settings.get();
  const want = src || set.default_source || 'sim';
  if (want === 'sim') return 'sim';
  if (isDev(want)) { const d = await db.deviceById(want.slice(4)); if (d && d.status === 'active') return want; }
  return 'sim';
}

module.exports = { SIM, load, run, tick, withSim, snapshot, describe, control, ingest, sources, resolveSource, isDev, fresh, reading };
