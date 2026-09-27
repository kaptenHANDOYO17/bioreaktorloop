'use strict';
/* Bot Telegram.
   - Vercel: mode webhook (Telegram mengirim pesan ke /api/telegram/webhook)
   - Lokal : mode long polling (tanpa IP publik)
   Chat baru harus disetujui admin di panel sebelum bisa memakai bot (bisa dimatikan). */
const cfg = require('./config');
const db = require('./db');
const reactor = require('./reactor');
const settings = require('./settings');
const { SIM } = reactor;

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let me = null, lastError = '', polling = false;

async function api(method, params = {}, timeoutMs = 20000) {
  if (!cfg.TELEGRAM_BOT_TOKEN) throw Object.assign(new Error('TELEGRAM_BOT_TOKEN belum diisi'), { code: 0 });
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${cfg.TELEGRAM_API_BASE}/bot${cfg.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
    const j = await r.json().catch(() => ({ ok: false, description: 'respons bukan JSON' }));
    if (!j.ok) { const e = new Error(j.description || 'Telegram error'); e.code = j.error_code; e.retry = j.parameters && j.parameters.retry_after; throw e; }
    return j.result;
  } finally { clearTimeout(to); }
}
async function getMe() {
  if (me) return me;
  const cached = await db.kvGet('tg_me');
  if (cached && cached.token === cfg.TELEGRAM_BOT_TOKEN.slice(-8)) { me = cached; return me; }
  const r = await api('getMe'); me = { id: r.id, username: r.username, first_name: r.first_name, token: cfg.TELEGRAM_BOT_TOKEN.slice(-8) };
  await db.kvSet('tg_me', me); return me;
}

/* ---------- kirim ---------- */
async function send(chatId, text, opts = {}) {
  const chunks = []; let t = String(text);
  while (t.length > 3900) { let cut = t.lastIndexOf('\n', 3900); if (cut < 1000) cut = 3900; chunks.push(t.slice(0, cut)); t = t.slice(cut); }
  chunks.push(t);
  for (let i = 0; i < chunks.length; i++) {
    const o = i === chunks.length - 1 ? opts : { parse_mode: opts.parse_mode };
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await api('sendMessage', Object.assign({ chat_id: chatId, text: chunks[i], disable_web_page_preview: true }, o), 15000); break; }
      catch (e) {
        if (e.retry && e.retry <= 5) { await sleep(e.retry * 1000); continue; }
        if (o.parse_mode && /parse|entities/i.test(e.message)) { chunks[i] = chunks[i].replace(/<[^>]+>/g, ''); delete o.parse_mode; continue; }
        if (e.code === 403) await db.updateTgChat(chatId, { subscribed: false }).catch(() => {});
        console.warn('[telegram] gagal kirim ke', chatId, e.message); lastError = e.message; break;
      }
    }
  }
}
const html = (id, t, kb) => send(id, t, Object.assign({ parse_mode: 'HTML' }, kb ? { reply_markup: kb } : {}));

async function recipients() {
  return (await db.listTgChats()).filter(c => c.subscribed && (c.approved || !cfg.TELEGRAM_REQUIRE_APPROVAL));
}
async function broadcast(text) {
  const list = await recipients();
  for (const c of list) { await html(c.chat_id, text); if (list.length > 20) await sleep(40); }
  return list.length;
}
async function sourceName(source) { const s = (await reactor.sources()).find(x => x.id === source); return s ? s.name : source; }

/* Dipanggil reactor setelah kejadian tersimpan. Beberapa kejadian digabung jadi satu pesan. */
async function notifyEvents(source, events) {
  if (!cfg.TELEGRAM_BOT_TOKEN || !events.length) return;
  const set = await settings.get(); const name = await sourceName(source);
  const ic = { bad: '🚨', warn: '⚠️', ok: '✅', info: 'ℹ️' };
  const parts = events.slice(0, 8).map(m => `${ic[m.lvl] || 'ℹ️'} <b>${esc(m.title)}</b>${m.body ? '\n' + esc(m.body) : ''}${m.actor && m.actor !== 'sistem' ? `\n<i>oleh ${esc(m.actor)}</i>` : ''}`);
  if (events.length > 8) parts.push(`…dan ${events.length - 8} kejadian lain. Lihat dasbor.`);
  const when = new Date().toLocaleString('id-ID', { timeZone: cfg.TZ, dateStyle: 'short', timeStyle: 'short' });
  await broadcast(parts.join('\n\n') + `\n\n🕒 ${when} | ${esc(name)} | ${esc(set.site_name)}`);
}

