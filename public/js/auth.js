/* Masuk, daftar, ganti kata sandi, dan tombol akun di navigasi. */
(function () {
'use strict';
const { esc, toast, openModal, closeModal, api } = window.UI;
const AUTH = { user: null, info: { registration: true, publicDashboard: true }, available: true };
const emit = () => document.dispatchEvent(new CustomEvent('bioloop:auth', { detail: AUTH.user }));
const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

AUTH.refresh = async function () {
  try {
    const j = await api('api/me');
    AUTH.user = j.user; AUTH.info = { registration: j.registration, publicDashboard: j.publicDashboard, site: j.site }; AUTH.available = true;
  } catch (e) { AUTH.user = null; AUTH.available = false; }
  render(); emit(); return AUTH.user;
};

function loginHtml(tab, msg) {
  const reg = AUTH.info.registration;
  return `<div class="auth">
    ${msg ? `<p class="auth-msg">${esc(msg)}</p>` : ''}
    <div class="seg" role="tablist">
      <button type="button" role="tab" data-t="in" aria-selected="${tab !== 'up'}">Masuk</button>
      ${reg ? `<button type="button" role="tab" data-t="up" aria-selected="${tab === 'up'}">Daftar akun baru</button>` : ''}
    </div>
    <form id="fIn" class="stack" ${tab === 'up' ? 'hidden' : ''}>
      <label>Nama pengguna<input name="username" class="sel" autocomplete="username" required autocapitalize="none"></label>
      <label>Kata sandi<span class="pw"><input name="password" type="password" class="sel" autocomplete="current-password" required><button type="button" class="eye" aria-label="Tampilkan kata sandi">👁</button></span></label>
      <p class="err" hidden></p>
      <button class="btn btn-gold full">Masuk</button>
      <p class="muted small">Lupa kata sandi? Minta admin mereset dari panel admin.</p>
    </form>
    ${reg ? `<form id="fUp" class="stack" ${tab === 'up' ? '' : 'hidden'}>
      <label>Nama lengkap<input name="name" class="sel" autocomplete="name" required maxlength="80"></label>
      <label>Nama pengguna<input name="username" class="sel" autocomplete="username" required pattern="[A-Za-z0-9_.\\-]{3,32}" title="3-32 karakter: huruf, angka, titik, garis bawah, strip" autocapitalize="none"></label>
      <label>Kata sandi (min. 8 karakter)<span class="pw"><input name="password" type="password" class="sel" autocomplete="new-password" required minlength="8"><button type="button" class="eye" aria-label="Tampilkan kata sandi">👁</button></span></label>
      <p class="err" hidden></p>
      <button class="btn btn-gold full">Daftar</button>
      <p class="muted small">Akun baru aktif setelah disetujui admin SPPG.</p>
    </form>` : ''}
  </div>`;
}
function bindEyes(root) { root.querySelectorAll('.eye').forEach(b => b.addEventListener('click', () => { const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; })); }
function showErr(form, m) { const e = form.querySelector('.err'); e.textContent = m; e.hidden = !m; }

AUTH.openLogin = function (msg, tab) {
  return new Promise(resolve => {
    let ok = false;
    const b = openModal('Akun MBG-BIOLOOP', loginHtml(tab, msg), () => resolve(ok));
    bindEyes(b);
    b.querySelectorAll('[data-t]').forEach(t => t.addEventListener('click', () => {
      b.querySelectorAll('[data-t]').forEach(x => x.setAttribute('aria-selected', x === t));
      b.querySelector('#fIn').hidden = t.dataset.t !== 'in'; const up = b.querySelector('#fUp'); if (up) up.hidden = t.dataset.t !== 'up';
      (t.dataset.t === 'in' ? b.querySelector('#fIn') : up).querySelector('input').focus();
    }));
    b.querySelector('#fIn').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target, btn = f.querySelector('button.btn'); btn.disabled = true; showErr(f, '');
      try {
        const j = await api('api/auth/login', { body: { username: f.username.value.trim(), password: f.password.value } });
        AUTH.user = j.user; ok = true; closeModal(); render(); emit();
        toast('ok', `Selamat datang, ${j.user.name}`, j.user.role === 'admin' ? 'Anda masuk sebagai admin.' : '');
        if (j.user.must_change) setTimeout(() => AUTH.openPassword('Kata sandi Anda masih bawaan/sementara. Demi keamanan, ganti sekarang.'), 400);
      } catch (err) { showErr(f, err.message); btn.disabled = false; }
    });
    const up = b.querySelector('#fUp');
    if (up) up.addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target, btn = f.querySelector('button.btn'); btn.disabled = true; showErr(f, '');
      try {
        const j = await api('api/auth/register', { body: { name: f.name.value.trim(), username: f.username.value.trim(), password: f.password.value } });
        closeModal(); UI.openModal('Pendaftaran terkirim', `<p>${esc(j.message)}</p><p class="muted">Sampaikan nama pengguna <b>${esc(f.username.value.trim())}</b> kepada admin SPPG agar segera disetujui.</p>`);
      } catch (err) { showErr(f, err.message); btn.disabled = false; }
    });
  });
};
/* Memastikan sudah masuk; bila belum, buka jendela masuk. */
AUTH.require = async function (msg) { if (AUTH.user) return true; return AUTH.openLogin(msg || 'Silakan masuk untuk melanjutkan.'); };

