/* =====================================================================
   MBG-BIOLOOP AI — logika dasbor
   Mode server : data dari server (diambil berkala), kendali lewat API
   Mode lokal  : model berjalan di browser selama server belum tersambung (atau file dibuka langsung)
   ===================================================================== */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const R = SIM.R;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 0) => (+v).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
const rp = v => 'Rp' + nf(Math.round(v));
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* abaikan */ } }
};
const ST_LABEL = { ok: 'Normal', warn: 'Waspada', bad: 'Bahaya', info: 'Info' };
const ST_ICON = { ok: '✓', warn: '!', bad: '✕', info: 'i' };

const APPSTATE = { mode: 'connecting', health: null, speed: 60, paused: false, log: [], srvMode: 'simulasi', source: store.get('bl_source') || '', sources: [], lastT: null, lastEventId: 0, polling: false };
window.APPSTATE = APPSTATE;

/* =====================================================================
   PENJELASAN KOMPONEN (klik benda 3D)
   ===================================================================== */
const INFO = {
  digester: ['Tangki digester ±500 L', () => `Tangki tertutup tempat bakteri anaerob mencerna sisa pangan. Isi kerja ±${R.V} L slurry (sisa pangan + air 1:1). Suhu dijaga ${S.set.T} ± ${S.set.band} °C (mesofilik). Sekarang ${S.T.toFixed(1)} °C, pH ${S.pH.toFixed(2)}.`],
  drum: ['Drum gas mengapung (floating drum)', () => `Drum terbalik yang naik-turun mengikuti jumlah gas. Beratnya memberi tekanan tetap ±${R.Pnom} mbar ke kompor. Isi sekarang ${(S.Vg * 1000).toFixed(0)} L dari ${(R.VgMax * 1000).toFixed(0)} L.`],
  relief: ['Katup pengaman tekanan', () => `Membuang gas bila tekanan mencapai ${R.Prelief} mbar supaya tangki tidak rusak. Kontrol otomatis berusaha mencegahnya dengan memakai gas surplus di boiler.`],
  level: ['Sensor ketinggian drum', () => `Sensor ultrasonik JSN-SR04T mengukur posisi drum untuk menghitung volume gas. Isi drum ${(S.Vg / R.VgMax * 100).toFixed(0)}%.`],
  lel: ['Detektor kebocoran metana', () => `Sensor MQ-4 di dekat sambungan. Di atas 10% LEL muncul peringatan, di atas 20% LEL bahaya: matikan semua api dan tutup katup gas. Sekarang ${S.lel.toFixed(0)}% LEL.`],
  coil: ['Koil pemanas/pendingin', () => `Selang melingkar di dalam tangki. Air panas atau air dingin mengalir di dalamnya dan memindahkan panas lewat dinding selang (konduksi). Katup panas ${S.hot ? 'terbuka' : 'tertutup'}, katup dingin ${S.cold ? 'terbuka' : 'tertutup'}.`],
  solar: ['Pemanas air tenaga surya', () => 'Panel kolektor memanaskan air untuk koil di siang hari. Malam hari dibantu boiler biogas, jadi reaktor memanaskan dirinya sendiri.'],
  hotwater: ['Tangki air panas', () => `Menyimpan air ±55 °C dari kolektor surya dan boiler. ${S.hotFail ? 'PEMANAS RUSAK (skenario latihan).' : 'Pemanas berfungsi normal.'}`],
  boiler: ['Boiler biogas', () => `Membakar gas surplus saat drum hampir penuh dan kompor mati, sekaligus memanaskan air koil. Gas tidak terbuang ke udara. Status: ${S.boiler ? 'aktif' : 'siaga'}.`],
  coldwater: ['Tangki air dingin', () => 'Air ±24 °C untuk menurunkan suhu reaktor saat cuaca sangat terik. Katup dibuka otomatis bila suhu melewati batas atas.'],
  inlet: ['Bak pencampur umpan', () => `Sisa pangan dicacah, dicampur air 1:1, lalu dialirkan ke tangki. Kapasitas harian aman ±${S.set.feedKg} kg sisa pangan untuk modul 500 L. Total masuk ${S.cum.feed.toFixed(1)} kg.`],
  buffer: ['Pompa buffer NaHCO₃', () => `Menambahkan natrium bikarbonat saat pH turun. Dosis optimum literatur 1,0 g/g VS; berlebihan justru menurunkan metana dan menaikkan natrium. Total dipakai ${nf(S.cum.buf)} g.`],
  outlet: ['Saluran limpahan (pupuk cair)', () => `Setiap umpan masuk mendorong cairan hasil cerna keluar. Cairan ini pupuk cair yang perlu diencerkan sebelum disiram. Total ${nf(S.cum.liq)} L.`],
  drain: ['Katup bawah pengurasan endapan', () => `Endapan padat menumpuk di dasar kerucut. Buka katup bawah untuk menguras ke bak pengering. Sekarang ${S.sludgeL.toFixed(0)} L (batas ${S.set.sludgeMax} L).`],
  bed: ['Bak pengering pupuk', () => `Endapan dikeringkan atau dikomposkan dulu. Digesti mesofilik menurunkan patogen tetapi tidak menghilangkannya, jadi pupuk harus kering/matang sebelum dipakai di kebun sekolah. Terkumpul ${S.cum.fert.toFixed(1)} kg.`],
  esp: ['Kontroler IoT (ESP32)', () => `Membaca semua sensor, menjalankan katup dan pompa, dan mengirim data ke server lewat WiFi. Server meneruskan peringatan ke Telegram. Sumber data: ${S.source === 'sensor' ? 'sensor nyata' : 'simulasi'}.`],
  tempSensor: ['Sensor suhu DS18B20', () => `Probe tahan air di tengah slurry. Suhu ${S.T.toFixed(1)} °C; target ${S.set.T} ± ${S.set.band} °C. Goyah 5 °C bisa menghentikan produksi gas.`],
  phSensor: ['Sensor pH', () => `Elektroda pH industri. Rentang aman ${S.set.pHmin}–${S.set.pHmax}. Sekarang ${S.pH.toFixed(2)}. VFA ${nf(S.vfa)} mg/L.`],
  hose: ['Selang biogas ke dapur', () => 'Selang gas khusus dengan kemiringan menuju penjebak air, supaya uap air yang mengembun tidak menyumbat aliran.'],
  watertrap: ['Penjebak air (water trap)', () => 'Titik terendah jalur gas tempat air embun dikumpulkan. Buka kerannya seminggu sekali.'],
  scrubber: ['Scrubber H₂S', () => `Tabung berisi besi oksida yang menangkap hidrogen sulfida (bau busuk, korosif). H₂S masuk ±${nf(S.h2s)} ppm, keluar ±${nf(S.h2sOut)} ppm. Sisa kapasitas media ${S.scrub.toFixed(0)}%.`],
  gasline: ['Jalur gas utama', () => 'Pipa dari drum ke dapur, melewati penjebak air, scrubber, sensor tekanan, penganalisis gas, dan pengaman api.'],
  pressure: ['Sensor tekanan MPX5010DP', () => `Mengukur tekanan gas. Normal ±${R.Pnom} mbar; peringatan di atas ${S.set.Pmax} mbar. Sekarang ${S.press.toFixed(1)} mbar.`],
  analyzer: ['Penganalisis kadar metana', () => `Biogas perlu CH₄ di atas ±45% agar mudah menyala. Sekarang ${(S.xCH4 * 100).toFixed(0)}%.`],
  arrester: ['Pengaman nyala balik (flame arrester)', () => 'Mencegah api merambat dari kompor kembali ke tangki. Wajib dipasang sebelum kompor.'],
  kitchen: ['Dapur SPPG', () => `Satuan Pelayanan Pemenuhan Gizi, dapur yang memasak makanan program MBG. Biogas membantu mengurangi pemakaian LPG. Sudah dipakai ${S.cum.used.toFixed(2)} m³ ≈ ${(S.cum.used * .47).toFixed(2)} kg LPG.`],
  stove: ['Kompor biogas', () => S.stove ? `Menyala ${S.burners} tungku, memakai ±${(R.burner * S.burners * 1000).toFixed(0)} L gas per jam. Gas cukup ±${(S.Vg / (R.burner * S.burners) * 60).toFixed(0)} menit.` : `Mati. Gas tersedia ${(S.Vg * 1000).toFixed(0)} L, cukup ±${(S.Vg / R.burner * 60).toFixed(0)} menit untuk 1 tungku.`],
  smartbin: ['Smart bin + kamera AI', () => 'Kamera memotret nampan sebelum dan sesudah makan. Model computer vision memperkirakan menu apa yang tersisa dan berapa gram, lalu hasilnya dipakai memperbaiki menu dan porsi.']
};
const infoEl = $('#info');
window.APP = {
  showInfo(key) {
    const it = INFO[key]; if (!it) return;
    infoEl.querySelector('h3').textContent = it[0];
    infoEl.querySelector('p').textContent = it[1]();
    infoEl.hidden = false; infoEl.dataset.key = key;
  },
  hideInfo() { infoEl.hidden = true; }
};
infoEl.querySelector('.x').addEventListener('click', () => APP.hideInfo());

