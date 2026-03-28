-- Scope user roles per event.
-- Draft awal untuk memindahkan akses dari role global ke role per-event.

create table if not exists user_event_roles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  role text not null,
  is_active boolean not null default true,
  assigned_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_user_event_roles_role check (
    upper(role) in (
      'SUPER_ADMIN',
      'ADMIN',
      'CHECKER',
      'FINISHER',
      'RACE_DIRECTOR',
      'RACE_CONTROL',
      'MC'
    )
  )
);

create unique index if not exists uq_user_event_roles_active
  on user_event_roles(user_id, event_id, upper(role));

create index if not exists idx_user_event_roles_event
  on user_event_roles(event_id, is_active);

create index if not exists idx_user_event_roles_user
  on user_event_roles(user_id, is_active);

create index if not exists idx_user_event_roles_role
  on user_event_roles(upper(role), is_active);

drop trigger if exists trg_user_event_roles_updated_at on user_event_roles;
create trigger trg_user_event_roles_updated_at
before update on user_event_roles
for each row execute function set_updated_at();

comment on table user_event_roles is
  'Per-event role assignment. SUPER_ADMIN = Central Admin, ADMIN = Operator Admin, other roles = field operators.';

comment on column user_event_roles.user_id is
  'Auth user receiving access for a specific event.';

comment on column user_event_roles.event_id is
  'Event scope for this role assignment.';

comment on column user_event_roles.role is
  'Scoped role for this event: SUPER_ADMIN, ADMIN, CHECKER, FINISHER, RACE_DIRECTOR, RACE_CONTROL, or MC.';

comment on column user_event_roles.assigned_by is
  'Auth user who assigned this event role.';
