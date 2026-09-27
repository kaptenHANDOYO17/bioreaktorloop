'use strict';
/* Penyimpanan berkas JSON untuk mode lokal (laptop, Raspberry Pi) bila DATABASE_URL kosong.
   Antarmukanya sama dengan pg.js. Satu proses saja; tidak untuk banyak server sekaligus. */
const fs = require('fs');
const path = require('path');
const cfg = require('../config');

const DIR = cfg.DATA_DIR;
fs.mkdirSync(DIR, { recursive: true });
const cache = {}, timers = {};
const LIMITS = { readings: 60000, events: 5000, telegram_updates: 2000 };
function file(n) { return path.join(DIR, n + '.json'); }
function load(n, fb) {
  if (cache[n]) return cache[n];
  try { cache[n] = JSON.parse(fs.readFileSync(file(n), 'utf8')); } catch (e) { cache[n] = fb; }
  return cache[n];
}
function writeNow(n) {
  clearTimeout(timers[n]); timers[n] = null;
  const tmp = file(n) + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cache[n])); fs.renameSync(tmp, file(n));
}
function save(n, delay = 600) { if (timers[n]) return; timers[n] = setTimeout(() => { try { writeNow(n); } catch (e) { console.error('[db-file]', n, e.message); } }, delay); }
function flush() { for (const n of Object.keys(cache)) { try { writeNow(n); } catch (e) { /* abaikan */ } } }
process.on('exit', flush);

const T = {
  users: () => load('users', { seq: 0, rows: [] }),
  state: () => load('reactor_state', {}),
  readings: () => load('readings', []),
  events: () => load('events', { seq: 0, rows: [] }),
  devices: () => load('devices', []),
  commands: () => load('device_commands', { seq: 0, rows: [] }),
  convs: () => load('conversations', {}),
  tg: () => load('telegram_chats', []),
  tgu: () => load('telegram_updates', []),
  kv: () => load('kv', {})
};
const now = () => new Date().toISOString();
const ms = v => v == null ? null : new Date(v).getTime();
const clone = o => o == null ? null : JSON.parse(JSON.stringify(o));

