'use strict';
/* Asisten BIOLOOP: Gemini + ingatan per akun + data reaktor dari database + fungsi kendali. */
const cfg = require('./config');
const gemini = require('./gemini');
const memory = require('./memory');
const reactor = require('./reactor');
const settings = require('./settings');
const db = require('./db');
const { SIM } = reactor;

/* Pengetahuan terverifikasi (lihat docs/Data_Penelitian_MBG_BIOLOOP.xlsx) */
const KB = `
FAKTA RUJUKAN (sebutkan sumbernya bila dipakai):
- Sisa makanan program MBG diperkirakan 1,1-1,4 juta ton/tahun; 451-603 ribu ton masih layak makan (kajian Bappenas 2024, dikutip Bapanas 27 Mei 2025).
- Studi UGM 2025 (52 siswa SD Yogyakarta): rata-rata sisa makan siang 2.484 g/hari untuk seluruh sampel; kesukaan menu karbohidrat & lauk berhubungan dengan jumlah sisa, pengetahuan tidak (Muthmainnah dkk., J. Gizi Klinik Indonesia 2025).
- Sisa makanan adalah jenis sampah terbesar di Indonesia, sekitar 40% (SIPSN KLH 2024-2025). Hanya ±32-34% sampah terkelola.
- Food loss & waste Indonesia 23-48 juta ton/tahun (2000-2019), kerugian Rp213-551 triliun/tahun (Bappenas 2021).
- Juknis BGN: SPPG baru melayani rata-rata 2.500 penerima (maks 3.000), Rp15.000 per penerima per hari termasuk insentif Rp6 juta/hari, 313 hari operasional/tahun. SPPG wajib punya IPAL dan SLHS.
- LPG: 80,58% kebutuhan nasional 2025 dipenuhi impor, 83,97% pada Jan-Feb 2026 (Ditjen Migas ESDM via detikFinance/Republika, Apr 2026). Bright Gas 12 kg Rp218.000 di agen Jawa sejak 15 Agu 2026.
- Emisi LPG ±2,98 kg CO2 per kg (IPCC 2006: NCV 47,3 MJ/kg; 63.100 kg CO2/TJ).
- Suhu mesofilik ±35 °C; variasi maks ±3 °C; pH produksi metana 6,0-8,5; C/N 20-30; biogas menyala bila CH4 >45% (Mapantsela dkk., Gases 2024).
- Naik dari 25 ke 37 °C memberi biogas ±3x; fluktuasi 5 °C dapat menghentikan produksi; insulasi mengurangi kehilangan panas 67-82%; pemanasan koil heliks di dalam tangki paling efisien (Garkoti dkk., RSER 2024).
- NaHCO3 1,0 g/g VS menaikkan metana 11,2-29,7%; dosis >=1,25 g/g VS justru menurunkan (Almomani & Bhosale, Chemosphere 2020).
- Digesti mesofilik menurunkan patogen tetapi tidak menghilangkannya; endapan harus dikeringkan/dikomposkan sebelum dipakai (Machnicka & Grübel 2023).
- Metana mudah meledak pada 5-15% di udara (NOAA CAMEO). H2S: IDLH 100 ppm (NIOSH); bau hilang pada konsentrasi tinggi, jangan andalkan penciuman.
- Hitungan model: 1 SPPG 2.500 porsi x ±48 g sisa = ±120 kg/hari, butuh digester ±13 m3 (±26 modul 500 L), setara ±7 kg LPG/hari. 1 modul 500 L menampung sisa ±70-120 porsi.`;