/* ---------- pesan status ---------- */
const onoff = b => b ? 'ON' : 'OFF';
function statusMsg(st, name, site) {
  return reactor.withSim(st, S => {
    const a = SIM.aiInsight(), R = SIM.R, icon = k => ({ ok: '✅', warn: '⚠️', bad: '🚨' })[SIM.statusOf(k)];
    const when = S.source === 'sensor' ? (S.lastSensor ? 'data terakhir ' + new Date(S.lastSensor).toLocaleTimeString('id-ID', { timeZone: cfg.TZ, hour: '2-digit', minute: '2-digit' }) : 'belum ada data sensor') : SIM.simTimeStr(S.t);
    return `📊 <b>Status ${esc(name)}</b> · ${esc(site)}\n🕒 ${when} | mode ${S.auto ? 'otomatis' : 'manual'}\n\n` +
      `🌡 Suhu <b>${S.T.toFixed(1)} °C</b> ${icon('T')} (target ${S.set.T}±${S.set.band})\n` +
      `🧪 pH <b>${S.pH.toFixed(2)}</b> ${icon('pH')} | VFA ${Math.round(S.vfa)} mg/L\n` +
      `⚖️ Tekanan <b>${S.press.toFixed(1)} mbar</b> ${icon('P')}\n` +
      `🔵 Gas <b>${(S.Vg * 1000).toFixed(0)} L</b> (${(S.Vg / R.VgMax * 100).toFixed(0)}%), ±${(S.Vg / (R.burner * S.burners) * 60).toFixed(0)} menit kompor\n` +
      `💨 CH₄ ${(S.xCH4 * 100).toFixed(0)}% | produksi ${(S.prod * 24).toFixed(2)} m³/hari\n` +
      `🟤 Endapan ${S.sludgeL.toFixed(0)}/${S.set.sludgeMax} L | kebocoran ${S.lel.toFixed(0)}% LEL\n` +
      `♨️ Panas ${onoff(S.hot)} | ❄️ Dingin ${onoff(S.cold)} | 🔥 Kompor ${onoff(S.stove)}\n\nKesehatan proses <b>${a.score}/100</b>`;
  }).result;
}
async function statusFor(source) {
  const set = await settings.get(); source = await reactor.resolveSource(source);
  const { state } = await reactor.tick(source);
  return statusMsg(state, await sourceName(source), set.site_name);
}

const KB = { keyboard: [[{ text: '📊 Status' }, { text: '🌡 Suhu' }, { text: '🧪 pH' }], [{ text: '🔵 Gas' }, { text: '🟤 Endapan' }, { text: '🤖 Prediksi' }], [{ text: '🔥 Kompor ON' }, { text: '⛔ Kompor OFF' }, { text: '🍽 Sisa pangan' }], [{ text: '🧠 Ingatan' }, { text: '❓ Bantuan' }]], resize_keyboard: true, is_persistent: true };
const ALIAS = { '📊 status': '/status', '🌡 suhu': '/suhu', '🧪 ph': '/ph', '🔵 gas': '/gas', '🟤 endapan': '/endapan', '🤖 prediksi': '/prediksi', '🔥 kompor on': '/kompor_on', '⛔ kompor off': '/kompor_off', '🍽 sisa pangan': '/sisa', '🧠 ingatan': '/ingatan', '❓ bantuan': '/bantuan' };
const HELP = `<b>Cara pakai bot</b>
Ketik pertanyaan biasa, misalnya "kenapa pH turun?" atau "nyalakan kompor 2 tungku". Asisten AI akan menjawab dan mengingat obrolan kita.

<b>Perintah cepat</b>
/status ringkasan sensor
/suhu, /ph, /gas, /endapan
/prediksi analitik 6 jam ke depan
/sisa menu yang paling banyak tersisa
/buffer 300 tambah 300 g NaHCO₃
/umpan 3 masukkan 3 kg sisa pangan
/kuras 20 kuras 20 L endapan
/kompor_on, /kompor_off
/panas_on, /dingin_on, /katup_off
/auto_on, /auto_off
/notif_on, /notif_off langganan peringatan
/ingatan lihat apa yang diingat asisten
/lupa hapus ingatan obrolan
/id tampilkan Chat ID`;

