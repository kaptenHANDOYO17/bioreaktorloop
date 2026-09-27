'use strict';
/* Alat akun dari terminal (tidak perlu masuk ke website).
   Memakai DATABASE_URL di file .env, jadi mengubah akun di database yang SAMA dengan website Vercel
   bila DATABASE_URL-nya sama.

   npm run akun                         → bantuan
   npm run akun -- daftar               → lihat semua akun
   npm run akun -- awal                 → buat/pulihkan akun-akun mudah (lihat AKUN_AWAL di bawah)
   npm run akun -- buat <nama> <sandi> [admin|user] ["Nama Lengkap"]
   npm run akun -- sandi <nama> <sandi-baru>
   npm run akun -- admin <nama>         → jadikan admin
   npm run akun -- user <nama>          → jadikan pengguna biasa
   npm run akun -- aktifkan <nama>      → setujui/aktifkan akun
   npm run akun -- nonaktifkan <nama>
   npm run akun -- hapus <nama>
*/
const cfg = require('../lib/config');
const db = require('../lib/db');
const auth = require('../lib/auth');

/* Akun-akun mudah. Ubah daftar ini sesuai kebutuhan, lalu jalankan: npm run akun -- awal */
const AKUN_AWAL = [
  { username: 'Handoyo', password: '12345',      role: 'admin', name: 'Handoyo' },
  { username: 'admin',   password: 'admin123',   role: 'admin', name: 'Admin SPPG' },
  { username: 'petugas', password: 'petugas123', role: 'user',  name: 'Petugas Dapur' },
  { username: 'gizi',    password: 'gizi123',    role: 'user',  name: 'Ahli Gizi' },
  { username: 'guru',    password: 'guru123',    role: 'user',  name: 'Guru Pendamping' }
];

const pad = (s, n) => String(s == null ? '' : s).padEnd(n).slice(0, n);
function where() {
  if (!cfg.DATABASE_URL) return 'berkas lokal (folder data/) — BUKAN database website online';
  try { const u = new URL(require('../lib/db/pg').normalizeUrl(cfg.DATABASE_URL)); return `PostgreSQL ${u.hostname} (user ${u.username})`; } catch (e) { return 'DATABASE_URL tidak valid: ' + e.message; }
}
async function need(name) { const u = await db.userByName(name); if (!u) throw new Error(`Akun "${name}" tidak ditemukan. Lihat daftar: npm run akun -- daftar`); return u; }

async function upsert({ username, password, role, name }) {
  const hash = await auth.hashPassword(password);
  const u = await db.userByName(username);
  if (u) {
    await db.updateUser(u.id, { password_hash: hash, role, status: 'active', must_change: false, pw_version: (u.pw_version || 1) + 1, failed: 0, locked_until: null, name: name || u.name });
    return 'diperbarui';
  }
  await db.createUser({ username, name: name || username, password_hash: hash, role, status: 'active', must_change: false });
  return 'dibuat';
}

