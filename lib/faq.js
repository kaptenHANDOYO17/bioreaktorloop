'use strict';
/* Jawaban cepat tanpa AI.
   Dipakai bila Gemini lambat/gagal, untuk salam, dan untuk perintah /qna /volume /biaya /hitung di Telegram.
   Angka diambil dari public/js/sizing.js (sama dengan kalkulator website dan file Excel). */
const SIZING = require('../public/js/sizing.js');

const nf = (v, d = 0) => (+v).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
const jt = v => nf(v / 1e6, 0);
const M = () => SIZING.compute();

function volumeText(o = M()) {
  return `Prototipe 500 L dipakai untuk menguji sistem kontrol. Kapasitasnya ±${nf(o.protoKg, 1)} kg sisa per hari, setara sisa ±${nf(o.protoPorsi)} porsi.\n` +
    `Untuk satu SPPG ${nf(o.p.porsi)} porsi (±${nf(o.fw, 1)} kg sisa/hari) dihitung dua kriteria:\n` +
    `- Beban organik: ${nf(o.vsd, 1)} kg VS ÷ OLR ${nf(o.p.olr, 1)} = ${nf(o.vOlr, 1)} m³\n` +
    `- Waktu tinggal: ${nf(o.q * 1000)} L slurry/hari × ${o.p.hrt} hari = ${nf(o.vHrt, 1)} m³\n` +
    `Yang terbesar menentukan (${o.gov}), jadi volume kerja ±${nf(o.vw, 1)} m³. Rancangannya modular ${o.ntank} tangki 5 m³ (HRT aktual ${nf(o.hrtInst)} hari). Prototipe ini skala 1:${nf(o.scale)}.\n` +
    `Sumber: Almomani & Bhosale (2020) untuk OLR, Mapantsela dkk. (2024) untuk HRT 30–50 hari di daerah tropis.`;
}
function biayaText(o = M()) {
  return `Investasi skala penuh satu SPPG ±Rp${jt(o.capex)} juta (rentang Rp${jt(o.capexLow)}–${jt(o.capexHigh)} juta), sudah termasuk instalasi 15% dan cadangan 10%. Komponen terbesar: ${o.ntank} tangki FRP 5.000 L dan instalasi. Harga utama dari marketplace per 18 November 2026.\n` +
    `Penghematan LPG ±Rp${nf(o.saving / 1e6, 1)} juta per tahun, biaya operasional ±Rp${nf(o.opex / 1e6, 1)} juta, manfaat bersih ±Rp${nf(o.net / 1e6, 1)} juta. Balik modal ±${nf(o.payback, 1)} tahun.\n` +
    `Pembanding: setara ±${nf(o.insentifHari)} hari insentif fasilitas SPPG (Rp6 juta/hari), atau ±Rp${nf(o.perPorsi)} per porsi selama 10 tahun.`;
}
function hitungText(porsi, gram) {
  const o = SIZING.compute({ porsi, gram: gram || SIZING.DEF.gram });
  return `Perhitungan untuk ${nf(porsi)} porsi × ${nf(o.p.gram, 1)} g sisa:\n` +
    `- Sisa pangan ${nf(o.fw, 1)} kg/hari, padatan organik ${nf(o.vsd, 1)} kg VS\n` +
    `- Volume kerja ${nf(o.vw, 1)} m³ (penentu ${o.gov}) → ${o.ntank} tangki 5 m³\n` +
    `- Biogas ${nf(o.bg, 1)} m³/hari, setara ${nf(o.lpg, 1)} kg LPG (±${nf(o.cover * 100)}% kebutuhan dapur)\n` +
    `- Simpan gas ±${nf(o.store, 1)} m³ (${o.nbag} kantong 2 m³)\n` +
    `- Investasi ±Rp${jt(o.capex)} juta, hemat LPG ±Rp${nf(o.saving / 1e6, 1)} juta/tahun, balik modal ±${isFinite(o.payback) ? nf(o.payback, 1) + ' tahun' : 'tidak tercapai'}\n` +
    `Angka model berbasis literatur, belum pengukuran lapangan.`;
}