/* =====================================================================
   HERO: siklus & hitung mundur
   ===================================================================== */
const ICONS = {
  tray: '<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 11h4M13 11h4M7 14.5h10"/>',
  tank: '<path d="M6 9h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M8 9V5h8v4M6 14h12"/>',
  flame: '<path d="M12 3c2 3 5 5.2 5 9.2a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.2 1.6.8 2.4 1.7 2.8C10.8 8 11.2 5.6 12 3z"/>',
  pot: '<path d="M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M2 10h20M9 6.5c0-1 1-1 1-2.5M14 6.5c0-1 1-1 1-2.5"/>',
  leaf: '<path d="M5 19C5 11 10 6 19 5c-1 9-6 14-14 14z"/><path d="M5 19l7-7"/>',
  sprout: '<path d="M12 21v-8M6 21h12"/><path d="M12 13c0-3-2-5-6-5 0 3 2 5 6 5zM12 11c0-3 2-5 6-5 0 3-2 5-6 5z"/>'
};
const NODES = [['tray', 'Sisa pangan', 'dipotret smart bin'], ['tank', 'Bioreaktor', '±500 L, 35 °C'], ['flame', 'Biogas', 'metana ±60%'], ['pot', 'Dapur SPPG', 'kompor memasak'], ['leaf', 'Pupuk', 'endapan dikeringkan'], ['sprout', 'Kebun sekolah', 'sayur untuk menu']];
const loopNodes = $('#loopNodes');
loopNodes.innerHTML = NODES.map((n, i) => {
  const a = (-90 + i * 60) * Math.PI / 180, x = 50 + 35.7 * Math.cos(a), y = 50 + 35.7 * Math.sin(a);
  return `<li style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n[0]]}</svg></span>${n[1]}<small>${n[2]}</small></li>`;
}).join('');
const loopLis = Array.from(loopNodes.children);
const loopDot = $('#loopDot'), loopGlow = $('#loopGlow'), CIRC = 2 * Math.PI * 150;
let loopPhase = 0;
function animLoop(dt) {
  if (!reduceMotion) loopPhase = (loopPhase + dt / 12) % 1;
  const f = reduceMotion ? 0 : loopPhase, a = -Math.PI / 2 + f * Math.PI * 2;
  loopDot.setAttribute('cx', (210 + 150 * Math.cos(a)).toFixed(1));
  loopDot.setAttribute('cy', (210 + 150 * Math.sin(a)).toFixed(1));
  loopGlow.style.strokeDasharray = `${(reduceMotion ? CIRC : CIRC * f).toFixed(1)} ${CIRC.toFixed(1)}`;
  const idx = Math.floor(f * 6 + .08) % 6;
  loopLis.forEach((li, i) => li.classList.toggle('on', i === idx));
}
(function yearsLeft() {
  const y = 2045 - new Date().getFullYear();
  $('#yearsLeft').textContent = y > 0 ? `${y} tahun lagi` : 'Tahun emas';
})();

/* ---------- navigasi ---------- */
const nav = $('#nav');
function onScroll() { nav.classList.toggle('solid', window.scrollY > 24); }
window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
if (window.IntersectionObserver) {
  const links = $$('.links a');
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
  ['cara-kerja', 'dasbor', 'data', 'panduan'].forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
}

/* =====================================================================
   TOAST & MODAL
   ===================================================================== */
const { toast, openModal, closeModal } = window.UI;
const modalTitle = $('#modalTitle'), modalBody = $('#modalBody');
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal').hidden && !infoEl.hidden) APP.hideInfo(); });

