# Menyelesaikan pemasangan (langkah awam)

Panduan ini membawa website **bioreaktorloop.vercel.app** dan bot **@Bioreaktorloop_bot** sampai siap dipakai: bisa masuk, panel admin terisi, bot membalas, dan notifikasi otomatis terkirim. Kerjakan berurutan. Total ±30 menit.

Yang dibutuhkan: laptop Windows dengan **VS Code**, folder proyek `C:\Users\hando\Downloads\mbg-bioloop\mbg-bioloop`, akun **GitHub**, **Vercel**, **Supabase**, dan **Telegram** di HP.

---

## Langkah 1: Buka folder proyek di VS Code

1. Buka VS Code → **File → Open Folder…** → pilih folder `mbg-bioloop` yang **di dalamnya** ada file `package.json`.
2. Buka terminal: menu **Terminal → New Terminal**. Terminal muncul di bawah.
3. Pastikan terminal berada di folder yang benar. Ketik lalu tekan Enter:

```
dir package.json
```

Harus muncul nama file `package.json`. Bila muncul *Cannot find path*, folder yang dibuka salah (kemungkinan satu tingkat di atasnya); ulangi langkah 1.

## Langkah 2: Pasang dan periksa

Ketik satu per satu, tekan Enter, tunggu sampai selesai:

```
npm install
npm run cek
```

`npm run cek` menampilkan daftar pemeriksaan. Yang penting **Database** harus ✓. Bila ✗, baca petunjuk di bawahnya (biasanya `DATABASE_URL` di file `.env` salah ketik).

## Langkah 3: Pulihkan akun (lupa nama pengguna & kata sandi)

```
npm run akun -- awal
```

Hasilnya kira-kira:

```
Database: PostgreSQL aws-0-ap-southeast-2.pooler.supabase.com (user postgres.xxxx)

  Handoyo    / 12345        admin  diperbarui
  admin      / admin123     admin  dibuat
  petugas    / petugas123   user   dibuat
  gizi       / gizi123      user   dibuat
  guru       / guru123      user   dibuat
```

**Periksa baris "Database".** Alamat itu harus sama dengan database website online:
Vercel → proyek **bioreaktorloop** → **Settings → Environment Variables** → `DATABASE_URL` → klik ikon mata. Bagian setelah `@` (misalnya `aws-0-ap-southeast-2.pooler.supabase.com`) dan nama user setelah `postgresql://` harus sama. Bila berbeda, salin `DATABASE_URL` dari Vercel ke file `.env`, simpan (Ctrl + S), lalu ulangi perintah di atas.

Untuk melihat semua akun kapan saja:

```
npm run akun -- daftar
```

> Kata sandi di atas sengaja mudah supaya cepat dipakai. Setelah semuanya berjalan, ganti kata sandi admin dan nonaktifkan akun yang tidak dipakai (lihat Panduan admin).

## Langkah 4: Kirim pembaruan ke GitHub (Vercel ikut memperbarui)

Masih di terminal VS Code:

```
git add .
git status
```

Periksa daftar yang muncul: **tidak boleh ada `.env`**. Bila aman, lanjutkan:

```
git commit -m "Panel admin, notifikasi otomatis, akun mudah"
git push
```

Bila diminta masuk GitHub, masuk dan izinkan. Buka **vercel.com → proyek bioreaktorloop → Deployments**. Dalam ±1 menit muncul deployment baru berstatus **Ready**.

> Pembaruan ini juga memindahkan server Vercel ke **Sydney (syd1)**, dekat database Supabase Anda, sehingga website jauh lebih cepat tersambung. Bila suatu saat database Anda di Singapura, ganti `syd1` menjadi `sin1` di file `vercel.json`.

Tidak memakai git? Buka repositori di github.com → **Add file → Upload files** → seret semua file dan folder **kecuali** `.env`, `node_modules`, dan `data` → **Commit changes**.

## Langkah 5: Masuk ke website

1. Buka `https://bioreaktorloop.vercel.app/admin.html`.
2. Masuk: nama pengguna **Handoyo**, kata sandi **12345** (atau **admin** / **admin123**).
3. Panel admin terbuka di **Ringkasan**. Kartu paling atas **"Siap dipakai?"** menunjukkan apa saja yang masih kurang. Langkah-langkah berikut membereskannya satu per satu.

Catatan: halaman panel admin memang kosong sebelum masuk. Isinya baru muncul setelah masuk dengan akun admin.

## Langkah 6: Nyalakan bot Telegram

Webhook bot **dipasang otomatis** oleh website. Untuk memastikan:

1. Panel admin → menu **Telegram & notifikasi** → klik **Cek koneksi**. Database, Bot Telegram, Webhook, dan Asisten Gemini harus ✓. Lalu klik **Atur profil & menu bot**. Kotak **Webhook** harus hijau *Terpasang ke https://bioreaktorloop.vercel.app/api/telegram/webhook*. Bila belum, klik **Pasang otomatis**.
2. Di HP buka Telegram → cari **@Bioreaktorloop_bot** → tekan **Start**. Bot membalas "menunggu persetujuan admin".
3. Kembali ke panel admin → muat ulang halaman (F5) → pada tabel **Chat yang memakai bot**, klik **Setujui** di chat Anda.
4. Di Telegram ketik `/status`. Bot membalas ringkasan reaktor. Coba juga `/laporan` dan tanya "kenapa pH bisa turun?".

