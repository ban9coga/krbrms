-- Venue check-in and goodie bag collection tracking.
alter table registrations
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid,
  add column if not exists goodie_bag_collected_at timestamptz,
  add column if not exists goodie_bag_collected_by uuid;

create index if not exists idx_registrations_event_checkin
  on registrations (event_id, checked_in_at);

create table if not exists registration_checkin_logs (
  id uuid primary key default uuid_generate_v4(),
  registration_id uuid not null references registrations(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  action text not null,
  performed_by uuid,
  performed_at timestamptz not null default now(),
  constraint ck_registration_checkin_logs_action
    check (action in ('CHECK_IN', 'GOODIE_BAG_COLLECTED'))
);

create index if not exists idx_registration_checkin_logs_registration
  on registration_checkin_logs (registration_id, performed_at desc);

create index if not exists idx_registration_checkin_logs_event
  on registration_checkin_logs (event_id, performed_at desc);