/* ---------- dokumen ---------- */
const DOC_TITLES = { 'PANDUAN_PENGGUNA.md': 'Panduan pengguna', 'PANDUAN_ADMIN.md': 'Panduan admin', 'PANDUAN_BOTFATHER.md': 'Template bot Telegram', 'PANDUAN_TERMINAL.md': 'Perintah terminal', 'PANDUAN_DEPLOY_VERCEL.md': 'Panduan deploy', 'PANDUAN_SETUP.md': 'Panduan setup', 'ARSITEKTUR.md': 'Arsitektur sistem' };
async function openDoc(name) {
  openModal(DOC_TITLES[name] || name, '<p class="muted">Memuat dokumen…</p>');
  try {
    const r = await fetch('docs/' + name, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status);
    let text = await r.text(); let title = DOC_TITLES[name] || name;
    const m = text.match(/^#\s+(.+)\n/); if (m) { title = m[1]; text = text.slice(m[0].length); }
    modalTitle.textContent = title; modalBody.innerHTML = MD.render(text);
  } catch (e) {
    modalBody.innerHTML = `<p>Dokumen tidak bisa dimuat dari sini. Buka website lewat alamat server (misalnya <code>http://localhost:3000</code> atau alamat Vercel Anda), atau buka langsung file <code>public/docs/${esc(name)}</code> di folder proyek.</p>`;
  }
}
$$('[data-doc]').forEach(b => b.addEventListener('click', () => openDoc(b.dataset.doc)));

/* =====================================================================
   KONEKSI SERVER
   ===================================================================== */
const connEl = $('#conn');
function setConn(cls, text) { connEl.className = 'conn ' + cls; connEl.querySelector('span').textContent = text; }

/* Server di Vercel bisa lambat saat "bangun" (cold start). Halaman menunggu, mencoba ulang,
   dan selama menunggu model berjalan di browser supaya tampilan tidak kosong.
   Begitu server menjawab, halaman beralih ke data server secara otomatis. */
async function fetchHealth(ms) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch('api/health', { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const h = await r.json(); if (!h || !h.ok) throw new Error('bukan server BIOLOOP');
    return h;
  } finally { clearTimeout(tm); }
}
async function detect() {
  if (location.protocol === 'file:') return startLocal('file');
  setConn('', 'Menghubungkan…');
  for (let i = 0; i < 2; i++) {
    try { return startServer(await fetchHealth(20000)); }
    catch (e) { if (i === 0) { setConn('', 'Menyambungkan ke server…'); await new Promise(r => setTimeout(r, 1500)); } }
  }
  startLocal('wait');
  let busyTry = false;
  const retry = setInterval(async () => {
    if (busyTry) return; busyTry = true;
    try { await fetchHealth(20000); clearInterval(retry); location.reload(); }
    catch (e) { /* coba lagi */ } finally { busyTry = false; }
  }, 8000);
  APPSTATE.retryNow = async () => { try { await fetchHealth(20000); location.reload(); } catch (e) { /* abaikan */ } };
}

/* Mode server: data diambil berkala (cocok untuk Vercel yang tidak mendukung koneksi terbuka lama). */
const sourceSel = $('#source');
function fmtEvent(e) {
  const at = new Date(e.at);
  const real = at.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  e.time = APPSTATE.srvMode === 'simulasi' && e.t != null ? `${real} · ${SIM.simTimeStr(e.t)}` : real;
  return e;
}
function renderSources() {
  const list = APPSTATE.sources;
  sourceSel.innerHTML = list.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.kind === 'sensor' ? (s.online ? ' · online' : ' · offline') : ''}</option>`).join('');
  sourceSel.value = APPSTATE.source; $('#sourceWrap').hidden = list.length < 2;
}
async function loadSources() {
  try {
    const j = await UI.api('api/sources');
    APPSTATE.sources = j.sources;
    if (!APPSTATE.source || !j.sources.some(s => s.id === APPSTATE.source)) APPSTATE.source = j.default;
    renderSources();
  } catch (e) { /* abaikan; akan dicoba lagi */ }
}
sourceSel.addEventListener('change', () => {
  APPSTATE.source = sourceSel.value; store.set('bl_source', APPSTATE.source);
  APPSTATE.lastT = null; APPSTATE.lastEventId = 0; APPSTATE.log = []; renderLog(true); poll(true);
});
let pollTimer = null, failCount = 0;
async function poll(now) {
  clearTimeout(pollTimer);
  if (document.hidden && !now) { pollTimer = setTimeout(poll, 5000); return; }
  try {
    const q = new URLSearchParams({ source: APPSTATE.source || '' });
    if (APPSTATE.lastT != null) q.set('since', APPSTATE.lastT);
    if (APPSTATE.lastEventId) q.set('after', APPSTATE.lastEventId);
    const j = await UI.api('api/state?' + q);
    const s = j.state;
    if (j.full) { S.hist = j.hist.slice(); } else if (j.hist.length) { S.hist.push(...j.hist); if (S.hist.length > 480) S.hist.splice(0, S.hist.length - 480); }
    SIM.applySnapshot(s);
    APPSTATE.lastT = S.hist.length ? S.hist[S.hist.length - 1].t : s.t;
    APPSTATE.speed = s.speed; APPSTATE.paused = s.paused;
    const modeChanged = APPSTATE.srvMode !== s.mode; APPSTATE.srvMode = s.mode;
    if (j.eventsOrder === 'desc') { APPSTATE.log = j.events.map(fmtEvent); renderLog(true); }
    else for (const e of j.events) onEvent(fmtEvent(e));
    APPSTATE.lastEventId = j.lastEventId || APPSTATE.lastEventId;
    if (modeChanged) syncMode();
    $('#noData').hidden = !(s.mode === 'sensor' && !s.lastSensor);
    failCount = 0; setConn('live', 'Terhubung'); updateUI(true);
  } catch (e) {
    failCount++;
    if (e.status === 401) { setConn('off', 'Perlu masuk'); $('#modeNote').textContent = 'Dasbor hanya untuk pengguna terdaftar. Silakan masuk.'; if (failCount === 1) AUTH.openLogin('Dasbor ini khusus pengguna terdaftar. Silakan masuk.'); }
    else setConn('off', failCount > 2 ? 'Terputus, mencoba lagi…' : 'Menyambung…');
  }
  pollTimer = setTimeout(poll, failCount ? Math.min(15000, 2000 * failCount) : 2000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && APPSTATE.mode === 'server') poll(true); });

async function startServer(h) {
  APPSTATE.mode = 'server'; APPSTATE.health = h;
  if (h.site) { $('#siteName').textContent = h.site; document.title = `MBG-BIOLOOP AI | ${h.site}`; }
  setConn('', 'Menyambung…');
  if (h.warnings && h.warnings.length) toast('warn', 'Perlu perhatian admin', h.warnings[0]);
  await loadSources();
  document.dispatchEvent(new CustomEvent('bioloop:health', { detail: h }));
  renderTele(); syncMode(); poll(true);
  setInterval(async () => {
    try { APPSTATE.health = await UI.api('api/health'); renderTele(); document.dispatchEvent(new CustomEvent('bioloop:health', { detail: APPSTATE.health })); } catch (e) { /* diam */ }
    loadSources();
  }, 60000);
}

/* ---------- mode lokal: model berjalan di browser ---------- */
const SRC = { auto: 'Kontrol otomatis', manual: 'Dasbor', jadwal: 'Jadwal harian', skenario: 'Skenario latihan', habis: 'Gas habis', ai: 'Asisten AI' };
const src = s => SRC[s] || s || '';
function fmtLocal(e, d) {
  switch (e) {
    case 'alert': return { cat: 'alert', lvl: d.lvl, title: (d.remind ? 'Masih terjadi: ' : '') + d.name, body: d.msg };
    case 'recover': return { cat: 'alert', lvl: 'ok', title: d.name + ' kembali normal', body: `Suhu ${S.T.toFixed(1)} °C, pH ${S.pH.toFixed(2)}, tekanan ${S.press.toFixed(1)} mbar.` };
    case 'valve': return { cat: 'action', lvl: 'info', title: `${d.v === 'hot' ? 'Katup air panas' : 'Katup air dingin'} ${d.on ? 'dibuka' : 'ditutup'}`, body: `${src(d.src)}. Suhu slurry ${S.T.toFixed(1)} °C.` };
    case 'dose': return { cat: 'action', lvl: 'info', title: `Buffer ${d.g} g NaHCO₃ ditambahkan`, body: `${src(d.src)}. pH ${S.pH.toFixed(2)}, VFA ${Math.round(S.vfa)} mg/L.` };
    case 'boiler': return { cat: 'action', lvl: 'info', title: d.on ? 'Gas surplus dipakai boiler' : 'Boiler berhenti', body: d.on ? 'Drum hampir penuh dan kompor mati; gas dipakai memanaskan air.' : 'Isi drum turun ke batas aman.' };
    case 'stove': return { cat: 'sched', lvl: 'info', title: d.on ? 'Kompor SPPG menyala' : 'Kompor SPPG dimatikan', body: `${src(d.src)}. Gas tersisa ${(S.Vg * 1000).toFixed(0)} L.` };
    case 'gasout': return { cat: 'alert', lvl: 'warn', title: 'Biogas habis', body: `Sisa gas ${(S.Vg * 1000).toFixed(0)} L. Pakai LPG cadangan.` };
    case 'stoveblock': return { cat: 'alert', lvl: 'bad', title: 'Kompor tidak dinyalakan', body: `Detektor membaca ${d.lel.toFixed(0)}% LEL (kebocoran). Perbaiki kebocoran dulu.` };
    case 'relief': return { cat: 'action', lvl: 'warn', title: 'Katup pengaman membuang gas', body: `Tekanan mencapai ${R.Prelief} mbar.` };
    case 'feed': return { cat: 'sched', lvl: 'info', title: `Umpan ${(+d.kg).toFixed(1)} kg ${SIM.FOOD[d.type].n}`, body: `${src(d.src)}, + ${(+d.water).toFixed(1)} L air.` };
    case 'feedmix': return { cat: 'sched', lvl: 'info', title: `Umpan terjadwal ${d.fed.toFixed(1)} kg sisa makan siang`, body: `Sisa terpantau ${d.total.toFixed(1)} kg; ${(d.total - d.fed).toFixed(1)} kg ke pengomposan.` };
    case 'feedskip': return { cat: 'action', lvl: 'warn', title: 'Pengumpanan ditunda', body: `Alasan: ${d.why}. ${d.total.toFixed(1)} kg dialihkan ke pengomposan.` };
    case 'cv': { const top = d.slice().sort((a, b) => b.w / b.served - a.w / a.served)[0];
      return { cat: 'sched', lvl: 'info', title: 'Smart bin: rekap sisa makan siang', body: `Total ${d.reduce((x, r) => x + r.w, 0).toFixed(1)} kg. Sisa tertinggi: ${top.n} (${(top.w / top.served * 100).toFixed(0)}% dari porsi).` }; }
    case 'drain': return { cat: 'action', lvl: 'info', title: 'Katup bawah dibuka', body: `${src(d.src)}. Menguras ${d.L.toFixed(0)} L endapan.` };
    case 'drainDone': return { cat: 'action', lvl: 'ok', title: 'Pengurasan selesai', body: `Endapan tersisa ${S.sludgeL.toFixed(0)} L. Keringkan/komposkan sebelum dipakai.` };
    case 'scenario': return { cat: 'action', lvl: /^fix/.test(d.k) ? 'ok' : 'warn', title: (/^fix/.test(d.k) ? '' : 'Skenario latihan: ') + (SIM.SCEN[d.k] || d.k), body: '' };
    default: return null;
  }
}
function localEmit(e, d) {
  const m = fmtLocal(e, d); if (!m) return;
  m.type = e; m.t = S.t; m.time = SIM.simTimeStr(S.t); m.at = Date.now();
  if (e === 'feed') m.food = d.type;
  onEvent(m);
}
function startLocal(why) {
  APPSTATE.mode = 'local'; APPSTATE.localWhy = why; APPSTATE.srvMode = 'simulasi'; APPSTATE.speed = why === 'file' ? 600 : 60;
  SIM.setEmitter(localEmit); window.S = SIM.getS();
  setConn(why === 'file' ? 'wait' : '', why === 'file' ? 'Tanpa server' : 'Menyambungkan ke server…');
  syncMode(); renderTele(); renderLog(true); updateUI(true);
  document.dispatchEvent(new CustomEvent('bioloop:health', { detail: null }));
}
function localControl(action, p) {
  const say = (ok, message) => ({ ok, message });
  switch (action) {
    case 'buffer': { const g = SIM.clamp(+p.grams || 300, 50, 3000); SIM.dose(g, 'manual'); return say(true, `${g} g NaHCO₃ sedang dipompa.`); }
    case 'feed': { const kg = SIM.clamp(+p.kg || 3, .5, 50); SIM.feed(kg, p.type, kg, 'manual'); return say(true, `${kg} kg ${SIM.FOOD[p.type].n} dimasukkan.`); }
    case 'drain': if (S.sludgeL < 1) return say(false, 'Endapan sudah kosong.'); SIM.drain(SIM.clamp(+p.liters || 20, 5, 200), 'manual'); return say(true, 'Katup bawah dibuka.');
    case 'stove': if (p.burners) S.burners = +p.burners; return SIM.stoveSet(!!p.on, 'manual') ? say(true, p.on ? 'Kompor menyala.' : 'Kompor dimatikan.') : say(false, S.lel > 10 ? 'Kompor diblokir karena kebocoran gas.' : 'Gas tidak cukup untuk menyalakan kompor.');
    case 'valve': if (p.mode !== 'tutup') S.auto = false;
      if (p.mode === 'panas') SIM.setHot(true, 'manual'); else if (p.mode === 'dingin') SIM.setCold(true, 'manual'); else { SIM.setHot(false, 'manual'); SIM.setCold(false, 'manual'); }
      return say(true, p.mode === 'tutup' ? 'Katup koil ditutup.' : `Mode manual; katup air ${p.mode} dibuka.`);
    case 'auto': S.auto = !!p.on; return say(true, `Mode ${S.auto ? 'otomatis' : 'manual'} aktif.`);
    case 'stir': S.stir = !!p.on; return say(true, `Pengaduk ${S.stir ? 'menyala' : 'mati'}.`);
    case 'schedule': if (p.feed !== undefined) S.sched.feed = !!p.feed; if (p.stove !== undefined) S.sched.stove = !!p.stove; return say(true, 'Jadwal diperbarui.');
    case 'scenario': return SIM.scenario(p.k) ? say(true, 'Skenario dijalankan: ' + (SIM.SCEN[p.k] || p.k)) : say(false, 'Skenario tidak dikenal.');
    case 'speed': APPSTATE.speed = +p.speed; return say(true, 'Kecepatan diubah.');
    case 'pause': APPSTATE.paused = !!p.on; return say(true, APPSTATE.paused ? 'Simulasi dijeda.' : 'Simulasi berjalan.');
    case 'reset': SIM.setS(SIM.newState()); window.S = SIM.getS(); APPSTATE.log = []; renderLog(true); return say(true, 'Simulasi dimulai ulang.');
    default: return say(false, 'Aksi tidak dikenal.');
  }
}

/* ---------- kendali terpadu ---------- */
async function act(action, params = {}, quiet) {
  let r;
  if (APPSTATE.mode !== 'server') r = localControl(action, params);
  else {
    if (!(await AUTH.require('Masuk dengan akun petugas untuk mengendalikan bioreaktor. Pengunjung umum bisa memantau dan bertanya ke asisten.'))) return { ok: false };
    try { r = await UI.api('api/control', { body: Object.assign({ action, source: APPSTATE.source }, params) }); }
    catch (e) { r = { ok: false, message: e.message }; if (e.status === 401) AUTH.refresh(); }
    poll(true);
  }
  if (!quiet || !r.ok) toast(r.ok ? 'ok' : 'warn', r.ok ? 'Berhasil' : 'Tidak dijalankan', r.message);
  updateUI(true);
  return r;
}
window.ACT = act;

/* =====================================================================
   KEJADIAN & CATATAN
   ===================================================================== */
const logEl = $('#log');
function logItem(m) {
  const lvl = m.lvl || 'info';
  return `<div class="e ${lvl}"><i aria-hidden="true">${ST_ICON[lvl] || 'i'}</i><div><time>${esc(m.time || '')}</time><b>${esc(m.title)}</b>${m.body ? `<p>${esc(m.body)}</p>` : ''}${m.actor && m.actor !== 'sistem' ? `<small class="by">oleh ${esc(m.actor)}</small>` : ''}</div></div>`;
}
function renderLog(full) {
  if (full) logEl.innerHTML = APPSTATE.log.length ? APPSTATE.log.slice(0, 150).map(logItem).join('') : '<div class="empty">Belum ada kejadian. Kejadian penting akan muncul di sini dan dikirim ke Telegram.</div>';
}
function onEvent(m) {
  APPSTATE.log.unshift(m); if (APPSTATE.log.length > 300) APPSTATE.log.length = 300;
  const empty = logEl.querySelector('.empty'); if (empty) empty.remove();
  logEl.insertAdjacentHTML('afterbegin', logItem(m));
  while (logEl.children.length > 150) logEl.lastChild.remove();
  if (window.SCENE) {
    if (m.type === 'feed') SCENE.chunks(m.food || 'campuran', 3);
    if (m.type === 'feedmix') SCENE.chunks('campuran', 4);
    if (m.type === 'cv') SCENE.scan();
    if (m.cat === 'alert') SCENE.wifi();
  }
  if (m.cat === 'alert' || m.type === 'relief' || m.type === 'feedskip') toast(m.lvl, m.title, m.body ? m.body.split('\n')[0] : '');
}

/* =====================================================================
   KPI
   ===================================================================== */
const KPI = [
  { k: 'T', n: 'Suhu', unit: '°C', v: () => S.T.toFixed(1), st: () => SIM.statusOf('T'), h: 'T' },
  { k: 'pH', n: 'pH', unit: '', v: () => S.pH.toFixed(2), st: () => SIM.statusOf('pH'), h: 'pH' },
  { k: 'P', n: 'Tekanan', unit: 'mbar', v: () => S.press.toFixed(1), st: () => SIM.statusOf('P'), h: 'P' },
  { k: 'Vg', n: 'Isi drum', unit: '%', v: () => (S.Vg / R.VgMax * 100).toFixed(0), st: () => worst(SIM.statusOf('full'), SIM.statusOf('gas')), h: 'Vg' },
  { k: 'prod', n: 'Biogas', unit: 'm³/hr', v: () => nf(S.prod * 24, 2), st: () => worst(SIM.statusOf('ch4'), SIM.statusOf('vfa')), h: 'prod' },
  { k: 'lel', n: 'Kebocoran', unit: '% LEL', v: () => S.lel.toFixed(0), st: () => SIM.statusOf('lel'), h: 'lel' }
];
function worst(...a) { return a.includes('bad') ? 'bad' : a.includes('warn') ? 'warn' : 'ok'; }
const kpisEl = $('#kpis');
kpisEl.innerHTML = KPI.map(k => `<div class="kpi" id="kpi-${k.k}" role="group" aria-label="${k.n}"><div class="k"><span>${k.n}</span><span class="chip"><i aria-hidden="true">✓</i><em style="font-style:normal">Normal</em></span></div><div class="v"><span class="val">–</span><small>${k.unit}</small></div><canvas height="30" aria-hidden="true"></canvas></div>`).join('');
KPI.forEach(k => { const el = $('#kpi-' + k.k); k.el = el; k.val = el.querySelector('.val'); k.chip = el.querySelector('.chip'); k.cv = el.querySelector('canvas'); });

function sizeCanvas(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return null;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); return { c, w, h };
}
function spark(cv, key, st) {
  const g = sizeCanvas(cv); if (!g) return; const { c, w, h } = g;
  const pts = S.hist.slice(-96).map(p => p[key]).filter(v => Number.isFinite(v)); if (pts.length < 2) return;
  let lo = Math.min(...pts), hi = Math.max(...pts); if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  c.beginPath();
  pts.forEach((v, i) => { const x = i / (pts.length - 1) * (w - 4) + 2, y = h - 3 - (v - lo) / (hi - lo) * (h - 6); i ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.strokeStyle = st === 'bad' ? '#B91C2C' : st === 'warn' ? '#C98A10' : '#7A1020'; c.lineWidth = 1.6; c.lineJoin = 'round'; c.stroke();
  const lx = w - 2, ly = h - 3 - (pts[pts.length - 1] - lo) / (hi - lo) * (h - 6);
  c.fillStyle = c.strokeStyle; c.beginPath(); c.arc(lx, ly, 2.5, 0, 7); c.fill();
}
function renderKPIs() {
  for (const k of KPI) {
    const st = k.st(); k.val.textContent = k.v();
    if (k._st !== st) { k._st = st; k.el.className = 'kpi ' + st; k.chip.className = 'chip ' + st; k.chip.querySelector('i').textContent = ST_ICON[st]; k.chip.querySelector('em').textContent = ST_LABEL[st]; }
    spark(k.cv, k.h, st);
  }
}

/* =====================================================================
   GRAFIK UTAMA
   ===================================================================== */
const CH = {
  T: { n: 'Suhu', u: '°C', d: 1, band: () => [S.set.T - S.set.band, S.set.T + S.set.band] },
  pH: { n: 'pH', u: '', d: 2, band: () => [S.set.pHmin, S.set.pHmax] },
  vfa: { n: 'VFA', u: 'mg/L', d: 0, band: () => [0, 2000] },
  P: { n: 'Tekanan', u: 'mbar', d: 1, band: () => [3, S.set.Pmax] },
  Vg: { n: 'Isi drum', u: '%', d: 0, band: () => [10, 93] },
  prod: { n: 'Produksi', u: 'm³/hari', d: 2, band: null },
  x: { n: 'Metana', u: '%', d: 0, band: () => [45, 75] },
  sl: { n: 'Endapan', u: 'L', d: 0, band: () => [0, S.set.sludgeMax] }
};
const chartCv = $('#bigChart'), chartTip = $('#chartTip'), chartSel = $('#chartSel');
let hoverX = null;
function drawChart() {
  const g = sizeCanvas(chartCv); if (!g) return; const { c, w, h } = g;
  const key = chartSel.value, cfg = CH[key], data = S.hist.filter(p => Number.isFinite(p[key]));
  const padL = 44, padR = 12, padT = 12, padB = 26, pw = w - padL - padR, ph = h - padT - padB;
  c.font = '11px "Plus Jakarta Sans", system-ui, sans-serif';
  if (data.length < 2) { c.fillStyle = '#8A909C'; c.textAlign = 'center'; c.fillText('Mengumpulkan data…', w / 2, h / 2); chartTip.hidden = true; return; }
  const band = cfg.band ? cfg.band() : null;
  let lo = Math.min(...data.map(p => p[key])), hi = Math.max(...data.map(p => p[key]));
  if (band) { lo = Math.min(lo, band[0]); hi = Math.max(hi, band[1]); }
  const span = hi - lo || 1; lo -= span * .08; hi += span * .08; if (key !== 'T' && key !== 'pH' && lo < 0) lo = 0;
  const t0 = data[0].t, t1 = data[data.length - 1].t, ts = t1 - t0 || 1;
  const X = t => padL + (t - t0) / ts * pw, Y = v => padT + (1 - (v - lo) / (hi - lo)) * ph;
  if (band) { c.fillStyle = 'rgba(31,122,77,.09)'; const y1 = Y(Math.min(band[1], hi)), y0 = Y(Math.max(band[0], lo)); c.fillRect(padL, y1, pw, y0 - y1);
    c.strokeStyle = 'rgba(31,122,77,.35)'; c.setLineDash([4, 4]); c.lineWidth = 1; [band[0], band[1]].forEach(b => { if (b > lo && b < hi) { c.beginPath(); c.moveTo(padL, Y(b)); c.lineTo(padL + pw, Y(b)); c.stroke(); } }); c.setLineDash([]); }
  c.strokeStyle = '#EEE9DF'; c.fillStyle = '#8A909C'; c.textAlign = 'right'; c.textBaseline = 'middle'; c.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, y = Y(v); c.beginPath(); c.moveTo(padL, y); c.lineTo(padL + pw, y); c.stroke(); c.fillText(nf(v, cfg.d > 1 ? 1 : cfg.d === 1 && hi - lo < 5 ? 1 : 0), padL - 8, y); }
  c.textAlign = 'center'; c.textBaseline = 'top';
  const nT = Math.max(2, Math.min(5, Math.floor(pw / 90)));
  for (let i = 0; i <= nT; i++) { const t = t0 + ts * i / nT; const hh = Math.floor(t % 24), mm = Math.floor((t * 60) % 60); c.textAlign = i === 0 ? 'left' : i === nT ? 'right' : 'center'; c.fillText(`${String(hh).padStart(2, '0')}.${String(mm).padStart(2, '0')}`, X(t), padT + ph + 8); }
  c.beginPath(); data.forEach((p, i) => { const x = X(p.t), y = Y(p[key]); i ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.strokeStyle = '#7A1020'; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
  const grad = c.createLinearGradient(0, padT, 0, padT + ph); grad.addColorStop(0, 'rgba(122,16,32,.12)'); grad.addColorStop(1, 'rgba(122,16,32,0)');
  c.lineTo(X(t1), padT + ph); c.lineTo(X(t0), padT + ph); c.closePath(); c.fillStyle = grad; c.fill();
  if (hoverX != null && hoverX >= padL && hoverX <= padL + pw) {
    const t = t0 + (hoverX - padL) / pw * ts; let best = data[0];
    for (const p of data) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    const x = X(best.t), y = Y(best[key]);
    c.strokeStyle = 'rgba(26,29,36,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, padT); c.lineTo(x, padT + ph); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); c.strokeStyle = '#7A1020'; c.lineWidth = 2; c.stroke();
    chartTip.hidden = false; chartTip.innerHTML = `${esc(SIM.simTimeStr(best.t))}<br>${cfg.n} <b>${nf(best[key], cfg.d)} ${cfg.u}</b>`;
    chartTip.style.left = Math.min(Math.max(x, 70), w - 70) + 'px'; chartTip.style.top = y + 'px';
  } else chartTip.hidden = true;
}
chartCv.addEventListener('pointermove', e => { const r = chartCv.getBoundingClientRect(); hoverX = e.clientX - r.left; drawChart(); });
chartCv.addEventListener('pointerleave', () => { hoverX = null; drawChart(); });
chartSel.addEventListener('change', drawChart);

/* =====================================================================
   PANEL: kendali, grafik, sisa pangan, kalkulator, telegram
   ===================================================================== */
function selectTab(name) { const b = $(`.tabs button[data-tab="${name}"]`); if (b && !b.hidden) b.click(); }
$$('.tabs button').forEach(b => b.addEventListener('click', () => {
  $$('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
  $$('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
  updateUI(true);
}));
const activeTab = () => { const b = $('.tabs button[aria-selected="true"]'); return b ? b.dataset.tab : 'grafik'; };

const feedType = $('#feedType');
feedType.innerHTML = Object.entries(SIM.FOOD).map(([k, f]) => `<option value="${k}">${esc(f.n)}</option>`).join('');
function sw(el, on) { el.setAttribute('aria-checked', on ? 'true' : 'false'); }
$('#swAuto').addEventListener('click', () => act('auto', { on: !S.auto }, true));
$('#swHot').addEventListener('click', () => act('valve', { mode: S.hot ? 'tutup' : 'panas' }, true));
$('#swCold').addEventListener('click', () => act('valve', { mode: S.cold ? 'tutup' : 'dingin' }, true));
$('#swStir').addEventListener('click', () => act('stir', { on: !S.stir }, true));
$('#btnStove').addEventListener('click', () => act('stove', { on: !S.stove, burners: +$('#burners').value }));
$('#burners').addEventListener('change', () => { if (S.stove) act('stove', { on: true, burners: +$('#burners').value }, true); });
$('#btnDose').addEventListener('click', () => act('buffer', { grams: +$('#doseG').value }));
$('#btnDrain').addEventListener('click', () => act('drain', { liters: +$('#drainL').value }));
$('#btnFeed').addEventListener('click', () => act('feed', { kg: +$('#feedKg').value, type: feedType.value }));
$('#schFeed').addEventListener('change', e => act('schedule', { feed: e.target.checked }, true));
$('#schStove').addEventListener('change', e => act('schedule', { stove: e.target.checked }, true));
$$('[data-sc]').forEach(b => b.addEventListener('click', () => act('scenario', { k: b.dataset.sc })));
$('#btnReset').addEventListener('click', async () => {
  if (await UI.confirmBox('Mulai ulang simulasi?', 'Grafik dan total simulasi kembali ke awal. Laporan lama di database dan ingatan asisten tidak terhapus.', 'Ya, mulai ulang', true)) act('reset');
});
$('#speed').addEventListener('change', e => act('speed', { speed: +e.target.value }, true));
$('#pause').addEventListener('click', () => act('pause', { on: !APPSTATE.paused }, true));

/* tampilan 3D */
$$('.vbar [data-view]').forEach(b => b.addEventListener('click', () => { $$('.vbar [data-view]').forEach(x => x.classList.toggle('on', x === b)); window.SCENE && SCENE.view(b.dataset.view); }));
$('#xray').addEventListener('click', e => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-pressed', on); window.SCENE && SCENE.xray(on); });
$('#lblmode').addEventListener('click', e => { if (!window.SCENE) return; const m = SCENE.labels(); e.currentTarget.textContent = 'Label: ' + ['mati', 'sensor', 'semua'][m]; e.currentTarget.classList.toggle('on', m === 2); });

function syncMode() {
  const note = $('#modeNote'), u = window.AUTH && AUTH.user;
  const src = APPSTATE.sources.find(s => s.id === APPSTATE.source);
  if (APPSTATE.mode === 'server') {
    note.textContent = (APPSTATE.srvMode === 'sensor' ? `Data langsung dari perangkat ${src ? src.name : ''}` : 'Model bioreaktor (simulasi) berjalan di server, waktu nyata') +
      (u ? ` · Anda masuk sebagai ${u.name}` : ' · Terbuka untuk umum. Petugas masuk untuk mengendalikan.');
  } else note.textContent = APPSTATE.localWhy === 'file' ? 'Halaman dibuka tanpa server: angka dihitung di browser ini. Buka alamat website untuk akun, Telegram, dan asisten AI.' : 'Menyambungkan ke server… Sementara itu angka dihitung di browser ini dan akan diganti data server begitu tersambung.';
  const sensor = APPSTATE.srvMode === 'sensor';
  $$('.scen button, #btnFeed').forEach(b => { b.disabled = sensor; });
  $('#speed').disabled = sensor; $('#pause').disabled = sensor;
  /* Pembagian tampilan:
     - tamu (siapa pun): memantau grafik, sisa pangan, catatan, notifikasi, kalkulator;
     - pengguna terdaftar: + tab Kendali dan asisten AI;
     - admin: + kecepatan simulasi, jeda, skenario gangguan, mulai ulang.
     File dibuka tanpa server: semuanya tampil karena model hanya ada di browser ini. */
  const offline = APPSTATE.mode !== 'server' && APPSTATE.localWhy === 'file', admin = !!(u && u.role === 'admin');
  $$('.only-admin').forEach(el => { el.hidden = !(offline || admin); });
  $('#btnReset').hidden = !(offline || admin);
  const canControl = offline || !!u, kb = $('#tabBtnKendali');
  kb.hidden = !canControl;
  if (!canControl && activeTab() === 'kendali') selectTab('grafik');
  if (canControl && !syncMode.shownCtl && u) { syncMode.shownCtl = true; selectTab('kendali'); }
  if (!u) syncMode.shownCtl = false;
  $('#guestNote').hidden = APPSTATE.mode !== 'server' || !!u;
  $('#helpLogin').textContent = u ? `Akun: ${u.name}` : 'Masuk / daftar akun';
}
document.addEventListener('bioloop:auth', () => { syncMode(); renderTele(); });
$('#guestLogin').addEventListener('click', () => AUTH.openLogin());
$('#helpLogin').addEventListener('click', () => { if (window.AUTH && AUTH.user) { AUTH.openAccount ? AUTH.openAccount() : toast('info', 'Sudah masuk', `Anda masuk sebagai ${AUTH.user.name}.`); } else AUTH.openLogin(); });

/* ---------- rendering per tab ---------- */
function renderKendali() {
  sw($('#swAuto'), S.auto); sw($('#swHot'), S.hot); sw($('#swCold'), S.cold); sw($('#swStir'), S.stir);
  $('#btnStove').textContent = S.stove ? 'Matikan' : 'Nyalakan';
  $('#btnStove').className = 'btn sm ' + (S.stove ? 'btn-line' : 'btn-merah');
  if (document.activeElement !== $('#burners')) $('#burners').value = String(S.burners);
  $('#stoveHint').textContent = S.stove ? `Menyala ${S.burners} tungku · gas cukup ±${nf(S.Vg / (R.burner * S.burners) * 60)} menit` : `Mati · gas tersedia ${nf(S.Vg * 1000)} L`;
  $('#doseHint').textContent = S.doseG > 0 ? `Sedang memompa, sisa ${nf(S.doseG)} g` : `pH ${S.pH.toFixed(2)} · saran bila asam: ${nf(SIM.autoDoseG())} g`;
  $('#drainHint').textContent = S.drainL > 0 ? `Menguras, sisa ${S.drainL.toFixed(0)} L` : `Endapan ${S.sludgeL.toFixed(0)} L dari batas ${S.set.sludgeMax} L`;
  $('#schFeed').checked = S.sched.feed; $('#schStove').checked = S.sched.stove;
}
const STAGES = [['Hidrolisis', 'Clostridium', 'hyd'], ['Asidogenesis & asetogenesis', 'Clostridium, Syntrophomonas', 'acid'], ['Metanogenesis', 'metanogen metilotrof, Geobacter (DIET)', 'meth']];
function renderGrafik() {
  drawChart();
  const vals = STAGES.map(s => (S[s[2]] || 0) * 24), mx = Math.max(...vals, 1e-6);
  $('#stages').innerHTML = STAGES.map((s, i) => `<div class="stage"><span>${s[0]}<small>${s[1]}</small></span><span class="bar"><i style="width:${(vals[i] / mx * 100).toFixed(0)}%"></i></span><span>${nf(vals[i], 2)} kg/hari</span></div>`).join('');
  const c = S.cum, lpg = c.used * .47, price = (+$('#kLpg').value || 218000) / 12;
  $('#summary').innerHTML = [
    ['Biogas dihasilkan', `${nf(c.bg, 2)} m³`], ['Dipakai kompor SPPG', `${nf(c.used, 2)} m³`], ['Setara LPG', `${nf(lpg, 2)} kg`],
    ['Perkiraan hemat', rp(lpg * price)], ['Dipakai boiler (pemanas)', `${nf(c.boil, 2)} m³`], ['Terbuang lewat katup', `${nf(c.vent, 2)} m³`],
    ['Sisa pangan masuk', `${nf(c.feed, 1)} kg`], ['Dialihkan ke kompos', `${nf(c.compost, 1)} kg`], ['Pupuk padat', `${nf(c.fert, 1)} kg`],
    ['Pupuk cair', `${nf(c.liq)} L`], ['Buffer NaHCO₃', `${nf(c.buf)} g`]
  ].map((r, i) => `<tr${i === 3 ? ' class="hl"' : ''}><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
}
function renderSisa() {
  const td = S.wp.today;
  $('#cvToday').innerHTML = td ? `<div class="today">${td.res.map(r => `<div>${esc(r.n)}<b>${nf(r.w, 2)} kg</b><span class="muted small">${nf(r.w / r.served * 100)}% dari ${nf(r.served, 1)} kg</span></div>`).join('')}</div>
    <p class="muted small" style="margin:8px 0 0">Hari ${td.day + 1} · ${S.set.porsi} porsi dipantau · ${td.fed ? 'sudah diumpankan pukul 14.00' : 'menunggu jadwal umpan 14.00'}</p>`
    : '<span class="muted">Rekap smart bin dibuat pukul 13.00 waktu simulasi.</span>';
  const rk = SIM.wasteRanking();
  if (rk.length) {
    const mx = Math.max(...rk.map(r => r.pct), 1);
    $('#cvRank').innerHTML = rk.map(r => `<div class="rank"><span>${esc(r.n)}</span><span class="bar"><i style="width:${(r.pct / mx * 100).toFixed(0)}%"></i></span><span>${nf(r.pct)}%</span></div>`).join('');
    const top = rk[0];
    const tip = { sayur: 'Coba olahan sayur yang lebih disukai anak (ditumis, dicampur telur) atau kurangi porsi 20% dan ganti buah.', nasi: 'Porsi nasi mungkin terlalu besar untuk kelas bawah; sesuaikan porsi per jenjang.', lauk: 'Cek tekstur dan bumbu lauk; libatkan siswa dalam uji rasa.', buah: 'Sajikan buah yang sudah dipotong agar mudah dimakan.' }[top.c] || 'Evaluasi resep dan porsi bersama ahli gizi SPPG.';
    $('#cvReco').innerHTML = `<div class="reco"><b>Saran untuk ahli gizi:</b> ${esc(top.n)} paling banyak tersisa (${nf(top.pct)}% dari porsi, ${top.days} hari). ${tip}</div>`;
  }
  const a = SIM.aiInsight();
  const col = a.score >= 80 ? '#1F7A4D' : a.score >= 55 ? '#C98A10' : '#B91C2C';
  $('#aiTable').innerHTML = `<tr><td colspan="2"><div class="score"><svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" fill="none" stroke="#EFEBE2" stroke-width="4"/><circle cx="18" cy="18" r="15.5" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(a.score / 100 * 97.4).toFixed(1)} 97.4" transform="rotate(-90 18 18)"/><text x="18" y="22" text-anchor="middle" font-size="10" font-weight="800" fill="${col}">${a.score}</text></svg><div><b>Skor kesehatan proses</b><br><span class="muted small">Gabungan suhu, pH, rasio VFA/alkalinitas, dan kebocoran</span></div></div></td></tr>
    <tr><td>pH 6 jam lagi</td><td>${a.pH6.toFixed(2)}</td></tr><tr><td>Suhu 6 jam lagi</td><td>${a.T6.toFixed(1)} °C</td></tr>
    <tr><td>Gas saat kompor pagi (${a.hN.toFixed(0)} jam lagi)</td><td>${nf(a.gasAt * 1000)} L · ±${nf(a.minutes)} menit</td></tr>
    <tr><td>Rasio VFA/alkalinitas</td><td>${a.fos.toFixed(2)}</td></tr>`;
  $('#aiNotes').innerHTML = `<ul class="notes">${a.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
}
function renderKalk() {
  const porsi = SIM.clamp(+$('#kPorsi').value || 0, 0, 50000), g = SIM.clamp(+$('#kGram').value || 0, 0, 1000), pin = SIM.clamp(+$('#kIn').value || 0, 0, 100) / 100, price = +$('#kLpg').value || 0;
  const kg = porsi * g / 1000 * pin, vs = kg * .217, ch4 = vs * .355, lpg = ch4 * .7156 * 50.4 / 47.3;
  const vol = Math.max(vs / 2, kg * 2 / 1000 * 40), days = 313;
  $('#kOut').innerHTML = [
    ['Sisa pangan masuk digester', `${nf(kg, 1)} kg/hari`], ['Padatan organik (VS)', `${nf(vs, 1)} kg/hari`], ['Metana', `${nf(ch4, 1)} m³/hari`],
    ['Setara LPG', `${nf(lpg, 1)} kg/hari`], ['Volume kerja digester', `${nf(vol, 1)} m³`], ['Jumlah modul 500 L', nf(Math.ceil(vol / .5))],
    ['LPG 12 kg dihemat per tahun', `${nf(lpg * days / 12)} tabung`], ['Perkiraan hemat per tahun', rp(lpg * days * price / 12)],
    ['Sisa pangan tidak ke TPA per tahun', `${nf(kg * days / 1000, 1)} ton`]
  ].map((r, i) => `<tr${i === 7 ? ' class="hl"' : ''}><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
}
['#kPorsi', '#kGram', '#kIn', '#kLpg'].forEach(id => $(id).addEventListener('input', () => { renderKalk(); if (activeTab() === 'grafik') renderGrafik(); }));

