# Panduan admin MBG-BIOLOOP

Untuk admin SPPG yang **bukan orang teknik**. Panel admin ada di **alamat-website/admin.html** (misalnya `https://bioreaktorloop.vercel.app/admin.html`), atau klik lingkaran nama Anda → **Panel admin**.

Halaman depan website sengaja hanya berisi informasi untuk umum. Semua yang khusus admin ada di panel admin:

| Menu | Isi |
|---|---|
| **Ringkasan** | Daftar **Siap dipakai?**, angka 7 hari, peringatan, perangkat, pengguna, chat Telegram |
| **Laporan** | Laporan lengkap per sumber & periode, unduh Excel/CSV/PDF |
| **Perangkat** | Alat ESP32 terdaftar, kunci, status online, perintah |
| **Pengguna** | Setujui, buat, reset sandi, jadikan admin, nonaktifkan |
| **Telegram & notifikasi** | Webhook, chat, **notifikasi otomatis**, **kirim sekarang**, **jadwal pesan**, pengumuman |
| **Pengaturan** | Nama SPPG, harga LPG, pendaftaran, tamu, cron, kata sandi Anda |
| **Panduan** | Semua panduan, bisa dibaca langsung di panel |

Di halaman dasbor, admin juga melihat alat khusus admin: **kecepatan simulasi, jeda, uji gangguan, dan mulai ulang**. Pengunjung umum tidak melihat tombol-tombol itu.

## 1. Akun

### Akun siap pakai

Setelah menjalankan `npm run akun -- awal` (lihat *Menyelesaikan pemasangan*), akun berikut aktif:

| Nama pengguna | Kata sandi | Peran |
|---|---|---|
| `Handoyo` | `12345` | admin |
| `admin` | `admin123` | admin |
| `petugas` | `petugas123` | pengguna |
| `gizi` | `gizi123` | pengguna |
| `guru` | `guru123` | pengguna |

> **Kata sandi ini mudah ditebak.** Pakai untuk uji coba. Sebelum website dipakai sungguhan, ganti kata sandi admin (klik nama Anda → *Ganti kata sandi*) dan nonaktifkan akun yang tidak dipakai di menu **Pengguna**.

### Mengelola akun lewat panel

- **Setujui / Tolak** pendaftaran baru (baris kuning, angka merah di menu).
- **Tambah pengguna**: kosongkan kata sandi agar dibuatkan kata sandi sementara.
- **Reset sandi**, **Jadikan admin / pengguna**, **Nonaktifkan / Aktifkan**, **Hapus**.
- Admin aktif terakhir tidak bisa dihapus atau dinonaktifkan, supaya panel tidak terkunci.

### Lupa kata sandi atau tidak bisa masuk sama sekali

Pakai terminal VS Code di folder proyek (file `.env` harus berisi `DATABASE_URL` yang **sama** dengan di Vercel):

```
npm run akun -- daftar
npm run akun -- sandi Handoyo 12345
```

Baris pertama menampilkan semua akun; baris kedua mengganti kata sandi dan membuka kunci akun. Perintah lain:

```
npm run akun -- awal
npm run akun -- buat rina rina2045 user "Rina Ahli Gizi"
npm run akun -- admin rina
npm run akun -- nonaktifkan guru
```

Setiap perintah menulis **Database: PostgreSQL aws-0-…supabase.com** di baris atas. Pastikan alamat itu sama dengan database di Vercel; bila tertulis *berkas lokal*, berarti `.env` belum berisi `DATABASE_URL`.

## 2. Ringkasan: daftar "Siap dipakai?"

Kartu paling atas menunjukkan apa yang masih kurang. Tanda ✓ hijau berarti beres; tanda ! kuning berarti perlu dikerjakan, lengkap dengan petunjuk dan tautan:

| Item | Cara membereskan |
|---|---|
| Database tersambung | Isi `DATABASE_URL` di Vercel → Redeploy |
| Kata sandi admin sudah diganti | Klik nama Anda → Ganti kata sandi |
| Asisten AI aktif | Isi `GEMINI_API_KEY` di Vercel → Redeploy |
| Token bot terisi | Isi `TELEGRAM_BOT_TOKEN` di Vercel → Redeploy |
| Webhook terpasang | Biasanya otomatis. Bila belum: Telegram & notifikasi → **Pasang otomatis** |
| Minimal satu chat menerima notifikasi | Buka bot → Start → setujui chat Anda |
| Cron berjalan | Pasang GitHub Actions atau cron-job.org |
| Perangkat ESP32 (opsional) | Daftarkan saat alat asli siap |

## 3. Telegram & notifikasi

### Webhook

Webhook adalah "alamat balasan" bot. Website memasangnya **otomatis** setiap kali panel admin dibuka atau cron berjalan, memakai alamat produksi (`https://…vercel.app`). Bila kotak Webhook tidak hijau, klik **Pasang otomatis**. Tombol *Pasang ke alamat di atas* untuk alamat khusus (misalnya domain sendiri).

### Menyetujui chat

1. Orang membuka bot → **Start**. Chatnya muncul di tabel dengan status **Menunggu**.
2. Klik **Setujui**. Bot mengirim pesan "sudah disetujui".
3. Per chat Anda bisa: *Matikan/Nyalakan notifikasi*, *Kirim uji*, *Cabut*, *Hapus*.