/* ---------- penanganan pesan ---------- */
async function handleMessage(msg) {
  const chatId = String(msg.chat.id), key = 'tg:' + chatId;
  let text = String(msg.text || '').trim(); if (!text) return;
  const al = ALIAS[text.toLowerCase()]; if (al) text = al;
  const set = await settings.get();
  const title = msg.chat.title || [msg.from && msg.from.first_name, msg.from && msg.from.last_name].filter(Boolean).join(' ') || chatId;
  const auto = cfg.TELEGRAM_ALLOWED_CHAT_IDS.includes(chatId) || !cfg.TELEGRAM_REQUIRE_APPROVAL;
  let chat = await db.tgChat(chatId);
  const isNew = !chat;
  chat = await db.upsertTgChat({ chat_id: chatId, title, username: (msg.chat.username || (msg.from && msg.from.username) || ''), approved: auto });
  if (auto && !chat.approved) chat = await db.updateTgChat(chatId, { approved: true });
  const cmd0 = text.replace(/@\w+/, '').split(/\s+/)[0].toLowerCase();

  if (!chat.approved) {
    if (cmd0 === '/id') return html(chatId, `Chat ID: <code>${chatId}</code>`);
    if (isNew) await db.addEvents([{ source: 'sistem', cat: 'action', lvl: 'info', type: 'tg_pending', title: `Chat Telegram baru menunggu persetujuan: ${title}`, body: `Chat ID ${chatId}`, actor: 'Telegram' }]).catch(() => {});
    return html(chatId, `👋 Halo! Bot ini melayani <b>${esc(set.site_name)}</b>.\nChat Anda sudah tercatat dan <b>menunggu persetujuan admin</b>.\nChat ID: <code>${chatId}</code>\n\nSetelah disetujui, ketik /start lagi.`);
  }

  if (!text.startsWith('/')) {
    api('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    const typing = setInterval(() => api('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {}), 4500);
    try {
      const ai = require('./ai');
      const conv = await ai.memory.get(key);
      if (title && !conv.facts.some(f => f.startsWith('Nama Telegram'))) await ai.memory.addFact(key, 'Nama Telegram: ' + title);
      const r = await ai.chat(key, text, { channel: 'telegram', canControl: cfg.AI_CAN_CONTROL, who: title });
      await send(chatId, r.reply);
    } finally { clearInterval(typing); }
    return;
  }
  const source = await reactor.resolveSource();
  const { state: S } = await reactor.tick(source);
  const a = reactor.withSim(S, () => SIM.aiInsight()).result;
  const icon = k => reactor.withSim(S, () => ({ ok: '✅', warn: '⚠️', bad: '🚨' })[SIM.statusOf(k)]).result;
  const parts = text.replace(/@\w+/, '').split(/\s+/), cmd = parts[0].toLowerCase();
  const n = parseFloat(String(parts[1] || '').replace(',', '.'));
  const who = { origin: 'telegram', actor: 'Telegram: ' + title };
  const ctl = async (act, p) => { const r = await reactor.control(source, act, p, who); return html(chatId, (r.ok ? '✅ ' : '⛔ ') + esc(r.message)); };
  switch (cmd) {
    case '/start': await db.updateTgChat(chatId, { subscribed: true });
      return html(chatId, `👋 Halo ${esc(title)}! Saya <b>Asisten BIOLOOP</b> untuk ${esc(set.site_name)}.\nAnda berlangganan peringatan otomatis.\n\nTanya apa saja dengan bahasa biasa, atau pakai tombol di bawah.`, KB);
    case '/menu': return html(chatId, 'Pilih tombol di bawah atau ketik pertanyaan.', KB);
    case '/status': return html(chatId, statusMsg(S, await sourceName(source), set.site_name));
    case '/suhu': return html(chatId, `🌡 Suhu slurry <b>${S.T.toFixed(1)} °C</b> ${icon('T')}\nTarget ${S.set.T} ± ${S.set.band} °C\nKatup panas ${onoff(S.hot)}, dingin ${onoff(S.cold)}\nPerkiraan 6 jam: ${a.T6.toFixed(1)} °C`);
    case '/ph': return html(chatId, `🧪 pH <b>${S.pH.toFixed(2)}</b> ${icon('pH')}\nVFA ${Math.round(S.vfa)} mg/L, alkalinitas ${Math.round(S.Alk)} mg/L\nRasio VFA/alkalinitas ${a.fos.toFixed(2)} (aman di bawah 0,3)\nPerkiraan 6 jam: ${a.pH6.toFixed(2)}`);
    case '/gas': return html(chatId, `🔵 Gas <b>${(S.Vg * 1000).toFixed(0)} L</b> (${(S.Vg / SIM.R.VgMax * 100).toFixed(0)}%)\nTekanan ${S.press.toFixed(1)} mbar, CH₄ ${(S.xCH4 * 100).toFixed(0)}%\nCukup ±${(S.Vg / SIM.R.burner * 60).toFixed(0)} menit 1 tungku`);
    case '/endapan': return html(chatId, `🟤 Endapan <b>${S.sludgeL.toFixed(0)} L</b> dari batas ${S.set.sludgeMax} L\nPupuk padat ${S.cum.fert.toFixed(1)} kg, pupuk cair ${S.cum.liq.toFixed(0)} L`);
    case '/prediksi': return html(chatId, `🤖 <b>Analitik proses</b>\nKesehatan ${a.score}/100\n` + a.notes.map(x => '• ' + esc(x)).join('\n'));
    case '/sisa': { const w = reactor.withSim(S, () => SIM.wasteRanking()).result; if (!w.length) return html(chatId, 'Belum ada data smart bin. Rekap dibuat pukul 13.00 waktu simulasi.');
      return html(chatId, '🍽 <b>Persentase sisa per menu</b>\n' + w.map(x => `${esc(x.n)}: ${x.pct.toFixed(0)}%`).join('\n') + `\n\nPaling banyak tersisa: <b>${esc(w[0].n)}</b>.`); }
    case '/buffer': return ctl('buffer', { grams: isFinite(n) ? n : 300 });
    case '/umpan': return ctl('feed', { kg: isFinite(n) ? n : 3 });
    case '/kuras': return ctl('drain', { liters: isFinite(n) ? n : 20 });
    case '/kompor_on': return ctl('stove', { on: true, burners: isFinite(n) ? n : undefined });
    case '/kompor_off': return ctl('stove', { on: false });
    case '/panas_on': return ctl('valve', { mode: 'panas' });
    case '/dingin_on': return ctl('valve', { mode: 'dingin' });
    case '/katup_off': return ctl('valve', { mode: 'tutup' });
    case '/auto_on': return ctl('auto', { on: true });
    case '/auto_off': return ctl('auto', { on: false });
    case '/notif_on': await db.updateTgChat(chatId, { subscribed: true }); return html(chatId, '🔔 Peringatan otomatis aktif untuk chat ini.');
    case '/notif_off': case '/stop': await db.updateTgChat(chatId, { subscribed: false }); return html(chatId, '🔕 Peringatan otomatis dimatikan. Ketik /notif_on untuk mengaktifkan lagi.');
    case '/ingatan': { const c = await require('./ai').memory.get(key);
      return html(chatId, `🧠 <b>Yang saya ingat</b>\nFakta: ${c.facts.length ? esc(c.facts.join('; ')) : '(belum ada)'}\nRingkasan: ${esc(c.summary || '(belum ada)')}\nPesan tersimpan: ${c.messages.length} (total ${c.total})`); }
    case '/lupa': await require('./ai').memory.forget(key); return html(chatId, '🧹 Ingatan obrolan untuk chat ini sudah dihapus.');
    case '/id': return html(chatId, `Chat ID: <code>${chatId}</code>`);
    case '/bantuan': case '/help': return html(chatId, HELP, KB);
    default: return html(chatId, 'Perintah tidak dikenal. Ketik /bantuan, atau tulis pertanyaan biasa.');
  }
}
/* Satu update dari Telegram (webhook atau polling). Duplikat diabaikan. */
async function handleUpdate(u) {
  if (!u || typeof u.update_id !== 'number') return;
  if (await db.tgSeen(u.update_id)) return;
  const msg = u.message || u.edited_message;
  if (msg && msg.chat) await handleMessage(msg);
}

