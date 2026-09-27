/* =====================================================================
   MBG-BIOLOOP AI — jendela asisten (Gemini lewat server)
   Riwayat obrolan disimpan di database per akun, jadi asisten tetap ingat
   walau pindah perangkat, halaman ditutup, atau server dijalankan ulang.
   ===================================================================== */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const { esc, api, toast, openModal, closeModal, confirmBox } = window.UI;
const chat = $('#chat'), body = $('#chatBody'), input = $('#chatIn'), form = $('#chatForm'), sub = $('#chatSub');
const menuBtn = $('#chatMenu'), menuBox = $('#chatMenuBox'), fab = $('.fab'), chips = $('#chips');
const sendBtn = form.querySelector('.send');

let loadedFor = undefined, busy = false, health = null;
const ACT_LABEL = {
  tambah_buffer: 'Buffer ditambahkan', masukkan_umpan: 'Umpan dimasukkan', kuras_endapan: 'Endapan dikuras', atur_kompor: 'Kompor diatur',
  atur_katup: 'Katup diatur', mode_otomatis: 'Mode diubah', ingat_fakta: 'Disimpan ke ingatan', lihat_status: 'Membaca sensor',
  lihat_tren: 'Membaca tren', lihat_sisa_pangan: 'Membaca data smart bin', lihat_kejadian: 'Membaca catatan', hitung_kebutuhan_sppg: 'Menghitung kebutuhan', lihat_perangkat: 'Memeriksa perangkat'
};
const isServer = () => window.APPSTATE && APPSTATE.mode === 'server';
const user = () => window.AUTH && AUTH.user;
/* Pengunjung tanpa akun tetap bisa bertanya; ingatannya disimpan per browser dengan kode acak ini. */
let guestId = null;
try { guestId = localStorage.getItem('bl_guest'); } catch (e) { /* abaikan */ }
if (!/^[a-z0-9]{16,40}$/i.test(guestId || '')) {
  guestId = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem('bl_guest', guestId); } catch (e) { /* abaikan */ }
}
const gq = () => user() ? '' : '?guestId=' + guestId;
const timeStr = t => new Date(t || Date.now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

function scrollEnd() { body.scrollTop = body.scrollHeight; }
function bubble(role, text, opt = {}) {
  const el = document.createElement('div');
  el.className = 'msg ' + (role === 'user' ? 'me' : role === 'sys' ? 'sys' : 'bot') + (opt.err ? ' err' : '');
  if (role === 'sys') el.textContent = text;
  else {
    el.innerHTML = (role === 'user' ? `<p>${esc(text).replace(/\n/g, '<br>')}</p>` : MD.render(text)) + (opt.at !== false ? `<time>${timeStr(opt.at)}</time>` : '');
    if (opt.actions && opt.actions.length) {
      const seen = new Set();
      const c = opt.actions.filter(a => { if (seen.has(a.name)) return false; seen.add(a.name); return true; })
        .map(a => `<span class="${a.ok === false ? 'no' : ''}">${a.ok === false ? '✕' : '✓'} ${esc(ACT_LABEL[a.name] || a.name)}</span>`).join('');
      el.insertAdjacentHTML('beforeend', `<div class="acts">${c}</div>`);
    }
  }
  body.appendChild(el); scrollEnd(); return el;
}
function typing() {
  const el = document.createElement('div'); el.className = 'msg bot typing'; el.setAttribute('aria-label', 'Asisten sedang mengetik');
  el.innerHTML = '<i></i><i></i><i></i>'; body.appendChild(el); scrollEnd(); return el;
}
function welcome() {
  const u = user();
  bubble('bot', `Halo${u ? ' ' + u.name : ''}! Saya **Asisten BIOLOOP**. Saya bisa membaca sensor bioreaktor, menjelaskan kenapa pH turun atau gas berkurang, menghitung kebutuhan SPPG Anda, dan menjalankan perintah seperti menambah buffer.\n\nSaya juga mengingat obrolan kita sebelumnya. Mau mulai dari mana?`, { at: false });
}

function updateSub() {
  if (!isServer()) { sub.textContent = 'Menyambungkan ke server…'; return; }
  const ai = health && health.ai;
  if (ai && !ai.enabled) { sub.textContent = 'Asisten belum diaktifkan admin'; return; }
  sub.textContent = user() ? `Gemini · ingat percakapan ${user().name}` : 'Gemini · pengunjung umum';
}
document.addEventListener('bioloop:health', e => { health = e.detail; updateSub(); });
document.addEventListener('bioloop:auth', () => { updateSub(); if (!chat.hidden) load(true); else loadedFor = undefined; });

async function load(force) {
  const key = isServer() ? (user() ? user().id : 'g') : 'local';
  if (!force && loadedFor === key) return; loadedFor = key;
  chips.hidden = false; form.hidden = false; body.innerHTML = '';
  if (!isServer()) { welcome(); bubble('sys', 'Menyambungkan ke server… Asisten bisa menjawab begitu tersambung.'); loadedFor = undefined; return; }
  try {
    const h = await api('api/chat/history' + gq());
    if (!user() && !(h.messages && h.messages.length)) { welcome(); bubble('sys', 'Anda bertanya sebagai pengunjung. Masuk dengan akun petugas agar asisten bisa menjalankan perintah kendali.'); return; }
    if (h.summary || (h.messages && h.messages.length)) {
      if (h.total > h.messages.length) bubble('sys', `${h.total - h.messages.length} pesan lama sudah diringkas ke ingatan asisten`);
      h.messages.forEach(m => bubble(m.r === 'user' ? 'user' : 'bot', m.text, { at: m.at }));
      bubble('sys', 'Obrolan sebelumnya dimuat. Asisten masih mengingatnya.');
    } else welcome();
  } catch (e) { welcome(); }
}

async function send(text) {
  text = String(text || '').trim(); if (!text || busy) return;
  bubble('user', text); input.value = ''; autosize();
  if (!isServer()) { bubble('sys', 'Masih menyambungkan ke server. Tunggu beberapa detik lalu kirim lagi.'); if (window.APPSTATE && APPSTATE.retryNow) APPSTATE.retryNow(); return; }
  busy = true; sendBtn.disabled = true; const t = typing();
  try {
    const j = await api('api/chat', { body: { message: text, source: window.APPSTATE && APPSTATE.source, guestId: user() ? undefined : guestId } });
    t.remove();
    bubble('bot', j.reply || '(tidak ada jawaban)', { actions: j.actions, err: !!j.error });
    if (j.actions && j.actions.some(a => !/^lihat_|^hitung_|^ingat_/.test(a.name))) toast('ok', 'Asisten menjalankan perintah', j.actions.map(a => ACT_LABEL[a.name] || a.name).join(', '));
  } catch (e) {
    t.remove(); bubble('bot', e.status === 401 ? 'Sesi Anda berakhir. Silakan masuk lagi.' : e.message, { err: true });
    if (e.status === 401) AUTH.refresh();
  }
  busy = false; sendBtn.disabled = false; input.focus();
}

function autosize() { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; }
input.addEventListener('input', autosize);
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
form.addEventListener('submit', e => { e.preventDefault(); send(input.value); });
chips.addEventListener('click', e => { const b = e.target.closest('button'); if (b) send(b.textContent); });

function open() { chat.hidden = false; fab.classList.add('hide'); updateSub(); load(); setTimeout(() => { if (!form.hidden) input.focus(); }, 60); }
function close() { chat.hidden = true; fab.classList.remove('hide'); menuBox.hidden = true; fab.focus(); }
document.querySelectorAll('[data-open-chat]').forEach(b => b.addEventListener('click', open));
$('#chatClose').addEventListener('click', close);
chat.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('modal').hidden) { e.stopPropagation(); close(); } });

