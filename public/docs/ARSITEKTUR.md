# Arsitektur sistem MBG-BIOLOOP AI (v3)

## Gambaran besar

```
 ┌──────────────── LOKASI SPPG ────────────────┐
 │ Bioreaktor ±500 L + sensor & aktuator        │
 │        │                 ▲ perintah          │
 │        ▼                 │                   │
 │   ESP32 (kontrol lokal, aman tanpa internet) │
 └────────┬─────────────────┼───────────────────┘
          │ HTTPS POST /api/sensor (tiap 10 dtk) + kunci perangkat
          ▼                 │ balasan berisi perintah yang menunggu
 ┌──────────────────── VERCEL ───────────────────────────────┐
 │ public/        website statis (dasbor 3D, panel admin)     │
 │ api/index.js   satu fungsi untuk semua /api/*              │
 │   └ lib/router.js   rute, akses tamu/pengguna/admin        │
 │     lib/reactor.js  simulasi & data sensor (mengejar waktu)│
 │     lib/auth.js     akun, scrypt, sesi cookie              │
 │     lib/reports.js  laporan + Excel/CSV (lib/xlsx.js)      │
 │     lib/telegram.js webhook, perintah, notifikasi          │
 │     lib/ai.js       Asisten BIOLOOP + ingatan (memory.js)  │
 │     lib/db/         PostgreSQL (pg.js) atau berkas (file.js)│
 └──┬───────────────┬──────────────────┬───────────────┬─────┘
    │ SQL (pooler)  │ HTTPS             │ HTTPS webhook │ GET /api/cron
    ▼               ▼                   ▲               ▲ tiap 5 menit
 Supabase/Neon   Google Gemini     Telegram Bot API   GitHub Actions
 (PostgreSQL)                                          (+ Vercel Cron harian)
```

Browser tidak pernah melihat token Telegram, kunci Gemini, maupun alamat database; semuanya hanya ada di Environment Variables Vercel.

## Kenapa desainnya begini (serverless)

Vercel menjalankan fungsi **hanya saat ada permintaan**; tidak ada proses yang hidup terus. Karena itu:

| Kebutuhan | Solusi |
|---|---|
| Simulasi berjalan 24 jam | Keadaan disimpan di tabel `reactor_state`. Setiap permintaan (dasbor, cron, Telegram, ESP32) memanggil `tick()`: waktu yang terlewat sejak penyimpanan terakhir dihitung lalu model dijalankan "mengejar" (maks. 10 menit waktu nyata per panggilan) |
| Banyak permintaan bersamaan | *Optimistic locking*: kolom `version`; penyimpanan gagal bila versi berubah, lalu diulang dengan keadaan terbaru |
| Data langsung di dasbor | Dasbor mengambil `GET /api/state` tiap 2 detik (hanya titik grafik & kejadian baru), berhenti saat tab tidak terlihat |
| Bot Telegram | Mode **webhook** di Vercel (dengan `secret_token`); **long polling** saat dijalankan di komputer sendiri. Update ganda diabaikan lewat tabel `telegram_updates` |
| Peringatan saat tidak ada yang membuka website | GitHub Actions memanggil `/api/cron` tiap 5 menit; Vercel Cron sekali sehari sebagai cadangan (batas paket Hobby) |
| Batas jumlah fungsi | Semua endpoint lewat satu fungsi `api/index.js` (rewrite di `vercel.json`) |

Kode yang sama juga berjalan di komputer sendiri: `server/index.js` menyajikan `public/`, meneruskan `/api/*` ke `lib/router.js`, menjalankan cron tiap 5 detik, dan memakai long polling Telegram. Tanpa `DATABASE_URL`, penyimpanan memakai berkas JSON di `data/`.

## Model proses (ringkas)

Tiga kolam massa: partikulat → terlarut → asam lemak volatil (VFA) → metana (`public/js/sim.js`, dipakai server dan mode demo browser).

