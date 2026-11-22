/* =====================================================================
   Simulasi analogi "botol meledak" untuk presentasi
   Kiri : botol tertutup tanpa pengawasan → tekanan naik → retak → pecah
   Kanan: botol dengan sensor BIO-LOOP → SIAGA ke Telegram → katup ke kompor → stabil
   Tekanan ditampilkan sebagai % batas aman botol (analogi, bukan angka fisik).
   ===================================================================== */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const stage = $('#demoStage'); if (!stage) return;
const NS = 'http://www.w3.org/2000/svg';
const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SIAGA = 0.60, BAHAYA = 0.85, VALVE = 0.70, HOLD = 0.40;

/* ---------- tampilan ---------- */
function bottleSVG(side) {
  const b = side === 'b';
  return `<svg viewBox="0 0 360 300" class="demo-svg" aria-hidden="true">
  <defs>
    <clipPath id="clip-${side}"><path d="M74 104 Q74 86 100 74 L100 58 L140 58 L140 74 Q166 86 166 104 L166 266 Q166 278 154 278 L86 278 Q74 278 74 266 Z"/></clipPath>
    <linearGradient id="liq-${side}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A9743A"/><stop offset="1" stop-color="#5B3416"/></linearGradient>
    <linearGradient id="glass-${side}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".25" stop-color="#fff" stop-opacity=".06"/><stop offset=".8" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#fff" stop-opacity=".18"/></linearGradient>
    <radialGradient id="flame-${side}" cx=".5" cy=".8" r=".8"><stop offset="0" stop-color="#E8F4FF"/><stop offset=".45" stop-color="#5AA7FF"/><stop offset="1" stop-color="#1D5FA8" stop-opacity="0"/></radialGradient>
  </defs>
  <line x1="10" y1="280" x2="350" y2="280" class="ground"/>
  ${b ? `<g class="pipe"><path d="M120 34 L120 18 L300 18 L300 226" class="pipe-body"/><path d="M120 34 L120 18 L300 18 L300 226" class="pipe-flow" data-k="flow"/>
    <g data-k="valve" transform="translate(208 18)"><circle r="11" class="valve"/><rect x="-2.5" y="-16" width="5" height="32" rx="2" class="valve-h" data-k="valveH"/></g>
    <text x="208" y="48" text-anchor="middle" class="svg-lbl">katup otomatis</text>
    <g transform="translate(300 252)"><rect x="-38" y="0" width="76" height="26" rx="5" class="stove"/><rect x="-26" y="-6" width="52" height="8" rx="3" class="burner"/>
      <path d="M-16 -6 Q-14 -40 0 -58 Q14 -40 16 -6 Z" fill="url(#flame-b)" class="flame" data-k="flame"/><text y="44" text-anchor="middle" class="svg-lbl">kompor SPPG</text></g></g>` : ''}
  <g data-k="bottle" class="bottle">
    <g clip-path="url(#clip-${side})">
      <rect x="60" y="40" width="120" height="240" class="gas" data-k="gas"/>
      <rect x="60" y="182" width="120" height="100" fill="url(#liq-${side})" data-k="liquid"/>
      <rect x="60" y="176" width="120" height="10" class="foam" data-k="foam"/>
      <g data-k="bubbles"></g>
    </g>
    <path d="M74 104 Q74 86 100 74 L100 58 L140 58 L140 74 Q166 86 166 104 L166 266 Q166 278 154 278 L86 278 Q74 278 74 266 Z" class="glass" fill="url(#glass-${side})"/>
    <rect x="96" y="${b ? 34 : 38}" width="48" height="${b ? 24 : 20}" rx="4" class="cap" data-k="cap"/>
    <g class="cracks" data-k="cracks"><path d="M120 120 l-10 18 l8 10 l-12 20 M150 150 l-14 8 l4 14 l-12 6 M92 200 l12 10 l-6 14 M140 230 l-10 -12 l-14 4"/></g>
    <text x="120" y="232" text-anchor="middle" class="svg-in">sisa makanan</text>
    ${b ? `<g transform="translate(150 118)" class="sensor"><rect x="0" y="0" width="34" height="22" rx="4"/><circle cx="9" cy="11" r="4" data-k="led"/><text x="22" y="15" text-anchor="middle">IoT</text></g>
      <g class="waves" data-k="waves" transform="translate(184 118)"><path d="M6 4 q8 7 0 14"/><path d="M12 -1 q13 12 0 24"/></g>` : ''}
  </g>
  <g data-k="frags"></g>
  <text x="120" y="150" text-anchor="middle" class="boom" data-k="boom">DUAR!</text>
</svg>`;
}
function gaugeSVG() {
  const arc = (a0, a1, cls) => { const r = 54, p = a => [64 + r * Math.cos(Math.PI * (1 - a)), 64 - r * Math.sin(Math.PI * (1 - a))]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" class="${cls}"/>`; };
  return `<svg viewBox="0 0 128 76" class="gauge" aria-hidden="true">${arc(0, SIAGA, 'g-ok')}${arc(SIAGA, BAHAYA, 'g-warn')}${arc(BAHAYA, 1, 'g-bad')}
    <line x1="64" y1="64" x2="64" y2="16" class="needle" data-k="needle"/><circle cx="64" cy="64" r="5" class="hub"/></svg>`;
}
function panelHTML(side) {
  const b = side === 'b';
  return `<header class="dp-h"><span class="dp-tag ${b ? 'ok' : 'bad'}">${b ? 'Dengan BIO-LOOP' : 'Tanpa pengawasan'}</span><span class="dp-state" data-k="state">Siap</span></header>
  <div class="dp-body">${bottleSVG(side)}
    <div class="dp-read">${gaugeSVG()}
      <div class="dp-num"><b data-k="pct">0%</b><span>tekanan dari batas aman botol</span></div>
      <dl class="dp-kv"><div><dt>Gas terkumpul</dt><dd data-k="gasv">0 mL</dd></div>${b ? '<div><dt>Gas ke kompor</dt><dd data-k="used">0 mL</dd></div><div><dt>Peringatan</dt><dd data-k="alerts">belum ada</dd></div>' : '<div><dt>Yang mengawasi</dt><dd>tidak ada</dd></div>'}</dl>
    </div>
  </div>
  <ol class="dp-log" data-k="log"></ol>
  ${b ? '<div class="dp-phone" data-k="phone" hidden><div class="ph-app">Telegram · Bioreaktorloop</div><b data-k="phT"></b><p data-k="phB"></p></div>' : ''}
  <div class="dp-flash" data-k="flashEl"></div>`;
}
const P = { a: $('#dpA'), b: $('#dpB') };
P.a.innerHTML = panelHTML('a'); P.b.innerHTML = panelHTML('b');
const q = (side, k) => P[side].querySelector(`[data-k="${k}"]`);

/* ---------- suara (Web Audio, dibuat saat tombol ditekan) ---------- */
let ac = null, hiss = null;
function audioOn() { return $('#demoSound').checked; }
function ensureAudio() {
  if (ac || !(window.AudioContext || window.webkitAudioContext)) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = .7;
  const g = ac.createGain(); g.gain.value = 0;
  src.connect(bp).connect(g).connect(ac.destination); src.start();
  hiss = { g, bp };
}
function tone(freq, dur, type = 'sine', vol = .2, when = 0) {
  if (!ac || !audioOn()) return;
  const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + .05);
}
function boomSound() {
  if (!ac || !audioOn()) return;
  const t = ac.currentTime, n = ac.sampleRate * 1.4, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
  const s = ac.createBufferSource(); s.buffer = buf; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(200, t + 1.2);
  const g = ac.createGain(); g.gain.value = .9; s.connect(lp).connect(g).connect(ac.destination); s.start(t);
  const o = ac.createOscillator(), og = ac.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + .6);
  og.gain.setValueAtTime(.8, t); og.gain.exponentialRampToValueAtTime(.001, t + .7); o.connect(og).connect(ac.destination); o.start(t); o.stop(t + .8);
}
const ding = () => { tone(880, .35, 'sine', .18); tone(1320, .45, 'sine', .15, .12); };
const whoosh = () => { tone(300, .5, 'triangle', .08); };

