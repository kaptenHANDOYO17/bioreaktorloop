# Panduan deploy: GitHub + Supabase + Vercel

Panduan ini untuk Anda yang **belum pernah membuat website**. Semua langkah dilakukan lewat browser, gratis, tanpa memasang program apa pun. Waktu yang dibutuhkan ±45 menit.

Hasil akhirnya:

- Website di alamat seperti `https://bioloop-sppg.vercel.app` yang bisa dibuka dari HP mana saja
- Database di Supabase yang menyimpan akun, laporan, perangkat, dan ingatan asisten
- Bot Telegram yang membalas dan mengirim peringatan
- Panel admin di `https://…vercel.app/admin.html`

> **Gambaran singkat.** GitHub = tempat menyimpan kode. Supabase = tempat menyimpan data. Vercel = "mesin" yang menjalankan website dari kode di GitHub. Setiap kali kode di GitHub berubah, Vercel otomatis memperbarui website.

## Yang perlu disiapkan

| Akun | Daftar di | Biaya |
|---|---|---|
| GitHub | github.com | Gratis |
| Supabase | supabase.com (bisa masuk pakai akun GitHub) | Gratis |
| Vercel | vercel.com (masuk pakai akun GitHub) | Gratis (paket Hobby) |
| Telegram | aplikasi di HP | Gratis |
| Google (untuk Gemini) | aistudio.google.com | Gratis dengan batas pemakaian |

Siapkan juga satu file catatan (Notepad) untuk menyimpan token dan kunci sementara. **Jangan kirim catatan ini ke siapa pun** dan hapus setelah selesai.

---

## Langkah 1: Simpan kode ke GitHub

1. Ekstrak **mbg-bioloop.zip** di komputer Anda.
2. Masuk ke **github.com** → klik tombol **+** di kanan atas → **New repository**.
3. Isi **Repository name**, misalnya `bioloop-sppg`. Pilih **Private** atau **Public**. Kode ini tidak berisi rahasia apa pun (token dan kunci disimpan di Vercel), jadi keduanya aman. Bedanya ada di kuota jadwal otomatis (lihat langkah 7). **Jangan** centang "Add a README". Klik **Create repository**.
4. Di halaman repositori yang masih kosong, klik tautan **uploading an existing file**.
5. Buka folder hasil ekstrak (`mbg-bioloop`), pilih **semua isi di dalamnya** (bukan foldernya), lalu seret ke halaman GitHub.
6. Tunggu sampai semua file terunggah, lalu klik **Commit changes**.

> **Periksa folder tersembunyi.** Folder `.github` (berisi jadwal cron) dan file `.env.example` diawali titik sehingga kadang tidak ikut terseret.
> - Windows: di File Explorer buka menu **View** → centang **Hidden items**.
> - macOS: di Finder tekan **Cmd + Shift + .** (titik).
>
> Setelah unggah, pastikan di GitHub terlihat folder `api`, `lib`, `public`, `server`, `.github`, dan file `vercel.json`, `package.json`.
>
> Cara lain yang lebih mudah untuk update berikutnya: pasang **GitHub Desktop** (desktop.github.com), pilih *Add existing repository*, lalu *Commit* dan *Push*.

**Jangan pernah mengunggah file `.env`** bila Anda membuatnya. File itu sudah otomatis diabaikan oleh `.gitignore`.

## Langkah 2: Buat database di Supabase

1. Masuk ke **supabase.com** → **New project**.
2. Isi:
   - **Name**: `bioloop`
   - **Database Password**: klik *Generate a password*, lalu **salin ke catatan Anda** (dipakai sebentar lagi)
   - **Region**: pilih **Southeast Asia (Singapore)** agar cepat dari Indonesia
3. Klik **Create new project** dan tunggu 1–2 menit.
4. Klik tombol **Connect** di bagian atas halaman proyek.
5. Pilih tab/opsi **Transaction pooler** (port **6543**). Ini yang cocok untuk Vercel.
6. Salin **connection string**-nya. Bentuknya seperti:

