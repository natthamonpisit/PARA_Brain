-- Phase F: external agent job queue + audit trail

create table if not exists external_agent_jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'OPENCLAW',
  request_text text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED', 'APPROVED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED')),
  priority int not null default 100,
  dedupe_key text unique,
  created_by text not null default 'user',
  assigned_agent text,
  approved_by text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  error_text text
);

create index if not exists idx_external_agent_jobs_status_priority
  on external_agent_jobs(status, priority asc, requested_at asc);
create index if not exists idx_external_agent_jobs_requested_at
  on external_agent_jobs(requested_at desc);

create table if not exists external_agent_actions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references external_agent_jobs(id) on delete cascade,
  actor text not null,
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_external_agent_actions_job_created
  on external_agent_actions(job_id, created_at desc);

create or replace function approve_external_agent_job(
  p_job_id uuid,
  p_actor text,
  p_approve boolean default true,
  p_note text default null
)
returns external_agent_jobs
language plpgsql
as $$
declare
  v_job external_agent_jobs;
begin
  update external_agent_jobs
  set
    status = case when p_approve then 'APPROVED' else 'CANCELLED' end,
    approved_by = p_actor,
    approved_at = now(),
    completed_at = case when p_approve then completed_at else now() end,
    error_text = case when p_approve then error_text else coalesce(p_note, 'Cancelled by approver') end
  where id = p_job_id
    and status in ('REQUESTED', 'APPROVED')
  returning * into v_job;

  if v_job.id is null then
    return null;
  end if;

  insert into external_agent_actions(job_id, actor, action_type, action_payload)
  values (
    v_job.id,
    p_actor,
    case when p_approve then 'APPROVED' else 'CANCELLED' end,
    jsonb_build_object('note', p_note)
  );

  return v_job;
end;
$$;

create or replace function claim_external_agent_job(
  p_agent text
)
returns external_agent_jobs
language plpgsql
as $$
declare
  v_job external_agent_jobs;
begin
  with next_job as (
    select id
    from external_agent_jobs
    where status = 'APPROVED'
    order by priority asc, requested_at asc
    for update skip locked
    limit 1
  )
  update external_agent_jobs j
  set
    status = 'RUNNING',
    assigned_agent = p_agent,
    started_at = now()
  from next_job
  where j.id = next_job.id
  returning j.* into v_job;

  if v_job.id is null then
    return null;
  end if;

  insert into external_agent_actions(job_id, actor, action_type, action_payload)
  values (
    v_job.id,
    p_agent,
    'CLAIMED',
    jsonb_build_object('status', v_job.status)
  );

  return v_job;
end;
$$;

create or replace function finish_external_agent_job(
  p_job_id uuid,
  p_actor text,
  p_success boolean,
  p_result jsonb default '{}'::jsonb,
  p_error_text text default null
)
returns external_agent_jobs
language plpgsql
as $$
declare
  v_job external_agent_jobs;
begin
  update external_agent_jobs
  set
    status = case when p_success then 'DONE' else 'FAILED' end,
    completed_at = now(),
    result = coalesce(p_result, '{}'::jsonb),
    error_text = case when p_success then null else coalesce(p_error_text, error_text) end
  where id = p_job_id
    and status = 'RUNNING'
  returning * into v_job;

  if v_job.id is null then
    return null;
  end if;

  insert into external_agent_actions(job_id, actor, action_type, action_payload)
  values (
    v_job.id,
    p_actor,
    case when p_success then 'DONE' else 'FAILED' end,
    jsonb_build_object('result', p_result, 'error_text', p_error_text)
  );

  return v_job;
end;
$$;
