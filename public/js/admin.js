/* =====================================================================
   PANEL ADMIN MBG-BIOLOOP
   Ringkasan · Laporan (unduh Excel/CSV/PDF) · Perangkat · Pengguna · Telegram · Pengaturan
   ===================================================================== */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const { esc, toast, openModal, closeModal, api, confirmBox } = window.UI;
const nf = (v, d = 0) => v == null || !Number.isFinite(+v) ? '–' : (+v).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
const rp = v => v == null ? '–' : 'Rp' + nf(Math.round(v));
const pct = v => v == null ? '–' : nf(v * 100, 0) + '%';
const dt = v => v ? new Date(v).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
function ago(v) {
  if (!v) return 'belum pernah'; const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' menit lalu'; if (s < 86400) return Math.floor(s / 3600) + ' jam lalu'; return Math.floor(s / 86400) + ' hari lalu';
}
const LVL = { bad: 'Bahaya', warn: 'Waspada', ok: 'Pulih', info: 'Info' };
const CAT = { alert: 'Peringatan', action: 'Aksi', sched: 'Jadwal' };
const TITLES = { ringkasan: 'Ringkasan', laporan: 'Laporan', perangkat: 'Perangkat terdaftar', pengguna: 'Pengguna', telegram: 'Telegram & notifikasi', pengaturan: 'Pengaturan', panduan: 'Panduan admin' };
async function copy(text, label) { try { await navigator.clipboard.writeText(text); toast('ok', 'Disalin', label || ''); } catch (e) { toast('warn', 'Tidak bisa menyalin otomatis', 'Pilih teks lalu salin manual.'); } }
const evItem = e => `<div class="ev ${e.lvl}"><i aria-hidden="true">${UI.ICON[e.lvl] || 'i'}</i><div><b>${esc(e.title)}</b>${e.body ? `<p>${esc(e.body)}</p>` : ''}${e.actor && e.actor !== 'sistem' ? `<span class="by">oleh ${esc(e.actor)}</span>` : ''}</div><small>${esc(e.name || (e.source === 'sim' ? 'Simulasi' : e.source))}<br>${dt(e.at)}</small></div>`;

/* ---------- grafik kanvas (satu seri, tooltip saat disorot) ---------- */
const tipEl = $('#tip');
function sizeCanvas(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return null;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.font = '11px "Plus Jakarta Sans", system-ui, sans-serif'; return { c, w, h };
}
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
/* opts: { labels[], values[], kind:'bar'|'line', unit, dec, color, band:[lo,hi], min, max } */
function chart(cv, o) {
  const draw = hi => {
    const g = sizeCanvas(cv); if (!g) return; const { c, w, h } = g;
    const vals = o.values, n = vals.length;
    if (!n) { c.fillStyle = '#8A909C'; c.textAlign = 'center'; c.fillText('Belum ada data pada periode ini', w / 2, h / 2); return; }
    const padL = 48, padR = 10, padT = 12, padB = 30, pw = w - padL - padR, ph = h - padT - padB;
    const finite = vals.filter(v => Number.isFinite(v));
    let lo = o.kind === 'bar' ? 0 : Math.min(...finite, o.band ? o.band[0] : Infinity), hiV = Math.max(...finite, o.band ? o.band[1] : -Infinity);
    if (o.kind === 'bar') hiV = niceMax(hiV * 1.05); else { const sp = (hiV - lo) || 1; lo -= sp * .1; hiV += sp * .1; }
    if (!Number.isFinite(lo) || !Number.isFinite(hiV) || hiV === lo) { lo = 0; hiV = 1; }
    const Y = v => padT + (1 - (v - lo) / (hiV - lo)) * ph;
    const step = pw / n, X = i => padL + step * (i + .5);
    if (o.band) { c.fillStyle = 'rgba(31,122,77,.09)'; c.fillRect(padL, Y(o.band[1]), pw, Y(o.band[0]) - Y(o.band[1])); }
    c.strokeStyle = '#EEE9DF'; c.lineWidth = 1; c.fillStyle = '#8A909C'; c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) { const v = lo + (hiV - lo) * i / 4, y = Y(v); c.beginPath(); c.moveTo(padL, y); c.lineTo(padL + pw, y); c.stroke(); c.fillText(nf(v, (hiV - lo) < 5 ? 1 : 0), padL - 8, y); }
    c.textAlign = 'center'; c.textBaseline = 'top';
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 64))));
    o.labels.forEach((l, i) => { if (i % every === 0 || i === n - 1) c.fillText(l, X(i), padT + ph + 9); });
    const col = o.color || '#7A1020';
    if (o.kind === 'bar') {
      const bw = Math.max(2, Math.min(36, step - 4));
      vals.forEach((v, i) => { if (!Number.isFinite(v)) return; const x = X(i) - bw / 2, y = Y(Math.max(v, 0)), hh = Y(0) - y; c.fillStyle = hi === i ? '#B91C2C' : col;
        const r = Math.min(4, bw / 2, hh); c.beginPath(); c.moveTo(x, Y(0)); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.lineTo(x + bw - r, y); c.quadraticCurveTo(x + bw, y, x + bw, y + r); c.lineTo(x + bw, Y(0)); c.closePath(); c.fill(); });
    } else {
      c.strokeStyle = col; c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath(); let started = false;
      vals.forEach((v, i) => { if (!Number.isFinite(v)) { started = false; return; } const x = X(i), y = Y(v); started ? c.lineTo(x, y) : c.moveTo(x, y); started = true; }); c.stroke();
      if (n <= 40) vals.forEach((v, i) => { if (!Number.isFinite(v)) return; c.fillStyle = '#fff'; c.beginPath(); c.arc(X(i), Y(v), hi === i ? 5 : 3, 0, 7); c.fill(); c.strokeStyle = col; c.lineWidth = 2; c.stroke(); });
      if (hi != null) { c.strokeStyle = 'rgba(26,29,36,.3)'; c.lineWidth = 1; c.beginPath(); c.moveTo(X(hi), padT); c.lineTo(X(hi), padT + ph); c.stroke(); }
    }
    cv._geom = { padL, pw, step, n, Y, X };
  };
  draw(null);
  cv.onpointermove = e => {
    const g = cv._geom; if (!g) return; const r = cv.getBoundingClientRect(); const i = Math.floor((e.clientX - r.left - g.padL) / g.step);
    if (i < 0 || i >= g.n) { tipEl.hidden = true; draw(null); return; }
    draw(i); const v = o.values[i];
    tipEl.hidden = false; tipEl.innerHTML = `${esc(o.full ? o.full[i] : o.labels[i])}<br><b>${Number.isFinite(v) ? nf(v, o.dec ?? 2) : '–'} ${esc(o.unit || '')}</b>`;
    tipEl.style.left = (r.left + g.X(i)) + 'px'; tipEl.style.top = (r.top + (Number.isFinite(v) ? g.Y(v) : r.height / 2)) + 'px';
  };
  cv.onpointerleave = () => { tipEl.hidden = true; draw(null); };
  cv._redraw = () => draw(null);
}
window.addEventListener('resize', () => document.querySelectorAll('canvas').forEach(c => c._redraw && c._redraw()));

/* =====================================================================
   RINGKASAN
   ===================================================================== */
