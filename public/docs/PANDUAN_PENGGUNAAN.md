# Panduan penggunaan untuk pengguna & admin

Panduan ini untuk petugas SPPG, ahli gizi, guru, dan admin yang **bukan orang teknik**. Tidak perlu memasang apa pun; cukup browser di HP atau laptop dan aplikasi Telegram.

## Tiga jenis pengunjung

| Siapa | Bisa apa | Cara mendapatkannya |
|---|---|---|
| **Tamu** (belum masuk) | Melihat dasbor 3D, angka sensor, grafik, data penelitian | Buka alamat website saja |
| **Pengguna** | Semua yang tamu bisa + menekan tombol kendali (kompor, buffer, kuras), bertanya ke asisten AI yang mengingat obrolan | Daftar sendiri lalu disetujui admin, atau dibuatkan admin |
| **Admin** | Semua yang pengguna bisa + **panel admin**: laporan lengkap & unduh, perangkat terdaftar, persetujuan pengguna & Telegram, pengaturan | Akun pertama: `Handoyo`. Admin bisa menjadikan pengguna lain admin |

---

# BAGIAN A: UNTUK PENGGUNA

## A1. Mendaftar dan masuk

1. Buka alamat website (misalnya `https://bioloop-sppg.vercel.app`).
2. Klik **Masuk** di pojok kanan atas → pilih **Daftar akun baru**.
3. Isi nama lengkap, nama pengguna (tanpa spasi, misalnya `rina.gizi`), dan kata sandi minimal 8 karakter.
4. Muncul pesan "menunggu persetujuan admin". **Beri tahu admin SPPG** nama pengguna Anda.
5. Setelah disetujui, klik **Masuk** dan isi nama pengguna & kata sandi.

Bila admin membuatkan akun untuk Anda, Anda akan menerima **kata sandi sementara**. Saat pertama masuk, sistem meminta Anda menggantinya.

**Lupa kata sandi?** Minta admin menekan **Reset sandi** di panel admin. Admin akan memberi kata sandi sementara yang baru.

**Keluar** dari akun: klik lingkaran inisial nama Anda di pojok kanan atas → **Keluar**. Lakukan ini bila memakai komputer bersama.

## A2. Membaca status di bagian atas dasbor

| Elemen | Arti |
|---|---|
| **Sumber** | Pilih *Simulasi* atau nama alat ESP32 yang terdaftar (muncul bila ada perangkat). Keterangan *online/offline* ada di sebelah nama |
| **Jam** (misal *Hari 3, 14.20*) | Waktu simulasi. Untuk alat asli tertulis *Waktu nyata* |
| **Status proses** | ✓ hijau *Proses stabil* + skor 0–100; ! kuning *Perhatian*; ✕ merah *Bahaya* beserta nama masalahnya |
| **Kecepatan** | Hanya untuk simulasi. *1 jam/detik* cocok untuk demo |
| **Titik di pojok kanan atas** | Hijau = tersambung; kuning = mode demo; merah = koneksi terputus (dicoba ulang otomatis) |

Enam kartu angka menunjukkan suhu, pH, tekanan gas, isi drum, produksi biogas, dan kebocoran. Setiap kartu punya label (Normal / Waspada / Bahaya) dan garis tren kecil. Angka diperbarui tiap ±2 detik.

Bila memilih alat ESP32 yang belum pernah mengirim data, muncul kotak **"Belum ada data dari perangkat ini"**. Hubungi admin/teknisi.

## Rentang normal

| Parameter | Normal | Waspada | Tindakan bila tidak normal |
|---|---|---|---|
| Suhu slurry | 33–37 °C | < 32 atau > 38 °C | Mode otomatis membuka air panas/dingin. Cek pemanas dan insulasi |
| pH | 6,6–7,9 | < 6,6 atau > 7,9 | Asam: tambah buffer NaHCO₃, stop umpan 1–2 hari |
| VFA | < 2.000 mg/L | > 2.500 mg/L | Tunda umpan, pantau pH |
| Tekanan gas | ±7 mbar | > 12 mbar | Pakai gas untuk memasak; boiler menyala otomatis |
| Metana (CH₄) | > 45% | < 45% | Gas sulit menyala. Cek pH dan suhu, jangan tambah umpan |
| Kebocoran | 0% LEL | > 10% LEL; bahaya > 20% | **Matikan semua api, tutup katup utama**, cek sambungan dengan air sabun |
| Endapan | < 60 L | > 60 L | Kuras 20–30 L ke bak pengering |
| Media scrubber | > 15% | < 15% | Ganti media besi oksida |

