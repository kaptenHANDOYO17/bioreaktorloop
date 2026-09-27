#!/usr/bin/env bash
# Jalankan MBG-BIOLOOP AI di macOS / Linux / Raspberry Pi
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js belum terpasang. Unduh versi LTS dari https://nodejs.org"
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js versi $NODE_MAJOR terlalu lama. Butuh versi 20 atau lebih baru."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Memasang pustaka yang dibutuhkan (sekali saja)..."
  npm install --omit=dev || exit 1
fi
if [ ! -f .env ]; then
  cp .env.example .env
  echo "File .env dibuat. Isi TELEGRAM_BOT_TOKEN dan GEMINI_API_KEY di file .env, lalu jalankan lagi."
  ${EDITOR:-nano} .env
fi
echo "Website: http://localhost:3000  |  Admin: http://localhost:3000/admin.html  (Ctrl+C untuk berhenti)"
exec node server/index.js
