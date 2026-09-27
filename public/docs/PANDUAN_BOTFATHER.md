# Template pengaturan bot Telegram (BotFather & notifikasi)

Panduan ini berisi **teks siap salin** untuk mengatur bot **@Bioreaktorloop_bot** di @BotFather, lalu langkah agar bot **mengirim peringatan otomatis** saat bioreaktor **SIAGA** atau **BAHAYA**, atau saat ada yang perlu dikerjakan (kuras endapan, ganti media scrubber, gas habis).

Cara pakai: buka Telegram → cari **@BotFather** → **Start**. Ketik perintah di kolom kiri, BotFather bertanya, lalu kirim teks di kolom kanan. Bila BotFather meminta memilih bot, ketuk **@Bioreaktorloop_bot**.

## Cara cepat (otomatis dari panel admin)

Panel admin → **Telegram & notifikasi** → **Atur profil & menu bot**.
Ini memasang sekaligus: menu perintah (tombol "/"), deskripsi yang tampil sebelum orang menekan Start, dan info singkat di profil bot. Sama dengan langkah 3, 4, dan 6 di bawah. Yang tetap lewat BotFather hanya **nama** dan **foto**.

Lewat terminal VS Code: `npm run bot -- profil`

## 1. Nama bot

| Ketik ke BotFather | Kirim teks ini |
|---|---|
| `/setname` | `Bioreaktor Loop SPPG` |

## 2. Foto profil

| Ketik ke BotFather | Kirim |
|---|---|
| `/setuserpic` | Gambar **bot-avatar.png** (ada di folder proyek `public/img/bot-avatar.png`, atau buka `https://bioreaktorloop.vercel.app/img/bot-avatar.png` lalu simpan gambarnya). Kirim sebagai **foto**, bukan file |

## 3. Deskripsi (tampil sebelum orang menekan Start)

Ketik `/setdescription`, lalu kirim:

```
Bot pemantau bioreaktor sisa makan siang MBG di dapur SPPG.

• Mengirim peringatan otomatis saat bioreaktor SIAGA atau BAHAYA (suhu, pH, kebocoran gas, gas habis, endapan penuh)
• Laporan harian biogas, LPG yang dihemat, dan pupuk
• Menjawab pertanyaan dengan asisten AI

Tekan START, lalu tunggu persetujuan admin SPPG.
```

## 4. Info singkat (tampil di profil bot)

Ketik `/setabouttext`, lalu kirim:

```
Peringatan & laporan bioreaktor sisa makan siang MBG di dapur SPPG. Tekan START untuk ikut menerima notifikasi.
```

## 5. Izin grup

| Ketik ke BotFather | Pilih | Alasan |
|---|---|---|
| `/setjoingroups` | **Enable** | Agar bot bisa dimasukkan ke grup petugas SPPG |
| `/setprivacy` | **Enable** | Di grup, bot hanya membaca perintah (`/status`) dan pesan yang membalas bot, tidak membaca obrolan lain |

## 6. Menu perintah

Ketik `/setcommands`, lalu kirim **semua baris** ini sekaligus:

```
status - Ringkasan sensor
laporan - Laporan hari ini
peringatan - Peringatan aktif
perangkat - Status alat ESP32
suhu - Suhu & katup
ph - pH & VFA
gas - Isi drum & tekanan
endapan - Endapan & pupuk
prediksi - Analitik 6 jam
sisa - Menu paling banyak tersisa
kompor_on - Nyalakan kompor
kompor_off - Matikan kompor
notif_on - Nyalakan notifikasi
notif_off - Matikan notifikasi
ingatan - Apa yang diingat asisten
lupa - Hapus ingatan
id - Lihat Chat ID
bantuan - Cara pakai
```

> **Jangan** memakai `/revoke` atau `/token` kecuali token bocor. Token baru harus diisi ulang di Vercel (`TELEGRAM_BOT_TOKEN`) lalu Redeploy.

---

## Agar bot mengirim peringatan otomatis

Centang semuanya:

1. **Token terpasang**: Vercel → Settings → Environment Variables → `TELEGRAM_BOT_TOKEN` terisi → Redeploy.
2. **Webhook hijau**: panel admin → Telegram & notifikasi → kotak Webhook *Terpasang*. Bila belum, klik **Pasang otomatis**.
3. **Chat disetujui**: petugas membuka bot → **Start** → admin klik **Setujui** di tabel chat. Kolom *Notifikasi* harus **Aktif**.
4. **Jenis notifikasi menyala**: kartu **Notifikasi otomatis** → nyalakan *Peringatan bahaya & waspada* (wajib) dan *Aksi penting* (disarankan) → **Simpan notifikasi**.
5. **Cron berjalan tiap 5 menit** (cron-job.org atau GitHub Actions). Tanpa cron, bioreaktor hanya diperiksa saat ada yang membuka website, sehingga peringatan bisa terlambat.
6. **Coba**: klik **Cek koneksi** (semua harus ✓), lalu **Kirim sekarang → 📊 Status reaktor**. Pesan harus masuk ke Telegram.

### Apa saja yang dikirim

| Keadaan | Contoh judul pesan | Kapan |
|---|---|---|
| 🚨 **BAHAYA** | Kebocoran gas > 20% LEL, suhu < 28 °C atau > 42 °C, pH < 6,2, VFA > 4.000 mg/L, tekanan di katup pengaman, kompor diblokir, alat ESP32 berhenti mengirim data | Langsung, dan diulang selama masih terjadi |
| ⚠️ **SIAGA** | Suhu di luar rentang normal, pH di luar 6,6–7,9, VFA tinggi, kebocoran 10–20% LEL, metana rendah, drum gas hampir penuh, gas hampir habis | Langsung; peringatan yang sama paling cepat diulang sesuai pengaturan (bawaan 15 menit) |
| 🧰 **Perlu dikerjakan** | Endapan penuh (kuras), media scrubber H₂S jenuh (ganti), biogas habis (pakai LPG cadangan) | Saat batas terlewati, dengan baris **👉 Tindakan** |
| ✅ **Kembali normal** | "pH kembali normal" | Saat masalah selesai |
| 🗓 **Laporan** | Status reaktor / laporan hari ini | Sesuai jadwal yang Anda buat |

Contoh pesan yang diterima petugas:

```
⚠️ SIAGA — bioreaktor perlu perhatian

⚠️ pH
pH 6,48 terlalu asam (batas 6,6). Biasanya karena umpan berlebih.
👉 Tindakan: tambah buffer NaHCO₃, hentikan umpan 1-2 hari. Buffer sudah ditambahkan otomatis.

Ketik /status untuk kondisi terkini, /peringatan untuk semua peringatan aktif.

🕒 27/09/26 14.35 | Simulasi | BioreaktorloopSppg
```

### Grup petugas

1. Buat grup Telegram (misalnya "Petugas SPPG"), tambahkan **@Bioreaktorloop_bot**.
2. Di grup ketik `/start`.
3. Panel admin → setujui chat bernama grup itu. Semua anggota grup menerima peringatan.

## Template pengumuman (menu Pengumuman / Jadwal pesan)

```
📢 Besok pukul 09.00 pengurasan endapan 25 L. Siapkan bak pengering dan sarung tangan.
```

```
🧰 Pengingat mingguan: cek sambungan selang dengan air sabun dan buka keran penjebak air.
```

```
🧪 Jumat ini kalibrasi sensor pH. Dasbor mungkin menampilkan angka tidak stabil 10 menit.
```

```
🍽 Rekap sisa makan siang minggu ini sudah ada di website, tab Sisa pangan. Mohon ahli gizi meninjau menu dengan sisa tertinggi.
```

## Bila bot diam

| Gejala | Solusi |
|---|---|
| Bot tidak membalas `/start` | Panel admin → Telegram & notifikasi → **Cek koneksi**. Bila *Webhook* merah → **Pasang otomatis** |
| Membalas "menunggu persetujuan" terus | Chat belum disetujui di panel admin |
| `/status` jalan tetapi peringatan tidak datang | Kolom *Notifikasi* chat **Aktif**? Kartu *Notifikasi otomatis* menyala? Cron berjalan? |
| Pertanyaan biasa tidak dijawab | *Cek koneksi* → *Asisten Gemini* harus ✓. Bila merah, periksa `GEMINI_API_KEY` di Vercel |
