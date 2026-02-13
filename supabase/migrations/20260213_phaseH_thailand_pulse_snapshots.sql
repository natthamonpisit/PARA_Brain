-- Phase H: Thailand Pulse snapshot persistence for cross-device sync

create extension if not exists pgcrypto;

create table if not exists pulse_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null default 'default',
  date_key date not null,
  generated_at timestamptz not null,
  provider text not null default 'RSS',
  interests text[] not null default '{}'::text[],
  snapshot_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_key, date_key)
);

create index if not exists idx_pulse_snapshots_owner_generated
  on pulse_snapshots(owner_key, generated_at desc);

create index if not exists idx_pulse_snapshots_date_key
  on pulse_snapshots(date_key desc);

create index if not exists idx_pulse_snapshots_snapshot_json
  on pulse_snapshots using gin (snapshot_json);
