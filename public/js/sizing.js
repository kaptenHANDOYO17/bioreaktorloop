/* =====================================================================
   MBG-BIOLOOP — perhitungan ukuran, biaya, dan kelayakan satu SPPG
   Satu sumber angka untuk website (kalkulator), asisten AI, dan bot Telegram.
   Rumus dan asumsi sama dengan file Excel "BIO-LOOP_Volume_Investasi_QnA.xlsx"
   (skenario Tengah, harga marketplace 18 Nov 2026).
   ===================================================================== */
(function (root) {
'use strict';

const DEF = {
  porsi: 2500, gram: 47.8, masuk: 1,
  ts: 0.245, vs: 0.217, ych4: 0.355, xch4: 0.60,            // Zhang dkk. 2014; Forster-Carneiro dkk. 2008; Garkoti dkk. 2024
  ncvch4: 50.4, mw: 16.04, ncvlpg: 47.3, eflpg: 63100,      // IPCC 2006; NOAA
  olr: 2.0, hrt: 30, tsTarget: 0.08,                       // Almomani & Bhosale 2020; Mapantsela dkk. 2024
  vmod: 5.0, wf: 0.90, vproto: 0.5,                        // tangki FRP 5.000 L; prototipe 500 L
  jam: 8, cad: 0.20, bag: 2.0,                             // jam memasak, cadangan simpan gas, kantong PVC 2 m³
  tamb: 28, top: 35, cp: 4.18, dia: 1.6, u: 3.0, red: 0.671,  // panas; insulasi -67,1% (Garkoti dkk. 2024)
  lpgRef: 18.7, porsiRef: 3120,                            // Dermawan & Fauzi 2026: SPPG X
  harga: 218000, hari: 313,                                // LPG 12 kg nonsubsidi; Juknis BGN
  rate: 0.10, umur: 10, maint: 0.03
};

/* Harga satuan skenario Tengah (Rp). Lihat lembar Investasi di Excel. */
const PRICE = {
  perTank: 13500000 + 1500000 + 1500000 + 1750000 + 250000 + 35000,   // tangki + modifikasi + insulasi/koil + probe pH + papan pH + sensor suhu
  perBag: 850000,
  fixed: 9000000 + 3 * 693000 + 750000 + 3000000 + 5000000            // penghancur, 3 kompor, filter H2S, pipa & pengaman, kolektor surya
       + 2 * 82000 + 35000 + 2425050 + 1643988 + 155000 + 300000 + 2 * 160000 + 1500000   // IoT & keselamatan
       + 3850000 + 500000 + 300000 + 600000,                           // smart bin
  civil: 5000000, commissioning: 1000000, training: 1000000,
  install: 0.15, contingency: 0.10,
  rangeLow: 0.6709, rangeHigh: 1.5054,                                // rasio total Rendah/Tinggi terhadap Tengah
  phProbe: 1750000, kwh: 0.75 * 0.5 + (0.012 + 0.010) * 24, tarif: 1444.70, nahco3: 100 * 15000, data: 12 * 100000
};

function compute(input) {
  const p = Object.assign({}, DEF, input || {});
  const o = { p };
  o.fw = p.porsi * p.gram / 1000 * p.masuk;                         // kg sisa/hari
  o.vsd = o.fw * p.vs;                                              // kg VS/hari
  o.air = Math.max(0, o.fw * (p.ts / p.tsTarget - 1));              // L air pengencer/hari
  o.q = (o.fw + o.air) / 1000;                                      // m³ slurry/hari
  o.vOlr = o.vsd / p.olr; o.vHrt = o.q * p.hrt;
  o.vw = Math.max(o.vOlr, o.vHrt); o.gov = o.vOlr >= o.vHrt ? 'OLR' : 'HRT';
  o.hrtAct = o.q ? o.vw / o.q : 0;
  o.ntank = Math.max(1, Math.ceil(o.vw / (p.vmod * p.wf) - 1e-9));
  o.vwInst = o.ntank * p.vmod * p.wf; o.vtInst = o.ntank * p.vmod;
  o.olrInst = o.vsd / o.vwInst; o.hrtInst = o.q ? o.vwInst / o.q : 0;
  o.ch4 = o.vsd * p.ych4; o.bg = o.ch4 / p.xch4;
  o.mj = o.ch4 * (p.mw / 22.414) * p.ncvch4;
  o.lpg = o.mj / p.ncvlpg;                                          // kg LPG/hari
  o.store = o.bg * (1 - p.jam / 24) * (1 + p.cad);
  o.nbag = Math.ceil(o.store / p.bag - 1e-9);
  o.need = p.porsi * p.lpgRef / p.porsiRef; o.cover = o.need ? o.lpg / o.need : 0;
  o.heatFeed = (o.fw + o.air) * p.cp * (p.top - p.tamb) / 1000;
  const len = p.vmod / (Math.PI * p.dia * p.dia / 4);
  o.area = o.ntank * (Math.PI * p.dia * len + 2 * Math.PI * p.dia * p.dia / 4);
  o.loss0 = p.u * o.area * (p.top - p.tamb) * 86400 / 1e6; o.loss1 = o.loss0 * (1 - p.red);
  o.heat = o.heatFeed + o.loss1; o.heatShare = o.mj ? o.heat / o.mj : 0;
  /* prototipe 500 L */
  o.protoW = p.vproto * p.wf;
  o.protoKg = Math.min(o.protoW * p.olr / p.vs, o.protoW / p.hrt * 1000 / Math.max(1, p.ts / p.tsTarget));
  o.protoPorsi = o.protoKg * 1000 / p.gram; o.scale = o.vwInst / o.protoW;
  /* biaya */
  const equip = PRICE.fixed + o.ntank * PRICE.perTank + o.nbag * PRICE.perBag;
  const pre = equip * (1 + PRICE.install) + PRICE.civil + PRICE.commissioning + PRICE.training;
  o.capex = pre * (1 + PRICE.contingency); o.capexLow = o.capex * PRICE.rangeLow; o.capexHigh = o.capex * PRICE.rangeHigh;
  o.saving = o.lpg * p.hari * p.harga / 12;
  o.opex = o.capex * p.maint + o.ntank * PRICE.phProbe + PRICE.kwh * p.hari * PRICE.tarif + PRICE.nahco3 + PRICE.data;
  o.net = o.saving - o.opex; o.payback = o.net > 0 ? o.capex / o.net : Infinity;
  o.co2 = o.lpg * p.hari * p.ncvlpg * p.eflpg / 1e9;               // t CO₂/tahun
  o.tabung = o.lpg * p.hari / 12;
  o.perPorsi = o.capex / (p.porsi * p.hari * p.umur);
  o.insentifHari = o.capex / 6000000;
  return o;
}

const API = { DEF, PRICE, compute };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.SIZING = API;
})(typeof window !== 'undefined' ? window : globalThis);
