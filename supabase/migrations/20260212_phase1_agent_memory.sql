-- Phase 1 foundation for agent memory and execution tracking

create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists user_profile (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null unique,
  display_name text,
  timezone text not null default 'Asia/Bangkok',
  goals jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists memory_chunks (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id text not null,
  source_updated_at timestamptz,
  chunk_text text not null,
  chunk_tokens int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists idx_memory_chunks_source on memory_chunks(source_table, source_id);
create index if not exists idx_memory_chunks_created_at on memory_chunks(created_at desc);

create table if not exists memory_summaries (
  id uuid primary key default gen_random_uuid(),
  summary_type text not null check (summary_type in ('DAILY', 'WEEKLY', 'MONTHLY')),
  summary_date date not null,
  title text not null,
  content_md text not null,
  input_refs jsonb not null default '[]'::jsonb,
  created_by text not null default 'agent',
  created_at timestamptz not null default now(),
  unique (summary_type, summary_date)
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('DAILY_BRIEF', 'WEEKLY_REVIEW', 'ACTION_PLAN')),
  status text not null check (status in ('STARTED', 'SUCCESS', 'FAILED')),
  prompt_version text not null,
  model text,
  output_file text,
  error_text text,
  metrics jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_agent_runs_type_started on agent_runs(run_type, started_at desc);
