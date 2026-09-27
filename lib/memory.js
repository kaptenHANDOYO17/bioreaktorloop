'use strict';
/* Ingatan percakapan persisten per pengguna ('user:<id>' di website, 'tg:<chat id>' di Telegram).
   - pesan terbaru disimpan utuh (MEMORY_RECENT)
   - bila lebih dari MEMORY_MAX, pesan lama diringkas oleh Gemini menjadi ringkasan jangka panjang
   - fakta penting (nama, jabatan, preferensi) disimpan terpisah lewat fungsi ingat_fakta */
const cfg = require('./config');
const db = require('./db');

function blank(key) { return { key, summary: '', facts: [], messages: [], total: 0, created: Date.now(), updated: Date.now() }; }
async function get(key) { return (await db.getConv(key)) || blank(key); }
async function save(conv) { conv.updated = Date.now(); await db.putConv(conv.key, conv); }
async function add(key, role, text) {
  const c = await get(key);
  c.messages.push({ r: role, text: String(text).slice(0, 4000), at: Date.now() });
  c.total++; await save(c); return c;
}
async function addFact(key, fact) {
  const c = await get(key); fact = String(fact || '').trim().slice(0, 300);
  if (fact && !c.facts.some(f => f.toLowerCase() === fact.toLowerCase())) c.facts.push(fact);
  if (c.facts.length > 30) c.facts.shift();
  await save(c); return c.facts;
}
async function forget(key) { await db.delConv(key); }
function transcript(msgs) {
  return msgs.map(m => `${m.r === 'user' ? 'Pengguna' : 'Asisten'} (${new Date(m.at).toLocaleString('id-ID', { timeZone: cfg.TZ })}): ${m.text}`).join('\n');
}
async function compact(key, summarizer) {
  const c = await get(key);
  if (c.messages.length <= cfg.MEMORY_MAX) return false;
  const old = c.messages.slice(0, c.messages.length - cfg.MEMORY_RECENT);
  try {
    const prompt = `Ringkasan lama:\n${c.summary || '(kosong)'}\n\nPercakapan yang akan diringkas:\n${transcript(old)}\n\n` +
      'Tulis ringkasan baru (maks 200 kata, bahasa Indonesia) yang menggabungkan ringkasan lama dan percakapan di atas. ' +
      'Pertahankan: nama & peran pengguna, keputusan yang diambil, masalah reaktor yang pernah terjadi dan penyelesaiannya, preferensi, pertanyaan yang belum terjawab.';
    const s = await summarizer(prompt);
    if (s && s.trim()) {
      const fresh = await get(key);   // ambil ulang: bisa saja ada pesan baru saat meringkas
      fresh.summary = s.trim().slice(0, 2500);
      fresh.messages = fresh.messages.filter(m => !old.some(o => o.at === m.at && o.text === m.text));
      await save(fresh); return true;
    }
  } catch (e) {
    console.warn('[memory] gagal meringkas:', e.message);
    if (c.messages.length > cfg.MEMORY_MAX * 2) { c.messages = c.messages.slice(-cfg.MEMORY_MAX); await save(c); }
  }
  return false;
}
module.exports = { get, add, addFact, forget, transcript, compact };
