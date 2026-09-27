'use strict';
/* Alat bot Telegram dari terminal (cadangan bila tidak bisa masuk panel admin).
   Memakai TELEGRAM_BOT_TOKEN dan DATABASE_URL di file .env (harus SAMA dengan di Vercel).

   npm run bot                               → bantuan
   npm run bot -- info                       → info bot & webhook
   npm run bot -- pasang https://nama.vercel.app   → pasang webhook ke website online
   npm run bot -- lepas                      → lepas webhook
   npm run bot -- chat                       → daftar chat yang pernah menekan Start
   npm run bot -- setujui <chat_id>          → setujui chat (bisa bertanya & terima notifikasi)
   npm run bot -- cabut <chat_id>
   npm run bot -- kirim "Pesan pengumuman"   → kirim ke semua chat yang disetujui
   npm run bot -- status                     → kirim status reaktor sekarang ke semua chat
   npm run bot -- laporan                    → kirim laporan hari ini ke semua chat
   npm run bot -- profil                     → pasang daftar perintah, deskripsi & info bot (pengganti BotFather)
*/
const cfg = require('../lib/config');
const db = require('../lib/db');
const tg = require('../lib/telegram');

const pad = (s, n) => String(s == null ? '' : s).padEnd(n).slice(0, n);
async function main() {
  const [cmd, a] = process.argv.slice(2);
  if (!cfg.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN di file .env masih kosong.');
  await db.init();
  switch ((cmd || '').toLowerCase()) {
    case 'info': {
      const me = await tg.api('getMe'); const wh = await tg.api('getWebhookInfo');
      console.log(`Bot      : @${me.username} (${me.first_name})`);
      console.log(`Webhook  : ${wh.url || '(belum dipasang)'}`);
      if (wh.pending_update_count) console.log(`Antrean  : ${wh.pending_update_count} pesan belum terkirim ke website`);
      if (wh.last_error_message) console.log(`Error    : ${wh.last_error_message} (${new Date(wh.last_error_date * 1000).toLocaleString('id-ID', { timeZone: cfg.TZ })})`);
      const chats = await db.listTgChats();
      console.log(`Chat     : ${chats.length} tercatat, ${chats.filter(c => c.approved).length} disetujui, ${chats.filter(c => c.approved && c.subscribed).length} menerima notifikasi`);
      break;
    }
    case 'pasang': {
      const base = a || cfg.PUBLIC_URL;
      if (!base || !/^https:\/\//.test(base)) throw new Error('Tulis alamat website online, contoh: npm run bot -- pasang https://bioreaktorloop.vercel.app');
      const url = await tg.setWebhook(base);
      console.log('Webhook terpasang: ' + url + '\nSekarang buka bot di Telegram dan ketik /start.');
      break;
    }
    case 'lepas': await tg.deleteWebhook(); console.log('Webhook dilepas.'); break;
    case 'chat': {
      const chats = await db.listTgChats();
      if (!chats.length) { console.log('Belum ada chat. Buka bot di Telegram lalu tekan Start.'); break; }
      console.log(pad('CHAT ID', 16) + pad('NAMA', 26) + pad('DISETUJUI', 11) + 'NOTIFIKASI');
      for (const c of chats) console.log(pad(c.chat_id, 16) + pad(c.title + (c.username ? ' @' + c.username : ''), 26) + pad(c.approved ? 'ya' : 'MENUNGGU', 11) + (c.subscribed ? 'aktif' : 'mati'));
      break;
    }
    case 'setujui': case 'cabut': {
      if (!a) throw new Error(`Format: npm run bot -- ${cmd} <chat_id>   (lihat chat_id dengan: npm run bot -- chat)`);
      const c = await db.updateTgChat(a, { approved: cmd === 'setujui', subscribed: true });
      if (!c) throw new Error('Chat tidak ditemukan. Pastikan orangnya sudah menekan Start di bot.');
      if (cmd === 'setujui') await tg.html(c.chat_id, '✅ Chat ini sudah disetujui admin. Ketik /start untuk mulai.');
      console.log(`Chat ${c.title || c.chat_id} ${cmd === 'setujui' ? 'disetujui' : 'dicabut'}.`);
      break;
    }
    case 'kirim': {
      if (!a) throw new Error('Format: npm run bot -- kirim "isi pengumuman"');
      const n = await tg.broadcast(`📢 <b>Pengumuman</b>\n${tg.esc(a)}`);
      console.log(`Terkirim ke ${n} chat.`);
      break;
    }
    case 'status': console.log(`Terkirim ke ${await tg.broadcast(await tg.statusFor())} chat.`); break;
    case 'laporan': console.log(`Terkirim ke ${await tg.broadcast(await tg.dailyReport())} chat.`); break;
    case 'profil': console.log('Profil bot diperbarui: ' + (await tg.setProfile()).join(', ') + '.\nBuka bot di Telegram, ketik "/" untuk melihat menu perintah.'); break;
    default:
      console.log(`Alat bot Telegram MBG-BIOLOOP

  npm run bot -- info                              info bot & webhook
  npm run bot -- pasang https://NAMA.vercel.app    pasang webhook ke website online
  npm run bot -- lepas                             lepas webhook
  npm run bot -- chat                              daftar chat
  npm run bot -- setujui <chat_id>                 setujui chat
  npm run bot -- cabut <chat_id>                   cabut akses chat
  npm run bot -- kirim "isi pengumuman"            kirim pengumuman
  npm run bot -- status                            kirim status reaktor sekarang
  npm run bot -- laporan                           kirim laporan hari ini
  npm run bot -- profil                            pasang menu perintah, deskripsi & info bot`);
  }
}
main().then(async () => { try { await db.close(); } catch (e) { /* abaikan */ } process.exit(0); })
  .catch(async e => { console.error('\nGagal: ' + e.message + '\n'); try { await db.close(); } catch (x) { /* abaikan */ } process.exit(1); });