### Notifikasi otomatis

Kartu **Notifikasi otomatis** mengatur apa yang dikirim bot tanpa perlu ditekan:

| Pilihan | Isi pesan |
|---|---|
| 🚨 Peringatan bahaya & waspada | Suhu, pH, tekanan, kebocoran, gas habis, dan saat kembali normal |
| ⚙️ Aksi penting | Kompor, katup, buffer, pengurasan (oleh orang maupun kontrol otomatis) |
| 🗓 Kegiatan terjadwal | Umpan harian, rekap smart bin |
| 🧪 Ikut kirim dari simulasi | Matikan setelah alat asli dipakai agar Telegram tidak ramai |
| Peringatan yang sama diulang tiap … menit | Mencegah pesan berulang untuk masalah yang sama (bawaan 15) |
| Ringkasan status berkala tiap … jam | 0 = mati; misalnya 6 = tiap 6 jam |

Klik **Simpan notifikasi**. Pesan dikirim ke semua chat yang **disetujui** dan notifikasinya **aktif**.

### Kirim sekarang

Tombol **📊 Status reaktor**, **🗓 Laporan hari ini**, **📟 Status perangkat** langsung mengirim ke semua chat penerima. Kotak **Pengumuman** untuk pesan bebas (misalnya jadwal pengurasan).

### Jadwal pesan otomatis

1. Klik **+ Tambah jadwal**.
2. Pilih **Jenis**: *Laporan hari ini*, *Status reaktor*, atau *Pesan sendiri* (isi teksnya).
3. Pilih **Jam** (waktu WIB) dan **hari** (klik hari untuk mematikan/menyalakan; semua menyala = setiap hari).
4. Klik **Simpan jadwal**.

Contoh: laporan hari ini pukul 15.00 Senin–Sabtu; status pukul 06.30 setiap hari; pesan sendiri "Pengingat: kuras endapan 20 L" setiap Jumat 09.00.

Jadwal dan notifikasi berkala berjalan dari **cron**. Dengan cron tiap 5 menit, pesan terkirim paling lambat ±5 menit setelah jamnya; dengan cron tiap 30 menit, paling lambat ±30 menit. Tanpa cron, jadwal hanya berjalan saat ada yang membuka website.

### Alternatif lewat terminal

```
npm run bot -- info
npm run bot -- chat
npm run bot -- setujui 123456789
npm run bot -- kirim "Besok pukul 09.00 pengurasan endapan"
npm run bot -- status
npm run bot -- laporan
npm run bot -- pasang https://bioreaktorloop.vercel.app
```

## 4. Laporan

1. Pilih **Sumber** (semua, simulasi, atau alat tertentu) dan **Periode** (24 jam, 7/30/90 hari, atau tanggal).
2. Laporan tersusun otomatis: kartu ringkasan, grafik biogas & suhu, ringkasan per sumber, rekap harian, peringatan paling sering, aktivitas pengguna, dan catatan kejadian dengan filter.
3. Unduh **Excel lengkap** (10 sheet), **CSV pembacaan / kejadian**, atau **Cetak / PDF** (pilih *Save as PDF*).

## 5. Perangkat ESP32

- **Daftarkan perangkat** → salin dua baris `SERVER_URL` dan `DEVICE_KEY` ke firmware (kunci hanya tampil sekali).
- Status *Online* bila mengirim data < 2 menit lalu. Perintah dari dasbor/Telegram diambil alat saat kirim data berikutnya (±10 detik).
- **Kunci baru** bila kunci bocor; **Nonaktifkan** saat perbaikan; **Hapus** bila alat tidak dipakai (riwayat tetap ada).
- Setelah alat asli berjalan: Pengaturan → *Sumber utama* = alat itu; Telegram & notifikasi → matikan *Ikut kirim dari simulasi*.

## 6. Pengaturan

| Pengaturan | Kegunaan |
|---|---|
| Nama lokasi/SPPG | Tampil di website, laporan, dan pesan Telegram |
| Sumber utama | Sumber yang dibuka pertama kali dan dipakai bot/asisten |
| Harga LPG 12 kg | Dasar hitungan penghematan |
| Simpan riwayat selama … hari | Data lebih lama dihapus otomatis |
| Pendaftaran terbuka | Matikan bila hanya admin yang membuat akun |
| Dasbor bisa dilihat tamu | Matikan bila dasbor hanya untuk pemilik akun |

Bagian **Cron & alamat penting** berisi alamat cron (untuk GitHub Actions/cron-job.org), alamat sensor ESP32, dan tombol **Jalankan cron sekarang**.

## 7. Kebiasaan aman

- Ganti kata sandi mudah sebelum website dipakai sungguhan. Jangan menuliskannya di grup.
- Setujui hanya chat Telegram dan akun yang Anda kenal. Nonaktifkan akun petugas yang pindah tugas.
- Unduh laporan Excel tiap bulan sebagai arsip.
- Jangan membagikan isi Environment Variables Vercel atau file `.env` (token bot, kunci Gemini, `DATABASE_URL`).
