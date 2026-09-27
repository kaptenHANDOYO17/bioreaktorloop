'use strict';
/* Penyimpanan PostgreSQL (Supabase, Neon, atau Postgres sendiri) memakai postgres.js.
   Koneksi dibuat sekali per instance; aman untuk pooler mode transaksi (prepare: false). */
const cfg = require('../config');
const SCHEMA = require('./schema');
const SCHEMA_VERSION = 1;

let sql = null, ready = null;
/* Merapikan DATABASE_URL:
   - kata sandi yang berisi karakter khusus (@ # / ? & * : %) di-encode otomatis
   - parameter khusus penyedia (mis. supa=..., pgbouncer=true) yang tidak dikenal Postgres dibuang
   - pesan jelas bila masih berisi [YOUR-PASSWORD] atau formatnya salah */
function normalizeUrl(raw) {
  let u = String(raw || '').trim().replace(/^["']|["']$/g, '');
  if (/YOUR-PASSWORD|\[YOUR_PASSWORD\]/i.test(u)) throw new Error('DATABASE_URL masih berisi [YOUR-PASSWORD]. Ganti dengan password database Supabase Anda (tanpa kurung siku).');
  const m = u.match(/^(postgres(?:ql)?:\/\/)([^:@\/]+)(?::(.*))?@([^@\/?#\s]+)(\/[^?#\s]*)?(\?[^#\s]*)?$/i);
  if (!m) throw new Error('Format DATABASE_URL tidak dikenali. Contoh yang benar: postgresql://postgres.xxxx:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres');
  let [, proto, user, pw, host, path, query] = m;
  if (pw !== undefined) { let dec = pw; try { dec = decodeURIComponent(pw); } catch (e) { /* sudah mentah */ } pw = encodeURIComponent(dec); }
  u = `${proto}${user}${pw !== undefined ? ':' + pw : ''}@${host}${path || '/postgres'}${query || ''}`;
  const url = new URL(u); const keep = new URLSearchParams();
  for (const [k, v] of url.searchParams) if (['sslmode', 'application_name', 'options'].includes(k)) keep.set(k, v);
  url.search = keep.toString();
  return url.toString();
}
function conn() {
  if (sql) return sql;
  const postgres = require('postgres');
  const url = normalizeUrl(cfg.DATABASE_URL);
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || /sslmode=disable/.test(url);
  sql = postgres(url, {
    max: cfg.IS_VERCEL ? 1 : 5, prepare: false, idle_timeout: 20, connect_timeout: 15,
    ssl: local ? false : 'require', onnotice: () => {}, transform: { undefined: null }
  });
  return sql;
}
async function init() {
  if (ready) return ready;
  ready = (async () => {
    const q = conn();
    const reg = await q`select to_regclass('bioloop.kv') as t`;
    if (reg[0].t) {
      const v = await q`select value from bioloop.kv where key = 'schema_version'`;
      if (v[0] && +v[0].value >= SCHEMA_VERSION) return;
    }
    await q.begin(async tx => {
      await tx`select pg_advisory_xact_lock(771001)`;
      await tx.unsafe(SCHEMA);
      await tx`insert into bioloop.kv (key, value) values ('schema_version', ${tx.json(SCHEMA_VERSION)})
               on conflict (key) do update set value = excluded.value, updated_at = now()`;
    });
  })();
  ready.catch(() => { ready = null; });
  return ready;
}
const q = async () => { await init(); return conn(); };
const iso = d => d instanceof Date ? d.toISOString() : d;
const toDate = v => v == null ? null : new Date(typeof v === 'number' ? v : v);
function row(r) { if (!r) return null; const o = {}; for (const k in r) o[k] = iso(r[k]); return o; }

module.exports = {
  kind: 'postgres',
  normalizeUrl,
  init,
  async ping() { const s = await q(); const r = await s`select now() as now`; return iso(r[0].now); },

  /* ---------- pengguna ---------- */
  async userByName(name) { const s = await q(); return row((await s`select * from bioloop.users where username_lc = ${String(name).toLowerCase()}`)[0]); },
  async userById(id) { const s = await q(); return row((await s`select * from bioloop.users where id = ${+id}`)[0]); },
  async listUsers() { const s = await q(); return (await s`select * from bioloop.users order by created_at`).map(row); },
  async countAdmins() { const s = await q(); return +(await s`select count(*)::int as n from bioloop.users where role = 'admin' and status = 'active'`)[0].n; },
  async createUser(u) {
    const s = await q();
    const r = await s`insert into bioloop.users (username, username_lc, name, password_hash, role, status, must_change)
      values (${u.username}, ${u.username.toLowerCase()}, ${u.name || ''}, ${u.password_hash}, ${u.role || 'user'}, ${u.status || 'pending'}, ${!!u.must_change})
      on conflict (username_lc) do nothing returning *`;
    return row(r[0]);
  },
  async updateUser(id, p) {
    const s = await q(); const allowed = ['name', 'password_hash', 'role', 'status', 'must_change', 'pw_version', 'failed', 'locked_until', 'last_login'];
    const set = {}; for (const k of allowed) if (p[k] !== undefined) set[k] = (k === 'locked_until' || k === 'last_login') ? toDate(p[k]) : p[k];
    if (!Object.keys(set).length) return this.userById(id);
    return row((await s`update bioloop.users set ${s(set)} where id = ${+id} returning *`)[0]);
  },
  async deleteUser(id) { const s = await q(); await s`delete from bioloop.users where id = ${+id}`; },

  /* ---------- keadaan reaktor (optimistic locking) ---------- */
  async getState(id) { const s = await q(); return row((await s`select * from bioloop.reactor_state where id = ${id}`)[0]); },
  async putState(id, state, version) {
    const s = await q();
    if (version == null) {
      const r = await s`insert into bioloop.reactor_state (id, state, version) values (${id}, ${s.json(state)}, 1) on conflict (id) do nothing returning version`;
      return r[0] ? r[0].version : false;
    }
    const r = await s`update bioloop.reactor_state set state = ${s.json(state)}, version = version + 1, updated_at = now()
                      where id = ${id} and version = ${version} returning version`;
    return r[0] ? r[0].version : false;
  },
  async deleteState(id) { const s = await q(); await s`delete from bioloop.reactor_state where id = ${id}`; },

  /* ---------- pembacaan sensor ---------- */
  async addReadings(rows) {
    if (!rows.length) return; const s = await q();
    for (let i = 0; i < rows.length; i += 500) {
      const part = rows.slice(i, i + 500).map(r => ({ source: r.source, at: toDate(r.at), t: r.t, d: r.d }));
      await s`insert into bioloop.readings ${s(part, 'source', 'at', 't', 'd')}`;
    }
  },
  async readings({ source, from, to, limit = 20000 }) {
    const s = await q();
    const r = await s`select source, at, t, d from bioloop.readings
      where (${source || null}::text is null or source = ${source || null})
        and at >= ${toDate(from)} and at <= ${toDate(to)}
      order by at asc limit ${limit}`;
    return r.map(row);
  },
  async lastReadings(source, n = 20) {
    const s = await q();
    return (await s`select source, at, t, d from bioloop.readings where source = ${source} order by at desc limit ${n}`).map(row);
  },
  async deleteReadings({ source, from, to }) {
    const s = await q();
    const r = await s`delete from bioloop.readings where (${source || null}::text is null or source = ${source || null})
      and (${from ? toDate(from) : null}::timestamptz is null or at >= ${from ? toDate(from) : null})
      and (${to ? toDate(to) : null}::timestamptz is null or at <= ${to ? toDate(to) : null})`;
    return r.count;
  },
  async pruneReadings(before) { const s = await q(); const r = await s`delete from bioloop.readings where at < ${toDate(before)}`; return r.count; },

  /* ---------- kejadian ---------- */
  async addEvents(rows) {
    if (!rows.length) return []; const s = await q();
    const part = rows.map(e => ({ source: e.source, at: toDate(e.at || Date.now()), t: e.t ?? null, cat: e.cat, lvl: e.lvl, type: e.type, title: e.title, body: e.body || '', actor: e.actor || '' }));
    return (await s`insert into bioloop.events ${s(part, 'source', 'at', 't', 'cat', 'lvl', 'type', 'title', 'body', 'actor')} returning id`).map(r => +r.id);
  },
  async events({ source, afterId, from, to, limit = 100, desc = true, lvl }) {
    const s = await q();
    const r = await s`select * from bioloop.events
      where (${source || null}::text is null or source = ${source || null})
        and (${afterId || null}::bigint is null or id > ${afterId || null})
        and (${from ? toDate(from) : null}::timestamptz is null or at >= ${from ? toDate(from) : null})
        and (${to ? toDate(to) : null}::timestamptz is null or at <= ${to ? toDate(to) : null})
        and (${lvl || null}::text is null or lvl = ${lvl || null})
      order by ${afterId ? s`id` : s`at`} ${desc ? s`desc` : s`asc`}, id ${desc ? s`desc` : s`asc`} limit ${limit}`;
    return r.map(x => Object.assign(row(x), { id: +x.id }));
  },
  async deleteEvents({ source, from, to }) {
    const s = await q();
    const r = await s`delete from bioloop.events where (${source || null}::text is null or source = ${source || null})
      and (${from ? toDate(from) : null}::timestamptz is null or at >= ${from ? toDate(from) : null})
      and (${to ? toDate(to) : null}::timestamptz is null or at <= ${to ? toDate(to) : null})`;
    return r.count;
  },
  async pruneEvents(before) { const s = await q(); const r = await s`delete from bioloop.events where at < ${toDate(before)}`; return r.count; },

  /* ---------- perangkat ---------- */
  async listDevices() { const s = await q(); return (await s`select * from bioloop.devices order by created_at`).map(row); },
  async deviceById(id) { const s = await q(); return row((await s`select * from bioloop.devices where id = ${id}`)[0]); },
  async deviceByKeyHash(h) { const s = await q(); return row((await s`select * from bioloop.devices where key_hash = ${h}`)[0]); },
  async createDevice(d) {
    const s = await q();
    return row((await s`insert into bioloop.devices (id, name, location, notes, key_hash, key_hint, status, created_by)
      values (${d.id}, ${d.name}, ${d.location || ''}, ${d.notes || ''}, ${d.key_hash}, ${d.key_hint || ''}, ${d.status || 'active'}, ${d.created_by || ''}) returning *`)[0]);
  },
  async updateDevice(id, p) {
    const s = await q(); const allowed = ['name', 'location', 'notes', 'key_hash', 'key_hint', 'status', 'last_seen', 'last_ip', 'fw', 'last_data'];
    const set = {}; for (const k of allowed) if (p[k] !== undefined) set[k] = k === 'last_seen' ? toDate(p[k]) : k === 'last_data' ? s.json(p[k]) : p[k];
    if (!Object.keys(set).length) return this.deviceById(id);
    return row((await s`update bioloop.devices set ${s(set)} where id = ${id} returning *`)[0]);
  },
  async deleteDevice(id) { const s = await q(); await s`delete from bioloop.devices where id = ${id}`; await s`delete from bioloop.device_commands where device_id = ${id}`; },

  async addCommand(deviceId, cmd, actor) { const s = await q(); return row((await s`insert into bioloop.device_commands (device_id, cmd, actor) values (${deviceId}, ${s.json(cmd)}, ${actor || ''}) returning *`)[0]); },
  async takeCommands(deviceId) {
    const s = await q();
    return (await s`update bioloop.device_commands set taken_at = now() where device_id = ${deviceId} and taken_at is null returning *`)
      .sort((a, b) => a.id - b.id).map(r => Object.assign({ id: String(r.id) }, r.cmd));
  },
  async listCommands(deviceId, n = 30) { const s = await q(); return (await s`select * from bioloop.device_commands where device_id = ${deviceId} order by id desc limit ${n}`).map(row); },

  /* ---------- ingatan obrolan ---------- */
  async getConv(key) { const s = await q(); const r = (await s`select data from bioloop.conversations where key = ${key}`)[0]; return r ? r.data : null; },
  async putConv(key, data) { const s = await q(); await s`insert into bioloop.conversations (key, data) values (${key}, ${s.json(data)}) on conflict (key) do update set data = excluded.data, updated_at = now()`; },
  async delConv(key) { const s = await q(); await s`delete from bioloop.conversations where key = ${key}`; },
  async countConvs() { const s = await q(); return +(await s`select count(*)::int as n from bioloop.conversations`)[0].n; },

  /* ---------- Telegram ---------- */
  async tgChat(id) { const s = await q(); return row((await s`select * from bioloop.telegram_chats where chat_id = ${String(id)}`)[0]); },
  async upsertTgChat(c) {
    const s = await q();
    return row((await s`insert into bioloop.telegram_chats (chat_id, title, username, approved, subscribed, last_seen)
      values (${String(c.chat_id)}, ${c.title || ''}, ${c.username || ''}, ${!!c.approved}, ${c.subscribed !== false}, now())
      on conflict (chat_id) do update set title = excluded.title, username = excluded.username, last_seen = now() returning *`)[0]);
  },
  async updateTgChat(id, p) {
    const s = await q(); const set = {}; for (const k of ['approved', 'subscribed', 'title']) if (p[k] !== undefined) set[k] = p[k];
    if (!Object.keys(set).length) return this.tgChat(id);
    return row((await s`update bioloop.telegram_chats set ${s(set)} where chat_id = ${String(id)} returning *`)[0]);
  },
  async listTgChats() { const s = await q(); return (await s`select * from bioloop.telegram_chats order by created_at`).map(row); },
  async delTgChat(id) { const s = await q(); await s`delete from bioloop.telegram_chats where chat_id = ${String(id)}`; },
  async tgSeen(updateId) {
    const s = await q();
    const r = await s`insert into bioloop.telegram_updates (update_id) values (${updateId}) on conflict do nothing returning update_id`;
    return !r.length;    // true = sudah pernah diproses
  },
  async pruneTgUpdates(before) { const s = await q(); await s`delete from bioloop.telegram_updates where at < ${toDate(before)}`; },

  /* ---------- nilai bebas ---------- */
  async kvGet(key) { const s = await q(); const r = (await s`select value from bioloop.kv where key = ${key}`)[0]; return r ? r.value : null; },
  async kvSet(key, value) { const s = await q(); await s`insert into bioloop.kv (key, value) values (${key}, ${s.json(value)}) on conflict (key) do update set value = excluded.value, updated_at = now()`; },

  async stats() {
    const s = await q();
    const r = await s`select
      (select count(*) from bioloop.readings)::int as readings,
      (select count(*) from bioloop.events)::int as events,
      (select count(*) from bioloop.conversations)::int as conversations,
      pg_database_size(current_database())::bigint as bytes`;
    return { readings: r[0].readings, events: r[0].events, conversations: r[0].conversations, bytes: +r[0].bytes };
  },
  async close() { if (sql) await sql.end({ timeout: 2 }); sql = null; ready = null; }
};