AUTH.openPassword = function (msg) {
  const b = openModal('Ganti kata sandi', `${msg ? `<p class="auth-msg">${esc(msg)}</p>` : ''}
    <form id="fPw" class="stack">
      <label>Kata sandi sekarang<span class="pw"><input name="old" type="password" class="sel" autocomplete="current-password" required><button type="button" class="eye" aria-label="Tampilkan">👁</button></span></label>
      <label>Kata sandi baru (min. 8 karakter)<span class="pw"><input name="n1" type="password" class="sel" autocomplete="new-password" required minlength="8"><button type="button" class="eye" aria-label="Tampilkan">👁</button></span></label>
      <label>Ulangi kata sandi baru<input name="n2" type="password" class="sel" autocomplete="new-password" required minlength="8"></label>
      <p class="muted small">Tips: gabungkan 3–4 kata yang mudah Anda ingat, misalnya <i>kompor-biru-sayur-2045</i>.</p>
      <p class="err" hidden></p>
      <button class="btn btn-gold full">Simpan kata sandi</button>
    </form>`);
  bindEyes(b);
  b.querySelector('#fPw').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    if (f.n1.value !== f.n2.value) return showErr(f, 'Kata sandi baru dan ulangannya tidak sama.');
    try { const j = await api('api/auth/password', { body: { old: f.old.value, new: f.n1.value } }); AUTH.user = j.user; closeModal(); render(); emit(); toast('ok', 'Kata sandi diganti', 'Gunakan kata sandi baru saat masuk berikutnya.'); }
    catch (err) { showErr(f, err.message); }
  });
};
AUTH.logout = async function () {
  try { await api('api/auth/logout', { body: {} }); } catch (e) { /* abaikan */ }
  AUTH.user = null; render(); emit(); toast('info', 'Anda sudah keluar', '');
  if (/admin\.html/.test(location.pathname)) location.href = './';
};

/* ---------- tombol akun di navigasi ---------- */
function render() {
  const box = document.getElementById('authBox'); if (!box) return;
  if (!AUTH.available) { box.innerHTML = ''; return; }
  const u = AUTH.user;
  if (!u) { box.innerHTML = '<button class="btn btn-ghost sm" id="btnLogin">Masuk</button>'; box.querySelector('#btnLogin').addEventListener('click', () => AUTH.openLogin()); return; }
  box.innerHTML = `<div class="acct"><button class="acct-btn" aria-haspopup="true" aria-expanded="false"><span class="av">${esc(initials(u.name))}</span><span class="nm">${esc(u.name)}<small>${u.role === 'admin' ? 'Admin' : 'Pengguna'}</small></span></button>
    <div class="acct-menu" hidden>${u.role === 'admin' ? '<a href="admin.html">Panel admin</a>' : ''}<a href="./#dasbor">Dasbor</a><button data-a="pw">Ganti kata sandi</button><button data-a="out" class="danger">Keluar</button></div></div>`;
  const btn = box.querySelector('.acct-btn'), menu = box.querySelector('.acct-menu');
  btn.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', !menu.hidden); });
  document.addEventListener('click', () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
  menu.querySelector('[data-a="pw"]').addEventListener('click', () => AUTH.openPassword());
  menu.querySelector('[data-a="out"]').addEventListener('click', () => AUTH.logout());
}
window.AUTH = AUTH;
AUTH.ready = location.protocol === 'file:' ? Promise.resolve((AUTH.available = false, null)) : AUTH.refresh();
})();