Batas-batas ini bisa diubah lewat API `setpoint` (lihat ARSITEKTUR.md).

## Model 3D

- **Seret** untuk memutar, **scroll/cubit** untuk zoom.
- **Klik benda** (tangki, drum, sensor, scrubber, kompor) untuk penjelasan lengkap dengan angka terkini.
- Tombol **Semua / Bioreaktor / Jalur gas / Dapur SPPG** memindahkan kamera.
- **Tembus pandang** memperlihatkan isi tangki: slurry, koil pemanas, dan endapan.
- **Label** berganti antara sensor saja, semua komponen, atau tanpa label. Warna tepi label: hijau normal, kuning waspada, merah berkedip bahaya.

## Tab Kendali

| Kendali | Kapan dipakai |
|---|---|
| **Mode otomatis** | Biarkan menyala. Kontroler mengatur suhu, buffer saat pH turun, dan boiler saat gas surplus |
| **Air panas / air dingin** | Mengubah ke mode manual. Pakai hanya bila Anda tahu alasannya |
| **Pengaduk** | Menyala 5 menit tiap 30 menit. Matikan saat perawatan |
| **Kompor SPPG** | Nyalakan 1 atau 2 tungku. Kompor otomatis mati bila gas habis dan **tidak bisa dinyalakan saat ada kebocoran** |
| **Buffer NaHCO₃** | Isi gram lalu *Tambah*. Keterangan di bawahnya memberi saran dosis |
| **Kuras endapan** | Membuka katup bawah. Pastikan bak pengering siap |
| **Masukkan sisa pangan** | Pilih jenis dan berat. Kapasitas aman modul 500 L ±3,5 kg sisa per hari |
| **Jadwal harian** | Umpan otomatis pukul 14.00 dari rekap smart bin; kompor mengikuti jadwal masak |

Tombol kendali hanya bisa dipakai setelah **masuk**. Tamu hanya bisa melihat.

### Uji gangguan (latihan petugas)

Tombol ini hanya untuk mode simulasi, gunanya melatih petugas mengenali peringatan:

| Skenario | Yang terjadi | Yang harus dilakukan |
|---|---|---|
| Malam dingin | Udara turun 10 °C selama 12 jam | Perhatikan katup air panas terbuka otomatis |
| Terik ekstrem | Matahari memanaskan tangki | Katup air dingin terbuka; beri peneduh |
| Kelebihan umpan | 30 kg masuk sekaligus | pH turun dalam beberapa jam; buffer otomatis; tunda umpan |
| Umpan tinggi protein | 10 kg lauk | C/N rendah dan H₂S naik; campur nasi/kulit buah |
| Pemanas rusak | Pemanas mati + malam dingin | Suhu turun walau katup panas terbuka; klik *Perbaiki pemanas* |
| Selang bocor | Metana di udara | Peringatan bahaya ke Telegram; kompor diblokir; klik *Perbaiki bocor* |
| Gas berlebih | 2 tungku terus menyala | Gas habis, kompor mati, siapkan LPG |
| Scrubber jenuh | Media tinggal 12% | Peringatan H₂S; klik *Ganti media* |

**Mulai ulang** (khusus admin) mengembalikan simulasi ke awal. Laporan lama di database dan ingatan asisten tidak terhapus.

## Tab Grafik

- Pilih parameter; area hijau adalah rentang normal.
- Arahkan kursor (atau sentuh) grafik untuk melihat nilai pada jam tertentu.
- **Tahap pencernaan anaerob** menunjukkan laju tiap tahap: hidrolisis (*Clostridium*), asidogenesis & asetogenesis (*Clostridium*, *Syntrophomonas*), dan metanogenesis (metanogen metilotrof; *Geobacter* membantu lewat transfer elektron langsung/DIET).
- **Hasil sejak mulai**: biogas, LPG setara, perkiraan penghematan rupiah, pupuk padat dan cair.

## Tab Sisa pangan

