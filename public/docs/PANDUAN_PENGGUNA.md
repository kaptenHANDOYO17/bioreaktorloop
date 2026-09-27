# Panduan pengguna MBG-BIOLOOP

Panduan ini untuk **siapa saja**: petugas dapur SPPG, ahli gizi, guru, orang tua, dan warga yang ingin ikut memantau bioreaktor sisa makan siang. Tidak perlu memasang aplikasi apa pun. Cukup browser di HP atau laptop, dan Telegram bila ingin menerima pemberitahuan.

## Siapa bisa apa

| Siapa | Bisa apa | Perlu apa |
|---|---|---|
| **Pengunjung umum** | Melihat dasbor 3D, angka sensor, grafik, sisa pangan, catatan kejadian, kalkulator, data penelitian | Buka alamat website saja, tanpa akun |
| **Pengguna terdaftar** (petugas, ahli gizi) | Semua di atas + tab **Kendali** (kompor, buffer, umpan, kuras) + **Asisten AI** yang mengingat obrolan | Akun dari admin, atau daftar lalu disetujui admin |
| **Admin** | Semua di atas + **panel admin** (laporan, perangkat, pengguna, Telegram, pengaturan) | Akun admin |

## 1. Memantau tanpa akun

1. Buka alamat website, misalnya `https://bioreaktorloop.vercel.app`.
2. Klik **Pantau reaktor sekarang** atau menu **Pantau**.
3. Tunggu titik di pojok kanan atas berubah **hijau "Terhubung"**. Saat website baru "bangun", ini bisa memakan waktu 5–20 detik; tulisannya "Menghubungkan…" atau "Server sedang bangun". Bila sempat muncul **Mode demo**, biarkan halaman terbuka: website terus mencoba dan otomatis beralih ke data server begitu tersambung.

### Membaca bagian atas dasbor

| Elemen | Arti |
|---|---|
| **Sumber** | Muncul bila ada lebih dari satu sumber: *Simulasi* atau nama alat ESP32 (dengan keterangan online/offline) |
| **Jam** | Waktu simulasi (misal *Hari 3, 14.20*), atau *Waktu nyata* untuk alat asli |
| **Status proses** | ✓ hijau *Proses stabil* + skor 0–100; ! kuning *Perhatian*; ✕ merah *Bahaya* beserta nama masalahnya |
| **Titik kanan atas** | Hijau = tersambung; kuning = mode demo; merah = terputus (dicoba ulang otomatis) |

Enam kartu angka: suhu, pH, tekanan gas, isi drum gas, produksi biogas, dan kebocoran. Tiap kartu berlabel Normal / Waspada / Bahaya dengan garis tren kecil, diperbarui tiap ±2 detik.

### Rentang normal

| Parameter | Normal | Perlu perhatian | Artinya |
|---|---|---|---|
| Suhu slurry | 33–37 °C | < 32 atau > 38 °C | Bakteri bekerja paling baik di suhu hangat tubuh |
| pH | 6,6–7,9 | < 6,6 atau > 7,9 | pH turun = reaktor "asam", biasanya karena terlalu banyak umpan |
| Tekanan gas | ±7 mbar | > 12 mbar | Gas menumpuk; sebaiknya dipakai memasak |
| Metana | > 45% | < 45% | Gas sulit menyala |
| Kebocoran | 0% LEL | > 10% LEL; bahaya > 20% | **Jauhi api**, beri tahu petugas |
| Endapan | < 60 L | > 60 L | Waktunya dikuras |

### Model 3D

- **Seret** untuk memutar, **scroll/cubit** untuk zoom.
- **Klik benda** (tangki, drum, sensor, kompor) untuk penjelasan dan angka terkini.
- Tombol **Semua / Bioreaktor / Jalur gas / Dapur SPPG** memindahkan kamera; **Tembus pandang** memperlihatkan isi tangki.

### Tab di bawah model 3D

| Tab | Isi |
|---|---|
| **Grafik** | Pilih parameter; area hijau = rentang normal. Sentuh grafik untuk melihat nilai per jam. Di bawahnya: tahap pencernaan dan **hasil sejak mulai** (biogas, LPG setara, hemat rupiah, pupuk) |
| **Sisa pangan** | Rekap smart bin sisa makan siang hari ini, menu yang paling banyak tersisa + saran untuk ahli gizi, dan prediksi proses 6 jam |
| **Catatan** | Semua kejadian: peringatan, tindakan, jadwal. Bisa difilter |
| **Notifikasi** | Cara ikut menerima pemberitahuan lewat Telegram (lihat bagian 3) |
| **Kalkulator** | Hitung kebutuhan digester untuk SPPG Anda dari jumlah porsi dan sisa per porsi |
| **Kendali** | Hanya muncul setelah **masuk** (lihat bagian 2) |

## 2. Memakai akun (petugas & ahli gizi)

### Masuk

1. Klik **Masuk** di pojok kanan atas.
2. Isi **nama pengguna** dan **kata sandi** dari admin. Nama pengguna tidak membedakan huruf besar/kecil.
3. Setelah masuk, tab **Kendali** muncul dan tombol **Asisten AI** bisa dipakai.

Belum punya akun? Klik **Masuk → Daftar akun baru**, isi data, lalu beri tahu admin agar akun Anda disetujui. **Lupa kata sandi?** Minta admin meresetnya.

