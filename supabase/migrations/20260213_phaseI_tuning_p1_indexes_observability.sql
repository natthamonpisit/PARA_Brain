-- Phase I (Tuning P1): hot-query index review + observability baseline

create extension if not exists pgcrypto;

create table if not exists api_observability_events (
  id uuid primary key default gen_random_uuid(),
  request_id text,
  endpoint text not null,
  method text not null,
  status_code integer not null,
  ok boolean not null,
  latency_ms integer not null,
  source text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_observability_endpoint_created
  on api_observability_events(endpoint, created_at desc);

create index if not exists idx_api_observability_ok_created
  on api_observability_events(ok, created_at desc);

create index if not exists idx_api_observability_request
  on api_observability_events(request_id);

-- Keep one row per event_source + event_id for replay-safe webhook/capture ingestion
with ranked as (
  select
    id,
    row_number() over (
      partition by event_source, event_id
      order by created_at asc, id asc
    ) as rn
  from system_logs
  where event_id is not null
)
delete from system_logs s
using ranked r
where s.id = r.id
  and r.rn > 1;

create unique index if not exists idx_system_logs_source_event_id_unique
  on system_logs(event_source, event_id)
  where event_id is not null;

create index if not exists idx_system_logs_source_created
  on system_logs(event_source, created_at desc);

create index if not exists idx_system_logs_created
  on system_logs(created_at desc);

create index if not exists idx_system_logs_user_message_created
  on system_logs(user_message, created_at desc);

create index if not exists idx_tasks_open_due_date
  on tasks(due_date)
  where is_completed = false;

create index if not exists idx_tasks_due_notified
  on tasks(due_date)
  where is_completed = false
    and is_notified = false;

create index if not exists idx_tasks_open_updated
  on tasks(updated_at desc)
  where is_completed = false;
