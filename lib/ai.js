'use strict';
/* Asisten BIOLOOP: Gemini + ingatan per akun + data reaktor dari database + fungsi kendali. */
const cfg = require('./config');
const gemini = require('./gemini');
const memory = require('./memory');
const reactor = require('./reactor');
const settings = require('./settings');
const db = require('./db');
const faq = require('./faq');
const SIZING = require('../public/js/sizing.js');
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
- Ukuran (model tim, skenario tengah): 1 SPPG 2.500 porsi x 47,8 g = 119,5 kg sisa/hari, VS 25,9 kg. Volume kerja dihitung dua kriteria dan diambil terbesar: OLR 2,0 kg VS/m3/hari (Almomani & Bhosale 2020) -> 13,0 m3; HRT 30 hari (Mapantsela 2024, tropis 30-50 hari) dengan umpan diencerkan ke TS 8% (366 L/hari) -> 11,0 m3. Jadi ±13 m3, modular 3 tangki FRP 5 m3 (volume kerja 13,5 m3, HRT 37 hari).
- Prototipe 500 L: untuk menguji sistem kontrol, kapasitas ±4,1 kg sisa/hari (±87 porsi), skala 1:30. JANGAN bilang 500 L cukup untuk satu SPPG.
- Pembanding OLR: Nagao dkk. 2012 stabil s.d. 9,2 kg VS/m3/hari di lab; Pramanik dkk. 2019 sudah tidak stabil pada 2,45 di reaktor semi-pilot. 2,0 dipilih konservatif karena operator petugas dapur.
- Produksi: biogas 15,3 m3/hari (rentang 8,0-29,9), 332 MJ, setara 7,0 kg LPG/hari = ±47% kebutuhan LPG SPPG (SPPG pembanding 18,7 kg LPG/hari untuk 3.120 porsi, Dermawan & Fauzi, Jurnal Ilmu Lingkungan 2026). Biogas pelengkap, bukan pengganti LPG total.
- Penyimpanan gas: dapur memasak ±8 jam, perlu simpan ±12,3 m3 (7 kantong PVC 2 m3). Kantong penuh tanpa dipakai = tekanan naik; ada sensor tekanan + katup pengaman.
- Pemanas: dengan insulasi ±40 MJ/hari = ±12% energi biogas; tanpa insulasi ±30%.
- Biaya investasi skala penuh 1 SPPG ±Rp126 juta (rentang Rp84-189 juta, termasuk instalasi 15% dan cadangan 10%; harga marketplace 18 Nov 2026). Penghematan LPG ±Rp39,9 juta/tahun (7,0 kg x 313 hari x Rp218.000/12 kg), OPEX ±Rp12,1 juta/tahun, manfaat bersih ±Rp27,8 juta. Balik modal ±4,5 tahun, NPV 10 tahun (diskonto 10%) ±Rp34 juta, IRR ±16%. Setara ±21 hari insentif fasilitas SPPG atau ±Rp16 per porsi selama 10 tahun. Risiko terbesar: hasil metana; bila rendah, balik modal mundur jauh, karena itu uji BMP lebih dulu.
- Biaya prototipe: estimasi komponen ±Rp10 juta (ganti dengan nota asli tim).
- Dapur MBG dilarang memakai LPG 3 kg sejak Juli 2026 (BGN via Bisnis.com), jadi harga yang dipakai LPG 12 kg nonsubsidi Rp218.000.
- Kejujuran: semua angka di atas hasil pemodelan dan harga pasar, BELUM pengukuran lapangan. Langkah berikutnya uji BMP sisa MBG lalu pilot di satu SPPG.
- Analogi presentasi: simulasi botol di website (menu Simulasi). Bioreaktor jarang meledak sendiri; bahayanya gas menumpuk, bocor, bertemu api. Jangan menakut-nakuti.`;

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
  { name: 'hitung_kebutuhan_sppg', description: 'Hitung ukuran digester (OLR & HRT), jumlah tangki, potensi biogas, biaya investasi, dan balik modal untuk satu SPPG.',
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
          const porsi = SIM.clamp(+a.porsi || 2500, 10, 20000), g = SIM.clamp(+a.gram_sisa_per_porsi || 47.8, 5, 500);
          const o = SIZING.compute({ porsi, gram: g }), r = (v, d = 1) => +(+v).toFixed(d);
          return { sisa_kg_hari: r(o.fw), vs_kg_hari: r(o.vsd), volume_menurut_OLR_m3: r(o.vOlr), volume_menurut_HRT_m3: r(o.vHrt), volume_kerja_m3: r(o.vw), penentu: o.gov,
            tangki_5m3: o.ntank, biogas_m3_hari: r(o.bg), setara_LPG_kg_hari: r(o.lpg), porsi_kebutuhan_LPG_tertutup_persen: Math.round(o.cover * 100),
            simpan_gas_m3: r(o.store), kantong_2m3: o.nbag, investasi_juta_rp: Math.round(o.capex / 1e6), rentang_investasi_juta_rp: [Math.round(o.capexLow / 1e6), Math.round(o.capexHigh / 1e6)],
            hemat_LPG_juta_rp_tahun: r(o.saving / 1e6), opex_juta_rp_tahun: r(o.opex / 1e6), balik_modal_tahun: isFinite(o.payback) ? r(o.payback) : null,
            asumsi: 'VS 21,7%, TS 24,5% diencerkan ke 8%, 0,355 m3 CH4/kg VS, CH4 60%, OLR 2,0, HRT min 30 hari, tangki FRP 5 m3 (90% kerja), LPG 12 kg Rp218.000, 313 hari. Model, belum pengukuran lapangan.' };
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
    const t0 = Date.now();
    const conv = await memory.add(key, 'user', text);
    /* Salam dijawab langsung (cepat, tanpa kuota AI). */
    if (faq.isGreeting(text)) {
      const name = (conv.facts.find(f => /^Nama/.test(f)) || '').replace(/^Nama[^:]*:\s*/, '') || (ctx.channel === 'telegram' ? ctx.who : '');
      const msg = faq.greeting(name && name !== 'Pengunjung website' ? name.split(' ')[0] : '', ctx.channel);
      await memory.add(key, 'model', msg);
      return { reply: msg, actions: [], ai: false, quick: true };
    }
    if (!gemini.info().enabled) {
      const quick = faq.fallback(text, null);
      const msg = quick || 'Asisten AI belum aktif karena GEMINI_API_KEY belum diisi. Minta admin mengisinya di Environment Variables. Perintah Telegram (/status, /qna, /volume, /biaya) tetap berfungsi.';
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
      /* Jangan biarkan pengguna menerima pesan galat: jawab dari basis tanya-jawab bila cocok. */
      const quick = faq.fallback(text, d);
      const why = e.status === 401 || e.status === 403 ? 'API key Gemini ditolak; admin perlu memeriksa GEMINI_API_KEY' : e.status === 429 ? 'kuota Gemini sedang habis' : 'asisten AI sedang lambat';
      const reply = quick ? `${quick}\n\n(Jawaban cepat dari data BIO-LOOP karena ${why}.)`
        : `Maaf, ${why}. Coba kirim ulang sebentar lagi. Sementara itu: /status untuk kondisi reaktor, /qna untuk pertanyaan yang sering diajukan, /volume dan /biaya untuk ukuran dan biaya.`;
      await memory.add(key, 'model', reply);
      return { reply, actions: [], ai: false, error: !quick, quick: !!quick };
    }
    const reply = out.text || (out.actions.length ? out.actions.map(a => a.result && a.result.message).filter(Boolean).join(' ') : 'Maaf, saya belum bisa menjawab itu.');
    await memory.add(key, 'model', reply);
    /* Meringkas ingatan lama hanya bila masih ada waktu (fungsi Vercel dibatasi 60 detik). */
    if (Date.now() - t0 < 25000) { try { await memory.compact(key, p => gemini.simple('Kamu merangkum percakapan secara faktual dan ringkas.', p, 15000)); } catch (e) { /* abaikan */ } }
    return { reply, actions: out.actions.map(a => ({ name: a.name, args: a.args, ok: a.result && a.result.ok !== false })), ai: true };
  });
}
module.exports = { chat, memory };