menuBtn.addEventListener('click', e => { e.stopPropagation(); menuBox.hidden = !menuBox.hidden; menuBtn.setAttribute('aria-expanded', !menuBox.hidden); });
document.addEventListener('click', e => { if (!menuBox.hidden && !menuBox.contains(e.target)) { menuBox.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); } });

$('#chatMemory').addEventListener('click', async () => {
  menuBox.hidden = true;
  if (!isServer()) return openModal('Ingatan asisten', '<p>Ingatan tampil setelah website tersambung ke server.</p>');
  try {
    const h = await api('api/chat/history' + gq());
    const facts = h.facts && h.facts.length ? `<ul>${h.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p class="muted">Belum ada fakta khusus. Katakan misalnya "ingat, SPPG kami melayani 3.000 porsi".</p>';
    const sum = h.summary ? `<p>${esc(h.summary)}</p>` : '<p class="muted">Belum ada ringkasan. Ringkasan dibuat otomatis saat obrolan sudah panjang.</p>';
    openModal('Yang diingat asisten', `<div class="mem"><p>Total <b>${h.total || 0}</b> pesan tersimpan untuk ${user() ? `akun <b>${esc(user().username)}</b>` : 'browser ini'}. Pesan terbaru dikirim utuh ke Gemini, yang lebih lama diringkas.</p><h5>Fakta tentang Anda</h5>${facts}<h5>Ringkasan obrolan lama</h5>${sum}</div>`);
  } catch (e) { toast('bad', 'Gagal memuat ingatan', e.message); }
});
$('#chatForget').addEventListener('click', async () => {
  menuBox.hidden = true;
  if (!isServer()) return;
  if (!(await confirmBox('Lupakan percakapan?', 'Semua pesan, ringkasan, dan fakta yang diingat asisten untuk ' + (user() ? 'akun Anda' : 'browser ini') + ' akan dihapus. Tindakan ini tidak bisa dibatalkan.', 'Hapus ingatan', true))) return;
  try { await api('api/chat/forget', { body: { guestId: user() ? undefined : guestId } }); } catch (e) { /* abaikan */ }
  body.innerHTML = ''; welcome(); bubble('sys', 'Ingatan dihapus. Kita mulai dari awal.');
});
})();
