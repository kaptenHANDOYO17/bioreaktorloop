'use strict';
/* Laporan admin: ringkasan per sumber, per hari, per jam, kejadian, perangkat, pengguna.
   Semua dihitung dari tabel readings & events sehingga sama untuk Postgres maupun berkas lokal. */
const cfg = require('./config');
const db = require('./db');
const settings = require('./settings');
const xlsx = require('./xlsx');

const CUM = ['bg', 'used', 'feed', 'fert', 'compost', 'buf', 'vent', 'boil', 'liq'];
const AVG = ['T', 'pH', 'P', 'x', 'prod', 'Vg', 'sl', 'vfa'];
const NORMAL = { T: [33, 37], pH: [6.6, 7.9] };
const LPG_PER_M3 = 0.47;   // kg LPG setara per m³ biogas ±63% CH₄ (lihat sheet Perhitungan)

function dayKey(ms, tz) { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
function hourKey(ms, tz) {
  const p = {}; for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms))) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:00`;
}
/* Pukul 00.00 hari ini pada zona waktu laporan, dalam milidetik UTC. */
function startOfDay(ms, tz) {
  const p = {}; for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms))) p[x.type] = x.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second), offset = asUtc - Math.floor(ms / 1000) * 1000;
  return Date.UTC(+p.year, +p.month - 1, +p.day) - offset;
}
function newAgg() { const a = { n: 0, first: null, last: null, normT: 0, normPH: 0, stoveN: 0 }; for (const k of CUM) a[k] = 0; for (const k of AVG) { a[k + '_s'] = 0; a[k + '_n'] = 0; a[k + '_min'] = Infinity; a[k + '_max'] = -Infinity; } return a; }
function addReading(a, r, prev) {
  const d = r.d, at = new Date(r.at).getTime();
  a.n++; if (a.first == null || at < a.first) a.first = at; if (a.last == null || at > a.last) a.last = at;
  if (prev) for (const k of CUM) { const dv = (d[k] || 0) - (prev.d[k] || 0); if (dv > 0 && dv < 1e6) a[k] += dv; }   // jumlah kenaikan; reset diabaikan
  for (const k of AVG) { const v = d[k]; if (Number.isFinite(v)) { a[k + '_s'] += v; a[k + '_n']++; if (v < a[k + '_min']) a[k + '_min'] = v; if (v > a[k + '_max']) a[k + '_max'] = v; } }
  if (Number.isFinite(d.T) && d.T >= NORMAL.T[0] && d.T <= NORMAL.T[1]) a.normT++;
  if (Number.isFinite(d.pH) && d.pH >= NORMAL.pH[0] && d.pH <= NORMAL.pH[1]) a.normPH++;
  if (d.stove) a.stoveN++;
}
function finish(a, price) {
  const o = { n: a.n, first: a.first, last: a.last };
  for (const k of CUM) o[k] = +a[k].toFixed(4);
  for (const k of AVG) { o[k + '_avg'] = a[k + '_n'] ? +(a[k + '_s'] / a[k + '_n']).toFixed(3) : null; o[k + '_min'] = a[k + '_n'] ? +a[k + '_min'].toFixed(3) : null; o[k + '_max'] = a[k + '_n'] ? +a[k + '_max'].toFixed(3) : null; }
  o.lpg = +(o.used * LPG_PER_M3).toFixed(3); o.rupiah = Math.round(o.lpg * price / 12);
  o.normT = a.n ? +(a.normT / a.n).toFixed(4) : null; o.normPH = a.n ? +(a.normPH / a.n).toFixed(4) : null;
  return o;
}

async function build({ from, to, source = 'all' }) {
  const set = await settings.get(); const tz = cfg.TZ; const price = +set.lpg_price || 218000;
  to = to ? new Date(to).getTime() : Date.now(); from = from ? new Date(from).getTime() : to - 7 * 864e5;
  if (!(to > from)) throw Object.assign(new Error('Rentang tanggal tidak valid'), { status: 400 });
  const src = source && source !== 'all' ? source : null;
  const [readings, events, devices] = await Promise.all([
    db.readings({ source: src, from, to, limit: 200000 }),
    db.events({ source: src, from, to, limit: 5000, desc: false }),
    db.listDevices()
  ]);
  const names = { sim: 'Simulasi', sistem: 'Sistem' }; for (const d of devices) names['dev:' + d.id] = d.name;
  const bySrc = {}, byDay = {}, byHour = {}, prevBy = {};
  for (const r of readings) {
    const s = r.source, at = new Date(r.at).getTime(), prev = prevBy[s];
    (bySrc[s] = bySrc[s] || newAgg()); addReading(bySrc[s], r, prev);
    const dk = s + '|' + dayKey(at, tz); (byDay[dk] = byDay[dk] || newAgg()); addReading(byDay[dk], r, prev);
    const hk = s + '|' + hourKey(at, tz); (byHour[hk] = byHour[hk] || newAgg()); addReading(byHour[hk], r, prev);
    prevBy[s] = r;
  }
  const alertCount = {}; const alertTop = {}; const actors = {};
  for (const e of events) {
    if (e.cat === 'alert' && (e.lvl === 'bad' || e.lvl === 'warn')) {
      const k = e.source; alertCount[k] = alertCount[k] || { bad: 0, warn: 0 }; alertCount[k][e.lvl]++;
      const dk = e.source + '|' + dayKey(new Date(e.at).getTime(), tz); alertCount[dk] = alertCount[dk] || { bad: 0, warn: 0 }; alertCount[dk][e.lvl]++;
      const t = e.title.replace(/^Masih terjadi: /, ''); alertTop[t] = alertTop[t] || { title: t, bad: 0, warn: 0 }; alertTop[t][e.lvl]++;
    }
    if (e.actor && e.actor !== 'sistem') { actors[e.actor] = actors[e.actor] || { actor: e.actor, n: 0, last: null }; actors[e.actor].n++; actors[e.actor].last = e.at; }
  }
  // ketersediaan data perangkat: blok 5 menit yang punya pembacaan
  const uptime = {};
  for (const s of Object.keys(bySrc)) if (s.startsWith('dev:')) {
    const dev = devices.find(d => 'dev:' + d.id === s); const start = Math.max(from, dev ? new Date(dev.created_at).getTime() : from);
    const blocks = new Set(); for (const r of readings) if (r.source === s) blocks.add(Math.floor(new Date(r.at).getTime() / 300000));
    const total = Math.max(1, Math.ceil((to - start) / 300000)); uptime[s] = Math.min(1, blocks.size / total);
  }
  const summary = Object.keys(bySrc).sort().map(s => Object.assign({ source: s, name: names[s] || s, uptime: uptime[s] ?? null, alerts: alertCount[s] || { bad: 0, warn: 0 } }, finish(bySrc[s], price)));
  const daily = Object.keys(byDay).sort().map(k => { const [s, day] = k.split('|'); return Object.assign({ source: s, name: names[s] || s, day, alerts: alertCount[k] || { bad: 0, warn: 0 } }, finish(byDay[k], price)); });
  const hourly = Object.keys(byHour).sort().map(k => { const [s, hour] = k.split('|'); return Object.assign({ source: s, name: names[s] || s, hour }, finish(byHour[k], price)); });
  const total = finish(Object.values(bySrc).reduce((acc, a) => { acc.n += a.n; for (const k of CUM) acc[k] += a[k]; return acc; }, newAgg()), price);
  return {
    range: { from, to, tz }, source: source || 'all', generated_at: Date.now(), site: set.site_name, lpg_price: price,
    counts: { readings: readings.length, events: events.length, truncated: readings.length >= 200000 },
    total: { bg: total.bg, used: total.used, lpg: total.lpg, rupiah: total.rupiah, feed: total.feed, fert: total.fert, compost: total.compost, buf: total.buf,
      alerts_bad: events.filter(e => e.cat === 'alert' && e.lvl === 'bad').length, alerts_warn: events.filter(e => e.cat === 'alert' && e.lvl === 'warn').length },
    summary, daily, hourly,
    alertTop: Object.values(alertTop).sort((a, b) => (b.bad * 10 + b.warn) - (a.bad * 10 + a.warn)).slice(0, 15),
    actors: Object.values(actors).sort((a, b) => b.n - a.n),
    events: events.slice(-1500).reverse().map(e => ({ id: e.id, at: e.at, source: e.source, name: names[e.source] || e.source, cat: e.cat, lvl: e.lvl, title: e.title, body: e.body, actor: e.actor })),
    _readings: readings, _names: names
  };
}

const LVL = { bad: 'Bahaya', warn: 'Waspada', ok: 'Pulih', info: 'Info' };
const CAT = { alert: 'Peringatan', action: 'Aksi', sched: 'Jadwal' };
async function toXlsx(rep) {
  const [devices, users, chats] = await Promise.all([db.listDevices(), db.listUsers(), db.listTgChats()]);
  const tz = rep.range.tz, fmtD = ms => new Date(ms).toLocaleString('id-ID', { timeZone: tz });
  const range = `Periode ${fmtD(rep.range.from)} s.d. ${fmtD(rep.range.to)} (${tz}). Dibuat ${fmtD(rep.generated_at)}.`;
  const sumRows = rep.summary.map(s => [s.name, s.source, s.n, s.first, s.last, s.bg, s.used, s.lpg, s.rupiah, s.feed, s.fert, s.compost, s.buf, s.vent, s.boil,
    s.T_avg, s.T_min, s.T_max, s.normT, s.pH_avg, s.pH_min, s.pH_max, s.normPH, s.x_avg, s.alerts.bad, s.alerts.warn, s.uptime]);
  const sheets = [
    { name: 'Ringkasan', title: `Laporan MBG-BIOLOOP · ${rep.site}`, note: range + ` Harga LPG 12 kg: Rp${rep.lpg_price.toLocaleString('id-ID')}. Data simulasi berasal dari model, bukan pengukuran.`,
      columns: [{ h: 'Sumber', w: 22 }, { h: 'ID', w: 14 }, { h: 'Jumlah pembacaan', type: 'int', w: 12 }, { h: 'Pembacaan pertama', type: 'dt', w: 18 }, { h: 'Pembacaan terakhir', type: 'dt', w: 18 },
        { h: 'Biogas dihasilkan (m³)', type: 'num', w: 14 }, { h: 'Dipakai kompor (m³)', type: 'num', w: 14 }, { h: 'Setara LPG (kg)', type: 'num', w: 12 }, { h: 'Perkiraan hemat (Rp)', type: 'int', w: 14 },
        { h: 'Sisa pangan masuk (kg)', type: 'num', w: 14 }, { h: 'Pupuk padat (kg)', type: 'num', w: 12 }, { h: 'Ke kompos (kg)', type: 'num', w: 12 }, { h: 'Buffer NaHCO₃ (g)', type: 'int', w: 12 },
        { h: 'Gas dibuang (m³)', type: 'num', w: 12 }, { h: 'Dipakai boiler (m³)', type: 'num', w: 12 },
        { h: 'Suhu rata2 (°C)', type: 'num', w: 11 }, { h: 'Suhu min', type: 'num', w: 9 }, { h: 'Suhu maks', type: 'num', w: 9 }, { h: 'Waktu suhu normal', type: 'pct', w: 11 },
        { h: 'pH rata2', type: 'num', w: 9 }, { h: 'pH min', type: 'num', w: 8 }, { h: 'pH maks', type: 'num', w: 8 }, { h: 'Waktu pH normal', type: 'pct', w: 11 },
        { h: 'CH₄ rata2 (%)', type: 'num', w: 10 }, { h: 'Peringatan bahaya', type: 'int', w: 10 }, { h: 'Peringatan waspada', type: 'int', w: 10 }, { h: 'Ketersediaan data', type: 'pct', w: 11 }],
      rows: sumRows.concat(rep.summary.length > 1 ? [['TOTAL', '', rep.counts.readings, null, null, rep.total.bg, rep.total.used, rep.total.lpg, rep.total.rupiah, rep.total.feed, rep.total.fert, rep.total.compost, rep.total.buf, null, null, null, null, null, null, null, null, null, null, null, rep.total.alerts_bad, rep.total.alerts_warn, null]] : []) },
    { name: 'Harian', note: 'Nilai kumulatif = jumlah kenaikan selama hari itu. Suhu normal 33–37 °C, pH normal 6,6–7,9.',
      columns: [{ h: 'Tanggal', w: 12 }, { h: 'Sumber', w: 20 }, { h: 'Pembacaan', type: 'int', w: 10 }, { h: 'Biogas (m³)', type: 'num' }, { h: 'Dipakai kompor (m³)', type: 'num' }, { h: 'Setara LPG (kg)', type: 'num' },
        { h: 'Hemat (Rp)', type: 'int' }, { h: 'Sisa pangan (kg)', type: 'num' }, { h: 'Pupuk padat (kg)', type: 'num' }, { h: 'Buffer (g)', type: 'int' },
        { h: 'Suhu rata2', type: 'num', w: 10 }, { h: 'Suhu min', type: 'num', w: 9 }, { h: 'Suhu maks', type: 'num', w: 9 }, { h: 'pH rata2', type: 'num', w: 9 }, { h: 'pH min', type: 'num', w: 8 },
        { h: 'CH₄ rata2 (%)', type: 'num', w: 10 }, { h: 'Produksi rata2 (m³/hari)', type: 'num', w: 12 }, { h: 'Bahaya', type: 'int', w: 8 }, { h: 'Waspada', type: 'int', w: 8 }],
      rows: rep.daily.map(d => [d.day, d.name, d.n, d.bg, d.used, d.lpg, d.rupiah, d.feed, d.fert, d.buf, d.T_avg, d.T_min, d.T_max, d.pH_avg, d.pH_min, d.x_avg, d.prod_avg, d.alerts.bad, d.alerts.warn]) },
    { name: 'Per jam', note: 'Rata-rata per jam dari semua pembacaan.',
      columns: [{ h: 'Jam', w: 16 }, { h: 'Sumber', w: 20 }, { h: 'Pembacaan', type: 'int', w: 10 }, { h: 'Suhu (°C)', type: 'num' }, { h: 'pH', type: 'num' }, { h: 'Tekanan (mbar)', type: 'num' },
        { h: 'CH₄ (%)', type: 'num' }, { h: 'Isi drum (%)', type: 'num' }, { h: 'Produksi (m³/hari)', type: 'num' }, { h: 'VFA (mg/L)', type: 'num' }, { h: 'Endapan (L)', type: 'num' }, { h: 'Biogas jam ini (m³)', type: 'num' }],
      rows: rep.hourly.slice(-20000).map(h => [h.hour, h.name, h.n, h.T_avg, h.pH_avg, h.P_avg, h.x_avg, h.Vg_avg, h.prod_avg, h.vfa_avg, h.sl_avg, h.bg]) },
    { name: 'Pembacaan', note: rep._readings.length > 20000 ? `Menampilkan 20.000 pembacaan terakhir dari ${rep._readings.length}. Unduh CSV per periode lebih pendek untuk data lengkap.` : 'Semua pembacaan dalam periode.',
      columns: [{ h: 'Waktu', type: 'dt', w: 17 }, { h: 'Sumber', w: 18 }, { h: 'Suhu (°C)', type: 'num' }, { h: 'pH', type: 'num' }, { h: 'Tekanan (mbar)', type: 'num' }, { h: 'CH₄ (%)', type: 'num' },
        { h: 'Isi drum (%)', type: 'num' }, { h: 'Produksi (m³/hari)', type: 'num' }, { h: 'VFA (mg/L)', type: 'int' }, { h: 'H₂S (ppm)', type: 'int' }, { h: 'Endapan (L)', type: 'num' }, { h: 'Bocor (% LEL)', type: 'num' },
        { h: 'Kompor', type: 'int', w: 8 }, { h: 'Biogas kumulatif (m³)', type: 'num' }, { h: 'Dipakai kumulatif (m³)', type: 'num' }],
      rows: rep._readings.slice(-20000).map(r => { const d = r.d; return [new Date(r.at).getTime(), rep._names[r.source] || r.source, d.T, d.pH, d.P, d.x, d.Vg, d.prod, d.vfa, d.h2s, d.sl, d.lel, d.stove, d.bg, d.used]; }) },
    { name: 'Kejadian', note: 'Peringatan, aksi otomatis, dan aksi pengguna (kolom Oleh).',
      columns: [{ h: 'Waktu', type: 'dt', w: 17 }, { h: 'Sumber', w: 18 }, { h: 'Jenis', w: 11 }, { h: 'Tingkat', w: 9 }, { h: 'Judul', w: 40 }, { h: 'Keterangan', w: 60 }, { h: 'Oleh', w: 24 }],
      rows: rep.events.slice().reverse().map(e => [new Date(e.at).getTime(), e.name, CAT[e.cat] || e.cat, LVL[e.lvl] || e.lvl, e.title, e.body, e.actor]) },
    { name: 'Peringatan teratas', columns: [{ h: 'Peringatan', w: 40 }, { h: 'Bahaya', type: 'int' }, { h: 'Waspada', type: 'int' }], rows: rep.alertTop.map(a => [a.title, a.bad, a.warn]) },
    { name: 'Aktivitas pengguna', columns: [{ h: 'Pelaku', w: 30 }, { h: 'Jumlah aksi', type: 'int' }, { h: 'Terakhir', type: 'dt', w: 18 }], rows: rep.actors.map(a => [a.actor, a.n, new Date(a.last).getTime()]) },
    { name: 'Perangkat', columns: [{ h: 'ID', w: 14 }, { h: 'Nama', w: 22 }, { h: 'Lokasi', w: 22 }, { h: 'Status', w: 10 }, { h: 'Terdaftar', type: 'dt', w: 17 }, { h: 'Oleh', w: 14 },
        { h: 'Terakhir terlihat', type: 'dt', w: 17 }, { h: 'IP terakhir', w: 15 }, { h: 'Firmware', w: 12 }, { h: 'Suhu terakhir', type: 'num' }, { h: 'pH terakhir', type: 'num' }, { h: 'Kunci (akhiran)', w: 12 }, { h: 'Catatan', w: 30 }],
      rows: devices.map(d => [d.id, d.name, d.location, d.status === 'active' ? 'Aktif' : 'Nonaktif', d.created_at && new Date(d.created_at).getTime(), d.created_by, d.last_seen && new Date(d.last_seen).getTime(), d.last_ip, d.fw,
        d.last_data && d.last_data.T, d.last_data && d.last_data.pH, d.key_hint ? '…' + d.key_hint : '', d.notes]) },
    { name: 'Pengguna', columns: [{ h: 'Nama pengguna', w: 16 }, { h: 'Nama', w: 22 }, { h: 'Peran', w: 8 }, { h: 'Status', w: 10 }, { h: 'Dibuat', type: 'dt', w: 17 }, { h: 'Terakhir masuk', type: 'dt', w: 17 }],
      rows: users.map(u => [u.username, u.name, u.role, u.status, u.created_at && new Date(u.created_at).getTime(), u.last_login && new Date(u.last_login).getTime()]) },
    { name: 'Telegram', columns: [{ h: 'Chat ID', w: 16 }, { h: 'Nama', w: 22 }, { h: 'Username', w: 16 }, { h: 'Disetujui', w: 10 }, { h: 'Berlangganan', w: 12 }, { h: 'Pertama', type: 'dt', w: 17 }, { h: 'Terakhir', type: 'dt', w: 17 }],
      rows: chats.map(c => [c.chat_id, c.title, c.username ? '@' + c.username : '', c.approved, c.subscribed, c.created_at && new Date(c.created_at).getTime(), c.last_seen && new Date(c.last_seen).getTime()]) }
  ];
  return xlsx.build(sheets, { tz, creator: 'MBG-BIOLOOP AI' });
}
function readingsCsv(rep, limit = 25000) {
  const rows = rep._readings.slice(-limit).map(r => { const d = r.d; return [new Date(r.at).toLocaleString('sv-SE', { timeZone: rep.range.tz }), rep._names[r.source] || r.source, d.T, d.pH, d.P, d.x, d.Vg, d.prod, d.vfa, d.h2s, d.sl, d.lel, d.stove, d.bg, d.used, d.feed, d.fert]; });
  return xlsx.csv(['Waktu', 'Sumber', 'Suhu (C)', 'pH', 'Tekanan (mbar)', 'CH4 (%)', 'Isi drum (%)', 'Produksi (m3/hari)', 'VFA (mg/L)', 'H2S (ppm)', 'Endapan (L)', 'Bocor (% LEL)', 'Kompor', 'Biogas kumulatif (m3)', 'Dipakai kumulatif (m3)', 'Sisa pangan kumulatif (kg)', 'Pupuk kumulatif (kg)'], rows);
}
function eventsCsv(rep) {
  const rows = rep.events.slice().reverse().map(e => [new Date(e.at).toLocaleString('sv-SE', { timeZone: rep.range.tz }), e.name, CAT[e.cat] || e.cat, LVL[e.lvl] || e.lvl, e.title, e.body, e.actor]);
  return xlsx.csv(['Waktu', 'Sumber', 'Jenis', 'Tingkat', 'Judul', 'Keterangan', 'Oleh'], rows);
}
function publicReport(rep) { const o = Object.assign({}, rep); delete o._readings; delete o._names; o.hourly = rep.hourly.slice(-24 * 60); return o; }

module.exports = { build, toXlsx, readingsCsv, eventsCsv, publicReport, startOfDay, LPG_PER_M3 };
