/* Komponen bersama: toast, modal, fetch JSON. Dipakai halaman utama dan panel admin. */
(function () {
'use strict';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { ok: '✓', warn: '!', bad: '✕', info: 'i' };

function ensure() {
  if (!document.getElementById('toasts')) document.body.insertAdjacentHTML('beforeend', '<div id="toasts" class="toasts" aria-live="polite"></div>');
  if (!document.getElementById('modal')) document.body.insertAdjacentHTML('beforeend', '<div class="modal" id="modal" hidden><div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><button class="x" id="modalClose" aria-label="Tutup">×</button><h2 id="modalTitle"></h2><div id="modalBody" class="md"></div></div></div>');
}
ensure();
const toastsEl = document.getElementById('toasts');
const modal = document.getElementById('modal'), modalTitle = document.getElementById('modalTitle'), modalBody = document.getElementById('modalBody');
const recent = {};
function toast(lvl, title, body) {
  const now = Date.now(); if (recent[title + body] && now - recent[title + body] < 6000) return; recent[title + body] = now;
  while (toastsEl.children.length >= 3) toastsEl.firstChild.remove();
  const el = document.createElement('div'); el.className = 'toast ' + (lvl || 'info');
  el.innerHTML = `<i aria-hidden="true">${ICON[lvl] || 'i'}</i><div><b>${esc(title)}</b>${body ? `<p>${esc(body)}</p>` : ''}</div>`;
  toastsEl.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, lvl === 'bad' ? 9000 : 5000);
}
let ret = null, onClose = null;
function openModal(title, html, cb, wide) {
  if (modal.hidden) ret = document.activeElement;
  onClose = cb || null;
  modalTitle.textContent = title; modalBody.innerHTML = html; modal.hidden = false;
  modal.querySelector('.modal-card').classList.toggle('wide', !!wide);
  document.body.style.overflow = 'hidden'; modalBody.parentElement.scrollTop = 0;
  setTimeout(() => { const f = modalBody.querySelector('input:not([type=hidden]),select,textarea') || document.getElementById('modalClose'); f.focus(); }, 30);
  return modalBody;
}
function closeModal() {
  if (modal.hidden) return; modal.hidden = true; document.body.style.overflow = '';
  const cb = onClose; onClose = null; if (cb) cb();
  if (ret && ret.focus) ret.focus();
}
document.getElementById('modalClose').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) { e.stopPropagation(); closeModal(); } }, true);

/* fetch JSON dengan pesan galat berbahasa Indonesia */
async function api(path, opt = {}) {
  const o = { method: opt.method || (opt.body ? 'POST' : 'GET'), headers: {}, credentials: 'same-origin', cache: 'no-store' };
  if (opt.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opt.body); }
  let r;
  try { r = await fetch(path, o); } catch (e) { const err = new Error('Tidak bisa menghubungi server. Periksa koneksi internet.'); err.status = 0; throw err; }
  let j = null; try { j = await r.json(); } catch (e) { /* bukan JSON */ }
  if (!r.ok) {
    const nice = { 502: 'Server sedang dimulai ulang. Coba lagi sebentar.', 503: 'Server sedang sibuk. Coba lagi sebentar.', 504: 'Server terlalu lama menjawab (504). Muat ulang halaman; bila berulang, buka menu Telegram & notifikasi → Cek koneksi.' }[r.status];
    const err = new Error((j && (j.message || j.error)) || nice || ('Kesalahan ' + r.status)); err.status = r.status; err.data = j; throw err;
  }
  return j;
}
function confirmBox(title, text, okLabel, danger) {
  return new Promise(res => {
    let done = false;
    const b = openModal(title, `<p>${esc(text)}</p><div class="row"><button class="btn ${danger ? 'btn-merah' : 'btn-gold'} sm" data-ok>${esc(okLabel || 'Ya')}</button><button class="btn btn-line sm" data-no>Batal</button></div>`, () => { if (!done) res(false); });
    b.querySelector('[data-ok]').addEventListener('click', () => { done = true; closeModal(); res(true); });
    b.querySelector('[data-no]').addEventListener('click', () => { done = true; closeModal(); res(false); });
  });
}
const fmtTime = (v, opt) => v ? new Date(v).toLocaleString('id-ID', opt || { dateStyle: 'medium', timeStyle: 'short' }) : '–';
window.UI = { esc, toast, openModal, closeModal, api, confirmBox, fmtTime, ICON };
})();