function renderTele() {
  const el = $('#teleStatus'); const h = APPSTATE.health; const t = h && h.telegram;
  const admin = window.AUTH && AUTH.user && AUTH.user.role === 'admin';
  $('#teleAdmin').hidden = !admin;
  const bl = $('#botLink'), un = APPSTATE.mode === 'server' && t && t.username;
  bl.hidden = !un; if (un) { bl.href = 'https://t.me/' + encodeURIComponent(t.username); bl.textContent = `Buka bot @${t.username}`; }
  if (APPSTATE.mode !== 'server') { el.className = 'tele-card off'; el.innerHTML = '<b>Menyambungkan ke server…</b><p>Status bot Telegram tampil setelah website tersambung ke server.</p>'; return; }
  if (!t || !t.enabled) { el.className = 'tele-card off'; el.innerHTML = '<b>Bot Telegram belum dipasang</b><p>Admin perlu mengisi <code>TELEGRAM_BOT_TOKEN</code> di pengaturan server (Vercel → Environment Variables).</p>'; return; }
  if (!t.username) { el.className = 'tele-card off'; el.innerHTML = `<b>Bot belum tersambung</b><p>${esc(t.error || 'Sedang menghubungkan ke Telegram…')}</p>`; return; }
  el.className = 'tele-card';
  el.innerHTML = `<b>Bot @${esc(t.username)} aktif</b><p>Mode ${t.mode === 'webhook' ? 'webhook (Vercel)' : 'long polling'} · asisten AI ${h.ai && h.ai.enabled ? 'aktif' : 'belum diisi'}</p><p><a href="https://t.me/${encodeURIComponent(t.username)}" target="_blank" rel="noopener">Buka bot di Telegram →</a></p>`;
}

