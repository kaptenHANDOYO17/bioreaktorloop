@echo off
title MBG-BIOLOOP AI
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js belum terpasang.
  echo  Unduh versi LTS dari https://nodejs.org lalu jalankan file ini lagi.
  echo.
  start https://nodejs.org
  pause
  exit /b
)
if not exist "node_modules" (
  echo  Memasang pustaka yang dibutuhkan (sekali saja)...
  call npm install --omit=dev
)
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo.
  echo  File .env dibuat. Isi TELEGRAM_BOT_TOKEN dan GEMINI_API_KEY di file .env
  echo  lalu simpan. Notepad akan terbuka sekarang.
  echo.
  notepad ".env"
)
echo.
echo  Menjalankan MBG-BIOLOOP AI...
echo  Website : http://localhost:3000
echo  Admin   : http://localhost:3000/admin.html  (Handoyo / 12345, segera ganti)
echo  Biarkan jendela ini tetap terbuka. Tekan Ctrl+C untuk berhenti.
echo.
start "" http://localhost:3000
node server\index.js
pause