/* ---------- Telegram (opsional, perlu masuk) ---------- */
const loggedIn = () => !!(window.AUTH && AUTH.user);
function syncTg() {
  const w = $('#demoTgWrap'), c = $('#demoTg');
  c.disabled = !loggedIn(); if (!loggedIn()) c.checked = false;
  w.classList.toggle('off', !loggedIn()); w.title = loggedIn() ? 'Kirim peringatan contoh ke chat Telegram yang disetujui' : 'Masuk akun dulu untuk mengirim peringatan demo ke Telegram';
}
setInterval(syncTg, 1500); syncTg();
async function sendTg(kind) {
  if (!$('#demoTg').checked || !loggedIn() || !window.UI) return;
  try { const r = await UI.api('api/demo/alert', { body: { kind } }); if (r && r.message) UI.toast(r.ok ? 'ok' : 'warn', 'Telegram', r.message); }
  catch (e) { UI.toast('warn', 'Telegram', e.message); }
}

/* ---------- keadaan ---------- */
let st = null, raf = 0, last = 0;
function fresh() {
  return { t: 0, D: +$('#demoSpeed').value, running: false, done: false,
    a: { p: 0, gas: 0, burst: false, burstAt: 0, flags: {} , frags: [] },
    b: { p: 0, gas: 0, used: 0, open: false, flags: {}, alerts: 0 } };
}
function mmss(t) { const s = Math.floor(t); return `00:${String(s).padStart(2, '0')}`; }
function log(side, text, lvl) {
  const ol = q(side, 'log'); const li = document.createElement('li'); li.className = lvl || '';
  li.innerHTML = `<time>${mmss(st.t)}</time>${text}`; ol.prepend(li); while (ol.children.length > 5) ol.lastChild.remove();
}
function setState(side, text, lvl) { const el = q(side, 'state'); el.textContent = text; el.className = 'dp-state ' + (lvl || ''); }
function phone(title, body, lvl) {
  const ph = q('b', 'phone'); ph.hidden = false; ph.className = 'dp-phone show ' + (lvl || '');
  q('b', 'phT').textContent = title; q('b', 'phB').textContent = body;
  clearTimeout(phone.to); phone.to = setTimeout(() => ph.classList.remove('show'), 3800);
}