function systemPrompt(conv, ctx, d, site) {
  return `Kamu adalah "Asisten BIOLOOP", asisten AI sistem MBG-BIOLOOP di ${site}: bioreaktor floating drum ±500 L yang mengolah sisa pangan program Makan Bergizi Gratis (MBG) menjadi biogas untuk kompor dapur SPPG dan endapan menjadi pupuk organik, dipantau sensor IoT.
Lawan bicaramu: ${ctx.who || 'petugas SPPG'}${ctx.role === 'admin' ? ' (admin sistem)' : ''}. Banyak pengguna bukan ahli teknik.

GAYA:
- Bahasa Indonesia yang santun, hangat, dan jelas. Panggil pengguna dengan namanya bila kamu tahu.
- Singkat: 2-6 kalimat atau daftar pendek. Lebih panjang hanya bila diminta.
- Teks polos, boleh daftar dengan tanda "-". Jangan memakai markdown tebal/judul.${ctx.channel === 'telegram' ? ' Kamu sedang membalas lewat Telegram.' : ' Kamu sedang membalas di website dashboard.'}
- Jangan mengarang angka. Untuk kondisi reaktor, pakai data di bawah atau panggil fungsi. Bila tidak tahu, katakan tidak tahu.
- Keselamatan nomor satu: untuk kebocoran gas, H2S, atau api, suruh matikan api dan tutup katup utama lebih dulu.
- Bila pengguna menyebut nama, jabatan, nama SPPG, atau preferensi, simpan dengan fungsi ingat_fakta.
${ctx.canControl ? '- Kamu BOLEH menjalankan aksi kendali lewat fungsi, tetapi hanya bila pengguna jelas memintanya. Setelah menjalankan, sebutkan apa yang kamu lakukan.' : '- Kamu TIDAK boleh menjalankan aksi kendali. Jelaskan cara melakukannya lewat dashboard (setelah masuk) atau perintah Telegram.'}

SUMBER DATA AKTIF: ${ctx.sourceName} (${d.sumber_data === 'sensor' ? 'data sensor nyata' : 'simulasi'})
KONDISI REAKTOR SAAT INI:
${JSON.stringify(d)}
${KB}

MEMORI TENTANG PENGGUNA INI:
Fakta penting: ${conv.facts.length ? conv.facts.join('; ') : '(belum ada)'}
Ringkasan percakapan lama: ${conv.summary || '(belum ada)'}

PERCAKAPAN TERAKHIR (lanjutkan secara alami, jangan mengulang salam bila sudah pernah menyapa):
${memory.transcript(conv.messages.slice(-cfg.MEMORY_RECENT, -1)) || '(ini pesan pertama)'}`;
}

/* ---------- fungsi (tools) ---------- */
const TREND_KEYS = { suhu: 'T', pH: 'pH', tekanan: 'P', metana: 'x', isi_drum: 'Vg', produksi: 'prod', vfa: 'vfa', endapan: 'sl', bocor: 'lel' };
const READ_TOOLS = [
  { name: 'lihat_status', description: 'Ambil kondisi terbaru bioreaktor: sensor, katup, kompor, peringatan, skor kesehatan, total produksi.', parameters: { type: 'object', properties: {} } },
  { name: 'lihat_tren', description: 'Ringkasan tren satu parameter dalam beberapa jam terakhir (min, maks, rata-rata, awal, akhir).',
    parameters: { type: 'object', properties: { parameter: { type: 'string', enum: Object.keys(TREND_KEYS) }, jam: { type: 'number', description: 'Rentang jam ke belakang, 1-120' } }, required: ['parameter'] } },
  { name: 'lihat_sisa_pangan', description: 'Data smart bin + kamera: sisa makan siang hari ini per menu dan peringkat menu dengan persentase sisa tertinggi.', parameters: { type: 'object', properties: {} } },
  { name: 'lihat_kejadian', description: 'Daftar kejadian/peringatan terakhir (log).', parameters: { type: 'object', properties: { jumlah: { type: 'number' } } } },
  { name: 'lihat_perangkat', description: 'Daftar sumber data: simulasi dan perangkat ESP32 terdaftar beserta status online.', parameters: { type: 'object', properties: {} } },
  { name: 'hitung_kebutuhan_sppg', description: 'Hitung ukuran digester dan potensi biogas untuk satu SPPG.',
    parameters: { type: 'object', properties: { porsi: { type: 'number', description: 'porsi per hari' }, gram_sisa_per_porsi: { type: 'number', description: 'default 48' } }, required: ['porsi'] } },
  { name: 'ingat_fakta', description: 'Simpan fakta penting tentang pengguna agar diingat di percakapan berikutnya (nama, jabatan, nama SPPG, preferensi).',
    parameters: { type: 'object', properties: { fakta: { type: 'string' } }, required: ['fakta'] } }
];
const CONTROL_TOOLS = [
  { name: 'tambah_buffer', description: 'Pompa buffer NaHCO3 untuk menaikkan pH.', parameters: { type: 'object', properties: { gram: { type: 'number', description: '50-3000' } }, required: ['gram'] } },
  { name: 'masukkan_umpan', description: 'Masukkan sisa pangan ke bioreaktor (mode simulasi).', parameters: { type: 'object', properties: { kg: { type: 'number' }, jenis: { type: 'string', enum: Object.keys(SIM.FOOD) } }, required: ['kg'] } },
  { name: 'kuras_endapan', description: 'Buka katup bawah untuk menguras endapan (pupuk).', parameters: { type: 'object', properties: { liter: { type: 'number' } }, required: ['liter'] } },
  { name: 'atur_kompor', description: 'Nyalakan atau matikan kompor biogas SPPG.', parameters: { type: 'object', properties: { nyala: { type: 'boolean' }, tungku: { type: 'number', description: '1 atau 2' } }, required: ['nyala'] } },
  { name: 'atur_katup', description: 'Atur katup koil suhu: panas, dingin, atau tutup (membuat mode manual).', parameters: { type: 'object', properties: { mode: { type: 'string', enum: ['panas', 'dingin', 'tutup'] } }, required: ['mode'] } },
  { name: 'mode_otomatis', description: 'Aktifkan atau matikan mode otomatis kontroler.', parameters: { type: 'object', properties: { aktif: { type: 'boolean' } }, required: ['aktif'] } }
];