module.exports = {
  kind: 'file',
  async init() {},
  async ping() { return now(); },
  flush,

  async userByName(n) { return clone(T.users().rows.find(u => u.username_lc === String(n).toLowerCase())); },
  async userById(id) { return clone(T.users().rows.find(u => u.id === +id)); },
  async listUsers() { return clone(T.users().rows); },
  async countAdmins() { return T.users().rows.filter(u => u.role === 'admin' && u.status === 'active').length; },
  async createUser(u) {
    const t = T.users(); if (t.rows.some(x => x.username_lc === u.username.toLowerCase())) return null;
    const r = { id: ++t.seq, username: u.username, username_lc: u.username.toLowerCase(), name: u.name || '', password_hash: u.password_hash, role: u.role || 'user',
      status: u.status || 'pending', must_change: !!u.must_change, pw_version: 1, failed: 0, locked_until: null, created_at: now(), last_login: null };
    t.rows.push(r); save('users'); return clone(r);
  },
  async updateUser(id, p) {
    const r = T.users().rows.find(u => u.id === +id); if (!r) return null;
    for (const k of ['name', 'password_hash', 'role', 'status', 'must_change', 'pw_version', 'failed', 'locked_until', 'last_login']) if (p[k] !== undefined) r[k] = (k === 'locked_until' || k === 'last_login') && p[k] ? new Date(p[k]).toISOString() : p[k];
    save('users'); return clone(r);
  },
  async deleteUser(id) { const t = T.users(); t.rows = t.rows.filter(u => u.id !== +id); save('users'); },

  async getState(id) { const r = T.state()[id]; return r ? clone(r) : null; },
  async putState(id, state, version) {
    const t = T.state(), cur = t[id];
    if (version == null) { if (cur) return false; t[id] = { id, state: clone(state), version: 1, updated_at: now() }; save('reactor_state', 1500); return 1; }
    if (!cur || cur.version !== version) return false;
    cur.state = clone(state); cur.version++; cur.updated_at = now(); save('reactor_state', 1500); return cur.version;
  },
  async deleteState(id) { delete T.state()[id]; save('reactor_state'); },

  async addReadings(rows) {
    if (!rows.length) return; const t = T.readings();
    for (const r of rows) t.push({ source: r.source, at: new Date(r.at).toISOString(), t: r.t, d: r.d });
    if (t.length > LIMITS.readings) t.splice(0, t.length - LIMITS.readings);
    save('readings', 3000);
  },
  async readings({ source, from, to, limit = 20000 }) {
    const a = ms(from), b = ms(to);
    return clone(T.readings().filter(r => (!source || r.source === source) && ms(r.at) >= a && ms(r.at) <= b).slice(0, limit));
  },
  async lastReadings(source, n = 20) { return clone(T.readings().filter(r => r.source === source).slice(-n).reverse()); },
  async pruneReadings(before) { const t = T.readings(), b = ms(before), n0 = t.length; const keep = t.filter(r => ms(r.at) >= b); t.length = 0; t.push(...keep); save('readings'); return n0 - t.length; },

  async addEvents(rows) {
    const t = T.events(); const ids = [];
    for (const e of rows) { const r = { id: ++t.seq, source: e.source, at: new Date(e.at || Date.now()).toISOString(), t: e.t ?? null, cat: e.cat, lvl: e.lvl, type: e.type, title: e.title, body: e.body || '', actor: e.actor || '' }; t.rows.push(r); ids.push(r.id); }
    if (t.rows.length > LIMITS.events) t.rows.splice(0, t.rows.length - LIMITS.events);
    save('events', 1500); return ids;
  },
  async events({ source, afterId, from, to, limit = 100, desc = true, lvl }) {
    const a = from ? ms(from) : -Infinity, b = to ? ms(to) : Infinity;
    let r = T.events().rows.filter(e => (!source || e.source === source) && (!afterId || e.id > afterId) && ms(e.at) >= a && ms(e.at) <= b && (!lvl || e.lvl === lvl));
    if (desc) r = r.slice().reverse();
    return clone(r.slice(0, limit));
  },
  async pruneEvents(before) { const t = T.events(), b = ms(before), n0 = t.rows.length; t.rows = t.rows.filter(e => ms(e.at) >= b); save('events'); return n0 - t.rows.length; },

  async listDevices() { return clone(T.devices()); },
  async deviceById(id) { return clone(T.devices().find(d => d.id === id)); },
  async deviceByKeyHash(h) { return clone(T.devices().find(d => d.key_hash === h)); },
  async createDevice(d) {
    const r = { id: d.id, name: d.name, location: d.location || '', notes: d.notes || '', key_hash: d.key_hash, key_hint: d.key_hint || '', status: d.status || 'active',
      created_at: now(), created_by: d.created_by || '', last_seen: null, last_ip: null, fw: null, last_data: null };
    T.devices().push(r); save('devices'); return clone(r);
  },
  async updateDevice(id, p) {
    const r = T.devices().find(d => d.id === id); if (!r) return null;
    for (const k of ['name', 'location', 'notes', 'key_hash', 'key_hint', 'status', 'last_seen', 'last_ip', 'fw', 'last_data']) if (p[k] !== undefined) r[k] = k === 'last_seen' && p[k] ? new Date(p[k]).toISOString() : p[k];
    save('devices'); return clone(r);
  },
  async deleteDevice(id) { cache.devices = T.devices().filter(d => d.id !== id); const c = T.commands(); c.rows = c.rows.filter(x => x.device_id !== id); save('devices'); save('device_commands'); },

  async addCommand(deviceId, cmd, actor) { const t = T.commands(); const r = { id: ++t.seq, device_id: deviceId, cmd, actor: actor || '', created_at: now(), taken_at: null }; t.rows.push(r); if (t.rows.length > 2000) t.rows.splice(0, t.rows.length - 2000); save('device_commands'); return clone(r); },
  async takeCommands(deviceId) {
    const out = []; for (const r of T.commands().rows) if (r.device_id === deviceId && !r.taken_at) { r.taken_at = now(); out.push(Object.assign({ id: String(r.id) }, r.cmd)); }
    if (out.length) save('device_commands'); return out;
  },
  async listCommands(deviceId, n = 30) { return clone(T.commands().rows.filter(r => r.device_id === deviceId).slice(-n).reverse()); },

  async getConv(key) { return clone(T.convs()[key] || null); },
  async putConv(key, data) { T.convs()[key] = clone(data); save('conversations'); },
  async delConv(key) { delete T.convs()[key]; save('conversations'); },
  async countConvs() { return Object.keys(T.convs()).length; },

  async tgChat(id) { return clone(T.tg().find(c => c.chat_id === String(id))); },
  async upsertTgChat(c) {
    const t = T.tg(); let r = t.find(x => x.chat_id === String(c.chat_id));
    if (r) { r.title = c.title || r.title; r.username = c.username || r.username; r.last_seen = now(); }
    else { r = { chat_id: String(c.chat_id), title: c.title || '', username: c.username || '', approved: !!c.approved, subscribed: c.subscribed !== false, created_at: now(), last_seen: now() }; t.push(r); }
    save('telegram_chats'); return clone(r);
  },
  async updateTgChat(id, p) { const r = T.tg().find(x => x.chat_id === String(id)); if (!r) return null; for (const k of ['approved', 'subscribed', 'title']) if (p[k] !== undefined) r[k] = p[k]; save('telegram_chats'); return clone(r); },
  async listTgChats() { return clone(T.tg()); },
  async delTgChat(id) { cache.telegram_chats = T.tg().filter(x => x.chat_id !== String(id)); save('telegram_chats'); },
  async tgSeen(u) { const t = T.tgu(); if (t.includes(u)) return true; t.push(u); if (t.length > LIMITS.telegram_updates) t.splice(0, t.length - LIMITS.telegram_updates); save('telegram_updates'); return false; },
  async pruneTgUpdates() {},

  async kvGet(key) { const v = T.kv()[key]; return v === undefined ? null : clone(v); },
  async kvSet(key, value) { T.kv()[key] = clone(value); save('kv'); },

  async stats() {
    let bytes = 0; try { for (const f of fs.readdirSync(DIR)) bytes += fs.statSync(path.join(DIR, f)).size; } catch (e) { /* abaikan */ }
    return { readings: T.readings().length, events: T.events().rows.length, conversations: Object.keys(T.convs()).length, bytes };
  },
  async close() { flush(); }
};
