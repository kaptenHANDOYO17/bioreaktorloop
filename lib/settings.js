'use strict';
/* Pengaturan yang bisa diubah admin dari panel (disimpan di database), dengan nilai awal dari .env. */
const cfg = require('./config');
const db = require('./db');

const DEFAULTS = () => ({
  site_name: cfg.SITE_NAME,
  default_source: 'sim',
  notify_sim: true,
  allow_register: cfg.ALLOW_REGISTER,
  public_dashboard: cfg.PUBLIC_DASHBOARD,
  retention_days: cfg.RETENTION_DAYS,
  report_every_hours: cfg.REPORT_EVERY_HOURS,
  lpg_price: 218000
});
let cache = null, cachedAt = 0;
async function get() {
  if (cache && Date.now() - cachedAt < 10000) return cache;
  const saved = (await db.kvGet('settings')) || {};
  cache = Object.assign(DEFAULTS(), saved); cachedAt = Date.now();
  return cache;
}
async function set(patch) {
  const cur = await get(); const next = Object.assign({}, cur);
  if (patch.site_name !== undefined) next.site_name = String(patch.site_name).trim().slice(0, 60) || cfg.SITE_NAME;
  if (patch.default_source !== undefined) next.default_source = String(patch.default_source).slice(0, 80);
  for (const k of ['notify_sim', 'allow_register', 'public_dashboard']) if (patch[k] !== undefined) next[k] = !!patch[k];
  if (patch.retention_days !== undefined) next.retention_days = Math.max(7, Math.min(3650, Math.round(+patch.retention_days || 90)));
  if (patch.report_every_hours !== undefined) next.report_every_hours = Math.max(0, Math.min(168, Math.round(+patch.report_every_hours || 0)));
  if (patch.lpg_price !== undefined) next.lpg_price = Math.max(1000, Math.min(10000000, Math.round(+patch.lpg_price || 218000)));
  await db.kvSet('settings', next); cache = next; cachedAt = Date.now();
  return next;
}
module.exports = { get, set, DEFAULTS };