/* ---------- webhook ---------- */
const COMMANDS = [['status', 'Ringkasan sensor'], ['suhu', 'Suhu & katup'], ['ph', 'pH & VFA'], ['gas', 'Isi drum & tekanan'], ['endapan', 'Endapan & pupuk'],
  ['prediksi', 'Analitik 6 jam'], ['sisa', 'Menu paling banyak tersisa'], ['kompor_on', 'Nyalakan kompor'], ['kompor_off', 'Matikan kompor'],
  ['ingatan', 'Apa yang diingat asisten'], ['lupa', 'Hapus ingatan'], ['id', 'Lihat Chat ID'], ['bantuan', 'Cara pakai']].map(([c, d]) => ({ command: c, description: d }));
async function setWebhook(baseUrl) {
  const url = baseUrl.replace(/\/+$/, '') + '/api/telegram/webhook';
  await api('setWebhook', { url, secret_token: cfg.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'edited_message'], drop_pending_updates: false, max_connections: 20 });
  await api('setMyCommands', { commands: COMMANDS }).catch(() => {});
  await db.kvSet('tg_webhook', { url, at: Date.now() });
  return url;
}
async function deleteWebhook() { await api('deleteWebhook', { drop_pending_updates: false }); await db.kvSet('tg_webhook', null); }
async function webhookInfo() { try { return await api('getWebhookInfo'); } catch (e) { return { error: e.message }; } }

