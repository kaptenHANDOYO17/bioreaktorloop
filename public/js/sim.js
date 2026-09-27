/* =====================================================================
   MBG-BIOLOOP AI — MESIN SIMULASI BIOREAKTOR FLOATING DRUM (±500 L)
   Dipakai bersama oleh server (Node.js) dan website (mode demo).
   Model 3 kolam: partikulat -> terlarut -> VFA -> CH4.
   Parameter rujukan (lihat docs/Data_Penelitian_MBG_BIOLOOP.xlsx):
   - Mesofilik 35 °C, toleransi ±3 °C (Mapantsela dkk. 2024)
   - Fluktuasi 5 °C dapat menghentikan produksi (Garkoti dkk. 2024)
   - NaHCO3 optimum 1,0 g/g VS; >=1,25 g/g VS menurunkan (Almomani & Bhosale 2020)
   - pH produksi metana 6,0-8,5; C/N 20-30; CH4 >45% agar menyala (Mapantsela dkk. 2024)
   ===================================================================== */
(function (root) {
'use strict';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const R = {
  V: 500, tankR: 0.42, tankH: 1.25, slurryH: 1.05,
  drumR: 0.37, drumH: 0.95, drumRest: 0.30, rise: 0.65,
  Pnom: 7, Prelief: 15, burner: 0.35
};
R.area = Math.PI * R.drumR * R.drumR;
R.VgMax = R.area * R.rise;

const FOOD = {
  campuran: { n: 'Campuran sisa MBG', TS: .25, VSf: .92, deg: .80, fast: .40, CN: 18, prot: .30, alk: 4 },
  nasi:     { n: 'Nasi/karbohidrat',  TS: .35, VSf: .97, deg: .85, fast: .50, CN: 28, prot: .08, alk: 3 },
  sayur:    { n: 'Sayuran',           TS: .10, VSf: .85, deg: .70, fast: .30, CN: 14, prot: .20, alk: 5 },
  lauk:     { n: 'Lauk protein',      TS: .35, VSf: .92, deg: .80, fast: .20, CN: 8,  prot: .60, alk: 15 },
  buah:     { n: 'Kulit/sisa buah',   TS: .15, VSf: .93, deg: .90, fast: .70, CN: 35, prot: .05, alk: 2 },
  sapi:     { n: 'Kotoran sapi',      TS: .17, VSf: .74, deg: .50, fast: .10, CN: 24, prot: .15, alk: 20 }
};

const MENU = [
  { n: 'Nasi putih',  c: 'nasi',  g: 150, bias: .18 },
  { n: 'Sayur bayam', c: 'sayur', g: 60,  bias: .34 },
  { n: 'Ayam goreng', c: 'lauk',  g: 60,  bias: .08 },
  { n: 'Tempe bacem', c: 'lauk',  g: 40,  bias: .15 },
  { n: 'Pisang',      c: 'buah',  g: 80,  bias: .22 },
  { n: 'Sayur sop',   c: 'sayur', g: 70,  bias: .26 }
];

function newState() {
  return {
    t: 8, T: 34.6, P: 1.2, Sol: .04, A: .10, Alk: 3300, Na: 250,
    Vg: .10, press: 7, xCH4: .63, pH: 7.2, vfa: 200,
    sludgeDry: 3.6, sludgeL: 45, scrub: 100, lel: 0, leak: false, hotFail: false,
    hot: false, cold: false, stove: false, boiler: false, burners: 1, stir: true, auto: true,
    ambOff: 0, ambUntil: 0, sunGain: 0,
    prod: 0, ch4r: 0, use: 0, hyd: 0, acid: 0, meth: 0, relief: false,
    cum: { bg: 0, ch4: 0, used: 0, boil: 0, vent: 0, feed: 0, fert: 0, liq: 0, heat: 0, buf: 0, compost: 0 },
    cn: 18, prot: .30, h2s: 1100, h2sOut: 20,
    drainL: 0, doseG: 0, lastDose: -99,
    sched: { feed: true, stove: true },
    set: { T: 35, band: 2, pHmin: 6.6, pHmax: 7.9, Pmax: 12, sludgeMax: 60, feedKg: 3.5, porsi: 60, water: 1 },
    stoveSched: [[5, 5.67], [10, 10.25], [17, 17.25]],
    wp: { items: {}, days: 0, today: null },
    hist: [], al: {}, source: 'simulasi', lastSensor: 0
  };
}
let S = newState();
let emit = () => {};
function setEmitter(fn) { emit = fn; }
function getS() { return S; }
function setS(o) { S = o; }
function applySnapshot(o) { for (const k in o) S[k] = o[k]; }

const crosses = (t0, t1, h) => Math.floor((t0 - h) / 24) < Math.floor((t1 - h) / 24);
function ambient(t) {
  const h = t % 24;
  return 29 + 4 * Math.sin(2 * Math.PI * (h - 9) / 24) + (t < S.ambUntil ? S.ambOff : 0);
}
const fTm = T => Math.exp(-(((T - 36) / (T < 36 ? 11 : 5)) ** 2));
const fTh = T => Math.exp(-(((T - 38) / 15) ** 2));
function fpH(p) { if (p < 6.0 || p > 8.6) return 0; if (p < 6.8) return (p - 6.0) / .8; if (p <= 7.8) return 1; return (8.6 - p) / .8; }
const fNa = n => n < 3500 ? 1 : Math.max(0, 1 - (n - 3500) / 8000);

/* ---------------- aksi ---------------- */
function setHot(on, src) { if (S.hot === on) return; S.hot = on; if (on) S.cold = false; emit('valve', { v: 'hot', on, src }); }
function setCold(on, src) { if (S.cold === on) return; S.cold = on; if (on) S.hot = false; emit('valve', { v: 'cold', on, src }); }
function stoveSet(on, src) {
  if (on && S.lel > 10) { emit('stoveblock', { src, lel: S.lel }); return false; }
  if (on && (S.Vg < .01 || S.press < 3)) { emit('gasout', { src }); return false; }
  if (S.stove === on) return true;
  S.stove = on; emit('stove', { on, src }); return true;
}
function dose(g, src) { g = Math.round(g); S.doseG += g; S.lastDose = S.t; emit('dose', { g, src }); }
function autoDoseG() { const B = S.Alk - .83 * S.vfa; return clamp((1800 - B) * R.V / 595, 200, 1500); }
function drain(L, src) { S.drainL = Math.min(L, S.sludgeL); emit('drain', { L: S.drainL, src }); }

function feed(kg, type, water, src, silent) {
  const f = FOOD[type] || FOOD.campuran; const vin = kg + water; const fr = Math.min(.3, vin / R.V);
  const Ta = ambient(S.t);
  S.T = S.T * (1 - fr) + Ta * fr;
  S.Alk = S.Alk - (S.Alk - 500) * fr + kg * f.alk * 1000 / R.V;
  S.Na *= 1 - fr; S.A *= 1 - fr * .5;
  const VS = kg * f.TS * f.VSf, dg = VS * f.deg;
  S.Sol += dg * f.fast; S.P += dg * (1 - f.fast);
  S.sludgeDry += (kg * f.TS - dg) * .5;
  const w = clamp(kg / 8, .05, .6); S.cn = S.cn * (1 - w) + f.CN * w; S.prot = S.prot * (1 - w) + f.prot * w;
  S.cum.feed += kg; S.cum.liq += vin;
  if (!silent) emit('feed', { kg, type: FOOD[type] ? type : 'campuran', water, src });
}

/* ---------------- smart bin + computer vision (disimulasikan) ---------------- */
function dayMenu(d) { return [MENU[0], d % 2 ? MENU[1] : MENU[5], d % 2 ? MENU[3] : MENU[2], MENU[4]]; }
function cvDay() {
  const d = Math.floor(S.t / 24); const res = [];
  for (const m of dayMenu(d)) {
    const served = S.set.porsi * m.g / 1000;
    const w = served * clamp(m.bias * (.75 + .5 * Math.random()), 0, .9);
    res.push({ n: m.n, c: m.c, served, w });
    const it = S.wp.items[m.n] || (S.wp.items[m.n] = { served: 0, w: 0, c: m.c, days: 0 });
    it.served += served; it.w += w; it.days++;
  }
  S.wp.today = { day: d, res, fed: false }; S.wp.days++;
  emit('cv', res);
}
function feedCheck() {
  if (S.pH < S.set.pHmin) return `pH ${S.pH.toFixed(2)} masih di bawah ${S.set.pHmin}`;
  if (S.vfa > 2000) return `VFA ${Math.round(S.vfa)} mg/L terlalu tinggi`;
  if (S.T < 30) return `suhu ${S.T.toFixed(1)} °C terlalu rendah`;
  return null;
}
function scheduledFeed() {
  const why = S.auto ? feedCheck() : null;
  let mix = {}, total = 0;
  const today = S.wp.today && S.wp.today.day === Math.floor(S.t / 24) ? S.wp.today : null;
  if (today) for (const r of today.res) { mix[r.c] = (mix[r.c] || 0) + r.w; total += r.w; }
  else { mix = { campuran: S.set.feedKg }; total = S.set.feedKg; }
  if (why) { S.cum.compost += total; emit('feedskip', { why, total }); return; }
  const ratio = Math.min(1, S.set.feedKg / total); let fed = 0;
  for (const c in mix) { const kg = mix[c] * ratio; fed += kg; feed(kg, c, kg * S.set.water, 'jadwal', true); }
  S.cum.compost += total - fed;
  if (today) today.fed = true;
  emit('feedmix', { fed, total, mix, ratio });
}

function schedule(t0, t) {
  if (S.sched.stove) for (const [a, b] of S.stoveSched) {
    if (crosses(t0, t, a)) stoveSet(true, 'jadwal');
    if (crosses(t0, t, b) && S.stove) stoveSet(false, 'jadwal');
  }
  if (crosses(t0, t, 13)) cvDay();
  if (S.sched.feed && crosses(t0, t, 14)) scheduledFeed();
  for (const h of [0, 6, 12, 18]) if (crosses(t0, t, h)) emit('tick6', { h });
}

/* ---------------- satu langkah simulasi (dt jam) ---------------- */
function step(dt) {
  const t0 = S.t; S.t += dt; const t = S.t;
  schedule(t0, t);
  const Ta = ambient(t);

  if (S.auto) {
    const lo = S.set.T - S.set.band, hi = S.set.T + S.set.band;
    if (S.T < lo && !S.hot) setHot(true, 'auto'); else if (S.hot && S.T >= S.set.T + .3) setHot(false, 'auto');
    if (S.T > hi && !S.cold) setCold(true, 'auto'); else if (S.cold && S.T <= S.set.T - .3) setCold(false, 'auto');
    if (S.pH < S.set.pHmin && t - S.lastDose > 4 && S.doseG <= 0) dose(autoDoseG(), 'auto');
    if (!S.boiler && !S.stove && S.Vg > .93 * R.VgMax) { S.boiler = true; emit('boiler', { on: true }); }
    else if (S.boiler && (S.Vg < .82 * R.VgMax || S.stove)) { S.boiler = false; emit('boiler', { on: false }); }
  } else if (S.boiler) { S.boiler = false; emit('boiler', { on: false }); }

  let dT = (Ta - S.T) / 40 + (t < S.ambUntil ? S.sunGain : 0);
  const k = .069;
  if (S.hot) { const Th = S.hotFail ? Math.min(Ta, 30) : 55; dT += k * (Th - S.T); if (!S.hotFail) S.cum.heat += 40 * (55 - S.T) * dt / 1000; }
  if (S.cold) dT += k * (24 - S.T);
  S.T += dT * dt;

  if (S.doseG > 0) { const g = Math.min(S.doseG, 1800 * dt); S.doseG -= g; S.Alk += g * 595 / R.V; S.Na += g * 274 / R.V; S.cum.buf += g; }

  const mix = S.stir ? 1 : .88, th = fTh(S.T), tm = fTm(S.T), ph = fpH(S.pH), na = fNa(S.Na);
  const vi = S.vfa > 4000 ? Math.max(.15, 1 - (S.vfa - 4000) / 6000) : 1;
  const hyd = .35 / 24 * th * mix * S.P;
  const acid = 3 / 24 * th * S.Sol;
  const meth = 1.6 / 24 * tm * ph * na * vi * mix * S.A / (.15 + S.A);
  S.P = Math.max(0, S.P - hyd * dt); S.Sol = Math.max(0, S.Sol + (hyd - acid) * dt); S.A = Math.max(0, S.A + (acid - meth) * dt);
  S.hyd = hyd; S.acid = acid; S.meth = meth;
  S.sludgeDry += .05 * meth * dt;

  const xm = clamp(.64 - Math.max(0, 6.9 - S.pH) * .2, .3, .7);
  const ch4 = meth * .40, bg = ch4 / xm + acid * .06;
  if (bg > 1e-6) S.xCH4 += (ch4 / bg - S.xCH4) * Math.min(1, dt / .5);
  S.prod = bg; S.ch4r = ch4; S.cum.bg += bg * dt; S.cum.ch4 += ch4 * dt; S.Vg += bg * dt;

  if (S.leak) { const l = Math.min(S.Vg, .03 * dt); S.Vg -= l; S.lel = Math.min(60, S.lel + 30 * dt); }
  else S.lel = Math.max(0, S.lel - 40 * dt);

  S.use = 0;
  if (S.stove) {
    if (S.press >= 3 && S.Vg > .006) { const u = Math.min(R.burner * S.burners * dt, S.Vg - .004); S.Vg -= u; S.cum.used += u; S.use = u / dt; }
    else { S.stove = false; emit('gasout', { src: 'habis' }); }
  }
  if (S.boiler) { const u = Math.min(.2 * dt, Math.max(0, S.Vg - .02)); S.Vg -= u; S.cum.boil += u; S.use += u / dt; }

  const Vmin = .012;
  if (S.Vg < Vmin) S.press = R.Pnom * Math.max(0, S.Vg) / Vmin;
  else if (S.Vg <= R.VgMax) S.press = R.Pnom;
  else S.press = R.Pnom + (S.Vg - R.VgMax) * 150;
  const wasRelief = S.relief; S.relief = false;
  if (S.press > R.Prelief) { const cap = R.VgMax + (R.Prelief - R.Pnom) / 150; S.cum.vent += S.Vg - cap; S.Vg = cap; S.press = R.Prelief; S.relief = true; }
  if (S.relief && !wasRelief) emit('relief', {});

  S.h2s = 300 + 2800 * S.prot;
  const eff = S.scrub > 5 ? .98 : .98 * S.scrub / 5;
  S.h2sOut = S.h2s * (1 - eff);
  S.scrub = Math.max(0, S.scrub - bg * dt * S.h2s * 1e-6 * 1520 * eff / 30 * 100);

  S.Alk += (3300 - S.Alk) / (20 * 24) * dt; S.Na += (250 - S.Na) / (60 * 24) * dt;

  S.vfa = S.A * 1e6 / R.V;
  const B = S.Alk - .83 * S.vfa, co2mM = clamp(1 - S.xCH4, .2, .8) * 25;
  const pHt = clamp(6.35 + Math.log10(Math.max(B, 20) / 50 / co2mM), 4.8, 8.8);
  S.pH += (pHt - S.pH) * Math.min(1, dt / .5);

  if (S.drainL > 0) {
    const L = S.sludgeDry / .08, r = Math.min(S.drainL, 120 * dt, L);
    S.sludgeDry -= r * .08; S.drainL -= r; S.cum.fert += r * .2;
    if (S.drainL <= 1e-6 || L - r <= 1e-6) { S.drainL = 0; emit('drainDone', {}); }
  }
  S.sludgeL = S.sludgeDry / .08;
  recordHist();
  evalAlerts(dt);
}
function recordHist() {
  if (!S.hist.length || S.t - S.hist[S.hist.length - 1].t >= .25) {
    S.hist.push({ t: S.t, T: S.T, pH: S.pH, P: S.press, x: S.xCH4 * 100, Vg: S.Vg / R.VgMax * 100, prod: S.prod * 24, vfa: S.vfa, h2s: S.h2s, sl: S.sludgeL, lel: S.lel });
    if (S.hist.length > 480) S.hist.shift();
  }
}

/* ---------------- aturan peringatan ---------------- */
const ALERTS = [
  { k: 'T', n: 'Suhu', f: () => { const lo = S.set.T - S.set.band - 1, hi = S.set.T + S.set.band + 1; if (S.T < 28 || S.T > 42) return 'bad'; if (S.T < lo || S.T > hi) return 'warn'; return 'ok'; },
    m: () => S.T < S.set.T
      ? `Suhu ${S.T.toFixed(1)} °C, di bawah rentang ${S.set.T}±${S.set.band} °C. Bakteri metanogen melambat.\nTindakan: cek pemanas air & aliran koil, pasang insulasi.${S.auto ? ' Katup air panas sudah dibuka otomatis.' : ''}`
      : `Suhu ${S.T.toFixed(1)} °C, di atas rentang ${S.set.T}±${S.set.band} °C.\nTindakan: alirkan air dingin ke koil, beri peneduh.${S.auto ? ' Katup air dingin sudah dibuka otomatis.' : ''}` },
  { k: 'pH', n: 'pH', f: () => { if (S.pH < 6.2 || S.pH > 8.3) return 'bad'; if (S.pH < S.set.pHmin || S.pH > S.set.pHmax) return 'warn'; return 'ok'; },
    m: () => S.pH < S.set.pHmin
      ? `pH ${S.pH.toFixed(2)} terlalu asam (batas ${S.set.pHmin}). Biasanya karena umpan berlebih.\nTindakan: tambah buffer NaHCO₃, hentikan umpan 1-2 hari.${S.auto ? ' Buffer sudah ditambahkan otomatis.' : ''}`
      : `pH ${S.pH.toFixed(2)} terlalu basa (batas ${S.set.pHmax}).\nTindakan: hentikan buffer, tambah umpan kaya karbohidrat.` },
  { k: 'vfa', n: 'Asam lemak volatil (VFA)', f: () => S.vfa > 4000 ? 'bad' : S.vfa > 2500 ? 'warn' : 'ok',
    m: () => `VFA ${Math.round(S.vfa)} mg/L menumpuk (normal di bawah 2000). Risiko reaktor asam.\nTindakan: tunda umpan, pantau pH, siapkan buffer.` },
  { k: 'P', n: 'Tekanan gas', f: () => S.press >= R.Prelief - .01 ? 'bad' : S.press > S.set.Pmax ? 'warn' : 'ok',
    m: () => `Tekanan ${S.press.toFixed(1)} mbar (normal ±${R.Pnom}). Drum di posisi tertinggi.\nTindakan: pakai gas untuk memasak atau bakar di flare.` },
  { k: 'gas', n: 'Gas hampir habis', f: () => (S.stove && S.Vg < .02) ? 'warn' : 'ok',
    m: () => `Sisa gas ${(S.Vg * 1000).toFixed(0)} L (±${(S.Vg / (R.burner * S.burners) * 60).toFixed(0)} menit).\nTindakan: siapkan LPG cadangan.` },
  { k: 'full', n: 'Drum gas hampir penuh', f: () => S.Vg > .95 * R.VgMax ? 'warn' : 'ok',
    m: () => `Drum terisi ${(S.Vg / R.VgMax * 100).toFixed(0)}%.\nTindakan: nyalakan kompor untuk merebus air/memasak.` },
  { k: 'lel', n: 'KEBOCORAN GAS', f: () => S.lel > 20 ? 'bad' : S.lel > 10 ? 'warn' : 'ok',
    m: () => `Detektor metana membaca ${S.lel.toFixed(0)}% LEL.\nTindakan: MATIKAN semua api, tutup katup gas utama, cek sambungan dengan air sabun.` },
  { k: 'ch4', n: 'Kadar metana rendah', f: () => (S.xCH4 < .45 && S.prod > .002) ? 'warn' : 'ok',
    m: () => `CH₄ ${(S.xCH4 * 100).toFixed(0)}%. Di bawah ±45% biogas sulit menyala.\nTindakan: periksa pH dan suhu; jangan tambah umpan dulu.` },
  { k: 'h2s', re: 24, n: 'Media scrubber H₂S jenuh', f: () => S.scrub < 5 ? 'bad' : S.scrub < 15 ? 'warn' : 'ok',
    m: () => `Kapasitas media scrubber ${S.scrub.toFixed(0)}%. H₂S keluar ${S.h2sOut.toFixed(0)} ppm.\nTindakan: ganti media besi oksida.` },
  { k: 'sl', re: 24, n: 'Endapan penuh', f: () => S.sludgeL > S.set.sludgeMax ? 'warn' : 'ok',
    m: () => `Endapan dasar ${S.sludgeL.toFixed(0)} L (batas ${S.set.sludgeMax} L).\nTindakan: kuras 20-30 L ke bak pengering pupuk.` },
  { k: 'na', re: 24, n: 'Natrium tinggi', f: () => S.Na > 3500 ? 'warn' : 'ok',
    m: () => `Natrium ${Math.round(S.Na)} mg/L akibat buffer berulang.\nTindakan: kurangi NaHCO₃, pertimbangkan kapur atau ko-substrat kotoran sapi.` },
  { k: 'cn', re: 24, n: 'Rasio C/N tidak ideal', f: () => (S.cn < 15 || S.cn > 35) ? 'warn' : 'ok',
    m: () => S.cn < 15 ? `Rasio C/N umpan ±${S.cn.toFixed(0)} (ideal 20-30), terlalu banyak protein.\nTindakan: campur dengan nasi/kulit buah atau kotoran sapi.`
                       : `Rasio C/N umpan ±${S.cn.toFixed(0)} (ideal 20-30), kurang nitrogen.\nTindakan: tambahkan sisa lauk/sayur.` },
  { k: 'sensor', n: 'Sensor tidak mengirim data', f: () => (S.source === 'sensor' && S.lastSensor && Date.now() - S.lastSensor > 120000) ? 'bad' : 'ok',
    m: () => `Tidak ada data dari kontroler selama ${Math.round((Date.now() - S.lastSensor) / 60000)} menit.\nTindakan: cek listrik, WiFi, dan ESP32.` }
];
function evalAlerts(dt) {
  for (const a of ALERTS) {
    const st = S.al[a.k] || (S.al[a.k] = { lvl: 'ok', cand: 'ok', since: 0, sent: -99 });
    const l = a.f();
    if (l !== st.cand) { st.cand = l; st.since = 0; } else st.since += dt;
    // simulasi: kondisi harus bertahan 12 menit (menghindari kedip); sensor nyata: 1 menit, kebocoran langsung
    const hold = S.source === 'sensor' ? (a.k === 'lel' ? 0 : 1 / 60) : .2;
    if (st.cand !== st.lvl && st.since >= hold) {
      const prev = st.lvl; st.lvl = st.cand; st.sent = S.t;
      emit(st.lvl === 'ok' ? 'recover' : 'alert', { k: a.k, name: a.n, lvl: st.lvl, prev, msg: st.lvl === 'ok' ? '' : a.m() });
    } else if (st.lvl !== 'ok' && S.t - st.sent > (a.re || 6)) {
      st.sent = S.t; emit('alert', { k: a.k, name: a.n, lvl: st.lvl, prev: st.lvl, msg: a.m(), remind: true });
    }
  }
}
function statusOf(k) { return (S.al[k] && S.al[k].lvl) || 'ok'; }
function worstStatus() { let w = 'ok'; for (const a of ALERTS) { const s = statusOf(a.k); if (s === 'bad') return 'bad'; if (s === 'warn') w = 'warn'; } return w; }

function scenario(k) {
  switch (k) {
    case 'cold': S.ambOff = -10; S.ambUntil = S.t + 12; S.sunGain = 0; break;
    case 'hot': S.ambOff = 10; S.ambUntil = S.t + 8; S.sunGain = .7; break;
    case 'over': feed(30, 'campuran', 15, 'skenario'); break;
    case 'heatfail': S.hotFail = true; S.ambOff = -8; S.ambUntil = S.t + 14; S.sunGain = 0; break;
    case 'leak': S.leak = true; break;
    case 'protein': feed(10, 'lauk', 10, 'skenario'); break;
    case 'stove': S.burners = 2; stoveSet(true, 'skenario'); break;
    case 'scrub': S.scrub = 12; break;
    case 'fixleak': S.leak = false; break;
    case 'fixheat': S.hotFail = false; break;
    case 'fixscrub': S.scrub = 100; break;
    default: return false;
  }
  emit('scenario', { k }); return true;
}

/* ---------------- analitik ---------------- */
function linTrend(key, n = 12) {
  const h = S.hist.slice(-n); if (h.length < 4) return 0;
  const mx = h.reduce((s, p) => s + p.t, 0) / h.length, my = h.reduce((s, p) => s + p[key], 0) / h.length;
  let a = 0, b = 0; for (const p of h) { a += (p.t - mx) * (p[key] - my); b += (p.t - mx) ** 2; }
  return b ? a / b : 0;
}
function hoursUntil(hh) { const h = S.t % 24; return (hh - h + 24) % 24 || 24; }
function aiInsight() {
  const out = [];
  const dpH = linTrend('pH'), dT = linTrend('T');
  const pH6 = S.pH + dpH * 6, T6 = S.T + dT * 6;
  const hN = hoursUntil(5);
  const gasAt = Math.min(R.VgMax, S.Vg + S.prod * hN - (S.stove ? S.use * .5 : 0));
  const minutes = gasAt / R.burner * 60;
  const last24 = S.hist.filter(p => p.t > S.t - 24);
  const meanProd = last24.length ? last24.reduce((s, p) => s + p.prod, 0) / last24.length : S.prod * 24;
  const drop = meanProd > 0 ? 1 - S.prod * 24 / meanProd : 0;
  const fos = S.vfa / Math.max(1, S.Alk);
  let score = 100;
  score -= Math.min(30, Math.abs(S.T - S.set.T) * 6);
  score -= S.pH < 6.8 ? (6.8 - S.pH) * 60 : S.pH > 7.8 ? (S.pH - 7.8) * 40 : 0;
  score -= fos > .3 ? (fos - .3) * 80 : 0;
  score -= S.lel > 10 ? 40 : 0;
  score = clamp(Math.round(score), 0, 100);
  if (dpH < -.03) out.push(`pH diperkirakan turun ke ${pH6.toFixed(2)} dalam 6 jam. Kurangi umpan besok.`);
  if (Math.abs(dT) > .3) out.push(`Suhu diperkirakan ${T6.toFixed(1)} °C dalam 6 jam.`);
  if (fos > .3) out.push(`Rasio VFA/alkalinitas ${fos.toFixed(2)} (aman di bawah 0,3), tanda awal pengasaman.`);
  if (drop > .35 && meanProd > .05) out.push(`Produksi gas turun ${(drop * 100).toFixed(0)}% dari rata-rata 24 jam.`);
  if (S.sludgeL > S.set.sludgeMax * .85) out.push('Endapan mendekati batas, jadwalkan pengurasan.');
  if (!out.length) out.push('Proses stabil. Tidak ada tindakan yang diperlukan.');
  return { score, pH6, T6, gasAt, minutes, hN, fos, meanProd, drop, notes: out };
}
function wasteRanking() {
  const arr = Object.entries(S.wp.items).map(([n, v]) => ({ n, c: v.c, pct: v.served ? v.w / v.served * 100 : 0, kg: v.w, days: v.days }));
  arr.sort((a, b) => b.pct - a.pct); return arr;
}
function simTimeStr(t) {
  const d = Math.floor(t / 24) + 1, h = Math.floor(t % 24), mi = Math.floor((t * 60) % 60);
  return `Hari ${d}, ${String(h).padStart(2, '0')}.${String(mi).padStart(2, '0')}`;
}
/* ringkasan kondisi untuk AI & Telegram */
function describe() {
  const a = aiInsight();
  return {
    waktu_simulasi: simTimeStr(S.t), sumber_data: S.source,
    suhu_C: +S.T.toFixed(1), target_suhu_C: S.set.T, toleransi_C: S.set.band,
    pH: +S.pH.toFixed(2), vfa_mgL: Math.round(S.vfa), alkalinitas_mgL: Math.round(S.Alk), natrium_mgL: Math.round(S.Na),
    tekanan_mbar: +S.press.toFixed(1), gas_drum_L: Math.round(S.Vg * 1000), isi_drum_persen: Math.round(S.Vg / R.VgMax * 100),
    metana_persen: Math.round(S.xCH4 * 100), produksi_biogas_m3_per_hari: +(S.prod * 24).toFixed(2),
    h2s_mentah_ppm: Math.round(S.h2s), h2s_keluar_ppm: Math.round(S.h2sOut), media_scrubber_persen: Math.round(S.scrub),
    endapan_L: Math.round(S.sludgeL), batas_endapan_L: S.set.sludgeMax, bocor_LEL_persen: Math.round(S.lel), rasio_CN_umpan: Math.round(S.cn),
    katup_air_panas: S.hot, katup_air_dingin: S.cold, kompor_menyala: S.stove, jumlah_tungku: S.burners, boiler: S.boiler,
    mode_otomatis: S.auto, pengaduk: S.stir, pemanas_rusak: S.hotFail, kebocoran: S.leak,
    peringatan_aktif: ALERTS.filter(x => statusOf(x.k) !== 'ok').map(x => `${x.n} (${statusOf(x.k)})`),
    skor_kesehatan: a.score, prediksi_pH_6jam: +a.pH6.toFixed(2), prediksi_suhu_6jam: +a.T6.toFixed(1), catatan_analitik: a.notes,
    total: { biogas_m3: +S.cum.bg.toFixed(2), dipakai_kompor_m3: +S.cum.used.toFixed(2), setara_LPG_kg: +(S.cum.used * .47).toFixed(2),
             sisa_pangan_masuk_kg: +S.cum.feed.toFixed(1), dikompos_kg: +S.cum.compost.toFixed(1), pupuk_padat_kg: +S.cum.fert.toFixed(1),
             pupuk_cair_L: Math.round(S.cum.liq), buffer_g: Math.round(S.cum.buf) }
  };
}

const SCEN = { cold: 'Malam dingin (udara -10 °C, 12 jam)', hot: 'Terik ekstrem (8 jam)', over: 'Kelebihan umpan 30 kg', heatfail: 'Pemanas rusak + malam dingin',
  leak: 'Selang gas bocor', protein: 'Umpan tinggi protein 10 kg', stove: 'Kompor 2 tungku terus menyala', scrub: 'Media scrubber hampir jenuh',
  fixleak: 'Kebocoran diperbaiki', fixheat: 'Pemanas diperbaiki', fixscrub: 'Media scrubber diganti' };
const API = { SCEN, R, FOOD, MENU, ALERTS, newState, getS, setS, applySnapshot, setEmitter, step, recordHist, evalAlerts, feed, dose, drain,
  stoveSet, setHot, setCold, scenario, autoDoseG, aiInsight, wasteRanking, statusOf, worstStatus, ambient, simTimeStr, describe, clamp };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.SIM = API;
})(typeof window !== 'undefined' ? window : globalThis);