- Hidrolisis dan asidogenesis dipengaruhi suhu; metanogenesis dipengaruhi suhu (optimum ±36 °C), pH (6,0–8,6), natrium, dan hambatan VFA.
- pH dari keseimbangan alkalinitas bikarbonat terhadap VFA dan CO₂.
- Suhu: pertukaran panas dengan udara + koil air panas (55 °C) / dingin (24 °C).
- Drum menjaga tekanan ±7 mbar sampai penuh, lalu naik sampai katup pengaman 15 mbar.
- Rujukan parameter di `Data_Penelitian_MBG_BIOLOOP.xlsx`. Model untuk edukasi dan perencanaan, bukan pengganti kalibrasi alat.

## Akun & hak akses

| Peran | Akses |
|---|---|
| Tamu | `GET /api/state`, `/api/sources` (bisa dimatikan: *Dasbor bisa dilihat tamu*) |
| Pengguna (`user`, status `active`) | + `POST /api/control` (kecuali `reset`), asisten `/api/chat*` |
| Admin | + semua `/api/admin/*` |
| Perangkat ESP32 | `POST /api/sensor`, `GET /api/device/commands` dengan header `X-Device-Key` |

- Kata sandi: **scrypt** (N=16384, r=8, p=1, garam acak 16 byte). Pendaftaran & ganti sandi: minimal 8 karakter.
- Sesi: token `uid.pv.exp` bertanda tangan HMAC-SHA256 dalam cookie `bl_sess` (HttpOnly, SameSite=Lax, Secure di HTTPS), berlaku 7 hari. `pw_version` naik saat sandi diganti/direset atau akun dinonaktifkan, sehingga sesi lama langsung gugur.
- 5 kali salah → akun dikunci 10 menit. Nama pengguna tidak dibedakan huruf besar/kecil.
- Permintaan POST dari browser ditolak bila header `Origin` berbeda domain (perlindungan CSRF).
- Admin pertama (`ADMIN_USERNAME`/`ADMIN_PASSWORD`, bawaan `Handoyo`/`12345`) dibuat hanya bila belum ada admin aktif, dengan tanda `must_change`. Pemulihan darurat: `ADMIN_RESET_PASSWORD`.
- Kunci perangkat: `blk_` + 24 byte acak; yang disimpan hanya SHA-256-nya dan 4 karakter terakhir.

## Desain ingatan asisten

Kunci percakapan: `user:<id akun>` (website, ikut akun di semua perangkat) atau `tg:<chat id>` (Telegram).

```
bioloop.conversations.data = {
  facts:    ["Nama Telegram: Rina", "Ahli gizi SPPG Sleman"],   ← lewat fungsi ingat_fakta
  summary:  "Rina bertanya soal pH turun setelah …",            ← ringkasan jangka panjang
  messages: [ {r:"user", text, at}, {r:"model", text, at}, … ]  ← pesan terakhir utuh
  total: 57 }
```

1. Pesan pengguna disimpan, lalu instruksi sistem disusun: persona + data reaktor terkini (sumber aktif) + fakta rujukan + **fakta pengguna** + **ringkasan** + **transkrip `MEMORY_RECENT` pesan terakhir**.
2. Gemini boleh memanggil fungsi; hasilnya dikirim balik (Interactions API memakai `previous_interaction_id`, cadangan `generateContent`).
3. Jawaban disimpan. Bila pesan melebihi `MEMORY_MAX`, pesan lama diringkas Gemini dan digabung ke ringkasan.
4. Semua di database, sehingga ingatan bertahan walau fungsi serverless berganti instance.

## Fungsi yang bisa dipanggil asisten

| Fungsi | Jenis | Keterangan |
|---|---|---|
| `lihat_status` | baca | Sensor, katup, peringatan, skor, total |
| `lihat_tren` | baca | Min/maks/rata-rata satu parameter N jam terakhir |
| `lihat_sisa_pangan` | baca | Data smart bin hari ini dan peringkat menu |
| `lihat_kejadian` | baca | Catatan kejadian terakhir dari database |
| `lihat_perangkat` | baca | Simulasi & perangkat ESP32 beserta status online |
| `hitung_kebutuhan_sppg` | hitung | Volume digester dan potensi biogas |
| `ingat_fakta` | ingatan | Simpan fakta tentang pengguna |
| `tambah_buffer`, `masukkan_umpan`, `kuras_endapan`, `atur_kompor`, `atur_katup`, `mode_otomatis` | kendali | Hanya bila `AI_CAN_CONTROL=true`; tercatat atas nama pengguna |