```
postgresql://postgres.abcdxyz:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

7. Ganti `[YOUR-PASSWORD]` (termasuk kurung sikunya) dengan password database dari langkah 2. Simpan hasilnya di catatan. Inilah **DATABASE_URL** Anda.

> Tabel dibuat **otomatis** oleh aplikasi saat pertama kali dibuka. Anda tidak perlu menjalankan SQL apa pun. (File `lib/db/schema.sql` tersedia bila ingin melihat strukturnya.)

> Password yang berisi karakter khusus (`@ # / ? & *`) ditangani otomatis oleh aplikasi. Tetap disarankan memakai password huruf dan angka saja agar aman di semua alat. Jalankan `npm run cek` di komputer untuk memeriksa sambungan.

## Langkah 3: Bot Telegram dan kunci Gemini

**Bot Telegram**

1. Di Telegram cari **@BotFather** (ada centang biru) → **Start**.
2. Ketik `/newbot`, beri nama (misalnya `BIOLOOP SPPG Sleman`) dan username berakhiran `bot` (misalnya `bioloop_sleman_bot`).
3. Salin **token** yang diberikan ke catatan. Bentuknya `7123456789:AAH...`.

**Kunci Gemini**

1. Buka **aistudio.google.com/apikey** → **Create API key**.
2. Salin kunci (diawali `AIza...`) ke catatan.

Catatan tingkat gratis Gemini: ada batas jumlah pertanyaan per menit/hari, dan Google dapat memakai isi percakapan untuk pengembangan produknya. Jangan memasukkan data pribadi siswa ke asisten.

## Langkah 4: Hubungkan ke Vercel

1. Masuk ke **vercel.com** dengan akun GitHub → **Add New…** → **Project**.
2. Pada daftar repositori GitHub, klik **Import** di sebelah `bioloop-sppg`. (Bila tidak muncul, klik *Adjust GitHub App Permissions* dan beri akses ke repositori itu.)
3. **Framework Preset**: biarkan **Other**. Jangan ubah Build Command maupun Output Directory (sudah diatur oleh `vercel.json`).
4. Buka bagian **Environment Variables**, lalu tambahkan satu per satu (Name → Value → Add):

| Name | Value |
|---|---|
| `DATABASE_URL` | connection string Supabase dari langkah 2 |
| `TELEGRAM_BOT_TOKEN` | token dari BotFather |
| `GEMINI_API_KEY` | kunci dari AI Studio |
| `SITE_NAME` | nama lokasi, misalnya `SPPG Sleman 01` |

Tambahan opsional: `CRON_SECRET` (kata acak panjang), `SESSION_SECRET` (kata acak panjang). Daftar lengkap ada di file `.env.example`.

5. Klik **Deploy** dan tunggu ±1 menit sampai muncul kembang api 🎉.
6. Klik **Continue to Dashboard** → **Visit**. Website Anda sudah online. Catat alamatnya (misalnya `https://bioloop-sppg.vercel.app`).

> **Alternatif database dari Vercel.** Di proyek Vercel → tab **Storage** → **Create Database** → pilih **Neon** (Postgres) atau **Supabase**. Vercel akan mengisi `DATABASE_URL`/`POSTGRES_URL` otomatis, lalu klik **Redeploy**. Aplikasi mengenali keduanya.

## Langkah 5: Masuk sebagai admin dan amankan akun

1. Buka `https://alamat-anda.vercel.app/admin.html`.
2. Masuk dengan:
   - Nama pengguna: **Handoyo**
   - Kata sandi: **12345**
3. Sistem meminta Anda **mengganti kata sandi**. Pakai minimal 8 karakter, misalnya gabungan 3–4 kata: `kompor-biru-sayur-2045`.

**Ingin beberapa akun mudah sekaligus, atau lupa kata sandi?** Di terminal VS Code (file `.env` berisi `DATABASE_URL` yang sama dengan di Vercel):

```
npm install
npm run akun -- awal
```

Perintah ini membuat/memulihkan `Handoyo/12345`, `admin/admin123` (admin), serta `petugas/petugas123`, `gizi/gizi123`, `guru/guru123` (pengguna). Rincian di **Menyelesaikan pemasangan** dan **Panduan admin**.

Keamanan bawaan: akun terkunci 10 menit setelah 5 kali salah kata sandi, dan semua kata sandi disimpan dalam bentuk hash (tidak bisa dibaca, bahkan oleh admin).

## Langkah 6: Nyalakan bot Telegram

