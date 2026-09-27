'use strict';
/* Mengubah kejadian mentah dari simulasi menjadi pesan yang bisa dibaca petugas. */
const SIM = require('../public/js/sim.js');

const SRC = { auto: 'Kontrol otomatis', manual: 'Dasbor', telegram: 'Telegram', ai: 'Asisten AI', jadwal: 'Jadwal harian', skenario: 'Skenario latihan', habis: 'Gas habis' };
const src = s => SRC[s] || s || '';

function fmt(e, d, s) {
  switch (e) {
    case 'alert': return { cat: 'alert', lvl: d.lvl, title: (d.remind ? 'Masih terjadi: ' : '') + d.name, body: d.msg, key: d.k };
    case 'recover': return { cat: 'alert', lvl: 'ok', title: d.name + ' kembali normal', body: `Suhu ${s.T.toFixed(1)} °C, pH ${s.pH.toFixed(2)}, tekanan ${s.press.toFixed(1)} mbar.`, key: d.k };
    case 'valve': return { cat: 'action', lvl: 'info', title: `${d.v === 'hot' ? 'Katup air panas' : 'Katup air dingin'} ${d.on ? 'dibuka' : 'ditutup'}`, body: `${src(d.src)}. Suhu slurry ${s.T.toFixed(1)} °C.` };
    case 'dose': return { cat: 'action', lvl: 'info', title: `Buffer ${d.g} g NaHCO₃ ditambahkan`, body: `${src(d.src)}. pH ${s.pH.toFixed(2)}, VFA ${Math.round(s.vfa)} mg/L.` };
    case 'boiler': return { cat: 'action', lvl: 'info', title: d.on ? 'Gas surplus dipakai boiler' : 'Boiler berhenti', body: d.on ? `Drum ${(s.Vg / SIM.R.VgMax * 100).toFixed(0)}% penuh dan kompor mati; gas dipakai memanaskan air.` : 'Isi drum turun ke batas aman.' };
    case 'stove': return { cat: 'sched', lvl: 'info', title: d.on ? 'Kompor SPPG menyala' : 'Kompor SPPG dimatikan', body: `${src(d.src)}. Gas tersisa ${(s.Vg * 1000).toFixed(0)} L.` };
    case 'gasout': return { cat: 'alert', lvl: 'warn', title: 'Biogas habis', body: `Kompor tidak bisa menyala atau berhenti. Sisa gas ${(s.Vg * 1000).toFixed(0)} L. Pakai LPG cadangan.`, key: 'gasout' };
    case 'stoveblock': return { cat: 'alert', lvl: 'bad', title: 'Kompor tidak dinyalakan', body: `Detektor membaca ${d.lel.toFixed(0)}% LEL (kebocoran). Perbaiki kebocoran dulu, pastikan area berventilasi.`, key: 'stoveblock' };
    case 'relief': return { cat: 'action', lvl: 'warn', title: 'Katup pengaman membuang gas', body: `Tekanan mencapai ${SIM.R.Prelief} mbar.` };
    case 'feed': return { cat: 'sched', lvl: 'info', title: `Umpan ${(+d.kg).toFixed(1)} kg ${SIM.FOOD[d.type].n}`, body: `${src(d.src)}, + ${(+d.water).toFixed(1)} L air.`, food: d.type };
    case 'feedmix': return { cat: 'sched', lvl: 'info', title: `Umpan terjadwal ${d.fed.toFixed(1)} kg sisa makan siang`, body: `Sisa terpantau ${d.total.toFixed(1)} kg; ${(d.total - d.fed).toFixed(1)} kg ke pengomposan.` };
    case 'feedskip': return { cat: 'action', lvl: 'warn', title: 'Pengumpanan ditunda', body: `Alasan: ${d.why}. ${d.total.toFixed(1)} kg sisa pangan dialihkan ke pengomposan.` };
    case 'cv': { const top = d.slice().sort((a, b) => b.w / b.served - a.w / a.served)[0];
      return { cat: 'sched', lvl: 'info', title: 'Smart bin: rekap sisa makan siang', body: `Total ${d.reduce((x, r) => x + r.w, 0).toFixed(1)} kg. Sisa tertinggi: ${top.n} (${(top.w / top.served * 100).toFixed(0)}% dari porsi).` }; }
    case 'drain': return { cat: 'action', lvl: 'info', title: 'Katup bawah dibuka', body: `${src(d.src)}. Menguras ${d.L.toFixed(0)} L endapan.` };
    case 'drainDone': return { cat: 'action', lvl: 'ok', title: 'Pengurasan selesai', body: `Endapan tersisa ${s.sludgeL.toFixed(0)} L. Keringkan/komposkan sebelum dipakai.` };
    case 'scenario': { const fix = /^fix/.test(d.k);
      return { cat: 'action', lvl: fix ? 'ok' : 'warn', title: (fix ? '' : 'Skenario latihan: ') + (SIM.SCEN[d.k] || d.k), body: fix ? 'Kondisi kembali seperti semula.' : 'Dijalankan admin untuk latihan petugas. Perhatikan peringatan berikutnya.' }; }
    case 'tick6': return null;
    default: return { cat: 'action', lvl: 'info', title: e, body: '' };
  }
}
module.exports = { fmt, src };
