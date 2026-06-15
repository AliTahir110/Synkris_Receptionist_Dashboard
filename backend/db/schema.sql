create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  retell_call_id text unique,
  from_number text,
  to_number text,
  intent text,
  outcome text,
  transcript text,
  recording_url text,
  booking_id text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists call_logs_created_at_idx
  on public.call_logs (created_at desc);

alter table public.call_logs enable row level security;