/* =====================================================================
   PEMBARUAN UI
   ===================================================================== */
let lastUI = 0;
function updateUI(force) {
  const now = performance.now(); if (!force && now - lastUI < 300) return; lastUI = now;
  $('#clock').textContent = APPSTATE.srvMode === 'sensor' ? 'Waktu nyata ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : SIM.simTimeStr(S.t);
  const w = SIM.worstStatus(), a = SIM.aiInsight(), hl = $('#health');
  const bad = SIM.ALERTS.filter(x => SIM.statusOf(x.k) !== 'ok').map(x => x.n);
  hl.className = 'health ' + w; hl.querySelector('i').textContent = ST_ICON[w];
  hl.querySelector('span').textContent = w === 'ok' ? `Proses stabil · skor ${a.score}` : `${w === 'bad' ? 'Bahaya' : 'Perhatian'}: ${bad.slice(0, 2).join(', ')}${bad.length > 2 ? ' +' + (bad.length - 2) : ''}`;
  const sp = $('#speed');
  if (document.activeElement !== sp) { const v = String(APPSTATE.speed); if (![...sp.options].some(o => o.value === v)) sp.insertAdjacentHTML('beforeend', `<option value="${v}">${v}×</option>`); sp.value = v; }
  $('#pause').textContent = APPSTATE.paused ? 'Lanjutkan' : 'Jeda';
  $('#loopVal').textContent = nf(S.prod * 24, 2) + ' m³';
  renderKPIs();
  const tab = activeTab();
  if (tab === 'kendali') renderKendali(); else if (tab === 'grafik') renderGrafik(); else if (tab === 'sisa') renderSisa(); else if (tab === 'kalk') renderKalk();
  if (!infoEl.hidden && infoEl.dataset.key) infoEl.querySelector('p').textContent = INFO[infoEl.dataset.key][1]();
}

/* ---------- loop animasi ---------- */
let prev = performance.now();
function loop(now) {
  const dt = Math.min(.1, (now - prev) / 1000); prev = now;
  if (APPSTATE.mode === 'local' && !APPSTATE.paused) {
    let h = dt * APPSTATE.speed / 3600, g = 0;
    while (h > 1e-9 && g < 400) { const d = Math.min(.02, h); SIM.step(d); h -= d; g++; }
    updateUI();
  } else if (APPSTATE.mode === 'server') updateUI();
  if (window.SCENE) SCENE.frame(dt);
  animLoop(dt);
  requestAnimationFrame(loop);
}
renderKalk(); renderKendali();
requestAnimationFrame(loop);
(window.AUTH ? AUTH.ready : Promise.resolve()).then(detect, detect);
})();