/* ---------- long polling (hanya mode lokal) ---------- */
async function startPolling() {
  if (!cfg.TELEGRAM_BOT_TOKEN || polling) return;
  try {
    const b = await getMe();
    // Bila bot sedang dipakai website online (webhook Vercel), jangan direbut kecuali TELEGRAM_MODE=polling
    const wh = await api('getWebhookInfo').catch(() => null);
    if (wh && wh.url && cfg.TELEGRAM_MODE !== 'polling') {
      lastError = 'Bot sedang dipakai webhook: ' + wh.url;
      console.log(`[telegram] Bot @${b.username} sedang dipakai website online (${wh.url}).\n           Bot lokal TIDAK dijalankan agar bot online tetap berfungsi. Isi TELEGRAM_MODE=polling di .env bila ingin memakai bot di komputer ini.`);
      return;
    }
    await api('deleteWebhook', { drop_pending_updates: false }).catch(() => {});
    await api('setMyCommands', { commands: COMMANDS }).catch(() => {});
    polling = true; console.log(`[telegram] Bot @${b.username} aktif (long polling).`);
  } catch (e) { lastError = e.message; console.error('[telegram] Gagal memulai bot:', e.message); return; }
  let offset = (await db.kvGet('tg_offset')) || 0;
  while (polling) {
    try {
      const ups = await api('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'edited_message'] }, 35000);
      for (const u of ups) {
        offset = u.update_id + 1; await db.kvSet('tg_offset', offset);
        handleUpdate(u).catch(e => console.error('[telegram] handle:', e.message));
      }
      lastError = '';
    } catch (e) {
      lastError = e.message;
      if (e.code === 401) { console.error('[telegram] Token ditolak. Periksa TELEGRAM_BOT_TOKEN.'); polling = false; break; }
      if (e.code === 409) { console.error('[telegram] Bot memakai webhook atau dijalankan di tempat lain. Menunggu 30 detik.'); await sleep(30000); continue; }
      await sleep(e.retry ? e.retry * 1000 : 5000);
    }
  }
}
function stopPolling() { polling = false; }
function mode() { return cfg.TELEGRAM_MODE === 'auto' ? (cfg.IS_VERCEL ? 'webhook' : 'polling') : cfg.TELEGRAM_MODE; }
async function info() {
  if (!cfg.TELEGRAM_BOT_TOKEN) return { enabled: false, mode: mode() };
  let b = null; try { b = await getMe(); } catch (e) { lastError = e.message; }
  return { enabled: true, mode: mode(), username: b && b.username, polling, error: lastError, requireApproval: cfg.TELEGRAM_REQUIRE_APPROVAL };
}
async function test(chatId, text) { await api('sendMessage', { chat_id: chatId, text: text || '✅ Pesan uji dari MBG-BIOLOOP. Bot berjalan.' }, 15000); }

module.exports = { api, send, html, broadcast, notifyEvents, statusFor, handleUpdate, setWebhook, deleteWebhook, webhookInfo, startPolling, stopPolling, info, test, mode, getMe };
