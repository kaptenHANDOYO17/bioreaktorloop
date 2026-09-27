# Menjalankan di komputer sendiri (laptop, Raspberry Pi, VPS)

Panduan ini untuk menjalankan MBG-BIOLOOP **di komputer sendiri**, misalnya untuk uji coba di laptop atau server di dapur SPPG. Untuk online lewat internet dengan GitHub + Vercel, baca **Panduan deploy (GitHub + Vercel)**. Panduan ini juga untuk Anda yang **belum pernah memrogram**. Ikuti urutannya, satu langkah selesai baru lanjut. Waktu yang dibutuhkan ±30 menit.

Yang Anda perlukan:

- Laptop/komputer Windows, macOS, atau Linux (Raspberry Pi juga bisa)
- Koneksi internet
- Akun Telegram di HP
- Akun Google (untuk kunci Gemini)

---

## Langkah 1: Pasang Node.js

Node.js adalah "mesin" yang menjalankan server BIOLOOP.

1. Buka **https://nodejs.org**
2. Klik tombol hijau bertuliskan **LTS** (versi stabil).
3. Buka file yang terunduh, lalu klik **Next** terus sampai **Finish**. Pengaturan bawaan sudah benar.
4. Cek pemasangan: buka **Command Prompt** (Windows: tekan tombol Windows, ketik `cmd`, Enter) atau **Terminal** (macOS), lalu ketik:

```
node -v
```

Bila muncul angka seperti `v22.x.x` (minimal v20), berarti berhasil.

## Langkah 2: Ekstrak folder proyek

1. Klik kanan file **mbg-bioloop.zip** → **Extract All** / **Ekstrak semua**.
2. Pindahkan folder `mbg-bioloop` ke tempat yang mudah, misalnya `Dokumen`.

Isi folder yang penting:

| File/folder | Fungsinya |
|---|---|
| `start-windows.bat` | Klik dua kali untuk menjalankan di Windows |
| `start-mac-linux.sh` | Untuk macOS/Linux/Raspberry Pi |
| `.env.example` | Contoh pengaturan (akan disalin menjadi `.env`) |
| `public/` | Website dasbor 3D |
| `server/` | Server untuk komputer sendiri |
| `firmware/` | Program untuk kontroler ESP32 di alat asli |
| `public/docs/` | Panduan dan data penelitian (Excel) |
| `lib/` | Otak sistem: akun, database, laporan, Telegram, Gemini |

> File yang namanya diawali titik (seperti `.env.example`) kadang tersembunyi. Di Windows Explorer: menu **View** → centang **Hidden items** dan **File name extensions**.

## Langkah 3: Buat bot Telegram

1. Di Telegram, cari **@BotFather** (ada centang biru) lalu tekan **Start**.
2. Ketik `/newbot`
3. Beri nama tampilan, misalnya `BIOLOOP SPPG Sleman`
4. Beri username yang berakhiran `bot`, misalnya `bioloop_sleman_bot`
5. BotFather mengirim **token** seperti ini:

```
7123456789:AAHk3xYz_contohTokenJanganDisebar
```

Salin token itu. **Jangan bagikan token ke siapa pun** dan jangan unggah ke internet. Siapa pun yang memegang token bisa mengendalikan bot Anda. Bila bocor, ketik `/revoke` di BotFather untuk membuat token baru.

## Langkah 4: Ambil API key Gemini (gratis)

1. Buka **https://aistudio.google.com/apikey** dan masuk dengan akun Google.
2. Klik **Create API key** (Buat kunci API).
3. Salin kunci yang muncul (diawali `AIza...`).

Catatan penting tentang tingkat gratis:

- Tingkat gratis punya batas jumlah permintaan per menit dan per hari. Untuk satu dapur SPPG biasanya cukup. Bila muncul pesan "kuota habis", tunggu sebentar atau aktifkan penagihan di AI Studio.
- Pada tingkat gratis, Google dapat memakai isi percakapan untuk meningkatkan produknya. **Jangan ketik data pribadi siswa atau data rahasia** ke asisten. Untuk penggunaan resmi, pakai tingkat berbayar.
- Jaga kunci ini seperti kata sandi.

## Langkah 5: Isi file pengaturan `.env`

**Windows (cara termudah):** klik dua kali `start-windows.bat`. Bila `.env` belum ada, file itu otomatis dibuat dan Notepad terbuka.