function execTool(key, ctx) {
  const who = { origin: ctx.channel === 'telegram' ? 'telegram' : 'ai', actor: `Asisten AI (${ctx.who || key})` };
  return async (name, a) => {
    try {
      switch (name) {
        case 'lihat_status': { const { state } = await reactor.tick(ctx.source); return reactor.describe(state); }
        case 'lihat_tren': {
          const { state: s } = await reactor.load(ctx.source);
          const f = TREND_KEYS[a.parameter] || 'T', jam = SIM.clamp(+a.jam || 12, 1, 120);
          const h = s.hist.filter(p => p.t >= s.t - jam); if (!h.length) return { pesan: 'Belum ada data' };
          const v = h.map(p => p[f]);
          return { parameter: a.parameter, jam, awal: +v[0].toFixed(2), akhir: +v[v.length - 1].toFixed(2), min: +Math.min(...v).toFixed(2), maks: +Math.max(...v).toFixed(2), rata: +(v.reduce((x, y) => x + y, 0) / v.length).toFixed(2), titik_data: v.length };
        }
        case 'lihat_sisa_pangan': {
          const { state: s } = await reactor.load(ctx.source);
          const rank = reactor.withSim(s, () => SIM.wasteRanking()).result;
          return { hari_ini: s.wp.today, peringkat: rank.map(x => ({ menu: x.n, persen_sisa: +x.pct.toFixed(1), total_kg: +x.kg.toFixed(2), hari: x.days })), porsi_dipantau: s.set.porsi };
        }
        case 'lihat_kejadian': return (await db.events({ source: ctx.source, limit: SIM.clamp(+a.jumlah || 8, 1, 30) }))
          .map(l => ({ waktu: new Date(l.at).toLocaleString('id-ID', { timeZone: cfg.TZ }), tingkat: l.lvl, judul: l.title, isi: l.body, oleh: l.actor }));
        case 'lihat_perangkat': return (await reactor.sources()).map(s => ({ id: s.id, nama: s.name, jenis: s.kind, online: s.online, terakhir: s.last_seen || null }));
        case 'hitung_kebutuhan_sppg': {
          const porsi = SIM.clamp(+a.porsi || 2500, 10, 20000), g = SIM.clamp(+a.gram_sisa_per_porsi || 48, 5, 500);
          const kg = porsi * g / 1000, vs = kg * .217, ch4 = vs * .355, lpg = ch4 * .7156 * 50.4 / 47.3;
          const vol = Math.max(vs / 2, kg * 2 / 1000 * 40);
          return { sisa_kg_hari: +kg.toFixed(1), metana_m3_hari: +ch4.toFixed(1), setara_LPG_kg_hari: +lpg.toFixed(1), volume_kerja_m3: +vol.toFixed(1), modul_500L: Math.ceil(vol / .5),
            asumsi: 'VS 21,7% berat basah, 0,355 m3 CH4/kg VS, OLR 2 kg VS/m3/hari, HRT 40 hari, pengencer 1:1. Angka perkiraan.' };
        }
        case 'ingat_fakta': return { tersimpan: await memory.addFact(key, a.fakta) };
      }
      if (!ctx.canControl) return { ok: false, message: 'Aksi kendali tidak diizinkan dari saluran ini.' };
      switch (name) {
        case 'tambah_buffer': return reactor.control(ctx.source, 'buffer', { grams: a.gram }, who);
        case 'masukkan_umpan': return reactor.control(ctx.source, 'feed', { kg: a.kg, type: a.jenis }, who);
        case 'kuras_endapan': return reactor.control(ctx.source, 'drain', { liters: a.liter }, who);
        case 'atur_kompor': return reactor.control(ctx.source, 'stove', { on: a.nyala, burners: a.tungku }, who);
        case 'atur_katup': return reactor.control(ctx.source, 'valve', { mode: a.mode }, who);
        case 'mode_otomatis': return reactor.control(ctx.source, 'auto', { on: a.aktif }, who);
      }
      return { ok: false, message: 'Fungsi tidak dikenal' };
    } catch (e) { return { ok: false, message: e.message }; }
  };
}