1. Webhook dipasang **otomatis** oleh website. Cek di panel admin → **Telegram & notifikasi** → kotak **Webhook** hijau *Terpasang*. Bila belum, klik **Pasang otomatis**.
2. Di Telegram, buka bot Anda → **Start**. Bot membalas "menunggu persetujuan admin".
3. Kembali ke panel admin → muat ulang halaman → klik **Setujui** pada chat Anda.
4. Di Telegram ketik `/status` dan `/laporan`. Coba tanya: *"kenapa pH bisa turun?"*
5. Atur **Notifikasi otomatis**, **Kirim sekarang**, dan **Jadwal pesan** di menu yang sama (lihat Panduan admin).

Ulangi langkah 2–3 untuk setiap petugas atau grup Telegram. Lewat terminal: `npm run bot -- chat` lalu `npm run bot -- setujui <chat id>`.

## Langkah 7: Jadwal otomatis lewat GitHub Actions (disarankan)

Vercel paket gratis hanya boleh menjalankan jadwal (cron) **sekali sehari**. Supaya simulasi berjalan terus, perangkat yang mati terdeteksi, dan laporan berkala terkirim, repositori sudah berisi jadwal GitHub Actions yang memanggil website Anda **tiap 5 menit**.

1. Di GitHub buka repositori → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Buat secret:
   - Name `BIOLOOP_URL`, Secret: alamat website Anda, misalnya `https://bioloop-sppg.vercel.app` (tanpa `/` di akhir)
   - Bila Anda mengisi `CRON_SECRET` di Vercel, buat juga secret `CRON_SECRET` dengan isi yang sama
3. Buka tab **Actions**. Bila diminta, klik **I understand my workflows, go ahead and enable them**.
4. Pilih **BIOLOOP cron** → **Run workflow** untuk mencoba. Centang hijau berarti berhasil.

**Penting untuk repositori Private.** GitHub Actions gratis tanpa batas untuk repositori publik, tetapi repositori private di akun gratis hanya mendapat **2.000 menit per bulan**, dan setiap panggilan dihitung dibulatkan ke atas menjadi 1 menit. Tiap 5 menit = ±8.600 menit/bulan, jadi **melebihi kuota**. Pilih salah satu:

- **Ubah jadwal menjadi tiap 30 menit** (±1.440 menit/bulan): di GitHub buka `.github/workflows/cron.yml` → ikon pensil → ganti `'*/5 * * * *'` menjadi `'*/30 * * * *'` → Commit.
- **Atau pakai cron-job.org** (gratis, tanpa batas menit): daftar di cron-job.org → *Create cronjob* → URL `https://alamat-anda.vercel.app/api/cron` → jadwal *Every 5 minutes* → simpan. Bila Anda mengisi `CRON_SECRET`, tambahkan header `Authorization: Bearer <isi CRON_SECRET>` di tab *Advanced*. Setelah itu matikan workflow GitHub (tab Actions → BIOLOOP cron → ⋯ → *Disable workflow*).

Catatan:
- Jadwal GitHub bisa terlambat beberapa menit saat GitHub sedang sibuk; itu normal.
- Pada repositori **publik**, GitHub mematikan jadwal otomatis bila repositori tidak ada aktivitas 60 hari. Repositori **private** tidak terkena aturan ini.
- Panggilan tiap 5 menit ini juga menjaga database Supabase gratis tetap aktif (Supabase menjeda proyek gratis yang sepi aktivitas selama sepekan).

Tanpa langkah ini website tetap berjalan: simulasi maju setiap ada orang membuka dasbor, dan data ESP32 tetap diproses saat dikirim. Yang tidak berjalan hanya pengecekan otomatis saat tidak ada yang membuka website.

## Langkah 8: Daftarkan alat ESP32 (saat alat asli siap)

1. Panel admin → **Perangkat** → **Daftarkan perangkat** → isi nama dan lokasi.
2. Muncul **kunci perangkat**. Salin dua baris `SERVER_URL` dan `DEVICE_KEY` (tombol *Salin kedua baris*). Kunci ini hanya ditampilkan sekali.
3. Tempel ke `firmware/bioloop_esp32/bioloop_esp32.ino`, isi juga nama & password WiFi, lalu upload ke ESP32 dengan Arduino IDE (lihat Panduan setup).
4. Dalam ±10 detik status berubah **Online** dan perangkat muncul di pilihan **Sumber** pada dasbor.
5. Setelah alat asli berjalan, di **Pengaturan** matikan *Notifikasi dari simulasi* dan pilih perangkat sebagai *Sumber utama dasbor & asisten*.