Klik lingkaran inisial nama Anda → **Keluar** bila memakai HP/komputer bersama.

### Tab Kendali

| Kendali | Kapan dipakai |
|---|---|
| **Mode otomatis** | Biarkan menyala. Sistem mengatur suhu, buffer, dan boiler sendiri |
| **Air panas / air dingin, pengaduk** | Untuk petugas yang paham alasannya |
| **Kompor SPPG** | Nyalakan 1 atau 2 tungku. Otomatis mati bila gas habis dan **tidak bisa dinyalakan saat ada kebocoran** |
| **Buffer NaHCO₃** | Isi gram lalu *Tambah*. Ada saran dosis di bawahnya |
| **Kuras endapan** | Membuka katup bawah; pastikan bak pengering siap |
| **Masukkan sisa pangan** | Pilih jenis dan berat. Kapasitas aman modul 500 L ±3,5 kg per hari |
| **Jadwal harian** | Umpan otomatis pukul 14.00 dan kompor mengikuti jadwal masak |

Setiap tombol yang ditekan tercatat atas nama Anda di laporan admin.

### Asisten AI

Klik **Asisten AI** di pojok kanan bawah (harus masuk dulu).

- Tanya dengan bahasa sehari-hari: *"kenapa gas hari ini sedikit?"*, *"menu apa yang paling banyak tersisa?"*, *"hitung digester untuk 3.000 porsi"*.
- Asisten bisa menjalankan perintah bila diminta jelas: *"tolong tambah buffer 300 gram"*.
- **Asisten mengingat obrolan Anda** walaupun pindah perangkat. Menu **⋯** untuk melihat atau menghapus ingatan.
- Jangan memasukkan data pribadi siswa (nama, alamat, NIK).

## 3. Menerima pemberitahuan di Telegram

1. Di website, buka tab **Notifikasi** atau bagian **Bantuan**, lalu klik **Buka bot** (atau cari nama bot di Telegram).
2. Tekan **Start**. Bot membalas "menunggu persetujuan admin".
3. Beri tahu admin. Setelah disetujui, bot mengirim pesan "sudah disetujui"; ketik `/start`.
4. Mulai sekarang Anda menerima **peringatan otomatis** (suhu, pH, kebocoran, gas habis), **laporan terjadwal**, dan **pengumuman** dari admin. Anda juga bisa bertanya ke asisten seperti di website.

Tombol menu di bawah kotak ketik Telegram memudahkan: 📊 Status, 🗓 Laporan, 🚨 Peringatan, 🌡 Suhu, 🧪 pH, 🔵 Gas, dan lainnya.

### Perintah bot

| Perintah | Fungsi |
|---|---|
| `/start` | Mulai dan berlangganan pemberitahuan |
| `/status` | Ringkasan semua sensor |
| `/laporan` | Biogas, LPG setara, hemat rupiah, dan peringatan hari ini |
| `/peringatan` | Peringatan yang sedang aktif |
| `/perangkat` | Alat ESP32 yang online/offline |
| `/suhu`, `/ph`, `/gas`, `/endapan` | Detail satu parameter |
| `/prediksi` | Skor kesehatan dan perkiraan 6 jam |
| `/sisa` | Menu yang paling banyak tersisa |
| `/buffer 300`, `/umpan 3`, `/kuras 20` | Tambah buffer 300 g, umpan 3 kg, kuras 20 L |
| `/kompor_on 2`, `/kompor_off` | Kompor 2 tungku / matikan |
| `/auto_on`, `/auto_off` | Mode otomatis |
| `/notif_on`, `/notif_off` | Nyalakan/matikan pemberitahuan untuk chat ini |
| `/ingatan`, `/lupa` | Lihat/hapus ingatan asisten |
| `/id` | Lihat Chat ID (berguna untuk admin) |
| `/bantuan` | Daftar perintah |

Pesan biasa tanpa garis miring dijawab asisten AI. Untuk grup: tambahkan bot ke grup, ketik `/start` di grup, lalu minta admin menyetujui grup itu.

## 4. Keselamatan

- Bioreaktor dan jalur gas **di luar ruangan**, berventilasi, jauh dari api kecuali kompor yang berpengaman.
- Metana mudah meledak pada 5–15% di udara. H₂S beracun dan bisa melumpuhkan penciuman; jangan mengandalkan bau.
- Bila ada peringatan **kebocoran**: matikan semua api, tutup katup utama, jauhkan orang, hubungi petugas.
- Jangan masuk atau melongok ke dalam tangki.
- Endapan/pupuk harus **dikeringkan atau dikomposkan** sebelum dipakai. Pakai sarung tangan dan cuci tangan.
- Angka mode simulasi berasal dari model literatur, bukan pengukuran alat.

## Perawatan rutin alat asli (untuk petugas)

| Frekuensi | Pekerjaan |
|---|---|
| Harian | Cek dasbor pagi dan siang; umpan sesuai kapasitas; catat bau/suara aneh |
| Mingguan | Buka keran penjebak air; cek sambungan selang dengan air sabun; bersihkan kompor |
| 2–4 minggu | Kuras endapan ke bak pengering; kalibrasi sensor pH |
| Sesuai peringatan | Ganti media scrubber H₂S |
| Bulanan | Cek karat drum; uji buzzer dan katup kompor |