async function secRingkasan(el) {
  el.innerHTML = '<p class="muted">Memuat ringkasan…</p>';
  const o = await api('api/admin/overview');
  $('#pwBanner').hidden = !o.passwordIsDefault;
  setBadges(o);
  const days = o.weekDaily.reduce((m, d) => { m[d.day] = (m[d.day] || 0) + d.bg; return m; }, {});
  const dayKeys = Object.keys(days).sort();
  const rd = o.ready ? o.ready.items : [];
  const need = rd.filter(x => !x.ok && !x.optional).length;
  const readyCard = rd.length ? `<div class="card ready ${need ? '' : 'done'}"><h3>${need ? `Siap dipakai? <small>${need} langkah lagi</small>` : 'Semua siap ✓ <small>website & bot siap dipakai</small>'}</h3>
    <ul class="checklist">${rd.map(x => `<li class="${x.ok ? '' : x.optional ? 'opt' : 'no'}"><div><b>${esc(x.label)}</b>${x.ok ? '' : `<br><span class="muted small">${esc(x.hint)}</span>${x.link ? ` <a class="small" href="${esc(x.link)}">buka →</a>` : ''}`}</div></li>`).join('')}</ul></div>` : '';
  el.innerHTML = readyCard + `
  <div class="tiles">
    <div class="tile green"><div class="k">Biogas 7 hari</div><div class="v">${nf(o.week.bg, 2)}<small>m³</small></div><div class="s">dipakai kompor ${nf(o.week.used, 2)} m³</div></div>
    <div class="tile"><div class="k">Hemat LPG 7 hari</div><div class="v">${rp(o.week.rupiah)}</div><div class="s">setara ${nf(o.week.lpg, 2)} kg LPG</div></div>
    <div class="tile ${o.alerts24.bad ? 'red' : ''}"><div class="k">Peringatan 24 jam</div><div class="v">${o.alerts24.bad}<small>bahaya</small></div><div class="s">${o.alerts24.warn} waspada · <a href="#laporan">lihat laporan →</a></div></div>
    <div class="tile blue"><div class="k">Perangkat</div><div class="v">${o.devices.online}<small>online dari ${o.devices.total}</small></div><div class="s"><a href="#perangkat">Kelola perangkat →</a></div></div>
    <div class="tile ${o.users.pending ? 'red' : ''}"><div class="k">Pengguna</div><div class="v">${o.users.total}<small>akun</small></div><div class="s">${o.users.pending ? `<a href="#pengguna"><b>${o.users.pending} menunggu persetujuan →</b></a>` : `${o.users.admins} admin`}</div></div>
    <div class="tile ${o.telegram.pending ? 'red' : ''}"><div class="k">Chat Telegram</div><div class="v">${o.telegram.subscribed}<small>penerima</small></div><div class="s">${o.telegram.pending ? `<a href="#telegram"><b>${o.telegram.pending} menunggu persetujuan →</b></a>` : `${o.telegram.total} chat tercatat`}</div></div>
  </div>
  <div class="grid2">
    <div class="card"><h3>Biogas dihasilkan per hari <small>semua sumber, 7 hari</small></h3><div class="chartbox"><canvas id="cvWeek"></canvas></div></div>
    <div class="card"><h3>Kejadian terbaru <a class="btn btn-soft xs" href="#laporan">Semua</a></h3><div class="evlist">${o.recent.length ? o.recent.slice(0, 8).map(evItem).join('') : '<div class="empty-s">Belum ada kejadian.</div>'}</div></div>
  </div>
  <div class="card"><h3>Penyimpanan <small>${o.db === 'postgres' ? 'PostgreSQL (Supabase/Neon)' : 'berkas lokal'}</small></h3>
    ${o.stats ? `<p class="muted small" style="margin:0">${nf(o.stats.readings)} pembacaan · ${nf(o.stats.events)} kejadian · ${nf(o.stats.conversations)} percakapan · ${nf(o.stats.bytes / 1048576, 1)} MB terpakai${o.db === 'postgres' ? ' (paket gratis Supabase: 500 MB)' : ''}</p>` : ''}</div>`;
  chart($('#cvWeek'), { kind: 'bar', labels: dayKeys.map(d => d.slice(8) + '/' + d.slice(5, 7)), full: dayKeys, values: dayKeys.map(d => days[d]), unit: 'm³', dec: 2, color: '#1F7A4D' });
}
function setBadges(o) {
  const b = (id, n) => { const e = $(id); e.hidden = !n; e.textContent = n; };
  b('#badgeUsr', o.users.pending); b('#badgeTg', o.telegram.pending);
}

/* =====================================================================
   LAPORAN
   ===================================================================== */
