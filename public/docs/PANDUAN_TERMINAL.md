# Menjalankan lewat terminal (tanpa file .bat)

Panduan ini menggantikan semua file otomatis (`start-windows.bat`, `start-mac-linux.sh`, jadwal GitHub Actions, dan lain-lain) dengan **perintah yang Anda ketik sendiri**. Cocok bila Anda memakai **Visual Studio Code**, atau bila file .bat diblokir antivirus/kantor.

Cara membaca panduan ini:

- Teks di dalam kotak abu-abu adalah **perintah**. Ketik (atau salin) persis seperti itu, lalu tekan **Enter**.
- Tulisan `PS C:\...>` di depan baris terminal Windows **bukan** bagian perintah; jangan ikut diketik.
- Ganti teks bertanda `<…>` dengan milik Anda (tanda `<` dan `>` ikut dihapus).

---

## Bagian 1: Menjalankan di komputer sendiri (Windows + VS Code)

### 1.1 Buka folder yang benar

ZIP yang diekstrak sering menghasilkan folder ganda, misalnya `Downloads\mbg-bioloop\mbg-bioloop`. Folder yang benar adalah yang **langsung berisi** `package.json`, `server`, `lib`, dan `public`.

1. Di VS Code: **File → Open Folder…** → pilih folder `mbg-bioloop` yang **di dalam** (yang berisi `package.json`) → **Select Folder**.
2. Buka terminal: menu **Terminal → New Terminal** (atau tekan ``Ctrl + ` ``).
3. Pastikan posisinya benar:

```
Get-ChildItem package.json
```

Bila muncul nama file `package.json`, posisi sudah benar. Bila muncul tulisan merah *Cannot find path*, pindah ke folder dalam:

```
cd .\mbg-bioloop
```

### 1.2 Periksa Node.js

```
node -v
npm -v
```

Harus muncul angka versi, dengan `node` minimal **v20**. Bila muncul *'node' is not recognized*: pasang Node.js LTS dari https://nodejs.org, lalu **tutup semua jendela VS Code dan buka lagi**.

Bila `npm -v` menampilkan tulisan merah *running scripts is disabled on this system*, jalankan sekali saja:

```
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Ketik `Y` lalu Enter. (Cara lain tanpa mengubah pengaturan: pakai `npm.cmd` sebagai pengganti `npm` di semua perintah.)

### 1.3 Pasang pustaka (sekali saja)

```
npm install
```

Tunggu sampai selesai. Folder `node_modules` akan muncul. Perintah ini hanya perlu diulang bila Anda mengganti `package.json` atau menyalin proyek ke komputer lain.

### 1.4 Buat dan isi file `.env`

Bila file `.env` belum ada:

```
if (!(Test-Path .env)) { Copy-Item .env.example .env }
code .env
```

Perintah kedua membuka `.env` di VS Code (bisa juga `notepad .env`). Isi minimal:

```
SITE_NAME=SPPG Sleman 01
TELEGRAM_BOT_TOKEN=<token dari BotFather>
GEMINI_API_KEY=<kunci dari AI Studio>
```

Bila ingin memakai database Supabase yang sama dengan website online, isi juga:

```
DATABASE_URL=<connection string Transaction pooler dari Supabase>
```

Aturan menulis `.env`:

- Satu pengaturan per baris, format `NAMA=nilai`, **tanpa spasi** di sekitar tanda `=`.
- Tidak perlu tanda kutip.
- Ganti `[YOUR-PASSWORD]` di connection string dengan password database, **termasuk menghapus kurung sikunya**.
- Password yang berisi karakter khusus (`@ # / ? & *`) kini ditangani otomatis. Meski begitu, password berisi huruf dan angka saja paling aman di semua alat.
- Simpan dengan **Ctrl + S**.

Jangan mengosongkan `DATABASE_URL` di Vercel; di komputer sendiri boleh kosong (data disimpan di folder `data`).

### 1.5 Periksa semuanya sebelum menjalankan

```
npm run cek
```

Perintah ini memeriksa Node.js, file `.env`, koneksi database, kunci Gemini, token Telegram, dan port. Setiap baris bertanda:

- ✓ sudah benar
- ! perlu diperhatikan tetapi boleh lanjut
- ✗ harus diperbaiki (petunjuk perbaikannya tertulis di bawahnya)

Ulangi `npm run cek` setelah memperbaiki `.env`, sampai tidak ada tanda ✗.

### 1.6 Jalankan server

```
npm start
```

Bila berhasil, muncul:

```
  MBG-BIOLOOP AI v3.0.0
  Website  : http://localhost:3000
  Admin    : http://localhost:3000/admin.html
```

Buka website dari terminal kedua (klik ikon **+** di panel terminal) atau langsung dari browser:

```
Start-Process http://localhost:3000
Start-Process http://localhost:3000/admin.html
```

Masuk panel admin dengan `Handoyo` / `12345`, lalu **segera ganti kata sandinya**.

Catatan:

- **Biarkan terminal tetap terbuka.** Menutup terminal = mematikan website.
- Untuk menghentikan: klik terminal lalu tekan **Ctrl + C** (jawab `Y` bila ditanya).
- Setelah mengubah `.env`, hentikan (Ctrl + C) lalu jalankan lagi `npm start`.
- `npm run dev` sama dengan `npm start` tetapi otomatis memulai ulang saat file kode diubah. Cocok bila Anda sedang mengedit kode; untuk pemakaian biasa pakai `npm start`.

### 1.7 Buka dari HP di WiFi yang sama

Cari alamat IP komputer:

```
ipconfig | Select-String IPv4
```

Di HP buka `http://<alamat IPv4>:3000`, misalnya `http://192.168.1.7:3000`. Bila Windows menanyakan izin firewall untuk Node.js saat pertama `npm start`, pilih **Allow**.

### 1.8 Bot Telegram di komputer sendiri

Tidak perlu perintah tambahan. Saat `npm start`:

- Bila bot **belum** dipakai website online, server lokal menjalankan bot (mode *long polling*).
- Bila bot **sudah** dipakai website Vercel (webhook terpasang), server lokal **tidak** merebutnya, supaya bot online tetap berjalan. Terminal akan menampilkan pesan itu.

Hanya bila Anda sengaja ingin menguji bot di komputer ini, tambahkan di `.env`:

```
TELEGRAM_MODE=polling
```

Setelah selesai uji, hapus baris itu lalu buka panel admin **online** → menu **Telegram** → **Pasang ulang webhook**.

---

## Bagian 2: Pengganti file otomatis lainnya

### 2.1 Pengganti jadwal GitHub Actions (memanggil cron)

Server di komputer sendiri **sudah menjalankan cron otomatis tiap 5 detik**, jadi tidak perlu apa-apa.

Untuk website Vercel, bila tidak memakai GitHub Actions, panggil cron secara manual (misalnya untuk uji):

```
Invoke-RestMethod https://<alamat-anda>.vercel.app/api/cron
```

Bila Anda mengisi `CRON_SECRET` di Vercel:

```
Invoke-RestMethod https://<alamat-anda>.vercel.app/api/cron -Headers @{ Authorization = "Bearer <isi CRON_SECRET>" }
```

Hasil yang benar berisi `ticked` dengan daftar sumber. Untuk jadwal otomatis tanpa GitHub, pakai cron-job.org (lihat Panduan deploy, langkah 7).

### 2.2 Pengganti unggah lewat browser ke GitHub (pakai git)

Pasang Git dari https://git-scm.com (klik Next sampai selesai), tutup-buka VS Code, lalu di terminal folder proyek:

```
git init
git add .
git status
```

**Periksa hasil `git status`:** file `.env` **tidak boleh** ada di daftar. Pastikan dengan:

```
git check-ignore .env
```

Harus muncul tulisan `.env` (artinya diabaikan dan aman). Bila tidak muncul apa-apa, **berhenti** dan jangan lanjut; periksa isi file `.gitignore`.

Lanjutkan (ganti nama dan email dengan milik Anda, cukup sekali per komputer):

```
git config --global user.name "<Nama Anda>"
git config --global user.email "<email GitHub Anda>"
git commit -m "MBG-BIOLOOP v3"
git branch -M main
git remote add origin https://github.com/<username>/<nama-repositori>.git
git push -u origin main
```

Saat `git push` pertama, jendela masuk GitHub akan terbuka; masuk dan izinkan.

Untuk mengirim perubahan berikutnya (Vercel otomatis deploy ulang):

```
git add .
git commit -m "<tulis apa yang diubah>"
git push
```

### 2.3 Memeriksa bot Telegram secara manual

Info bot dan webhook (ganti `<TOKEN>` dengan token bot):

```
Invoke-RestMethod "https://api.telegram.org/bot<TOKEN>/getMe"
Invoke-RestMethod "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

**Memasang** webhook tetap lewat panel admin online (menu Telegram → Pasang webhook), karena panel otomatis menyertakan kode rahasia webhook. Jangan memasang webhook dengan perintah manual.

Jangan menempel token ke chat, grup, atau tangkapan layar. Bila terlanjur, buka @BotFather → `/revoke`.

### 2.4 Menghapus data lokal (mulai dari awal)

Hanya untuk mode tanpa `DATABASE_URL`. Hentikan server (Ctrl + C), lalu:

```
Remove-Item .\data\*.json
npm start
```

Akun admin `Handoyo` / `12345` dibuat lagi otomatis. (Data di Supabase **tidak** terhapus oleh perintah ini.)

### 2.5 Lupa kata sandi admin (komputer sendiri)

```
$env:ADMIN_RESET_PASSWORD="<kata sandi sementara minimal 8 karakter>"
npm start
```

Masuk dengan `Handoyo` dan kata sandi sementara itu, ganti kata sandi, lalu hentikan server (Ctrl + C) dan jalankan:

```
Remove-Item Env:ADMIN_RESET_PASSWORD
npm start
```

Bila memakai `DATABASE_URL` Supabase yang sama dengan Vercel, reset ini juga berlaku untuk website online.

### 2.6 Port 3000 sudah dipakai

Pesan: *Port 3000 sudah dipakai*. Biasanya server lama masih berjalan di terminal lain; tutup terminal itu atau tekan Ctrl + C di sana. Bila tidak ketemu:

```
netstat -ano | findstr :3000
```

Angka paling kanan adalah PID. Hentikan dengan:

```
taskkill /PID <angka PID> /F
```

Atau pakai port lain: tambahkan `PORT=3001` di `.env`, lalu buka `http://localhost:3001`.

---

## Bagian 3: macOS dan Linux

| Tujuan | Perintah |
|---|---|
| Pindah ke folder proyek | `cd ~/Downloads/mbg-bioloop/mbg-bioloop` |
| Cek Node | `node -v` |
| Pasang pustaka | `npm install` |
| Buat `.env` | `cp -n .env.example .env` lalu `nano .env` (simpan: Ctrl+O, Enter, keluar: Ctrl+X) |
| Periksa | `npm run cek` |
| Jalankan | `npm start` |
| Buka website | `open http://localhost:3000` (macOS) · `xdg-open http://localhost:3000` (Linux) |
| Panggil cron Vercel | `curl https://<alamat-anda>.vercel.app/api/cron` |
| Hapus data lokal | `rm data/*.json` |
| Reset admin | `ADMIN_RESET_PASSWORD='<sandi sementara>' npm start` |
| Cari proses di port 3000 | `lsof -i :3000` lalu `kill <PID>` |

---

## Bagian 4: Pesan kesalahan yang sering muncul

| Pesan | Arti & solusi |
|---|---|
| `Invalid URL` | `DATABASE_URL` tidak terbaca. Pastikan memakai versi terbaru proyek (password berkarakter khusus sudah ditangani otomatis), `[YOUR-PASSWORD]` sudah diganti, dan tidak ada spasi. Jalankan `npm run cek` |
| `password authentication failed` | Password database salah. Reset di Supabase → Project Settings → Database |
| `getaddrinfo ENOTFOUND` | Alamat host salah ketik atau tidak ada internet |
| `Tenant or user not found` | Nama pengguna/region pada connection string tidak cocok; salin ulang dari tombol **Connect** Supabase |
| `Cannot find module 'postgres'` | Belum `npm install` |
| `npm ERR! enoent ... package.json` | Terminal berada di folder yang salah (lihat 1.1) |
| `running scripts is disabled` | Lihat 1.2 (`Set-ExecutionPolicy` atau pakai `npm.cmd`) |
| `EADDRINUSE` / `Port 3000 sudah dipakai` | Lihat 2.6 |
| `[telegram] Token ditolak` | Token salah; salin ulang dari @BotFather |
| `409 Conflict` pada Telegram | Bot dijalankan dua kali (komputer dan online). Lihat 1.8 |
| Asisten: *API key Gemini ditolak* | Kunci salah atau terhapus; buat baru di AI Studio |