/* ---------- gambar ---------- */
function bubbles(side, rate, dt) {
  const g = q(side, 'bubbles'); if (!g) return;
  if (Math.random() < rate * dt * 30) {
    const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', 80 + Math.random() * 80); c.setAttribute('cy', 272); c.setAttribute('r', 1.5 + Math.random() * 3);
    c.setAttribute('class', 'bub'); c._v = 30 + Math.random() * 40; g.appendChild(c);
  }
  for (const c of Array.from(g.children)) { const y = +c.getAttribute('cy') - c._v * dt; if (y < 186) c.remove(); else c.setAttribute('cy', y.toFixed(1)); }
}
function draw(side, s) {
  const p = Math.min(1, s.p);
  q(side, 'needle').setAttribute('transform', `rotate(${(-90 + 180 * p).toFixed(1)} 64 64)`);
  q(side, 'pct').textContent = Math.round(p * 100) + '%';
  q(side, 'pct').className = p >= BAHAYA ? 'bad' : p >= SIAGA ? 'warn' : '';
  q(side, 'gasv').textContent = Math.round(s.gas).toLocaleString('id-ID') + ' mL';
  q(side, 'gas').style.opacity = (0.08 + p * 0.55).toFixed(2);
  q(side, 'foam').setAttribute('height', (8 + p * 10).toFixed(1));
  const bottle = q(side, 'bottle');
  if (!s.burst) {
    const sx = 1 + 0.07 * p * p, shake = side === 'a' && p > BAHAYA && !reduce ? (Math.random() - .5) * 4 * (p - BAHAYA) / .15 : 0;
    bottle.setAttribute('transform', `translate(${(120 * (1 - sx) + shake).toFixed(2)} 0) scale(${sx.toFixed(3)} 1)`);
  }
  if (side === 'a') q('a', 'cracks').style.opacity = p > .82 ? Math.min(1, (p - .82) / .15).toFixed(2) : 0;
  if (side === 'b') {
    q('b', 'used').textContent = Math.round(s.used).toLocaleString('id-ID') + ' mL';
    q('b', 'alerts').textContent = s.alerts ? `${s.alerts} terkirim` : 'belum ada';
    const led = q('b', 'led'); led.setAttribute('class', p >= BAHAYA ? 'led bad' : p >= SIAGA ? 'led warn' : 'led ok');
    q('b', 'waves').style.opacity = s.flags.siaga && st.t - s.flags.siagaT < 3 ? 1 : 0;
    q('b', 'valveH').setAttribute('transform', s.open ? 'rotate(90)' : 'rotate(0)');
    q('b', 'flow').style.opacity = s.open ? 1 : 0;
    const fl = q('b', 'flame'); const f = s.open ? Math.min(1, .45 + s.flowRate * st.D / 3) : 0;
    fl.style.transform = `scale(${(f * (0.9 + Math.random() * .2)).toFixed(2)})`; fl.style.opacity = f ? 1 : 0;
  }
}
function explode() {
  const s = st.a; s.burst = true; s.burstAt = st.t;
  q('a', 'bottle').style.opacity = 0;
  const g = q('a', 'frags'); g.innerHTML = '';
  const pieces = [];
  for (let i = 0; i < 26; i++) {
    const el = document.createElementNS(NS, 'path'); const w = 6 + Math.random() * 16, h = 6 + Math.random() * 18;
    const liquid = i % 3 === 0;
    el.setAttribute('d', liquid ? `M0 0 q${w / 2} ${-h / 2} ${w} 0 q${-w / 2} ${h} ${-w} 0z` : `M0 0 l${w} ${h * .2} l${-w * .3} ${h} z`);
    el.setAttribute('class', liquid ? 'frag liq' : 'frag');
    const ang = Math.random() * Math.PI * 2, sp = 140 + Math.random() * 260;
    pieces.push({ el, x: 120 + (Math.random() - .5) * 60, y: 170 + (Math.random() - .5) * 120, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 160, r: Math.random() * 360, vr: (Math.random() - .5) * 720 });
    g.appendChild(el);
  }
  const cap = document.createElementNS(NS, 'rect'); cap.setAttribute('width', 48); cap.setAttribute('height', 20); cap.setAttribute('rx', 4); cap.setAttribute('class', 'cap'); g.appendChild(cap);
  pieces.push({ el: cap, x: 96, y: 38, vx: 60, vy: -520, r: 0, vr: 540 });
  s.frags = pieces;
  const boom = q('a', 'boom'); boom.classList.remove('pop'); void boom.getBBox(); boom.classList.add('pop');
  const fl = q('a', 'flashEl'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  if (!reduce) { stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake'); }
  boomSound();
  setState('a', 'PECAH', 'bad'); log('a', '<b>Botol pecah.</b> Gas dan isi tumpah; di dapur sungguhan bisa memicu api.', 'bad');
  sendTg('bahaya');
}
function stepFrags(dt) {
  for (const f of st.a.frags) {
    f.vy += 900 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.r += f.vr * dt;
    if (f.y > 272) { f.y = 272; f.vy *= -.25; f.vx *= .6; f.vr *= .5; }
    f.el.setAttribute('transform', `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${f.r.toFixed(0)})`);
  }
}

/* ---------- langkah simulasi ---------- */
function prodRate(t, D) { const u = Math.min(1.4, t / D); return 1.25 / D * (0.35 + 0.95 * u); }   // % batas per detik, makin cepat
function tick(now) {
  const dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
  if (st.running) {
    st.t += dt; const D = st.D, r = prodRate(st.t, D);
    /* kiri: tidak ada yang melihat */
    const A = st.a;
    if (!A.burst) {
      A.p += r * dt; A.gas += r * dt * 2400;
      if (!A.flags.start && st.t > .6) { A.flags.start = 1; log('a', 'Bakteri mulai menghasilkan gas.'); setState('a', 'Gas terbentuk', ''); }
      if (!A.flags.siaga && A.p >= SIAGA) { A.flags.siaga = 1; log('a', 'Tekanan 60%. <b>Tidak ada yang tahu.</b>', 'warn'); setState('a', 'Tekanan naik', 'warn'); }
      if (!A.flags.crack && A.p >= .88) { A.flags.crack = 1; log('a', 'Dinding menggelembung dan retak.', 'bad'); setState('a', 'Retak!', 'bad'); tone(160, .25, 'sawtooth', .06); }
      if (A.p >= 1) explode();
      bubbles('a', r * D, dt);
    } else stepFrags(dt);
    /* kanan: BIO-LOOP berjaga */
    const B = st.b;
    let out = 0;
    if (B.open) out = Math.max(0, (B.p - HOLD)) * 13 / D;
    B.flowRate = out;
    B.p = Math.max(0, B.p + (r - out) * dt); B.gas += r * dt * 2400; B.used += out * dt * 2400;
    if (!B.flags.start && st.t > .6) { B.flags.start = 1; log('b', 'Sensor IoT membaca tekanan & metana tiap detik.'); setState('b', 'Dipantau', 'ok'); }
    if (!B.flags.siaga && B.p >= SIAGA) {
      B.flags.siaga = 1; B.flags.siagaT = st.t; B.alerts++; ding();
      log('b', '<b>SIAGA</b> dikirim ke Telegram petugas.', 'warn'); setState('b', 'SIAGA', 'warn');
      phone('⚠️ SIAGA — tekanan gas naik', 'Tekanan 60% batas aman. Tindakan: nyalakan kompor atau buka katup ke kantong gas.', 'warn');
      sendTg('siaga');
    }
    if (!B.open && B.p >= VALVE) { B.open = true; whoosh(); log('b', 'Katup otomatis terbuka: gas mengalir ke kompor.', 'ok'); setState('b', 'Katup terbuka', 'ok'); }
    if (B.open && !B.flags.stable && B.p < .55 && st.t > (B.flags.siagaT || 0) + 2) {
      B.flags.stable = 1; B.alerts++; ding();
      log('b', `<b>Aman.</b> Tekanan stabil ±${Math.round(B.p * 100)}%, api biru menyala.`, 'ok'); setState('b', 'AMAN · gas dipakai', 'ok');
      phone('✅ Tekanan kembali normal', 'Gas dialirkan ke kompor SPPG. Energi dipakai, bukan meledak.', 'ok');
    }
    bubbles('b', r * D, dt);
    if (hiss && audioOn()) { const hp = Math.max(A.burst ? 0 : A.p, 0); hiss.g.gain.setTargetAtTime(Math.min(.12, hp * hp * .14), ac.currentTime, .1); hiss.bp.frequency.setTargetAtTime(1500 + hp * 3000, ac.currentTime, .1); }
    else if (hiss) hiss.g.gain.setTargetAtTime(0, ac.currentTime, .05);
    if (A.burst && st.t - A.burstAt > 4 && !st.done) finish();
    draw('a', A); draw('b', B);
  }
  raf = requestAnimationFrame(tick);
}
function finish() {
  st.done = true; st.running = false; if (hiss) hiss.g.gain.setTargetAtTime(0, ac.currentTime, .1);
  $('#demoStart').textContent = '▶ Mulai lagi';
  const s = $('#demoSummary'); s.hidden = false;
  s.innerHTML = `<div><b class="bad">Tanpa pengawasan</b><span>pecah di detik ${Math.round(st.a.burstAt)}, energinya terbuang</span></div>
    <div><b class="ok">Dengan BIO-LOOP</b><span>peringatan di detik ${Math.round(st.b.flags.siagaT || 0)}, ${Math.round(st.b.used).toLocaleString('id-ID')} mL gas dipakai memasak</span></div>
    <p>Bedanya bukan alatnya, tetapi <b>ada yang mengawasi</b>. Sisa makan siang hari ini, api dapur SPPG esok pagi.</p>`;
}
function reset() {
  st = fresh();
  for (const side of ['a', 'b']) {
    P[side].innerHTML = panelHTML(side);
  }
  $('#demoSummary').hidden = true; stage.classList.remove('shake');
  $('#demoStart').textContent = '▶ Mulai simulasi';
  draw('a', st.a); draw('b', st.b);
}
reset();
raf = requestAnimationFrame(t => { last = t; tick(t); });

$('#demoStart').addEventListener('click', () => {
  ensureAudio(); if (ac && ac.state === 'suspended') ac.resume();
  if (st.done || st.t > 0) reset();
  st.D = +$('#demoSpeed').value; st.running = true; last = performance.now();
  $('#demoStart').textContent = '⏸ Berjalan…';
});
$('#demoReset').addEventListener('click', reset);
$('#demoSpeed').addEventListener('change', () => { if (!st.running) st.D = +$('#demoSpeed').value; });
const sec = $('#simulasi');
$('#demoFull').addEventListener('click', async () => {
  if (document.fullscreenElement) { await document.exitFullscreen().catch(() => {}); return; }
  if (sec.requestFullscreen) { try { await sec.requestFullscreen(); return; } catch (e) { /* lanjut ke mode CSS */ } }
  document.body.classList.toggle('demo-present');
});
document.addEventListener('fullscreenchange', () => { sec.classList.toggle('is-full', document.fullscreenElement === sec); $('#demoFull').textContent = document.fullscreenElement ? '✕ Keluar layar penuh' : '⛶ Layar penuh'; });
/* alamat /simulasi langsung membuka bagian ini */
if (/\/simulasi\/?$/.test(location.pathname)) {
  document.body.classList.add('demo-route');
  setTimeout(() => sec.scrollIntoView({ behavior: 'instant', block: 'start' }), 60);
}
})();
