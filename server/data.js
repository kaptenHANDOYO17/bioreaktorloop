'use strict';
/* Data riwayat awal untuk ringkasan & laporan (tanpa perlu masuk ke website).
   Memakai DATABASE_URL di file .env (harus SAMA dengan di Vercel).

   npm run data -- isi          → isi riwayat 30 hari (model simulasi berjalan dengan jam nyata)
   npm run data -- isi 60       → isi riwayat 60 hari
   npm run data -- hapus        → hapus riwayat yang pernah diisi
   npm run data -- status       → lihat apakah riwayat sudah diisi
*/
const db = require('../lib/db');
const seed = require('../lib/seed');

async function main() {
  const [cmd, a] = process.argv.slice(2);
  await db.init();
  switch ((cmd || '').toLowerCase()) {
    case 'isi': { console.log('Menyiapkan riwayat, tunggu sebentar…'); const r = await seed.isi({ days: +a || 30 }); console.log(r.message); break; }
    case 'hapus': console.log((await seed.hapus()).message); break;
    case 'status': { const s = await seed.status(); console.log(s ? `Riwayat ${s.days} hari diisi ${new Date(s.at).toLocaleString('id-ID')}: ${s.readings} pembacaan, ${s.events} kejadian.` : 'Belum ada riwayat yang diisi.'); break; }
    default: console.log(`Data riwayat MBG-BIOLOOP

  npm run data -- isi          isi riwayat 30 hari (ringkasan, grafik, laporan, aktivitas pengguna)
  npm run data -- isi 60       isi riwayat 60 hari
  npm run data -- hapus        hapus riwayat yang pernah diisi
  npm run data -- status       cek status`);
  }
}
main().then(async () => { try { await db.close(); } catch (e) { /* abaikan */ } process.exit(0); })
  .catch(async e => { console.error('\nGagal: ' + e.message + '\n'); try { await db.close(); } catch (x) { /* abaikan */ } process.exit(1); });