- **Sisa makan siang hari ini** dari smart bin (kamera + computer vision), dibuat pukul 13.00.
- **Peringkat menu** dengan persentase sisa tertinggi dan saran untuk ahli gizi. Mengurangi sisa di piring selalu lebih baik daripada mengolahnya.
- **Prediksi proses**: skor kesehatan, perkiraan pH dan suhu 6 jam lagi, sisa gas saat kompor pagi, rasio VFA/alkalinitas (aman di bawah 0,3).

Pada mode simulasi data smart bin dibangkitkan acak mengikuti pola menu.

## Tab Kalkulator

Masukkan jumlah porsi per hari dan sisa per porsi. Hasilnya: kebutuhan volume digester, jumlah modul 500 L, metana, LPG setara, dan penghematan per tahun (313 hari operasional). Contoh bawaan 2.500 porsi × 48 g ≈ 120 kg sisa/hari → digester ±13 m³, setara ±7 kg LPG/hari. Ini perkiraan awal dari literatur; desain akhir perlu uji potensi metana (BMP) sisa pangan setempat.

## Asisten AI (Gemini)

Klik **Asisten AI** di pojok kanan bawah. Anda harus **masuk** dulu.

- Tanya dengan bahasa sehari-hari: *"kenapa gas hari ini sedikit?"*, *"hitung digester untuk 3.000 porsi"*, *"menu apa yang paling banyak tersisa?"*.
- Asisten membaca sensor dari sumber yang sedang dipilih dan bisa **menjalankan perintah** bila Anda memintanya dengan jelas: *"tolong tambah buffer 300 gram"*. Tindakan yang dijalankan tampil sebagai label hijau di bawah jawaban dan tercatat di laporan atas nama Anda.
- **Asisten mengingat obrolan Anda**, walaupun Anda pindah dari HP ke laptop, menutup halaman, atau keesokan harinya. Obrolan yang panjang diringkas otomatis. Perkenalkan diri (*"saya Rina, ahli gizi SPPG Sleman"*) supaya dicatat sebagai fakta.
- Menu **⋯** → *Lihat yang diingat* menampilkan fakta dan ringkasan; *Lupakan percakapan ini* menghapus semuanya.
- Jangan memasukkan data pribadi siswa (nama, alamat, NIK) ke asisten.

## Telegram

1. Buka bot SPPG Anda di Telegram (tautan ada di tab **Telegram** pada dasbor) → tekan **Start**.
2. Bot membalas "menunggu persetujuan admin". Beri tahu admin.
3. Setelah disetujui, bot mengirim pesan "sudah disetujui". Ketik `/start`.
4. Anda akan menerima peringatan otomatis (suhu, pH, kebocoran, gas habis) dan bisa bertanya seperti di website. Asisten di Telegram punya ingatan sendiri per chat.

## Perintah Telegram

| Perintah | Fungsi |
|---|---|
| `/start` | Mulai dan berlangganan peringatan |
| `/status` | Ringkasan lengkap |
| `/suhu`, `/ph`, `/gas`, `/endapan` | Detail satu parameter |
| `/prediksi` | Skor kesehatan dan catatan analitik |
| `/sisa` | Peringkat menu dengan sisa tertinggi |
| `/buffer 300` | Tambah 300 g NaHCO₃ |
| `/umpan 3` | Masukkan 3 kg sisa campuran (simulasi) |
| `/kuras 20` | Kuras 20 L endapan |
| `/kompor_on 2`, `/kompor_off` | Kompor 2 tungku / matikan |
| `/panas_on`, `/dingin_on`, `/katup_off` | Katup koil manual |
| `/auto_on`, `/auto_off` | Mode otomatis |
| `/notif_on`, `/notif_off` | Nyalakan/matikan peringatan untuk chat ini |
| `/ingatan`, `/lupa` | Lihat/hapus ingatan asisten |
| `/id` | Lihat Chat ID |
| `/bantuan` | Daftar perintah |

Pesan tanpa garis miring dijawab oleh asisten Gemini. Semua perintah (kecuali `/id`) baru berlaku setelah admin **menyetujui** chat Anda di panel admin.


---

# BAGIAN B: UNTUK ADMIN

Buka **alamat-website/admin.html**, atau klik lingkaran nama Anda → **Panel admin**.

## B1. Hal pertama setelah deploy