## Skema database (schema `bioloop`)

Dibuat otomatis saat pertama kali jalan (`lib/db/schema.sql`). RLS diaktifkan tanpa kebijakan sehingga tidak bisa dibaca lewat Data API Supabase; aplikasi memakai koneksi Postgres langsung.

| Tabel | Isi |
|---|---|
| `users` | akun, peran, status, hash sandi, penguncian |
| `reactor_state` | keadaan per sumber (`sim`, `dev:<id>`) + versi |
| `readings` | pembacaan tiap 15 menit waktu simulasi / 1 menit alat asli: suhu, pH, tekanan, CH₄, isi drum, produksi, kumulatif biogas/LPG/pupuk |
| `events` | peringatan, aksi otomatis, aksi pengguna (kolom `actor`) |
| `devices` | perangkat ESP32, hash kunci, terakhir terlihat, data terakhir |
| `device_commands` | antrean perintah ke ESP32 |
| `conversations` | ingatan asisten |
| `telegram_chats` | chat, status disetujui, langganan |
| `telegram_updates` | anti-duplikat webhook (dibersihkan setelah 3 hari) |
| `kv` | pengaturan, versi skema, info bot, jadwal laporan |

Retensi: `readings` dan `events` lebih lama dari *Simpan riwayat selama* (bawaan 90 hari) dihapus oleh cron.

## API HTTP

| Metode & jalur | Akses | Keterangan |
|---|---|---|
| `GET /api/health` | publik | versi, status database/AI/Telegram, peringatan konfigurasi |
| `GET /api/me` | publik | pengguna yang sedang masuk |
| `POST /api/auth/login` · `logout` · `register` | publik | `{username, password}`, `{username, name, password}` |
| `POST /api/auth/password` | pengguna | `{old, new}` |
| `GET /api/sources` | tamu* | daftar sumber data |
| `GET /api/state?source&since&after` | tamu* | keadaan + titik grafik setelah `since` + kejadian setelah `after` |
| `POST /api/control` | pengguna | `{source, action, …param}` |
| `POST /api/chat` · `GET /api/chat/history` · `POST /api/chat/forget` | pengguna | asisten |
| `POST /api/sensor` | perangkat | data ESP32 → `{commands, set, auto}` |
| `GET /api/device/commands` | perangkat | ambil perintah menunggu |
| `POST /api/telegram/webhook` | Telegram | header `X-Telegram-Bot-Api-Secret-Token` |
| `GET/POST /api/cron` | publik/`CRON_SECRET` | tick semua sumber, laporan berkala, retensi |
| `GET /api/admin/overview` | admin | ringkasan |
| `GET /api/admin/report?from&to&source` | admin | laporan JSON |
| `GET /api/admin/report.xlsx` · `report.csv?type=readings|events` | admin | unduhan |
| `GET/POST /api/admin/devices` · `GET/POST/DELETE /api/admin/devices/:id` · `POST …/:id/rotate` | admin | perangkat |
| `GET/POST /api/admin/users` · `POST/DELETE /api/admin/users/:id` · `POST …/:id/reset` | admin | pengguna |
| `GET /api/admin/telegram` · `POST …/webhook` · `POST/DELETE …/chats/:id` · `POST …/test` · `POST …/broadcast` | admin | Telegram |
| `GET/POST /api/admin/settings` · `POST /api/admin/cron` | admin | pengaturan |

\* bisa diubah menjadi khusus pengguna lewat pengaturan *Dasbor bisa dilihat tamu*.

Aksi `control`:

| action | parameter | Alat asli |
|---|---|---|
| `buffer` | `grams` (50–3000) | diantrikan ke ESP32 |
| `feed` | `kg`, `type` (`campuran`, `nasi`, `sayur`, `lauk`, `buah`, `sapi`), `water` | tidak (manual oleh petugas) |
| `drain` | `liters` | diantrikan |
| `stove` | `on`, `burners` (1–2) | diantrikan |
| `valve` | `mode`: `panas` / `dingin` / `tutup` | diantrikan |
| `auto`, `stir` | `on` | diantrikan |
| `schedule` | `feed`, `stove` | simulasi |
| `setpoint` | `T`, `band`, `pHmin`, `pHmax`, `Pmax`, `sludgeMax`, `feedKg`, `porsi` | disimpan + diantrikan |
| `scenario` | `k`: `cold`, `hot`, `over`, `protein`, `heatfail`, `leak`, `stove`, `scrub`, `fixleak`, `fixheat`, `fixscrub` | tidak |
| `speed` | `speed` (1–7200) · `pause` `on` | tidak |
| `reset` | (khusus admin) | tidak |

Data dari ESP32 (semua kolom opsional):

```
POST /api/sensor
X-Device-Key: blk_…
{ "T": 35.1, "pH": 7.12, "press": 7.0, "lel": 0, "vg": 180,
  "hot": false, "cold": false, "stove": true, "fw": "3.0.0",
  "ch4": 61, "h2s": 900, "sludge": 40, "scrub": 80, "vfa": 400, "prod_m3_day": 0.45 }
```

`vg` boleh liter (> 5) atau m³; `ch4` boleh persen atau pecahan. Bila `prod_m3_day` dikirim, server menjumlahkan biogas kumulatif; saat `stove` menyala, pemakaian kompor dihitung dari laju tungku.

## Rangkaian ESP32

| Perangkat | Pin ESP32 | Catatan |
|---|---|---|
| DS18B20 tahan air | GPIO4 | Resistor 4,7 kΩ data ke 3,3 V |
| Modul pH (PH-4502C) | GPIO34 | Keluaran 5 V → pembagi 10k/20k |
| MPX5010DP | GPIO35 | Keluaran 5 V → pembagi 10k/20k; selang ke jalur gas |
| MQ-4 | GPIO32 | Pembagi 10k/20k; dekat sambungan, di bawah atap |
| JSN-SR04T | TRIG GPIO5, ECHO GPIO18 | Di atas drum menghadap bawah |
| Relay air panas / dingin | GPIO25 / GPIO26 | Solenoid 12 V normally closed |
| Relay pompa buffer | GPIO27 | Pompa peristaltik/dosis |
| Relay katup gas kompor | GPIO14 | Solenoid gas normally closed |
| Relay pengaduk | GPIO12 | Motor sesuai rating relay |
| Relay katup bawah | GPIO13 | Katup bola bermotor |
| Buzzer | GPIO33 | Alarm lokal kebocoran |

Kontrol lokal tanpa server: histeresis suhu, katup kompor ditutup saat LEL > 10% atau tekanan < 2 mbar, pemanas mati bila sensor suhu gagal, pompa/katup dengan batas waktu. Ke Vercel memakai HTTPS (`WiFiClientSecure`).

## Keamanan

- **Rahasia di server saja.** Token, kunci, dan `DATABASE_URL` hanya di Environment Variables. `.env` ada di `.gitignore`.
- **Keluaran AI** dirender dengan markdown mini yang meng-escape HTML; tautan hanya `http(s)`/relatif.
- **Header keamanan** (`nosniff`, `Referrer-Policy`, `X-Frame-Options`) lewat `vercel.json`.
- **Data tingkat gratis Gemini** dapat dipakai Google untuk pengembangan produk. Hindari data pribadi siswa.
- **Kata sandi bawaan** `12345` hanya untuk masuk pertama; panel admin menampilkan spanduk sampai diganti.

## Mengembangkan lebih lanjut

- **Computer vision nyata**: tambahkan rute `POST /api/waste` di `lib/router.js` yang menulis ke `S.wp` lewat `reactor.run()` (lihat `cvDay()` di `sim.js`).
- **Banyak SPPG**: daftarkan tiap bioreaktor sebagai perangkat; laporan sudah per sumber.
- **Notifikasi lain** (email/WhatsApp): tambahkan pengirim di `pickNotify()`/`notifyEvents()`.