/* Daftar tanya-jawab juri (sama dengan lembar QnA di Excel). */
const QNA = [
  { q: 'Bioreaktor 500 L cukup untuk satu SPPG?', k: /500\s*l|cukup|volume|ukuran|besar.*reaktor|berapa m3|m³|kapasitas/i, a: () => volumeText() },
  { q: 'Berapa biaya investasinya?', k: /biaya|investasi|modal awal|harga alat|capex|mahal/i, a: () => biayaText() },
  { q: 'Kapan balik modal?', k: /balik modal|payback|untung|npv|irr|kelayakan|layak/i, a: () => { const o = M(); return `Manfaat bersih ±Rp${nf(o.net / 1e6, 1)} juta per tahun (hemat LPG Rp${nf(o.saving / 1e6, 1)} juta dikurangi operasional Rp${nf(o.opex / 1e6, 1)} juta). Balik modal sederhana ±${nf(o.payback, 1)} tahun; kas kumulatif positif di tahun ke-6 karena elektronik diganti di tahun ke-5. NPV 10 tahun pada diskonto 10% ±Rp34 juta, IRR ±16%. Risiko terbesar: hasil metana. Bila hasil metana rendah, balik modal mundur jauh, karena itu uji BMP menjadi langkah pertama.`; } },
  { q: 'Apakah biogas menggantikan LPG sepenuhnya?', k: /lpg|elpiji|gas melon|ganti.*gas|hemat/i, a: () => { const o = M(); return `Tidak sepenuhnya. SPPG pembanding memakai 18,7 kg LPG per hari untuk 3.120 porsi (Dermawan & Fauzi, 2026); untuk ${nf(o.p.porsi)} porsi ±${nf(o.need)} kg. Biogas setara ±${nf(o.lpg, 1)} kg, jadi menutup ±${nf(o.cover * 100)}%. Posisinya pelengkap yang mengurangi LPG impor. Harga yang dipakai LPG 12 kg nonsubsidi Rp218.000 karena dapur MBG dilarang memakai LPG 3 kg.`; } },
  { q: 'Bioreaktor bisa meledak?', k: /ledak|meledak|bahaya|aman|bocor|tekanan|api|kebakaran|balon|botol/i, a: () => 'Bioreaktor jarang meledak sendiri. Risiko nyatanya gas yang menumpuk lalu bocor dan bertemu api: metana mudah terbakar mulai 5% volume di udara (NOAA). BIO-LOOP memasang sensor tekanan dan kebocoran: SIAGA dikirim ke Telegram, katup pengaman membuang gas berlebih di luar ruangan, dan kompor dikunci bila kebocoran melewati 20% LEL. Simulasi botol di website menunjukkan bedanya tanpa dan dengan pengawasan.' },
  { q: 'Kenapa ambang pH 6,6 bukan 6,0?', k: /\bph\b|asam|nahco|buffer|soda kue|penyangga/i, a: () => 'Metana berhenti terbentuk di bawah pH 6,0 (Mapantsela dkk., 2024). Zona 6,0–6,6 sengaja dijadikan SIAGA supaya NaHCO₃ sempat ditambahkan sebelum pH jatuh. Dosis 1,0 g/g VS menaikkan metana 11,2–29,7%, tetapi 1,25 g/g VS ke atas justru menurunkan (Almomani & Bhosale, 2020), jadi buffer ditambahkan hanya saat pH turun.' },
  { q: 'Indonesia sudah panas, kenapa perlu pemanas?', k: /suhu|panas|pemanas|dingin|insulasi|35/i, a: () => { const o = M(); return `Reaktor dijaga ±35 °C, sedangkan suhu rata-rata ±28 °C, dan fluktuasi 5 °C bisa menghentikan produksi (Garkoti dkk., 2024). Dengan insulasi, panas yang dibutuhkan ±${nf(o.heat)} MJ per hari, ±${nf(o.heatShare * 100)}% energi biogas; tanpa insulasi sekitar 30%. Karena itu dipakai insulasi, koil di dalam tangki, dan kolektor surya.`; } },
  { q: 'Gas terbentuk 24 jam, dapur memasak pagi. Disimpan di mana?', k: /simpan|penyimpanan|kantong|gas holder|malam/i, a: () => { const o = M(); return `Dapur memakai gas ±${o.p.jam} jam per hari, jadi gas di luar jam itu perlu ruang simpan ±${nf(o.store, 1)} m³: ${o.nbag} kantong PVC 2 m³ di luar dapur. Kantong penuh yang tidak dipakai menaikkan tekanan, karena itu ada sensor tekanan dan katup pengaman.`; } },
  { q: 'Hasil metana 0,355 dari mana?', k: /0,355|0\.355|hasil metana|bmp|yield/i, a: () => 'Nilai tengah rentang 0,22–0,49 m³ CH₄/kg VS dari studi sisa makanan (Forster-Carneiro dkk., 2008). Studi itu termofilik kering, desain kami mesofilik basah, jadi angka ini harus dikonfirmasi uji BMP pada sisa MBG.' },
  { q: 'Pupuknya aman?', k: /pupuk|digestat|endapan|patogen/i, a: () => 'Belum kami uji. Digesti mesofilik menurunkan patogen tetapi tidak menghilangkannya (Machnicka & Grübel, 2023), jadi endapan dikeringkan atau dikomposkan dan diuji mutunya sebelum dipakai.' },
  { q: 'AI-nya melakukan apa?', k: /\bai\b|kamera|smart ?bin|computer vision|akurasi|gemini/i, a: () => 'Kamera smart bin mengenali menu dan menimbang sisanya, jadi ahli gizi tahu menu mana yang tidak dihabiskan siswa. Asisten AI menjawab pertanyaan petugas dan membaca data sensor. Akurasi computer vision belum diukur pada data lapangan.' },
  { q: 'Ini sudah diuji di lapangan?', k: /uji|lapangan|valid|nyata|terbukti|data asli/i, a: () => 'Belum. Volume, biaya, dan produksi gas adalah perhitungan desain dari literatur dan harga pasar per 18 November 2026. Prototipe 500 L menguji sistem kontrol. Langkah berikutnya: uji BMP sisa MBG, lalu pilot di satu SPPG mitra.' },
  { q: 'Bagaimana cara daftar dan disetujui?', k: /daftar|akun|login|masuk|admin|setuju|persetujuan/i, a: () => 'Daftar di website (Masuk / daftar → Daftar akun baru). Akun aktif setelah admin membuka panel admin (alamat website + /admin) → menu Pengguna → Setujui. Untuk Telegram: tekan Start di bot, lalu admin menyetujui di menu Telegram & notifikasi.' }
];