1. Masuk dengan `Handoyo` / `12345`.
2. **Ganti kata sandi saat itu juga** (sistem langsung memintanya, dan spanduk merah muncul sampai Anda menggantinya).
3. Menu **Telegram** → **Pasang webhook** → setujui chat Anda sendiri.
4. Menu **Pengaturan** → isi nama SPPG dan harga LPG setempat.
5. Buat akun untuk petugas di menu **Pengguna**, atau biarkan mereka mendaftar lalu Anda setujui.

## B2. Ringkasan

Halaman pertama panel admin. Menampilkan dalam sekali lihat:

- Biogas dan penghematan LPG 7 hari terakhir
- Jumlah peringatan bahaya/waspada 24 jam terakhir
- Perangkat online, jumlah pengguna, chat Telegram
- **Angka merah** pada menu *Pengguna* atau *Telegram* berarti ada yang menunggu persetujuan
- Grafik biogas per hari dan 8 kejadian terbaru
- Pemakaian database (paket gratis Supabase: 500 MB)

## B3. Laporan (lihat & unduh)

1. Pilih **Sumber**: *Semua sumber*, *Simulasi*, atau salah satu alat.
2. Pilih **Periode**: 24 jam, 7 hari, 30 hari, 90 hari, atau *Pilih tanggal*.
3. Laporan tersusun otomatis:
   - **Kartu ringkasan**: biogas dihasilkan, dipakai kompor, setara LPG, perkiraan hemat rupiah, sisa pangan diolah, pupuk, jumlah peringatan
   - **Grafik** biogas per hari dan suhu rata-rata harian (area hijau = rentang normal). Arahkan kursor/sentuh batang untuk melihat angkanya
   - **Ringkasan per sumber**: termasuk persentase waktu suhu & pH normal, dan persentase data yang masuk (untuk alat asli)
   - **Rekap harian**, **peringatan paling sering**, **aktivitas pengguna** (siapa menekan apa)
   - **Catatan kejadian** dengan filter tingkat dan kotak pencarian
4. Unduh:
   - **Excel lengkap**: satu file berisi sheet Ringkasan, Harian, Per jam, Pembacaan, Kejadian, Peringatan teratas, Aktivitas pengguna, Perangkat, Pengguna, Telegram. Tanggal dan angka bisa langsung diolah (filter, grafik, pivot)
   - **CSV pembacaan / CSV kejadian**: untuk diolah di aplikasi statistik
   - **Cetak / PDF**: pilih *Save as PDF* pada jendela cetak untuk laporan bulanan

Tips: untuk periode sangat panjang dengan banyak data, sheet *Pembacaan* dibatasi 20.000 baris terakhir; unduh CSV per bulan bila butuh semua data mentah.

## B4. Perangkat terdaftar (ESP32)

- **Daftarkan perangkat**: isi nama & lokasi → sistem membuat **kunci perangkat**. Salin dan tempel ke firmware (tombol *Salin kedua baris*). Kunci hanya tampil sekali.
- **Status**: *Online* (mengirim data < 2 menit lalu), *Offline*, *Belum terhubung*, atau *Nonaktif*.
- **Detail**: data terakhir, perintah yang dikirim dan apakah sudah diambil alat, kejadian perangkat.
- **Ubah**: nama, lokasi, catatan (misalnya tanggal kalibrasi pH).
- **Kunci baru**: bila kunci bocor atau hilang. Kunci lama langsung tidak berlaku; firmware harus di-upload ulang.
- **Nonaktifkan**: alat ditolak sementara (misalnya saat perbaikan). **Hapus**: alat dan kuncinya dihapus; riwayat pembacaan tetap ada di laporan.

Perintah dari dasbor, Telegram, atau asisten untuk alat asli disimpan dulu, lalu diambil ESP32 saat mengirim data berikutnya (±10 detik).

## B5. Pengguna

- **Setujui / Tolak** pendaftaran baru (baris berwarna kuning).
- **Tambah pengguna**: kosongkan kata sandi agar dibuatkan kata sandi sementara. Berikan kepada orangnya secara langsung atau lewat pesan pribadi.
- **Jadikan admin / Jadikan pengguna**, **Nonaktifkan / Aktifkan**, **Reset sandi**, **Hapus**.
- Sistem mencegah admin aktif terakhir dinonaktifkan atau dihapus, supaya panel tidak terkunci.
- Menonaktifkan atau mereset kata sandi langsung mengeluarkan orang itu dari semua perangkat.