/* ---------- antrean per pengguna (dalam satu instance) ---------- */
const locks = new Map();
function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn); locks.set(key, next.catch(() => {}));
  return next;
}

/* ctx: { channel: 'web'|'telegram', canControl, who, role, source } */
async function chat(key, text, ctx = {}) {
  return withLock(key, async () => {
    const conv = await memory.add(key, 'user', text);
    if (!gemini.info().enabled) {
      const msg = 'Asisten AI belum aktif karena GEMINI_API_KEY belum diisi. Minta admin mengisinya di Environment Variables. Perintah Telegram (/status, /suhu, dll.) tetap berfungsi.';
      await memory.add(key, 'model', msg);
      return { reply: msg, actions: [], ai: false };
    }
    ctx.channel = ctx.channel || 'web';
    ctx.source = await reactor.resolveSource(ctx.source);
    const srcList = await reactor.sources();
    ctx.sourceName = (srcList.find(s => s.id === ctx.source) || { name: ctx.source }).name;
    const set = await settings.get();
    const { state } = await reactor.tick(ctx.source);
    const d = reactor.describe(state);
    const tools = ctx.canControl ? READ_TOOLS.concat(CONTROL_TOOLS) : READ_TOOLS;
    let out;
    try {
      out = await gemini.run({ system: systemPrompt(conv, ctx, d, set.site_name), input: text, tools, execTool: execTool(key, ctx) });
    } catch (e) {
      console.error('[ai]', e.status || '', e.message);
      const hint = e.status === 401 || e.status === 403 ? 'API key Gemini ditolak. Admin perlu memeriksa GEMINI_API_KEY.' : e.status === 429 ? 'Kuota Gemini sedang habis; coba lagi sebentar lagi.' : 'Gagal menghubungi Gemini: ' + e.message;
      return { reply: hint, actions: [], ai: false, error: true };
    }
    const reply = out.text || (out.actions.length ? out.actions.map(a => a.result && a.result.message).filter(Boolean).join(' ') : 'Maaf, saya belum bisa menjawab itu.');
    await memory.add(key, 'model', reply);
    try { await memory.compact(key, p => gemini.simple('Kamu merangkum percakapan secara faktual dan ringkas.', p)); } catch (e) { /* abaikan */ }
    return { reply, actions: out.actions.map(a => ({ name: a.name, args: a.args, ok: a.result && a.result.ok !== false })), ai: true };
  });
}
module.exports = { chat, memory };