**Cara manual:** salin `.env.example`, ganti nama salinannya menjadi `.env`, lalu buka dengan Notepad / TextEdit.

Isi minimal:

```
SITE_NAME=SPPG Sleman 01
TELEGRAM_BOT_TOKEN=7123456789:AAHk3xYz_contohTokenJanganDisebar
GEMINI_API_KEY=AIzaSy_contohKunci
```

- `SITE_NAME` nama yang tampil di website dan pesan Telegram
- `DATABASE_URL` boleh dikosongkan: data disimpan di folder `data/`. Bila ingin memakai Supabase/Postgres juga di komputer sendiri, isi alamatnya

Simpan file (Ctrl+S).

## Langkah 6: Jalankan

> Lebih suka mengetik perintah sendiri (misalnya di VS Code) daripada klik file .bat? Ikuti **Perintah terminal (tanpa .bat)**: `npm install` → `npm run cek` → `npm start`.

- **Windows:** klik dua kali `start-windows.bat`
- **macOS/Linux:** buka Terminal di folder proyek, ketik `./start-mac-linux.sh` (atau `node server/index.js`)

Bila berhasil, muncul tulisan:

```
  MBG-BIOLOOP AI v3.0.0
  Website  : http://localhost:3000
  Admin    : http://localhost:3000/admin.html
  Gemini   : aktif, model ...
  [telegram] Bot @bioloop_sleman_bot aktif.
```

Buka browser ke **http://localhost:3000**. **Jangan tutup jendela hitam** itu selama sistem dipakai; menutupnya berarti mematikan server.

Masuk ke panel admin di **http://localhost:3000/admin.html** dengan `Handoyo` / `12345`, lalu **segera ganti kata sandinya**.

## Langkah 7: Sambungkan Telegram

1. Buka bot Anda di Telegram, tekan **Start**. Bot membalas "menunggu persetujuan admin".
2. Buka panel admin → menu **Telegram** → klik **Setujui** pada chat Anda.
3. Ketik `/start` lagi di Telegram, lalu coba `/status` dan pertanyaan biasa seperti *"kenapa pH bisa turun?"*.

Di komputer sendiri bot memakai **long polling** (menjemput pesan terus-menerus), jadi tidak perlu webhook maupun IP publik. Asisten mengingat obrolan Anda; ketik `/ingatan` untuk melihat apa yang diingat, `/lupa` untuk menghapusnya.

> Jangan menjalankan bot yang sama di komputer dan di Vercel sekaligus. Bila Vercel sudah memasang webhook, bot lokal akan menunggu (pesan *409 Conflict*).

## Langkah 8: Coba dari HP di jaringan yang sama

1. Cari alamat IP komputer: Windows `ipconfig` (lihat *IPv4 Address*), macOS `ipconfig getifaddr en0`.
2. Di HP yang tersambung ke WiFi yang sama, buka `http://192.168.x.x:3000`.
3. Bila tidak bisa dibuka, izinkan Node.js di Windows Firewall (muncul pertanyaan saat pertama kali dijalankan → **Allow**).

---

## Menjalankan 24 jam

Peringatan Telegram hanya terkirim selama server menyala. Pilihan:

| Pilihan | Cocok untuk | Catatan |
|---|---|---|
| Laptop/PC di dapur | Uji coba | Matikan mode *sleep* di pengaturan daya |
| Raspberry Pi 4/5 | Pemasangan permanen murah | Pasang Node.js LTS, jalankan `./start-mac-linux.sh` |
| VPS (server sewaan) | Diakses dari mana saja | Pakai Docker (di bawah) dan pasang HTTPS |

**Hindari hosting gratis yang "tidur"** saat tidak ada pengunjung. Server yang tidur tidak bisa memantau sensor dan tidak mengirim peringatan.

### Dengan Docker

```
cp .env.example .env      # lalu isi
docker compose up -d --build
docker compose logs -f    # melihat log
```

Data (ingatan obrolan, catatan, keadaan) tersimpan di volume `bioloop-data` sehingga aman saat container diperbarui.

### Supaya menyala otomatis di Raspberry Pi/Linux (systemd)

Buat file `/etc/systemd/system/bioloop.service`:

```
[Unit]
Description=MBG-BIOLOOP AI
After=network-online.target

[Service]
WorkingDirectory=/home/pi/mbg-bioloop
ExecStart=/usr/bin/node server/index.js
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

Lalu: `sudo systemctl enable --now bioloop`

### Bila diakses dari internet

- Ganti kata sandi admin bawaan dan matikan *Pendaftaran terbuka* bila tidak dibutuhkan.
- Pasang HTTPS lewat reverse proxy (Caddy/Nginx) atau Cloudflare Tunnel.
- Setujui hanya akun dan chat Telegram yang Anda kenal.

---

## Menghubungkan alat asli (ESP32)

Setelah bioreaktor fisik dibangun:

1. Buka panel admin → **Perangkat** → **Daftarkan perangkat**. Salin kunci yang muncul (hanya tampil sekali).
2. Pasang Arduino IDE, tambahkan board **esp32 by Espressif**, dan pustaka **OneWire**, **DallasTemperature**, **ArduinoJson (7.x)**.
3. Buka `firmware/bioloop_esp32/bioloop_esp32.ino`, isi `WIFI_SSID`, `WIFI_PASS`, `SERVER_URL` (alamat Vercel Anda, atau IP komputer server misalnya `http://192.168.1.10:3000`), dan `DEVICE_KEY` dari panel admin.
4. Kalibrasi sebelum dipakai:
   - **pH:** celupkan ke larutan pH 7, catat tegangan ke `PH_V7`; larutan pH 4 untuk menghitung `PH_SLOPE`.
   - **Tinggi drum:** ukur jarak sensor ke atap drum saat drum turun penuh → `US_REST_CM`.
   - **MQ-4:** panaskan 24 jam di udara bersih, catat tegangan → `MQ4_V_CLEAN`. Angka %LEL dari MQ-4 hanya perkiraan; untuk keselamatan pakai juga detektor gas bersertifikat.
   - **Pompa buffer & katup kuras:** ukur gram/detik dan liter/detik.
5. Upload ke ESP32. Buka Serial Monitor (115200) untuk melihat data.

Kontroler tetap menjaga suhu dan menutup katup kompor bila ada kebocoran **walaupun WiFi atau server mati**.

Rangkaian sensor dan relay dijelaskan di `ARSITEKTUR.md`.

---

## Masalah umum

| Gejala | Penyebab & solusi |
|---|---|
| `node` tidak dikenal | Node.js belum terpasang atau komputer perlu di-restart setelah pemasangan |
| `Port 3000 sudah dipakai` | Ganti `PORT=3001` di `.env` lalu buka `http://localhost:3001` |
| Bot tidak membalas | Token salah/tertukar. Cek jendela hitam: bila tertulis `401 Unauthorized`, salin ulang token |
| Bot membalas "menunggu persetujuan admin" | Setujui chat di panel admin → Telegram |
| `409 Conflict` di log Telegram | Bot dijalankan di dua tempat sekaligus. Matikan salah satunya |
| Asisten menjawab "GEMINI_API_KEY belum diisi" | Isi kunci di `.env`, simpan, jalankan ulang server |
| Asisten menjawab kunci tidak valid (401/403) | Buat kunci baru di AI Studio dan pastikan tidak ada spasi tambahan |
| Asisten menjawab kuota habis (429) | Batas tingkat gratis tercapai. Tunggu beberapa menit |
| Model tidak ditemukan (404) | Nama model sudah diganti Google. Cek daftar di ai.google.dev/gemini-api/docs/models, ubah `GEMINI_MODEL` |
| Website "Mode demo" | Halaman dibuka langsung dari file, bukan lewat `http://localhost:3000` |
| Model 3D tidak muncul | Browser/komputer tidak mendukung WebGL. Data dan kendali tetap berfungsi. Coba Chrome terbaru |
| Tombol kendali meminta masuk | Masuk dengan akun Anda; tamu hanya bisa melihat |
| `npm` tidak dikenal | Node.js belum terpasang lengkap; pasang ulang versi LTS |

## Menghapus data

Tanpa `DATABASE_URL`, semua data tersimpan di folder `data/` (akun, keadaan reaktor, pembacaan, kejadian, perangkat, ingatan obrolan, chat Telegram). Untuk mulai bersih, matikan server lalu hapus file `.json` di folder itu. Akun admin `Handoyo` / `12345` dibuat lagi otomatis.
