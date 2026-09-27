# MBG-BIOLOOP AI

Sisa makan siang program **Makan Bergizi Gratis** diolah bioreaktor floating drum ±500 L menjadi **biogas untuk kompor dapur SPPG** dan **pupuk organik**. Sensor IoT menjaga reaktor, AI membaca pola sisa makanan, dan **bot Telegram + asisten Gemini** mengabari serta menjawab pertanyaan petugas. Asisten **mengingat obrolan sebelumnya**.

**Versi 3**: siap deploy ke **Vercel** dari **GitHub**, database **Supabase/Neon (PostgreSQL)**, akun **pengguna & admin**, laporan lengkap yang bisa diunduh, dan manajemen perangkat ESP32.

## Fitur

- **Website dasbor 3D** bertema SPPG & Indonesia Emas 2045: model bioreaktor, jalur gas, dan dapur yang bisa diputar; grafik; kendali; kalkulator kebutuhan SPPG; data penelitian bersumber.
- **Akun**: tamu melihat, pengguna mengendalikan dan bertanya ke asisten, admin mengelola semuanya. Pendaftaran dengan persetujuan admin.
- **Panel admin** (`/admin.html`): ringkasan, **laporan** (per sumber, harian, per jam, kejadian, aktivitas pengguna) dengan unduhan **Excel/CSV/PDF**, **perangkat terdaftar** (kunci per alat, status online, perintah), pengguna, Telegram, pengaturan.
- **Bot Telegram**: webhook terpasang otomatis di Vercel, persetujuan chat oleh admin, peringatan otomatis, **jadwal pesan**, tombol *kirim sekarang*, perintah (`/status`, `/laporan`, `/peringatan`, `/perangkat`, …), pengumuman, dan obrolan AI.
- **Tampilan terpisah**: halaman depan untuk umum (siapa pun bisa memantau), kendali untuk pengguna terdaftar, dan panel admin khusus admin.
- **Asisten Gemini** dengan pemanggilan fungsi dan ingatan per akun yang tersimpan di database.
- **Firmware ESP32** (HTTPS) dan **jadwal GitHub Actions** untuk cron tiap 5 menit.
- Tetap bisa dijalankan di **komputer sendiri/Raspberry Pi/Docker** tanpa database (berkas lokal).

## Mulai cepat (Vercel)

1. Unggah isi folder ini ke repositori **GitHub**.
2. Buat proyek **Supabase** → *Connect* → salin connection string **Transaction pooler** (port 6543).
3. Di **Vercel** → *Add New Project* → impor repositori → isi Environment Variables `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `SITE_NAME` → **Deploy**.
4. Di terminal VS Code: `npm install`, `npm run akun -- awal` (membuat akun mudah di database yang sama).
5. Buka `https://proyek-anda.vercel.app/admin.html`, masuk **Handoyo / 12345** atau **admin / admin123**. Webhook Telegram terpasang otomatis; setujui chat Anda di menu *Telegram & notifikasi*.
6. Pasang cron tiap 5 menit (cron-job.org atau secret `BIOLOOP_URL` di GitHub).

Langkah demi langkah untuk orang awam: [public/docs/PANDUAN_DEPLOY_VERCEL.md](public/docs/PANDUAN_DEPLOY_VERCEL.md).

## Mulai cepat (komputer sendiri)

Pasang **Node.js LTS**, lalu di terminal folder proyek ketik `npm install`, `npm run cek`, dan `npm start` (atau klik dua kali `start-windows.bat`). Alat terminal: `npm run akun` (akun & kata sandi) dan `npm run bot` (webhook, persetujuan chat, kirim pesan). Buka http://localhost:3000. Panduan: [public/docs/PANDUAN_SETUP.md](public/docs/PANDUAN_SETUP.md).

## Struktur

```
mbg-bioloop/
├─ api/index.js          fungsi Vercel (semua /api/*)
├─ lib/                  logika: router, akun, reaktor, laporan, Telegram, Gemini, database
│  └─ db/                pg.js (Supabase/Neon), file.js (lokal), schema.sql
├─ public/               website: index.html (dasbor), admin.html (panel admin), js, css, docs
├─ server/index.js       server untuk komputer sendiri / Docker
├─ firmware/             program ESP32
├─ .github/workflows/    cron GitHub Actions tiap 5 menit
├─ vercel.json           pengaturan Vercel (rewrite, cron harian, header)
└─ .env.example          daftar Environment Variables
```

## Dokumen

- [Panduan deploy GitHub + Supabase + Vercel](public/docs/PANDUAN_DEPLOY_VERCEL.md)
- **[Menyelesaikan pemasangan (mulai dari sini)](public/docs/PANDUAN_SELESAIKAN.md)**
- [Panduan pengguna umum](public/docs/PANDUAN_PENGGUNA.md)
- [Panduan admin](public/docs/PANDUAN_ADMIN.md)
- [Template pengaturan bot Telegram (BotFather & notifikasi)](public/docs/PANDUAN_BOTFATHER.md)
- [Menjalankan di komputer sendiri](public/docs/PANDUAN_SETUP.md)
- [Perintah terminal tanpa file .bat (Windows/VS Code, macOS, Linux)](public/docs/PANDUAN_TERMINAL.md)
- [Arsitektur, API, database, keamanan](public/docs/ARSITEKTUR.md)
- [Data penelitian (Excel, 151 data, 51 sumber)](public/docs/Data_Penelitian_MBG_BIOLOOP.xlsx)

## Catatan penting

- **Akun mudah** (`Handoyo/12345`, `admin/admin123`, `petugas/petugas123`, `gizi/gizi123`, `guru/guru123`) bersifat sementara. Ganti kata sandinya sebelum website dibagikan.
- Jangan unggah file `.env`. Token Telegram, kunci Gemini, dan `DATABASE_URL` hanya disimpan di Environment Variables.
- Tingkat gratis Gemini: data dapat dipakai Google untuk pengembangan produk; jangan memasukkan data pribadi siswa.
- Angka mode simulasi berasal dari model literatur, bukan hasil kalibrasi alat. Desain digester akhir perlu uji potensi metana (BMP) sisa pangan setempat.
- Endapan harus dikeringkan/dikomposkan sebelum dipakai sebagai pupuk: digesti mesofilik menurunkan patogen tetapi tidak menghilangkannya.