const GREET = /^(halo+|hal+o|hai+|hi+|hello|hey|p+|pagi|siang|sore|malam|selamat (pagi|siang|sore|malam)|assalamu.?alaikum|permisi|tes|test|ping)[\s!.,?]*$/i;
const isGreeting = t => GREET.test(String(t || '').trim());
function greeting(name, channel) {
  const tail = channel === 'web' ? 'Anda juga bisa mencoba menu Simulasi untuk melihat analogi botol tanpa dan dengan pengawasan.' : 'Perintah cepat: /status, /volume, /biaya, /qna (daftar pertanyaan juri), /bantuan.';
  return `Halo${name ? ' ' + name : ''}! Saya Asisten BIOLOOP.\nTanyakan apa saja, misalnya "bagaimana kondisi reaktor?", "berapa volume untuk satu SPPG?", atau "berapa biaya investasinya?".\n${tail}`;
}
function match(text) {
  const t = String(text || '');
  let best = null;
  for (const item of QNA) if (item.k.test(t)) { best = item; break; }
  return best;
}
/* Jawaban cadangan bila AI tidak tersedia. d = reactor.describe(state) bila ada. */
function fallback(text, d) {
  const hit = match(text);
  if (hit) return hit.a();
  if (d && /status|kondisi|reaktor|sekarang|sensor|bagaimana/i.test(text)) {
    return `Kondisi saat ini: suhu ${d.suhu_C} °C, pH ${d.pH}, tekanan ${d.tekanan_mbar} mbar, gas ${d.gas_drum_L} L, metana ${d.metana_persen}%.` +
      (d.peringatan_aktif && d.peringatan_aktif.length ? ` Peringatan aktif: ${d.peringatan_aktif.join(', ')}.` : ' Tidak ada peringatan aktif.');
  }
  return null;
}
function qnaList() {
  return 'Pertanyaan yang sering diajukan juri. Ketik /qna diikuti nomornya, misalnya /qna 1:\n' + QNA.map((x, i) => `${i + 1}. ${x.q}`).join('\n');
}
function qnaAnswer(n) { const x = QNA[n - 1]; return x ? `${x.q}\n\n${x.a()}` : null; }

module.exports = { QNA, isGreeting, greeting, fallback, match, qnaList, qnaAnswer, volumeText, biayaText, hitungText };