Ulangi langkah 2–3 untuk setiap petugas atau grup.

Nama dan foto bot diatur di **@BotFather** dengan teks siap salin di panduan **Template pengaturan bot Telegram** (menu Panduan di panel admin).

Cara lain lewat terminal (bila panel belum bisa dibuka):

```
npm run bot -- pasang https://bioreaktorloop.vercel.app
npm run bot -- chat
npm run bot -- setujui <angka chat id dari daftar>
```

## Langkah 7: Jadwal otomatis (cron) agar notifikasi tepat waktu

Tanpa ini, peringatan dan jadwal hanya berjalan saat ada yang membuka website. Pilih **salah satu**:

**A. cron-job.org (paling mudah, gratis, cocok untuk repositori private)**

1. Daftar di **cron-job.org** → **Create cronjob**.
2. URL: `https://bioreaktorloop.vercel.app/api/cron`
3. Execution schedule: **Every 5 minutes** → **Create**.

**B. GitHub Actions (sudah ada di repositori)**

1. GitHub → repositori **bioreaktorloop** → **Settings → Secrets and variables → Actions → New repository secret**.
2. Name `BIOLOOP_URL`, Secret `https://bioreaktorloop.vercel.app` → **Add secret**.
3. Tab **Actions** → **BIOLOOP cron** → **Run workflow**. Centang hijau = berhasil.
4. Repositori **private** hanya mendapat 2.000 menit/bulan: ubah jadwal di `.github/workflows/cron.yml` dari `*/5` menjadi `*/30`, atau pakai pilihan A.

Setelah ±5 menit, item **"Jadwal otomatis (cron) berjalan"** di Ringkasan menjadi ✓.

## Langkah 8: Atur notifikasi otomatis

Panel admin → **Telegram & notifikasi**:

1. Kartu **Notifikasi otomatis**: nyalakan *Peringatan bahaya & waspada* dan *Aksi penting*. Isi *Ringkasan status berkala tiap* misalnya `6` jam (0 = mati). Klik **Simpan notifikasi**.
2. Kartu **Kirim sekarang**: klik **📊 Status reaktor** untuk mencoba. Pesan masuk ke Telegram Anda.
3. Kartu **Jadwal pesan otomatis** → **+ Tambah jadwal** → misalnya *Laporan hari ini*, jam `15:00`, hari Sen–Sab → **Simpan jadwal**.

## Langkah 9: Isi riwayat 30 hari (ringkasan & laporan terisi)

Panel admin → **Pengaturan** → kartu **Data riwayat** → **Isi riwayat 30 hari** → **Isi sekarang**. Tunggu beberapa detik. Buka lagi **Ringkasan** dan **Laporan**: grafik 7 hari, peringatan, dan aktivitas pengguna sudah terisi. Data ini dari model bioreaktor dan tetap berlabel *Simulasi*.

Lewat terminal: `npm run data -- isi`

## Langkah 10: Amankan

1. Klik nama Anda (kanan atas) → **Ganti kata sandi**. Pakai kata sandi yang hanya Anda tahu.
2. Menu **Pengguna**: nonaktifkan akun mudah yang tidak dipakai (`guru`, `gizi`, …) atau reset kata sandinya.
3. Bagikan ke petugas dan warga: alamat `https://bioreaktorloop.vercel.app` dan **Panduan pengguna** (tombol di bagian Bantuan website). Pengunjung umum bisa langsung memantau tanpa akun.

---

## Bila ada masalah

| Gejala | Solusi |
|---|---|
| `npm run akun` menulis "berkas lokal" | File `.env` belum berisi `DATABASE_URL`. Salin dari Vercel |
| Masuk ditolak walau sudah `npm run akun -- awal` | Database di `.env` berbeda dengan di Vercel (lihat Langkah 3) |
| "Akun dikunci 10 menit" | Jalankan `npm run akun -- sandi Handoyo 12345` untuk membuka kunci |
| Website lama "Menyambungkan ke server" | Tunggu ±20 detik; halaman beralih sendiri. Pastikan deployment terbaru **Ready** di Vercel. Panel admin → **Cek koneksi** menunjukkan bagian yang bermasalah |
| Bot tidak membalas | Panel admin → Telegram & notifikasi → **Pasang otomatis**, lalu pastikan chat Anda **Disetujui** |
| Bot membalas "menunggu persetujuan" terus | Chat belum disetujui. Setujui di panel atau `npm run bot -- setujui <chat id>` |
| Notifikasi tidak datang | Cek item cron di Ringkasan; cek chat berstatus *Notifikasi: Aktif* |
| `git push` ditolak "rejected" | Ketik `git pull --rebase` lalu `git push` lagi |
| "Another git process seems to be running" | Tutup VS Code, buka lagi, ulangi perintah |
