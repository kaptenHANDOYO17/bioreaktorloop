-- MBG-BIOLOOP AI: skema database (PostgreSQL 14+; Supabase atau Neon)
-- Tabel dibuat OTOMATIS oleh aplikasi saat pertama kali dijalankan.
-- File ini hanya rujukan bila Anda ingin membuatnya manual lewat SQL Editor.
-- Semua tabel ada di schema "bioloop" supaya tidak terbuka lewat Data API Supabase.

create schema if not exists bioloop;

create table if not exists bioloop.users (
  id            bigserial primary key,
  username      text not null,
  username_lc   text not null unique,
  name          text not null default '',
  password_hash text not null,
  role          text not null default 'user',      -- admin | user
  status        text not null default 'pending',   -- active | pending | disabled
  must_change   boolean not null default false,
  pw_version    integer not null default 1,
  failed        integer not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now(),
  last_login    timestamptz
);

create table if not exists bioloop.reactor_state (
  id         text primary key,                     -- 'sim' atau 'dev:<id perangkat>'
  state      jsonb not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists bioloop.readings (
  id     bigserial primary key,
  source text not null,
  at     timestamptz not null,
  t      double precision,
  d      jsonb not null
);
create index if not exists readings_source_at on bioloop.readings (source, at);

create table if not exists bioloop.events (
  id     bigserial primary key,
  source text not null,
  at     timestamptz not null default now(),
  t      double precision,
  cat    text, lvl text, type text,
  title  text, body text, actor text
);
create index if not exists events_source_id on bioloop.events (source, id);
create index if not exists events_at on bioloop.events (at);

create table if not exists bioloop.devices (
  id         text primary key,
  name       text not null,
  location   text not null default '',
  notes      text not null default '',
  key_hash   text not null unique,
  key_hint   text not null default '',
  status     text not null default 'active',       -- active | disabled
  created_at timestamptz not null default now(),
  created_by text,
  last_seen  timestamptz,
  last_ip    text,
  fw         text,
  last_data  jsonb
);

create table if not exists bioloop.device_commands (
  id         bigserial primary key,
  device_id  text not null,
  cmd        jsonb not null,
  actor      text,
  created_at timestamptz not null default now(),
  taken_at   timestamptz
);
create index if not exists device_commands_dev on bioloop.device_commands (device_id, id);

create table if not exists bioloop.conversations (
  key        text primary key,                     -- 'user:<id>' atau 'tg:<chat id>'
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists bioloop.telegram_chats (
  chat_id    text primary key,
  title      text not null default '',
  username   text not null default '',
  approved   boolean not null default false,
  subscribed boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen  timestamptz
);

create table if not exists bioloop.telegram_updates (
  update_id bigint primary key,
  at        timestamptz not null default now()
);

create table if not exists bioloop.kv (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

-- Kunci akses langsung dari Data API Supabase (aplikasi memakai koneksi Postgres langsung).
alter table bioloop.users           enable row level security;
alter table bioloop.reactor_state   enable row level security;
alter table bioloop.readings        enable row level security;
alter table bioloop.events          enable row level security;
alter table bioloop.devices         enable row level security;
alter table bioloop.device_commands enable row level security;
alter table bioloop.conversations   enable row level security;
alter table bioloop.telegram_chats  enable row level security;
alter table bioloop.telegram_updates enable row level security;
alter table bioloop.kv              enable row level security;