async function main() {
  const [cmd, a, b, c, d] = process.argv.slice(2);
  console.log(`\nDatabase: ${where()}\n`);
  await db.init();
  switch ((cmd || '').toLowerCase()) {
    case 'daftar': case 'list': {
      const us = await db.listUsers();
      console.log(pad('NAMA PENGGUNA', 16) + pad('NAMA', 22) + pad('PERAN', 8) + pad('STATUS', 12) + 'TERAKHIR MASUK');
      for (const u of us) console.log(pad(u.username, 16) + pad(u.name, 22) + pad(u.role, 8) + pad(u.status, 12) + (u.last_login ? new Date(u.last_login).toLocaleString('id-ID', { timeZone: cfg.TZ }) : '-'));
      console.log(`\n${us.length} akun. Nama pengguna tidak membedakan huruf besar/kecil. Kata sandi tidak bisa ditampilkan (disimpan terenkripsi); pakai "sandi" untuk menggantinya.`);
      break;
    }
    case 'awal': case 'seed': {
      for (const acc of AKUN_AWAL) console.log(`  ${pad(acc.username, 10)} / ${pad(acc.password, 12)} ${pad(acc.role, 6)} ${await upsert(acc)}`);
      console.log('\nSemua akun di atas aktif dan bisa langsung dipakai masuk di website.');
      console.log('PERINGATAN: kata sandi ini mudah ditebak. Pakai hanya untuk uji coba/demo, lalu ganti sebelum dipakai sungguhan.');
      break;
    }
    case 'buat': case 'tambah': {
      if (!a || !b) throw new Error('Format: npm run akun -- buat <nama-pengguna> <kata-sandi> [admin|user] ["Nama Lengkap"]');
      if (!auth.USER_RE.test(a)) throw new Error('Nama pengguna 3-32 karakter: huruf, angka, titik, garis bawah, atau strip (tanpa spasi).');
      const r = await upsert({ username: a, password: b, role: c === 'admin' ? 'admin' : 'user', name: d });
      console.log(`Akun ${a} ${r} (${c === 'admin' ? 'admin' : 'pengguna'}).`);
      break;
    }
    case 'sandi': case 'reset': {
      if (!a || !b) throw new Error('Format: npm run akun -- sandi <nama-pengguna> <kata-sandi-baru>');
      const u = await need(a);
      await db.updateUser(u.id, { password_hash: await auth.hashPassword(b), must_change: false, pw_version: (u.pw_version || 1) + 1, failed: 0, locked_until: null, status: u.status === 'disabled' ? 'disabled' : 'active' });
      console.log(`Kata sandi ${u.username} diganti. Kunci karena salah sandi (bila ada) juga dibuka.`);
      break;
    }
    case 'admin': case 'user': {
      if (!a) throw new Error(`Format: npm run akun -- ${cmd} <nama-pengguna>`);
      const u = await need(a); await db.updateUser(u.id, { role: cmd, status: 'active' });
      console.log(`${u.username} sekarang ${cmd === 'admin' ? 'admin' : 'pengguna biasa'}.`);
      break;
    }
    case 'aktifkan': case 'nonaktifkan': {
      if (!a) throw new Error(`Format: npm run akun -- ${cmd} <nama-pengguna>`);
      const u = await need(a); await db.updateUser(u.id, { status: cmd === 'aktifkan' ? 'active' : 'disabled', pw_version: (u.pw_version || 1) + 1, failed: 0, locked_until: null });
      console.log(`${u.username} ${cmd === 'aktifkan' ? 'aktif' : 'dinonaktifkan'}.`);
      break;
    }
    case 'hapus': {
      if (!a) throw new Error('Format: npm run akun -- hapus <nama-pengguna>');
      const u = await need(a); await db.deleteUser(u.id); await db.delConv('user:' + u.id);
      console.log(`Akun ${u.username} dihapus.`);
      break;
    }
    default:
      console.log(`Alat akun MBG-BIOLOOP

  npm run akun -- daftar                          lihat semua akun
  npm run akun -- awal                            buat/pulihkan akun-akun mudah:
${AKUN_AWAL.map(x => `                                                    ${pad(x.username, 9)} / ${pad(x.password, 11)} (${x.role})`).join('\n')}
  npm run akun -- buat <nama> <sandi> [admin|user] "Nama Lengkap"
  npm run akun -- sandi <nama> <sandi-baru>       ganti/reset kata sandi (juga membuka kunci)
  npm run akun -- admin <nama>                    jadikan admin
  npm run akun -- user <nama>                     jadikan pengguna biasa
  npm run akun -- aktifkan <nama>                 setujui/aktifkan
  npm run akun -- nonaktifkan <nama>
  npm run akun -- hapus <nama>

Contoh:  npm run akun -- sandi Handoyo 12345`);
  }
}
main().then(async () => { try { await db.close(); } catch (e) { /* abaikan */ } process.exit(0); })
  .catch(async e => { console.error('\nGagal: ' + e.message + '\n'); try { await db.close(); } catch (x) { /* abaikan */ } process.exit(1); });