## Memperbarui website

- **Ubah sedikit teks**: buka file di GitHub → ikon pensil ✏️ → edit → **Commit changes**. Vercel otomatis deploy ulang dalam ±1 menit.
- **Ganti banyak file**: unggah ulang file yang berubah (Add file → Upload files), atau pakai GitHub Desktop.
- **Ubah Environment Variables** (token, kunci): Vercel → proyek → **Settings** → **Environment Variables** → ubah → buka tab **Deployments** → titik tiga pada deployment teratas → **Redeploy**. Perubahan variabel baru berlaku setelah redeploy.

## Batas paket gratis (perlu diketahui)

| Layanan | Batas yang relevan |
|---|---|
| Vercel Hobby | Untuk pemakaian non-komersial; cron bawaan hanya sekali sehari; satu permintaan maksimal 300 detik dan 4,5 MB |
| Supabase Free | Database 500 MB; proyek dijeda bila sepi seminggu (dijaga oleh cron GitHub); bisa dipulihkan dari dasbor Supabase |
| GitHub Actions | Gratis tanpa batas untuk repositori publik; repositori private 2.000 menit/bulan (pakai jadwal 30 menit atau cron-job.org) |
| Gemini | Batas pertanyaan per menit/hari pada tingkat gratis |

Untuk operasional resmi di banyak SPPG, pertimbangkan paket berbayar agar lebih stabil. Riwayat pembacaan otomatis dihapus setelah 90 hari (bisa diubah di Pengaturan) agar database tidak penuh.

## Masalah umum

| Gejala | Penyebab & solusi |
|---|---|
| Website terbuka tapi muncul "DATABASE_URL belum diisi" | Isi `DATABASE_URL` di Vercel lalu **Redeploy** |
| "Database tidak bisa dihubungi: password authentication failed" | Password di connection string salah atau masih `[YOUR-PASSWORD]` |
| "…getaddrinfo ENOTFOUND…" atau timeout | Anda memakai *Direct connection*. Ganti ke **Transaction pooler** port 6543 |
| Proyek Supabase "Paused" | Buka dasbor Supabase → **Restore project**. Pasang cron GitHub (langkah 7) agar tidak terulang |
| Tidak bisa masuk `Handoyo`/`12345` | Di terminal VS Code: `npm run akun -- sandi Handoyo 12345` (atau `npm run akun -- awal`). `.env` harus memakai `DATABASE_URL` yang sama dengan Vercel |
| "Akun dikunci 10 menit" | 5 kali salah kata sandi. Tunggu 10 menit |
| Bot tidak membalas | Panel admin → Telegram → pastikan webhook **Terpasang** dan chat Anda **Disetujui** |
| Webhook error "wrong response 401" | Webhook dipasang dengan alamat lama/preview. Klik **Pasang otomatis** di menu Telegram & notifikasi |
| Website lambat / lama "Menyambungkan ke server" | Server Vercel jauh dari database. `vercel.json` sudah berisi `"regions": ["syd1"]` (Sydney, cocok untuk Supabase `ap-southeast-2`). Untuk Supabase Singapura ganti ke `sin1` |
| Asisten menjawab "API key Gemini ditolak" | Kunci salah/terhapus. Buat baru di AI Studio, ganti di Vercel, Redeploy |
| Asisten "Kuota Gemini sedang habis" | Batas tingkat gratis tercapai. Tunggu beberapa menit |
| Workflow GitHub gagal (merah) | Secret `BIOLOOP_URL` salah ketik atau `CRON_SECRET` tidak sama dengan di Vercel |
| ESP32 "Kunci perangkat tidak dikenal" | Kunci salah atau sudah diganti. Buat **Kunci baru** di panel lalu upload ulang firmware |
| Model 3D tidak muncul di HP lama | Browser tidak mendukung WebGL. Data dan tombol tetap berfungsi |