## B6. Telegram

- **Webhook** harus berstatus hijau *Terpasang* agar bot membalas. Setelah mengganti alamat website atau token bot, klik **Pasang ulang webhook**.
- **Chat yang memakai bot**: setujui atau cabut akses, nyalakan/matikan notifikasi per chat, kirim pesan uji, hapus.
- **Pengumuman**: kirim pesan ke semua chat yang disetujui, misalnya jadwal pengurasan.
- Untuk grup Telegram: tambahkan bot ke grup, ketik `/start` di grup, lalu setujui grup itu di panel.

## B7. Pengaturan

| Pengaturan | Kegunaan |
|---|---|
| Nama lokasi/SPPG | Tampil di website, laporan, dan pesan Telegram |
| Sumber utama dasbor & asisten | Sumber yang dibuka pertama kali dan dipakai bot/asisten. Ganti ke alat asli bila sudah terpasang |
| Harga LPG 12 kg | Dasar perhitungan penghematan rupiah |
| Laporan status ke Telegram tiap … jam | Ringkasan berkala ke semua chat (0 = mati). Butuh cron (lihat panduan deploy langkah 7) |
| Simpan riwayat selama … hari | Data lebih lama dihapus otomatis agar database tidak penuh |
| Pendaftaran terbuka | Matikan bila hanya admin yang boleh membuat akun |
| Dasbor bisa dilihat tamu | Matikan bila dasbor hanya untuk yang punya akun |
| Notifikasi dari simulasi | Matikan setelah memakai alat asli agar Telegram tidak ramai |

Bagian **Status konfigurasi** menunjukkan apakah database, Gemini, dan Telegram sudah tersambung. Tombol **Jalankan cron sekarang** memperbarui semua sumber seketika.

## B8. Lupa kata sandi admin

- Bila masih ada admin lain: minta dia menekan **Reset sandi** untuk akun Anda.
- Bila tidak ada admin lain:
  1. Vercel → proyek → Settings → Environment Variables → tambahkan `ADMIN_RESET_PASSWORD` berisi kata sandi sementara (minimal 8 karakter).
  2. Tab Deployments → **Redeploy**.
  3. Masuk sebagai `Handoyo` dengan kata sandi sementara itu, lalu ganti kata sandi.
  4. **Hapus** lagi variabel `ADMIN_RESET_PASSWORD` di Vercel dan Redeploy.

## B9. Kebiasaan aman untuk admin

- Pakai kata sandi yang berbeda dari akun lain Anda. Jangan menuliskannya di grup.
- Setujui hanya chat Telegram dan akun yang Anda kenal.
- Nonaktifkan akun petugas yang sudah pindah tugas.
- Unduh laporan Excel tiap bulan sebagai arsip.
- Jangan pernah membagikan isi Environment Variables Vercel (token bot, kunci Gemini, DATABASE_URL).


---

# BAGIAN C: PERAWATAN & KESELAMATAN

## Perawatan rutin alat asli

| Frekuensi | Pekerjaan |
|---|---|
| Harian | Cek angka di dasbor pagi dan siang; umpan sesuai kapasitas; catat keanehan bau/suara |
| Mingguan | Buka keran penjebak air; cek sambungan selang dengan air sabun; bersihkan kompor |
| 2–4 minggu | Kuras endapan ke bak pengering; kalibrasi sensor pH |
| Sesuai peringatan | Ganti media scrubber H₂S |
| Bulanan | Cek karat drum, cat ulang bila perlu; uji buzzer dan katup kompor |

## Keselamatan

- Bioreaktor dan jalur gas **di luar ruangan**, berventilasi, jauh dari sumber api kecuali kompor yang terpasang pengaman nyala.
- Metana mudah meledak pada 5–15% di udara. H₂S beracun dan bisa melumpuhkan indra penciuman; jangan mengandalkan bau.
- Jangan masuk atau melongok ke dalam tangki. Perbaikan di dalam tangki hanya oleh teknisi dengan prosedur ruang terbatas.
- Endapan/pupuk harus **dikeringkan atau dikomposkan** sebelum dipakai: digesti mesofilik menurunkan patogen tetapi tidak menghilangkannya. Pakai sarung tangan dan cuci tangan.
- Angka di dasbor mode simulasi berasal dari model literatur, bukan hasil pengukuran alat.
