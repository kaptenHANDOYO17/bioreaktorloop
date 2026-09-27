'use strict';
/* Akun & sesi: kata sandi di-hash scrypt, sesi berupa token bertanda tangan HMAC di cookie HttpOnly. */
const crypto = require('crypto');
const cfg = require('./config');
const db = require('./db');

const COOKIE = 'bl_sess';
const SESSION_DAYS = 7;
const MAX_FAILED = 5, LOCK_MIN = 10;

/* ---------- kata sandi ---------- */
function scrypt(pw, salt, N = 16384) {
  return new Promise((res, rej) => crypto.scrypt(String(pw), salt, 32, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? rej(e) : res(k)));
}
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const k = await scrypt(pw, salt);
  return `scrypt$16384$${salt.toString('base64')}$${k.toString('base64')}`;
}
async function verifyPassword(pw, stored) {
  try {
    const [alg, N, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const k = await scrypt(pw, Buffer.from(salt, 'base64'), +N);
    const h = Buffer.from(hash, 'base64');
    return h.length === k.length && crypto.timingSafeEqual(h, k);
  } catch (e) { return false; }
}
const DUMMY_HASH = 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/* ---------- token ---------- */
const b64u = b => Buffer.from(b).toString('base64url');
function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', cfg.SESSION_SECRET).update(body).digest('base64url');
  return body + '.' + mac;
}
function unsign(tok) {
  if (!tok || typeof tok !== 'string' || !tok.includes('.')) return null;
  const [body, mac] = tok.split('.');
  const good = crypto.createHmac('sha256', cfg.SESSION_SECRET).update(body).digest('base64url');
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch (e) { return null; }
}
function parseCookies(h) {
  const o = {}; String(h || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}
function cookieHeader(req, value, maxAgeSec) {
  const secure = cfg.IS_VERCEL || req.headers['x-forwarded-proto'] === 'https';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

/* ---------- validasi ---------- */
const USER_RE = /^[A-Za-z0-9_.-]{3,32}$/;
function checkNewPassword(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'Kata sandi minimal 8 karakter.';
  if (pw.length > 200) return 'Kata sandi terlalu panjang.';
  if (/^(.)\1+$/.test(pw) || /^(12345678|password|kata sandi|qwertyui)/i.test(pw)) return 'Kata sandi terlalu mudah ditebak.';
  return null;
}
function publicUser(u) {
  if (!u) return null;
  return { id: +u.id, username: u.username, name: u.name || u.username, role: u.role, status: u.status, must_change: !!u.must_change, created_at: u.created_at, last_login: u.last_login };
}

/* ---------- akun admin bawaan ---------- */
let ensured = null;
function ensureAdmin() {
  if (ensured) return ensured;
  ensured = (async () => {
    await db.init();
    await emergencyReset();
    if (await db.countAdmins() > 0) return;
    const existing = await db.userByName(cfg.ADMIN_USERNAME);
    if (existing) { await db.updateUser(existing.id, { role: 'admin', status: 'active' }); return; }
    await db.createUser({ username: cfg.ADMIN_USERNAME, name: cfg.ADMIN_USERNAME, password_hash: await hashPassword(cfg.ADMIN_PASSWORD), role: 'admin', status: 'active', must_change: true });
    console.log(`[auth] Akun admin "${cfg.ADMIN_USERNAME}" dibuat. Segera ganti kata sandinya.`);
  })();
  ensured.catch(() => { ensured = null; });
  return ensured;
}

/* Pemulihan bila admin lupa kata sandi: isi ADMIN_RESET_PASSWORD di Environment Variables, redeploy,
   masuk dengan kata sandi itu, lalu HAPUS lagi variabelnya. Hanya dijalankan sekali per nilai. */
async function emergencyReset() {
  const pw = process.env.ADMIN_RESET_PASSWORD; if (!pw) return;
  const mark = crypto.createHash('sha256').update('reset|' + pw).digest('hex');
  if ((await db.kvGet('admin_reset')) === mark) return;
  const hash = await hashPassword(pw);
  let u = await db.userByName(cfg.ADMIN_USERNAME);
  if (!u) u = await db.createUser({ username: cfg.ADMIN_USERNAME, name: cfg.ADMIN_USERNAME, password_hash: hash, role: 'admin', status: 'active', must_change: true });
  else await db.updateUser(u.id, { password_hash: hash, role: 'admin', status: 'active', must_change: true, pw_version: (u.pw_version || 1) + 1, failed: 0, locked_until: null });
  await db.kvSet('admin_reset', mark);
  console.warn(`[auth] Kata sandi admin "${cfg.ADMIN_USERNAME}" direset lewat ADMIN_RESET_PASSWORD. Hapus variabel itu setelah masuk.`);
}

/* ---------- alur masuk ---------- */
async function login(username, password) {
  await ensureAdmin();
  const u = await db.userByName(String(username || '').trim());
  if (!u) { await verifyPassword(password, DUMMY_HASH); return { ok: false, message: 'Nama pengguna atau kata sandi salah.' }; }
  if (u.locked_until && new Date(u.locked_until).getTime() > Date.now()) {
    const m = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60000);
    return { ok: false, message: `Terlalu banyak percobaan. Coba lagi dalam ${m} menit.` };
  }
  const good = await verifyPassword(password, u.password_hash);
  if (!good) {
    const failed = (u.failed || 0) + 1;
    await db.updateUser(u.id, failed >= MAX_FAILED ? { failed: 0, locked_until: Date.now() + LOCK_MIN * 60000 } : { failed });
    return { ok: false, message: failed >= MAX_FAILED ? `Akun dikunci ${LOCK_MIN} menit karena ${MAX_FAILED} kali salah.` : 'Nama pengguna atau kata sandi salah.' };
  }
  if (u.status === 'pending') return { ok: false, message: 'Akun Anda menunggu persetujuan admin.' };
  if (u.status !== 'active') return { ok: false, message: 'Akun ini dinonaktifkan. Hubungi admin.' };
  const nu = await db.updateUser(u.id, { failed: 0, locked_until: null, last_login: Date.now() });
  const token = sign({ uid: +u.id, pv: u.pw_version || 1, exp: Date.now() + SESSION_DAYS * 864e5 });
  return { ok: true, user: publicUser(nu), token };
}
async function register({ username, name, password }) {
  await ensureAdmin();
  username = String(username || '').trim();
  if (!USER_RE.test(username)) return { ok: false, message: 'Nama pengguna 3-32 karakter: huruf, angka, titik, garis bawah, atau strip.' };
  const bad = checkNewPassword(password); if (bad) return { ok: false, message: bad };
  const u = await db.createUser({ username, name: String(name || username).trim().slice(0, 80), password_hash: await hashPassword(password), role: 'user', status: 'pending' });
  if (!u) return { ok: false, message: 'Nama pengguna sudah dipakai.' };
  return { ok: true, user: publicUser(u) };
}
/* Membaca sesi dari cookie; memastikan akun masih aktif dan kata sandi belum diganti. */
async function currentUser(req) {
  const p = unsign(parseCookies(req.headers.cookie)[COOKIE]);
  if (!p) return null;
  const u = await db.userById(p.uid);
  if (!u || u.status !== 'active' || (u.pw_version || 1) !== p.pv) return null;
  return u;
}
async function changePassword(u, oldPw, newPw) {
  if (!(await verifyPassword(oldPw, u.password_hash))) return { ok: false, message: 'Kata sandi lama salah.' };
  const bad = checkNewPassword(newPw); if (bad) return { ok: false, message: bad };
  if (oldPw === newPw) return { ok: false, message: 'Kata sandi baru harus berbeda.' };
  const nu = await db.updateUser(u.id, { password_hash: await hashPassword(newPw), must_change: false, pw_version: (u.pw_version || 1) + 1 });
  const token = sign({ uid: +u.id, pv: nu.pw_version, exp: Date.now() + SESSION_DAYS * 864e5 });
  return { ok: true, user: publicUser(nu), token };
}
function tempPassword() {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(12), b => a[b % a.length]).join('');
}

module.exports = { COOKIE, SESSION_DAYS, hashPassword, verifyPassword, sign, unsign, parseCookies, cookieHeader, login, register, currentUser, changePassword,
  ensureAdmin, publicUser, checkNewPassword, tempPassword, USER_RE };
