-- Audit trail for admin edits to guardian/contact data on registrations.
create table if not exists registration_contact_change_logs (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  registration_id uuid not null references registrations(id) on delete cascade,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb
);

create index if not exists idx_registration_contact_change_logs_registration
  on registration_contact_change_logs (registration_id, changed_at desc);

create index if not exists idx_registration_contact_change_logs_event
  on registration_contact_change_logs (event_id, changed_at desc);