const REP = { preset: '7', source: 'all', from: null, to: null, data: null, evPage: 0, evFilter: '', evSearch: '' };
function rangeOf() {
  const to = Date.now();
  if (REP.preset === 'custom' && REP.from && REP.to) return { from: new Date(REP.from + 'T00:00').getTime(), to: new Date(REP.to + 'T23:59:59').getTime() };
  const days = { '1': 1, '7': 7, '30': 30, '90': 90 }[REP.preset] || 7;
  return { from: to - days * 864e5, to };
}
function repQuery() { const r = rangeOf(); return new URLSearchParams({ from: r.from, to: r.to, source: REP.source }).toString(); }
async function secLaporan(el) {
  const srcs = (await api('api/sources')).sources;
  const today = new Date().toISOString().slice(0, 10), weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  el.innerHTML = `
  <div class="card no-print">
    <div class="toolbar">
      <label>Sumber<select class="sel" id="rSrc"><option value="all">Semua sumber</option>${srcs.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
      <div><span class="muted small" style="font-weight:700;display:block;margin-bottom:4px">Periode</span>
        <div class="presets" role="group" aria-label="Periode">${[['1', '24 jam'], ['7', '7 hari'], ['30', '30 hari'], ['90', '90 hari'], ['custom', 'Pilih tanggal']].map(([k, l]) => `<button data-p="${k}" class="${REP.preset === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <label id="rCustom" ${REP.preset === 'custom' ? '' : 'hidden'}>Dari<input type="date" class="sel" id="rFrom" value="${REP.from || weekAgo}"></label>
      <label id="rCustom2" ${REP.preset === 'custom' ? '' : 'hidden'}>Sampai<input type="date" class="sel" id="rTo" value="${REP.to || today}"></label>
      <div class="dls">
        <a class="btn btn-merah sm" id="dlX" href="#">⬇ Excel lengkap</a>
        <a class="btn btn-line sm" id="dlC" href="#">CSV pembacaan</a>
        <a class="btn btn-line sm" id="dlE" href="#">CSV kejadian</a>
        <button class="btn btn-line sm" id="dlP">Cetak / PDF</button>
      </div>
    </div>
  </div>
  <div id="repBody"><p class="muted">Menyusun laporan…</p></div>`;
  $('#rSrc').value = REP.source;
  $('#rSrc').addEventListener('change', e => { REP.source = e.target.value; loadReport(); });
  el.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
    REP.preset = b.dataset.p; el.querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x === b));
    $('#rCustom').hidden = $('#rCustom2').hidden = REP.preset !== 'custom';
    if (REP.preset === 'custom') { REP.from = $('#rFrom').value; REP.to = $('#rTo').value; }
    loadReport();
  }));
  ['#rFrom', '#rTo'].forEach(id => $(id).addEventListener('change', () => { REP.from = $('#rFrom').value; REP.to = $('#rTo').value; loadReport(); }));
  $('#dlP').addEventListener('click', () => window.print());
  loadReport();
}
async function loadReport() {
  const q = repQuery();
  $('#dlX').href = 'api/admin/report.xlsx?' + q; $('#dlC').href = 'api/admin/report.csv?type=readings&' + q; $('#dlE').href = 'api/admin/report.csv?type=events&' + q;
  const gen = REP.gen = (REP.gen || 0) + 1;
  let body = $('#repBody'); body.innerHTML = '<p class="muted">Menyusun laporan…</p>';
  let d; try { d = await api('api/admin/report?' + q); } catch (e) { if (gen === REP.gen) $('#repBody').innerHTML = `<div class="warnbox">${esc(e.message)}</div>`; return; }
  if (gen !== REP.gen || !document.getElementById('repBody')) return;   // sudah diganti permintaan yang lebih baru
  body = $('#repBody');
  REP.data = d; REP.evPage = 0;
  const r = d.range, t = d.total;
  const byDay = {}; d.daily.forEach(x => { const k = x.day; byDay[k] = byDay[k] || { bg: 0, used: 0, Ts: 0, Tn: 0, bad: 0, warn: 0 }; byDay[k].bg += x.bg; byDay[k].used += x.used; if (x.T_avg != null) { byDay[k].Ts += x.T_avg * x.n; byDay[k].Tn += x.n; } byDay[k].bad += x.alerts.bad; byDay[k].warn += x.alerts.warn; });
  const days = Object.keys(byDay).sort();
  const hourlyMode = days.length <= 2 && d.hourly.length > 2;
  body.innerHTML = `
  <div class="card print-head"><h3>Laporan ${esc(d.site)} <small>${dt(r.from)} – ${dt(r.to)} · ${esc(r.tz)} · ${REP.source === 'all' ? 'semua sumber' : esc((d.summary[0] || {}).name || REP.source)}</small></h3>
    <p class="muted small" style="margin:0">${nf(d.counts.readings)} pembacaan dan ${nf(d.counts.events)} kejadian dianalisis. Harga LPG 12 kg ${rp(d.lpg_price)}. Data simulasi berasal dari model, bukan pengukuran alat.${d.counts.truncated ? ' <b>Data terpotong; pilih periode lebih pendek.</b>' : ''}</p></div>
  <div class="tiles">
    <div class="tile green"><div class="k">Biogas dihasilkan</div><div class="v">${nf(t.bg, 2)}<small>m³</small></div></div>
    <div class="tile green"><div class="k">Dipakai kompor</div><div class="v">${nf(t.used, 2)}<small>m³</small></div><div class="s">setara ${nf(t.lpg, 2)} kg LPG</div></div>
    <div class="tile"><div class="k">Perkiraan hemat</div><div class="v">${rp(t.rupiah)}</div></div>
    <div class="tile"><div class="k">Sisa pangan diolah</div><div class="v">${nf(t.feed, 1)}<small>kg</small></div><div class="s">${nf(t.compost, 1)} kg ke kompos</div></div>
    <div class="tile"><div class="k">Pupuk padat</div><div class="v">${nf(t.fert, 1)}<small>kg</small></div><div class="s">buffer ${nf(t.buf)} g NaHCO₃</div></div>
    <div class="tile ${t.alerts_bad ? 'red' : ''}"><div class="k">Peringatan</div><div class="v">${t.alerts_bad}<small>bahaya</small></div><div class="s">${t.alerts_warn} waspada</div></div>
  </div>
  <div class="grid2">
    <div class="card"><h3>${hourlyMode ? 'Biogas per jam' : 'Biogas dihasilkan per hari'} <small>m³</small></h3><div class="chartbox"><canvas id="cvBg"></canvas></div></div>
    <div class="card"><h3>${hourlyMode ? 'Suhu rata-rata per jam' : 'Suhu rata-rata harian'} <small>°C · area hijau = normal 33–37</small></h3><div class="chartbox"><canvas id="cvT"></canvas></div></div>
  </div>
  <div class="card"><h3>Ringkasan per sumber</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>Sumber</th><th class="num">Pembacaan</th><th class="num">Biogas (m³)</th><th class="num">Kompor (m³)</th><th class="num">Hemat</th><th class="num">Sisa pangan (kg)</th><th class="num">Suhu rata2</th><th class="num">Suhu normal</th><th class="num">pH rata2</th><th class="num">pH normal</th><th class="num">CH₄</th><th class="num">Bahaya</th><th class="num">Waspada</th><th class="num">Data masuk</th></tr></thead><tbody>
    ${d.summary.length ? d.summary.map(s => `<tr><td><b>${esc(s.name)}</b><br><span class="muted small mono">${esc(s.source)}</span></td><td class="num">${nf(s.n)}</td><td class="num">${nf(s.bg, 2)}</td><td class="num">${nf(s.used, 2)}</td><td class="num">${rp(s.rupiah)}</td><td class="num">${nf(s.feed, 1)}</td><td class="num">${nf(s.T_avg, 1)} °C</td><td class="num">${pct(s.normT)}</td><td class="num">${nf(s.pH_avg, 2)}</td><td class="num">${pct(s.normPH)}</td><td class="num">${nf(s.x_avg, 0)}%</td><td class="num">${s.alerts.bad}</td><td class="num">${s.alerts.warn}</td><td class="num">${s.uptime == null ? '–' : pct(s.uptime)}</td></tr>`).join('') : '<tr><td colspan="14" class="empty-s">Belum ada pembacaan pada periode ini.</td></tr>'}
  </tbody></table></div></div>
  <div class="card"><h3>Rekap harian</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>Tanggal</th><th>Sumber</th><th class="num">Biogas (m³)</th><th class="num">Kompor (m³)</th><th class="num">LPG (kg)</th><th class="num">Hemat</th><th class="num">Sisa pangan (kg)</th><th class="num">Suhu min–maks</th><th class="num">pH rata2</th><th class="num">Bahaya</th><th class="num">Waspada</th></tr></thead><tbody>
    ${d.daily.length ? d.daily.slice().reverse().map(x => `<tr><td>${esc(x.day)}</td><td>${esc(x.name)}</td><td class="num">${nf(x.bg, 2)}</td><td class="num">${nf(x.used, 2)}</td><td class="num">${nf(x.lpg, 2)}</td><td class="num">${rp(x.rupiah)}</td><td class="num">${nf(x.feed, 1)}</td><td class="num">${nf(x.T_min, 1)}–${nf(x.T_max, 1)}</td><td class="num">${nf(x.pH_avg, 2)}</td><td class="num">${x.alerts.bad}</td><td class="num">${x.alerts.warn}</td></tr>`).join('') : '<tr><td colspan="11" class="empty-s">Belum ada data.</td></tr>'}
  </tbody></table></div></div>
  <div class="grid2">
    <div class="card"><h3>Peringatan paling sering</h3>${d.alertTop.length ? `<table class="t"><thead><tr><th>Peringatan</th><th class="num">Bahaya</th><th class="num">Waspada</th></tr></thead><tbody>${d.alertTop.map(a => `<tr><td>${esc(a.title)}</td><td class="num">${a.bad}</td><td class="num">${a.warn}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-s">Tidak ada peringatan. 🎉</div>'}</div>
    <div class="card"><h3>Aktivitas pengguna</h3>${d.actors.length ? `<table class="t"><thead><tr><th>Pelaku</th><th class="num">Aksi</th><th>Terakhir</th></tr></thead><tbody>${d.actors.map(a => `<tr><td>${esc(a.actor)}</td><td class="num">${a.n}</td><td>${dt(a.last)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-s">Belum ada aksi pengguna pada periode ini.</div>'}</div>
  </div>
  <div class="card"><h3>Catatan kejadian <small>${nf(d.events.length)} terbaru</small></h3>
    <div class="toolbar no-print" style="margin-bottom:10px"><label>Tingkat<select class="sel" id="evF"><option value="">Semua</option><option value="bad">Bahaya</option><option value="warn">Waspada</option><option value="ok">Pulih</option><option value="info">Info</option></select></label>
      <label>Cari<input class="sel searchin" id="evS" placeholder="judul, keterangan, pelaku…"></label></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Waktu</th><th>Sumber</th><th>Jenis</th><th>Tingkat</th><th>Kejadian</th><th>Oleh</th></tr></thead><tbody id="evBody"></tbody></table></div>
    <div class="pager no-print" id="evPager"></div></div>`;
  if (hourlyMode) {
    const hs = {}; d.hourly.forEach(x => { hs[x.hour] = hs[x.hour] || { bg: 0, Ts: 0, Tn: 0 }; hs[x.hour].bg += x.bg; if (x.T_avg != null) { hs[x.hour].Ts += x.T_avg * x.n; hs[x.hour].Tn += x.n; } });
    const ks = Object.keys(hs).sort();
    chart($('#cvBg'), { kind: 'bar', labels: ks.map(k => k.slice(11, 13)), full: ks, values: ks.map(k => hs[k].bg), unit: 'm³', dec: 3, color: '#1F7A4D' });
    chart($('#cvT'), { kind: 'line', labels: ks.map(k => k.slice(11, 13)), full: ks, values: ks.map(k => hs[k].Tn ? hs[k].Ts / hs[k].Tn : NaN), unit: '°C', dec: 1, band: [33, 37] });
  } else {
    chart($('#cvBg'), { kind: 'bar', labels: days.map(k => k.slice(8) + '/' + k.slice(5, 7)), full: days, values: days.map(k => byDay[k].bg), unit: 'm³', dec: 2, color: '#1F7A4D' });
    chart($('#cvT'), { kind: 'line', labels: days.map(k => k.slice(8) + '/' + k.slice(5, 7)), full: days, values: days.map(k => byDay[k].Tn ? byDay[k].Ts / byDay[k].Tn : NaN), unit: '°C', dec: 1, band: [33, 37] });
  }
  $('#evF').addEventListener('change', e => { REP.evFilter = e.target.value; REP.evPage = 0; renderEvents(); });
  $('#evS').addEventListener('input', e => { REP.evSearch = e.target.value.toLowerCase(); REP.evPage = 0; renderEvents(); });
  renderEvents();
}
function renderEvents() {
  const all = REP.data.events.filter(e => (!REP.evFilter || e.lvl === REP.evFilter) && (!REP.evSearch || (e.title + ' ' + e.body + ' ' + e.actor).toLowerCase().includes(REP.evSearch)));
  const per = 50, pages = Math.max(1, Math.ceil(all.length / per)); REP.evPage = Math.min(REP.evPage, pages - 1);
  const rows = all.slice(REP.evPage * per, REP.evPage * per + per);
  $('#evBody').innerHTML = rows.length ? rows.map(e => `<tr><td style="white-space:nowrap">${dt(e.at)}</td><td>${esc(e.name)}</td><td>${CAT[e.cat] || esc(e.cat)}</td><td><span class="badge ${e.lvl === 'info' ? 'bl' : e.lvl}">${LVL[e.lvl] || e.lvl}</span></td><td><b>${esc(e.title)}</b>${e.body ? `<br><span class="muted small">${esc(e.body)}</span>` : ''}</td><td class="small">${esc(e.actor || '')}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-s">Tidak ada kejadian yang cocok.</td></tr>';
  $('#evPager').innerHTML = pages > 1 ? `<button class="btn btn-soft xs" ${REP.evPage ? '' : 'disabled'} data-pg="-1">← Sebelumnya</button><span>Halaman ${REP.evPage + 1} dari ${pages}</span><button class="btn btn-soft xs" ${REP.evPage < pages - 1 ? '' : 'disabled'} data-pg="1">Berikutnya →</button>` : '';
  $('#evPager').querySelectorAll('[data-pg]').forEach(b => b.addEventListener('click', () => { REP.evPage += +b.dataset.pg; renderEvents(); }));
}

/* =====================================================================
   PERANGKAT
   ===================================================================== */
function serverBase() { return location.origin; }
function keyModal(title, dev, key) {
  const snippet = `const char* SERVER_URL = "${serverBase()}";\nconst char* DEVICE_KEY = "${key}";`;
  const b = openModal(title, `<div class="stack">
    <div class="okbox">Perangkat <b>${esc(dev.name)}</b> (ID <code>${esc(dev.id)}</code>) siap dipakai.</div>
    <p style="margin:0"><b>Kunci perangkat</b>. Simpan sekarang, kunci ini <b>tidak akan ditampilkan lagi</b>:</p>
    <div class="keybox"><span id="kv">${esc(key)}</span><button class="btn btn-gold xs" data-c="k">Salin</button></div>
    <p style="margin:6px 0 0"><b>Tempel ke firmware</b> <code>firmware/bioloop_esp32/bioloop_esp32.ino</code>, bagian "ISI BAGIAN INI":</p>
    <pre><code>${esc(snippet)}</code></pre>
    <div class="row"><button class="btn btn-line sm" data-c="s">Salin kedua baris</button><button class="btn btn-gold sm" data-c="x">Sudah saya simpan</button></div>
    <p class="muted small">Bila kunci hilang atau bocor, pakai tombol "Kunci baru" di daftar perangkat. Kunci lama langsung tidak berlaku.</p></div>`);
  b.querySelector('[data-c="k"]').addEventListener('click', () => copy(key, 'Kunci perangkat'));
  b.querySelector('[data-c="s"]').addEventListener('click', () => copy(snippet, 'Potongan firmware'));
  b.querySelector('[data-c="x"]').addEventListener('click', closeModal);
}
function devForm(d) {
  return `<form class="stack" id="fDev">
    <label>Nama perangkat<input name="name" class="sel" required maxlength="60" value="${esc(d ? d.name : '')}" placeholder="mis. Bioreaktor SPPG Sleman 01"></label>
    <label>Lokasi<input name="location" class="sel" maxlength="120" value="${esc(d ? d.location : '')}" placeholder="mis. Dapur SPPG Sleman, belakang gudang"></label>
    <label>Catatan<textarea name="notes" class="sel" rows="3" maxlength="500" placeholder="nomor seri, kalibrasi terakhir, penanggung jawab…">${esc(d ? d.notes : '')}</textarea></label>
    <p class="err" hidden></p>
    <button class="btn btn-gold full">${d ? 'Simpan perubahan' : 'Daftarkan & buat kunci'}</button></form>`;
}
async function secPerangkat(el) {
  const { devices } = await api('api/admin/devices');
  el.innerHTML = `
  <div class="card"><h3>Perangkat ESP32 terdaftar <button class="btn btn-gold sm" id="addDev">+ Daftarkan perangkat</button></h3>
    <p class="muted small" style="margin-top:-4px">Setiap bioreaktor punya satu kontroler ESP32 dengan kunci sendiri. Perangkat dianggap <b>online</b> bila mengirim data dalam 2 menit terakhir.</p>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Perangkat</th><th>Status</th><th>Terakhir terlihat</th><th class="num">Suhu</th><th class="num">pH</th><th class="num">Bocor</th><th>Firmware / IP</th><th>Kunci</th><th class="num">Aksi</th></tr></thead><tbody>
    ${devices.length ? devices.map(d => { const ld = d.last_data || {};
      const st = d.status !== 'active' ? '<span class="badge mute"><i></i>Nonaktif</span>' : d.online ? '<span class="badge ok"><i></i>Online</span>' : d.last_seen ? '<span class="badge warn"><i></i>Offline</span>' : '<span class="badge gold"><i></i>Belum terhubung</span>';
      return `<tr><td><b>${esc(d.name)}</b><br><span class="muted small">${esc(d.location || '–')} · <span class="mono">${esc(d.id)}</span></span></td><td>${st}</td><td>${ago(d.last_seen)}</td>
        <td class="num">${ld.T != null ? nf(ld.T, 1) + ' °C' : '–'}</td><td class="num">${ld.pH != null ? nf(ld.pH, 2) : '–'}</td><td class="num">${ld.lel != null ? nf(ld.lel, 0) + '%' : '–'}</td>
        <td class="small">${esc(d.fw || '–')}<br><span class="muted">${esc(d.last_ip || '')}</span></td><td class="mono small">…${esc(d.key_hint)}</td>
        <td><div class="actions"><button class="btn btn-soft xs" data-a="detail" data-id="${esc(d.id)}">Detail</button><button class="btn btn-soft xs" data-a="edit" data-id="${esc(d.id)}">Ubah</button><button class="btn btn-soft xs" data-a="rotate" data-id="${esc(d.id)}">Kunci baru</button><button class="btn btn-soft xs" data-a="toggle" data-id="${esc(d.id)}">${d.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</button><button class="btn btn-soft xs danger" data-a="del" data-id="${esc(d.id)}">Hapus</button></div></td></tr>`; }).join('')
      : '<tr><td colspan="9" class="empty-s">Belum ada perangkat. Klik <b>Daftarkan perangkat</b> saat kontroler ESP32 siap dipasang. Sebelum itu, dasbor memakai simulasi.</td></tr>'}
    </tbody></table></div></div>
  <div class="card"><h3>Cara menghubungkan ESP32</h3><ol class="plain">
    <li>Klik <b>Daftarkan perangkat</b>, isi nama & lokasi, salin kunci yang muncul.</li>
    <li>Buka <code>firmware/bioloop_esp32/bioloop_esp32.ino</code> di Arduino IDE, isi WiFi, <code>SERVER_URL</code> (<code>${esc(serverBase())}</code>) dan <code>DEVICE_KEY</code>.</li>
    <li>Upload ke ESP32. Dalam ±10 detik status berubah menjadi <b>Online</b> dan perangkat muncul di pilihan "Sumber" dasbor.</li>
    <li>Perintah dari dasbor/Telegram/asisten disimpan dan diambil ESP32 setiap kali mengirim data.</li></ol></div>`;
  $('#addDev').addEventListener('click', () => {
    const b = openModal('Daftarkan perangkat baru', devForm());
    b.querySelector('#fDev').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target;
      try { const j = await api('api/admin/devices', { body: { name: f.name.value, location: f.location.value, notes: f.notes.value } }); keyModal('Perangkat terdaftar', j.device, j.key); show('perangkat', true); }
      catch (err) { const x = f.querySelector('.err'); x.textContent = err.message; x.hidden = false; }
    });
  });
  el.querySelectorAll('[data-a]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.id, d = devices.find(x => x.id === id), a = btn.dataset.a;
    try {
      if (a === 'detail') return devDetail(id);
      if (a === 'edit') {
        const b = openModal('Ubah perangkat', devForm(d));
        b.querySelector('#fDev').addEventListener('submit', async e => { e.preventDefault(); const f = e.target; await api('api/admin/devices/' + id, { body: { name: f.name.value, location: f.location.value, notes: f.notes.value } }); closeModal(); toast('ok', 'Perangkat diperbarui', ''); show('perangkat', true); });
        return;
      }
      if (a === 'rotate') { if (!(await confirmBox('Buat kunci baru?', `Kunci lama ${d.name} langsung tidak berlaku. ESP32 harus di-upload ulang dengan kunci baru.`, 'Buat kunci baru', true))) return;
        const j = await api(`api/admin/devices/${id}/rotate`, { body: {} }); keyModal('Kunci baru dibuat', j.device, j.key); return show('perangkat', true); }
      if (a === 'toggle') { await api('api/admin/devices/' + id, { body: { status: d.status === 'active' ? 'disabled' : 'active' } }); toast('ok', d.status === 'active' ? 'Perangkat dinonaktifkan' : 'Perangkat diaktifkan', ''); return show('perangkat', true); }
      if (a === 'del') { if (!(await confirmBox('Hapus perangkat?', `${d.name} akan dihapus beserta kuncinya. Riwayat pembacaan tetap ada di laporan.`, 'Hapus', true))) return;
        await api('api/admin/devices/' + id, { method: 'DELETE' }); toast('ok', 'Perangkat dihapus', ''); return show('perangkat', true); }
    } catch (e) { toast('bad', 'Gagal', e.message); }
  }));
}
async function devDetail(id) {
  const b = openModal('Detail perangkat', '<p class="muted">Memuat…</p>', null, true);
  try {
    const j = await api('api/admin/devices/' + id), d = j.device;
    b.innerHTML = `<div class="grid2"><div><p><b>${esc(d.name)}</b><br><span class="muted">${esc(d.location || '–')}</span></p><p class="small">ID <code>${esc(d.id)}</code> · didaftarkan ${dt(d.created_at)} oleh ${esc(d.created_by || '–')}<br>Terakhir terlihat ${dt(d.last_seen)} (${ago(d.last_seen)}) · firmware ${esc(d.fw || '–')} · IP ${esc(d.last_ip || '–')}</p>${d.notes ? `<p class="small">${esc(d.notes)}</p>` : ''}</div>
      <div><h4>Perintah terakhir</h4>${j.commands.length ? `<table class="t"><thead><tr><th>Waktu</th><th>Perintah</th><th>Oleh</th><th>Diambil</th></tr></thead><tbody>${j.commands.map(c => `<tr><td>${dt(c.created_at)}</td><td class="mono small">${esc(JSON.stringify(c.cmd))}</td><td class="small">${esc(c.actor)}</td><td>${c.taken_at ? '<span class="badge ok">ya</span>' : '<span class="badge warn">menunggu</span>'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Belum ada perintah.</p>'}</div></div>
      <h4>Pembacaan terakhir</h4>${j.readings.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Waktu</th><th class="num">Suhu</th><th class="num">pH</th><th class="num">Tekanan</th><th class="num">Isi drum</th><th class="num">Bocor</th><th class="num">Kompor</th></tr></thead><tbody>${j.readings.map(r => `<tr><td>${dt(r.at)}</td><td class="num">${nf(r.d.T, 1)}</td><td class="num">${nf(r.d.pH, 2)}</td><td class="num">${nf(r.d.P, 1)}</td><td class="num">${nf(r.d.Vg, 0)}%</td><td class="num">${nf(r.d.lel, 0)}%</td><td class="num">${r.d.stove ? 'ON' : '–'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Belum ada pembacaan. Pembacaan disimpan tiap 1 menit.</p>'}
      <h4>Kejadian</h4><div class="evlist">${j.events.length ? j.events.map(evItem).join('') : '<p class="muted">Belum ada kejadian.</p>'}</div>`;
  } catch (e) { b.innerHTML = `<div class="warnbox">${esc(e.message)}</div>`; }
}

/* =====================================================================
   PENGGUNA
   ===================================================================== */
function tempPwModal(username, pw) {
  const b = openModal('Kata sandi sementara', `<div class="stack"><p style="margin:0">Berikan kata sandi ini kepada <b>${esc(username)}</b>. Mereka akan diminta menggantinya saat pertama masuk.</p>
    <div class="keybox"><span>${esc(pw)}</span><button class="btn btn-gold xs" data-c>Salin</button></div><p class="muted small">Kata sandi ini tidak akan ditampilkan lagi.</p></div>`);
  b.querySelector('[data-c]').addEventListener('click', () => copy(pw, 'Kata sandi sementara'));
}
async function secPengguna(el) {
  const { users } = await api('api/admin/users'); const me = AUTH.user;
  users.sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0));
  const pend = users.filter(u => u.status === 'pending').length; $('#badgeUsr').hidden = !pend; $('#badgeUsr').textContent = pend;
  el.innerHTML = `
  <div class="card"><h3>Akun pengguna <button class="btn btn-gold sm" id="addUsr">+ Tambah pengguna</button></h3>
    <p class="muted small" style="margin-top:-4px"><b>Pengguna</b> bisa melihat dasbor, mengendalikan reaktor, dan memakai asisten AI. <b>Admin</b> juga bisa melihat laporan, mengelola perangkat, pengguna, Telegram, dan pengaturan.</p>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Pengguna</th><th>Peran</th><th>Status</th><th>Dibuat</th><th>Terakhir masuk</th><th class="num">Aksi</th></tr></thead><tbody>
    ${users.map(u => { const self = u.id === me.id;
      const st = { active: '<span class="badge ok"><i></i>Aktif</span>', pending: '<span class="badge warn"><i></i>Menunggu persetujuan</span>', disabled: '<span class="badge mute"><i></i>Nonaktif</span>' }[u.status];
      return `<tr class="${u.status === 'pending' ? 'pending' : ''}"><td><b>${esc(u.name)}</b>${self ? ' <span class="badge gold">Anda</span>' : ''}<br><span class="muted small">@${esc(u.username)}</span>${u.must_change ? '<br><span class="small" style="color:var(--warn)">kata sandi sementara</span>' : ''}</td>
        <td>${u.role === 'admin' ? '<span class="badge bl">Admin</span>' : 'Pengguna'}</td><td>${st}</td><td class="small">${dt(u.created_at)}</td><td class="small">${u.last_login ? dt(u.last_login) : 'belum pernah'}</td>
        <td><div class="actions">${u.status === 'pending' ? `<button class="btn btn-gold xs" data-a="approve" data-id="${u.id}">Setujui</button><button class="btn btn-soft xs danger" data-a="del" data-id="${u.id}">Tolak</button>` : self ? '<button class="btn btn-soft xs" data-a="pw">Ganti kata sandi saya</button>' : `
          <button class="btn btn-soft xs" data-a="role" data-id="${u.id}">${u.role === 'admin' ? 'Jadikan pengguna' : 'Jadikan admin'}</button>
          <button class="btn btn-soft xs" data-a="toggle" data-id="${u.id}">${u.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</button>
          <button class="btn btn-soft xs" data-a="reset" data-id="${u.id}">Reset sandi</button>
          <button class="btn btn-soft xs danger" data-a="del" data-id="${u.id}">Hapus</button>`}</div></td></tr>`; }).join('')}
    </tbody></table></div></div>`;
  $('#addUsr').addEventListener('click', () => {
    const b = openModal('Tambah pengguna', `<form class="stack" id="fUsr">
      <label>Nama lengkap<input name="name" class="sel" required maxlength="80" placeholder="mis. Rina Wulandari"></label>
      <label>Nama pengguna (untuk masuk)<input name="username" class="sel" required pattern="[A-Za-z0-9_.\\-]{3,32}" placeholder="mis. rina.gizi" autocapitalize="none"></label>
      <label>Peran<select name="role" class="sel"><option value="user">Pengguna (petugas SPPG)</option><option value="admin">Admin</option></select></label>
      <label>Kata sandi (kosongkan agar dibuatkan otomatis)<input name="password" type="text" class="sel" minlength="8" autocomplete="off"></label>
      <p class="err" hidden></p><button class="btn btn-gold full">Buat akun</button></form>`);
    b.querySelector('#fUsr').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target;
      try { const j = await api('api/admin/users', { body: { name: f.name.value, username: f.username.value.trim(), role: f.role.value, password: f.password.value || undefined } });
        if (j.password) tempPwModal(j.user.username, j.password); else { closeModal(); toast('ok', 'Akun dibuat', j.user.username); } show('pengguna', true); }
      catch (err) { const x = f.querySelector('.err'); x.textContent = err.message; x.hidden = false; }
    });
  });
  el.querySelectorAll('[data-a]').forEach(btn => btn.addEventListener('click', async () => {
    const a = btn.dataset.a, u = users.find(x => String(x.id) === btn.dataset.id);
    try {
      if (a === 'pw') return AUTH.openPassword();
      if (a === 'approve') { await api('api/admin/users/' + u.id, { body: { status: 'active' } }); toast('ok', 'Akun disetujui', `${u.username} sekarang bisa masuk.`); }
      if (a === 'role') { if (!(await confirmBox('Ubah peran?', `${u.name} akan menjadi ${u.role === 'admin' ? 'pengguna biasa' : 'admin (akses penuh ke laporan, perangkat, dan pengguna)'}.`, 'Ubah peran'))) return; await api('api/admin/users/' + u.id, { body: { role: u.role === 'admin' ? 'user' : 'admin' } }); toast('ok', 'Peran diubah', ''); }
      if (a === 'toggle') { await api('api/admin/users/' + u.id, { body: { status: u.status === 'active' ? 'disabled' : 'active' } }); toast('ok', u.status === 'active' ? 'Akun dinonaktifkan' : 'Akun diaktifkan', ''); }
      if (a === 'reset') { if (!(await confirmBox('Reset kata sandi?', `Kata sandi ${u.username} diganti dengan kata sandi sementara dan semua sesi masuknya berakhir.`, 'Reset'))) return; const j = await api(`api/admin/users/${u.id}/reset`, { body: {} }); tempPwModal(u.username, j.password); }
      if (a === 'del') { if (!(await confirmBox(u.status === 'pending' ? 'Tolak pendaftaran?' : 'Hapus akun?', `Akun ${u.username} dan ingatan asistennya akan dihapus.`, u.status === 'pending' ? 'Tolak' : 'Hapus', true))) return; await api('api/admin/users/' + u.id, { method: 'DELETE' }); toast('ok', 'Akun dihapus', ''); }
      show('pengguna', true);
    } catch (e) { toast('bad', 'Gagal', e.message); }
  }));
}

/* =====================================================================
   TELEGRAM
   ===================================================================== */
const tgl = (s, k, t, d) => `<div class="toggle-row"><div><b>${t}</b><span>${d}</span></div><button type="button" class="sw" role="switch" aria-checked="${!!s[k]}" data-k="${k}" aria-label="${esc(t)}"></button></div>`;
async function secTelegram(el) {
  const j = await api('api/admin/telegram'); const info = j.info, wh = j.webhook, st = j.settings || {};
  const pend = j.chats.filter(c => !c.approved).length; $('#badgeTg').hidden = !pend; $('#badgeTg').textContent = pend;
  const whOk = wh && wh.url && !wh.last_error_message;
  el.innerHTML = `
  <div class="grid2">
    <div class="card"><h3>Bot</h3>${!info.enabled ? `<div class="warnbox"><b>Token bot belum diisi.</b><br>Buat bot di <b>@BotFather</b> (ketik <code>/newbot</code>), lalu isi <code>TELEGRAM_BOT_TOKEN</code> di Vercel → Settings → Environment Variables, lalu Redeploy.</div>` : `
      <p style="margin:0 0 8px"><b>@${esc(info.username || '?')}</b> ${info.username ? `<a class="small" href="https://t.me/${encodeURIComponent(info.username)}" target="_blank" rel="noopener">buka di Telegram →</a>` : ''}</p>
      <p class="small muted">Mode <b>${info.mode === 'webhook' ? 'webhook' : 'long polling'}</b>. ${info.mode === 'webhook' ? 'Telegram mengirim pesan ke website ini.' : 'Server lokal menjemput pesan terus-menerus.'} ${info.requireApproval ? 'Chat baru harus disetujui admin.' : 'Semua chat langsung diterima.'}</p>
      ${info.error ? `<div class="warnbox small">Kesalahan terakhir: ${esc(info.error)}</div>` : ''}`}</div>
    <div class="card"><h3>Webhook</h3>${info.enabled && info.mode === 'webhook' ? `
      ${whOk ? `<div class="okbox small">Terpasang ke <code>${esc(wh.url)}</code>${wh.pending_update_count ? ` · ${wh.pending_update_count} pesan antre` : ''}</div>` : `<div class="warnbox small">${wh && wh.url ? `Terpasang ke <code>${esc(wh.url)}</code> tetapi ada kesalahan: ${esc(wh.last_error_message || '')}` : '<b>Belum terpasang.</b> Bot tidak akan membalas sampai webhook dipasang.'}</div>`}
      <label class="fl" style="margin-top:10px">Alamat website (HTTPS)<input class="sel" id="whUrl" value="${esc(j.suggestedUrl)}"></label>
      <div class="row"><button class="btn btn-gold sm" id="whAuto">Pasang otomatis</button><button class="btn btn-line sm" id="whSet">Pasang ke alamat di atas</button>${wh && wh.url ? '<button class="btn btn-soft sm danger" id="whDel">Lepas webhook</button>' : ''}</div>
      <p class="muted small">Pakai alamat produksi (mis. <code>https://nama-proyek.vercel.app</code>), bukan alamat preview.</p>` : info.enabled ? '<p class="muted small">Server lokal memakai long polling, jadi webhook tidak diperlukan. Webhook hanya untuk Vercel.</p>' : '<p class="muted small">Isi token bot dulu.</p>'}</div>
  </div>
  <div class="card"><h3>Chat yang memakai bot <small>${j.chats.length} chat</small></h3>
    <p class="muted small" style="margin-top:-4px">Chat muncul di sini setelah seseorang menekan <b>Start</b> di bot. Setujui agar bisa bertanya, memberi perintah, dan menerima peringatan.</p>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Chat</th><th>Chat ID</th><th>Status</th><th>Notifikasi</th><th>Terakhir aktif</th><th class="num">Aksi</th></tr></thead><tbody>
    ${j.chats.length ? j.chats.map(c => `<tr class="${c.approved ? '' : 'pending'}"><td><b>${esc(c.title || '(tanpa nama)')}</b>${c.username ? `<br><span class="muted small">@${esc(c.username)}</span>` : ''}</td><td class="mono small">${esc(c.chat_id)}</td>
      <td>${c.approved ? '<span class="badge ok"><i></i>Disetujui</span>' : '<span class="badge warn"><i></i>Menunggu</span>'}</td><td>${c.subscribed ? 'Aktif' : '<span class="muted">Mati</span>'}</td><td class="small">${ago(c.last_seen)}</td>
      <td><div class="actions">${c.approved ? `<button class="btn btn-soft xs" data-a="revoke" data-id="${esc(c.chat_id)}">Cabut</button>` : `<button class="btn btn-gold xs" data-a="approve" data-id="${esc(c.chat_id)}">Setujui</button>`}
        <button class="btn btn-soft xs" data-a="sub" data-id="${esc(c.chat_id)}">${c.subscribed ? 'Matikan notifikasi' : 'Nyalakan notifikasi'}</button><button class="btn btn-soft xs" data-a="test" data-id="${esc(c.chat_id)}">Kirim uji</button><button class="btn btn-soft xs danger" data-a="del" data-id="${esc(c.chat_id)}">Hapus</button></div></td></tr>`).join('')
      : '<tr><td colspan="6" class="empty-s">Belum ada chat. Buka bot di Telegram, tekan Start, lalu muat ulang halaman ini.</td></tr>'}
    </tbody></table></div></div>
  <div class="grid2">
    <div class="card"><h3>Notifikasi otomatis <small>dikirim bot tanpa perlu ditekan</small></h3><form id="fNotif" class="formgrid">
      <div class="full">${tgl(st, 'notify_alerts', '🚨 Peringatan bahaya & waspada', 'Suhu, pH, tekanan, kebocoran gas, gas habis, dan saat kembali normal.')}${tgl(st, 'notify_actions', '⚙️ Aksi penting', 'Kompor, katup, buffer, pengurasan — baik oleh orang maupun kontrol otomatis.')}${tgl(st, 'notify_schedule', '🗓 Kegiatan terjadwal', 'Umpan harian, rekap smart bin sisa makan siang.')}${tgl(st, 'notify_sim', '🧪 Ikut kirim dari simulasi', 'Matikan bila sudah memakai alat asli supaya Telegram tidak ramai.')}</div>
      <label>Peringatan yang sama diulang paling cepat tiap (menit)<input class="sel" type="number" name="alert_cooldown_min" value="${st.alert_cooldown_min}" min="0" max="1440"></label>
      <label>Ringkasan status berkala tiap (jam, 0 = mati)<input class="sel" type="number" name="report_every_hours" value="${st.report_every_hours}" min="0" max="168"></label>
      <div class="full"><button class="btn btn-gold sm">Simpan notifikasi</button></div></form>
      <p class="muted small">Notifikasi berjalan dari jadwal otomatis (cron). Terakhir berjalan: <b>${j.lastCron ? ago(j.lastCron) : 'belum pernah'}</b>${!j.lastCron || Date.now() - j.lastCron > 20 * 60000 ? ' — <a href="#panduan">pasang cron</a> agar notifikasi tepat waktu.' : '.'}</p></div>
    <div class="card"><h3>Kirim sekarang</h3>
      <p class="muted small" style="margin-top:-4px">Dikirim ke semua chat yang disetujui dan notifikasinya aktif (${j.chats.filter(c => c.approved && c.subscribed).length} chat).</p>
      <div class="row"><button class="btn btn-line sm" data-send="status">📊 Status reaktor</button><button class="btn btn-line sm" data-send="laporan">🗓 Laporan hari ini</button><button class="btn btn-line sm" data-send="perangkat">📟 Status perangkat</button></div>
      <h3 style="margin-top:18px">Pengumuman</h3><form id="fBc" class="stack"><textarea class="sel" name="text" rows="3" maxlength="3500" placeholder="mis. Besok pukul 09.00 pengurasan endapan dan ganti media scrubber." required></textarea><div><button class="btn btn-merah sm">Kirim pengumuman</button></div></form></div>
  </div>
  <div class="card"><h3>Jadwal pesan otomatis <small>waktu ${esc(j.tz || 'WIB')}</small></h3>
    <p class="muted small" style="margin-top:-4px">Contoh: laporan harian pukul 15.00, status pagi pukul 06.30, atau pengingat "kuras endapan" tiap Jumat. Pesan terkirim paling lambat beberapa menit setelah jam yang dipilih (sesuai jadwal cron).</p>
    <div id="schList" class="sch-list"></div>
    <div class="row"><button class="btn btn-line sm" id="schAdd">+ Tambah jadwal</button><button class="btn btn-gold sm" id="schSave">Simpan jadwal</button></div></div>`;
  /* ----- jadwal ----- */
  const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  let sch = (j.schedules || []).map(x => Object.assign({}, x));
  const renderSch = () => {
    const box = $('#schList');
    box.innerHTML = sch.length ? sch.map((x, i) => `<div class="sch" data-i="${i}">
      <label>Jenis<select class="sel" data-f="kind"><option value="laporan" ${x.kind === 'laporan' ? 'selected' : ''}>Laporan hari ini</option><option value="status" ${x.kind === 'status' ? 'selected' : ''}>Status reaktor</option><option value="teks" ${x.kind === 'teks' ? 'selected' : ''}>Pesan sendiri</option></select></label>
      <label>Jam<input class="sel" type="time" data-f="time" value="${esc(x.time || '07:00')}"></label>
      <div class="days" role="group" aria-label="Hari">${DAYS.map((d, k) => `<button type="button" class="${!x.days || !x.days.length || x.days.includes(k + 1) ? 'on' : ''}" data-d="${k + 1}">${d}</button>`).join('')}</div>
      <label class="grow" ${x.kind === 'teks' ? '' : 'hidden'}>Isi pesan<input class="sel" data-f="text" maxlength="1500" value="${esc(x.text || '')}" placeholder="mis. Pengingat: kuras endapan 20 L hari ini"></label>
      <label class="chk"><input type="checkbox" data-f="enabled" ${x.enabled !== false ? 'checked' : ''}> Aktif</label>
      <button type="button" class="btn btn-soft xs danger" data-del>Hapus</button>
      ${x.last ? `<span class="muted small full">Terakhir terkirim: ${esc(x.last)}</span>` : ''}</div>`).join('') : '<div class="empty-s">Belum ada jadwal. Klik “Tambah jadwal”.</div>';
    box.querySelectorAll('.sch').forEach(row => {
      const x = sch[+row.dataset.i];
      row.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('change', () => {
        const f = inp.dataset.f; x[f] = inp.type === 'checkbox' ? inp.checked : inp.value;
        if (f === 'kind') renderSch();
      }));
      row.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
        b.classList.toggle('on');
        const on = [...row.querySelectorAll('[data-d].on')].map(e => +e.dataset.d);
        x.days = on.length === 7 ? [] : on;
      }));
      row.querySelector('[data-del]').addEventListener('click', () => { sch.splice(+row.dataset.i, 1); renderSch(); });
    });
  };
  renderSch();
  $('#schAdd').addEventListener('click', () => { sch.push({ kind: 'laporan', time: '15:00', days: [1, 2, 3, 4, 5, 6], text: '', enabled: true }); renderSch(); });
  $('#schSave').addEventListener('click', async () => {
    if (sch.some(x => x.kind === 'teks' && !String(x.text || '').trim())) return toast('warn', 'Isi pesan kosong', 'Jadwal jenis “Pesan sendiri” perlu isi pesan.');
    try { const r = await api('api/admin/telegram/schedules', { body: { schedules: sch } }); sch = r.schedules; renderSch(); toast('ok', 'Jadwal disimpan', `${sch.length} jadwal`); } catch (e) { toast('bad', 'Gagal', e.message); }
  });
  /* ----- notifikasi otomatis ----- */
  el.querySelectorAll('#fNotif .sw').forEach(b => b.addEventListener('click', () => b.setAttribute('aria-checked', b.getAttribute('aria-checked') !== 'true')));
  $('#fNotif').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; const body = { alert_cooldown_min: +f.alert_cooldown_min.value, report_every_hours: +f.report_every_hours.value };
    f.querySelectorAll('.sw[data-k]').forEach(b => { body[b.dataset.k] = b.getAttribute('aria-checked') === 'true'; });
    try { await api('api/admin/settings', { body }); toast('ok', 'Notifikasi disimpan', ''); } catch (err) { toast('bad', 'Gagal', err.message); }
  });
  el.querySelectorAll('[data-send]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { const r = await api('api/admin/telegram/send', { body: { kind: b.dataset.send } }); toast('ok', 'Kirim sekarang', r.message); } catch (e) { toast('bad', 'Gagal', e.message); } finally { b.disabled = false; }
  }));
  const wa = $('#whAuto'); if (wa) wa.addEventListener('click', async () => { try { const r = await api('api/admin/telegram/webhook', { body: { action: 'auto' } }); toast('ok', 'Webhook', r.message); show('telegram', true); } catch (e) { toast('bad', 'Gagal memasang webhook', e.message); } });
  const s = $('#whSet'); if (s) s.addEventListener('click', async () => { try { const r = await api('api/admin/telegram/webhook', { body: { url: $('#whUrl').value.trim() } }); toast('ok', 'Webhook', r.message); show('telegram', true); } catch (e) { toast('bad', 'Gagal memasang webhook', e.message); } });
  const dl = $('#whDel'); if (dl) dl.addEventListener('click', async () => { if (await confirmBox('Lepas webhook?', 'Bot berhenti menerima pesan sampai webhook dipasang lagi.', 'Lepas', true)) { await api('api/admin/telegram/webhook', { body: { action: 'delete' } }); show('telegram', true); } });
  $('#fBc').addEventListener('submit', async e => { e.preventDefault(); try { const r = await api('api/admin/telegram/broadcast', { body: { text: e.target.text.value } }); toast('ok', 'Pengumuman', r.message); e.target.reset(); } catch (err) { toast('bad', 'Gagal', err.message); } });
  el.querySelectorAll('[data-a]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.id, c = j.chats.find(x => x.chat_id === id), a = btn.dataset.a;
    try {
      if (a === 'approve') { await api('api/admin/telegram/chats/' + id, { body: { approved: true } }); toast('ok', 'Chat disetujui', c.title); }
      if (a === 'revoke') { await api('api/admin/telegram/chats/' + id, { body: { approved: false } }); toast('ok', 'Akses dicabut', c.title); }
      if (a === 'sub') await api('api/admin/telegram/chats/' + id, { body: { subscribed: !c.subscribed } });
      if (a === 'test') { const r = await api('api/admin/telegram/test', { body: { chatId: id } }); return toast('ok', 'Terkirim', r.message); }
      if (a === 'del') { if (!(await confirmBox('Hapus chat?', 'Chat dan ingatan obrolannya dihapus. Bila orang itu menekan Start lagi, chat muncul sebagai permintaan baru.', 'Hapus', true))) return; await api('api/admin/telegram/chats/' + id, { method: 'DELETE' }); }
      show('telegram', true);
    } catch (e) { toast('bad', 'Gagal', e.message); }
  }));
}

/* =====================================================================
   PENGATURAN
   ===================================================================== */
async function secPengaturan(el) {
  const j = await api('api/admin/settings'); const s = j.settings, env = j.env;
  const tg = (k, t, d) => `<div class="toggle-row"><div><b>${t}</b><span>${d}</span></div><button type="button" class="sw" role="switch" aria-checked="${!!s[k]}" data-k="${k}" aria-label="${esc(t)}"></button></div>`;
  el.innerHTML = `
  <div class="grid2">
    <div class="card"><h3>Umum</h3><form id="fSet" class="formgrid">
      <label class="full">Nama lokasi/SPPG<input class="sel" name="site_name" value="${esc(s.site_name)}" maxlength="60"></label>
      <label>Sumber utama dasbor & asisten<select class="sel" name="default_source">${j.sources.map(x => `<option value="${esc(x.id)}" ${x.id === s.default_source ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <label>Harga LPG 12 kg (Rp)<input class="sel" type="number" name="lpg_price" value="${s.lpg_price}" min="1000" step="1000"></label>
      <label>Simpan riwayat selama (hari)<input class="sel" type="number" name="retention_days" value="${s.retention_days}" min="7" max="3650"></label>
      <div class="full">${tg('allow_register', 'Pendaftaran terbuka', 'Orang bisa mendaftar sendiri; akun aktif setelah Anda setujui.')}${tg('public_dashboard', 'Dasbor bisa dilihat tamu', 'Tanpa masuk, tamu hanya melihat. Kendali & asisten tetap butuh akun.')}</div>
      <p class="full muted small" style="margin:0">Pengaturan notifikasi Telegram ada di menu <a href="#telegram">Telegram & notifikasi</a>.</p>
      <div class="full"><button class="btn btn-gold">Simpan pengaturan</button></div></form></div>
    <div class="card"><h3>Keamanan akun</h3>
      <p class="small">Anda masuk sebagai <b>${esc(AUTH.user.name)}</b> (@${esc(AUTH.user.username)}).</p>
      ${AUTH.user.must_change ? '<div class="warnbox small" style="margin-bottom:10px">Kata sandi masih bawaan. Segera ganti.</div>' : ''}
      <button class="btn btn-merah sm" id="chPw">Ganti kata sandi saya</button>
      <h3 style="margin-top:22px">Status konfigurasi</h3>
      <ul class="checklist">
        <li class="${env.database ? '' : 'no'}">Database ${env.database ? `terhubung (${j.db === 'postgres' ? 'PostgreSQL' : j.db})` : j.vercel ? '<b>belum diisi</b>: data akan hilang. Isi DATABASE_URL.' : 'berkas lokal (folder data/)'}</li>
        <li class="${env.gemini ? '' : 'no'}">Gemini ${env.gemini ? 'aktif' : 'belum diisi (GEMINI_API_KEY)'}</li>
        <li class="${env.telegram ? '' : 'no'}">Telegram ${env.telegram ? 'aktif' : 'belum diisi (TELEGRAM_BOT_TOKEN)'}</li>
        <li class="${env.sessionSecret ? '' : 'no'}">SESSION_SECRET ${env.sessionSecret ? 'diisi' : 'tidak diisi (memakai turunan DATABASE_URL, tetap aman; isi sendiri bila ingin)'}</li>
        <li class="${env.cronSecret ? '' : 'no'}">CRON_SECRET ${env.cronSecret ? 'diisi' : 'tidak diisi (endpoint cron terbuka, tidak berbahaya)'}</li>
      </ul></div>
  </div>
  <div class="card"><h3>Cron & alamat penting</h3>
    <p class="small">Vercel Hobby (gratis) hanya menjalankan cron <b>sekali sehari</b>. Agar simulasi berjalan dan perangkat diam terdeteksi tiap beberapa menit, repositori sudah berisi <b>GitHub Actions</b> (<code>.github/workflows/cron.yml</code>) yang memanggil alamat di bawah tiap 5 menit. Isi secret <code>BIOLOOP_URL</code> di GitHub, atau daftarkan alamat cron di <b>cron-job.org</b> (gratis). Detail di <a href="#panduan">Panduan</a>.</p>
    <div class="fl">Alamat cron<div class="copyline"><code id="cu">${esc(j.cronUrl)}</code><button class="btn btn-soft xs" data-copy="cu">Salin</button></div></div>
    <div class="fl" style="margin-top:10px">Alamat sensor ESP32<div class="copyline"><code id="su">${esc(j.sensorUrl)}</code><button class="btn btn-soft xs" data-copy="su">Salin</button></div></div>
    <div class="row"><button class="btn btn-line sm" id="runCron">Jalankan cron sekarang</button></div>
    ${j.stats ? `<p class="muted small">Isi database: ${nf(j.stats.readings)} pembacaan, ${nf(j.stats.events)} kejadian, ${nf(j.stats.conversations)} percakapan, ${nf(j.stats.bytes / 1048576, 1)} MB.</p>` : ''}</div>`;
  el.querySelectorAll('.sw').forEach(b => b.addEventListener('click', () => b.setAttribute('aria-checked', b.getAttribute('aria-checked') !== 'true')));
  $('#fSet').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; const body = { site_name: f.site_name.value, default_source: f.default_source.value, lpg_price: +f.lpg_price.value, retention_days: +f.retention_days.value };
    el.querySelectorAll('.sw[data-k]').forEach(b => { body[b.dataset.k] = b.getAttribute('aria-checked') === 'true'; });
    try { await api('api/admin/settings', { body }); toast('ok', 'Pengaturan disimpan', ''); $('#siteName').textContent = body.site_name; } catch (err) { toast('bad', 'Gagal', err.message); }
  });
  $('#chPw').addEventListener('click', () => AUTH.openPassword());
  el.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copy($('#' + b.dataset.copy).textContent)));
  $('#runCron').addEventListener('click', async () => { try { const r = await api('api/admin/cron', { body: {} }); toast('ok', 'Cron dijalankan', `${r.ticked.length} sumber diperbarui`); } catch (e) { toast('bad', 'Gagal', e.message); } });
}

/* =====================================================================
   PANDUAN (dokumen untuk admin)
   ===================================================================== */
const DOCS = [['PANDUAN_ADMIN.md', 'Panduan admin', 'Akun, persetujuan, laporan, perangkat, Telegram, notifikasi otomatis.'],
  ['PANDUAN_SELESAIKAN.md', 'Menyelesaikan pemasangan', 'Langkah awam dari nol sampai website & bot siap.'],
  ['PANDUAN_DEPLOY_VERCEL.md', 'Deploy GitHub + Supabase + Vercel', 'Memasang ulang atau memindah website.'],
  ['PANDUAN_TERMINAL.md', 'Perintah terminal', 'npm run cek, npm run akun, npm run bot.'],
  ['PANDUAN_PENGGUNA.md', 'Panduan pengguna umum', 'Bahan untuk dibagikan ke petugas dan warga.'],
  ['ARSITEKTUR.md', 'Arsitektur teknis', 'API, database, keamanan (untuk teknisi).']];
async function secPanduan(el) {
  el.innerHTML = `<div class="docgrid">${DOCS.map(([f, t, d]) => `<button class="card doc" data-doc="${f}"><b>${t}</b><span class="muted small">${d}</span></button>`).join('')}</div><div class="card md" id="docView" hidden></div>`;
  el.querySelectorAll('[data-doc]').forEach(b => b.addEventListener('click', async () => {
    const v = $('#docView'); v.hidden = false; v.innerHTML = '<p class="muted">Memuat…</p>';
    el.querySelectorAll('[data-doc]').forEach(x => x.classList.toggle('on', x === b));
    try { const r = await fetch('docs/' + b.dataset.doc, { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); v.innerHTML = MD.render(await r.text()); v.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (e) { v.innerHTML = `<div class="warnbox">Dokumen tidak bisa dimuat (${esc(e.message)}).</div>`; }
  }));
}

/* =====================================================================
   NAVIGASI & AKSES
   ===================================================================== */
const SECS = { ringkasan: secRingkasan, laporan: secLaporan, perangkat: secPerangkat, pengguna: secPengguna, telegram: secTelegram, pengaturan: secPengaturan, panduan: secPanduan };
let current = null;
async function show(name, force) {
  if (!SECS[name]) name = 'ringkasan';
  if (!AUTH.user || AUTH.user.role !== 'admin') return;
  document.querySelectorAll('.side-nav a').forEach(a => a.classList.toggle('on', a.dataset.sec === name));
  document.querySelectorAll('.sec-adm').forEach(s => { s.hidden = s.id !== 'sec-' + name; });
  $('#pageTitle').textContent = TITLES[name]; document.title = `${TITLES[name]} | Panel Admin MBG-BIOLOOP`;
  if (current === name && !force) return; current = name;
  const el = $('#sec-' + name);
  try { await SECS[name](el); } catch (e) { el.innerHTML = `<div class="warnbox">${esc(e.message)}${e.status === 401 ? ' <a href="#" id="relog">Masuk lagi</a>' : ''}</div>`; if (e.status === 401) AUTH.refresh(); }
}
window.addEventListener('hashchange', () => show(location.hash.slice(1)));
let gatedFor = null;
function gate() {
  const u = AUTH.user, g = $('#gate');
  if (u && u.role === 'admin') { g.hidden = true; $('#pwBanner').hidden = !u.must_change; const key = u.id + ':' + u.must_change; show(location.hash.slice(1) || 'ringkasan', gatedFor !== key); gatedFor = key; return; }
  gatedFor = null;
  document.querySelectorAll('.sec-adm').forEach(s => { s.hidden = true; }); current = null; g.hidden = false;
  $('#gateMsg').textContent = !AUTH.available ? 'Server tidak bisa dihubungi. Panel admin hanya bisa dibuka lewat alamat server.' : u ? `Akun ${u.name} bukan admin. Minta admin mengubah peran Anda.` : 'Masuk dengan akun admin untuk melanjutkan.';
  $('#gateLogin').hidden = !AUTH.available || !!u;
}
$('#gateLogin').addEventListener('click', () => AUTH.openLogin('Masuk dengan akun admin.'));
$('#pwBannerBtn').addEventListener('click', () => AUTH.openPassword('Ganti kata sandi bawaan dengan kata sandi yang hanya Anda ketahui.'));
document.addEventListener('bioloop:auth', gate);
AUTH.ready.then(() => { gate(); if (AUTH.available && !AUTH.user) AUTH.openLogin('Masuk dengan akun admin.'); });
fetch('api/health').then(r => r.json()).then(h => { if (h.site) $('#siteName').textContent = h.site; if (h.warnings && h.warnings.length) toast('warn', 'Perlu perhatian', h.warnings[0]); }).catch(() => {});
})();
