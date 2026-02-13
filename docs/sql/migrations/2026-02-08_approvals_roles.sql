-- Additive approvals + event approval mode + moto locks + audit log
-- Non-destructive: new enums/tables only.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'approval_mode') then
    create type approval_mode as enum ('AUTO','DIRECTOR');
  end if;
  if not exists (select 1 from pg_type where typname = 'approval_status') then
    create type approval_status as enum ('PENDING','APPROVED','REJECTED');
  end if;
  if not exists (select 1 from pg_type where typname = 'audit_action') then
    create type audit_action as enum ('STATUS_APPROVAL','PENALTY_APPROVAL','RESULT_OVERRIDE','RESULT_UNLOCK');
  end if;
end$$;

-- Event-level approval mode (default AUTO)
create table if not exists event_approval_modes (
  event_id uuid primary key references events(id) on delete cascade,
  approval_mode approval_mode not null default 'AUTO',
  created_at timestamptz not null default now()
);

-- Status updates submitted by jury (pending/approved/rejected)
create table if not exists rider_status_updates (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete cascade,
  proposed_status participation_status not null,
  created_by text not null,
  approval_status approval_status not null default 'PENDING',
  approved_by text,
  approved_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rider_status_updates_event
  on rider_status_updates(event_id);

-- Penalty approvals (separate table, no change to rider_penalties)
create table if not exists rider_penalty_approvals (
  id uuid primary key default uuid_generate_v4(),
  penalty_id uuid not null references rider_penalties(id) on delete cascade,
  approval_status approval_status not null default 'PENDING',
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_rider_penalty_approvals_penalty
  on rider_penalty_approvals(penalty_id);

-- Moto locks (by race director)
create table if not exists moto_locks (
  moto_id uuid primary key references motos(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  is_locked boolean not null default true,
  locked_by text not null,
  locked_at timestamptz not null default now(),
  unlocked_by text,
  unlocked_at timestamptz,
  reason text
);

-- Audit log (mandatory)
create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  action_type audit_action not null,
  performed_by text not null,
  rider_id uuid references riders(id) on delete set null,
  moto_id uuid references motos(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
