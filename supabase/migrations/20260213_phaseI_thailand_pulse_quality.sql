-- Phase I (Thailand Pulse Quality): source policy + relevance feedback storage

create extension if not exists pgcrypto;

create table if not exists pulse_source_preferences (
  owner_key text primary key,
  allow_domains text[] not null default '{}'::text[],
  deny_domains text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pulse_feedback (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null default 'default',
  article_id text not null,
  article_url text,
  source text,
  domain text,
  category text,
  keywords text[] not null default '{}'::text[],
  relevant boolean not null,
  snapshot_date date,
  confidence_score numeric(6,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_key, article_id)
);

create index if not exists idx_pulse_feedback_owner_created
  on pulse_feedback(owner_key, created_at desc);

create index if not exists idx_pulse_feedback_owner_relevant
  on pulse_feedback(owner_key, relevant, created_at desc);

create index if not exists idx_pulse_feedback_domain
  on pulse_feedback(owner_key, domain, created_at desc);

create index if not exists idx_pulse_feedback_category
  on pulse_feedback(owner_key, category, created_at desc);
