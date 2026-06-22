-- Per-rider venue attendance and goodie bag tracking.
alter table registrations
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid,
  add column if not exists goodie_bag_collected_at timestamptz,
  add column if not exists goodie_bag_collected_by uuid;

alter table registration_items
  add column if not exists venue_status text not null default 'UNMARKED',
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid,
  add column if not exists goodie_bag_collected_at timestamptz,
  add column if not exists goodie_bag_collected_by uuid;

alter table registration_items
  drop constraint if exists ck_registration_items_venue_status;

alter table registration_items
  add constraint ck_registration_items_venue_status
  check (venue_status in ('UNMARKED', 'CHECKED_IN', 'NOT_ATTENDING'));

-- Preserve old registration-level venue records by treating every rider in
-- those registrations as already processed.
update registration_items items
set
  venue_status = 'CHECKED_IN',
  checked_in_at = registrations.checked_in_at,
  checked_in_by = registrations.checked_in_by,
  goodie_bag_collected_at = registrations.goodie_bag_collected_at,
  goodie_bag_collected_by = registrations.goodie_bag_collected_by
from registrations
where registrations.id = items.registration_id
  and registrations.checked_in_at is not null
  and items.checked_in_at is null;

create index if not exists idx_registration_items_venue_status
  on registration_items (registration_id, venue_status);

create table if not exists registration_checkin_logs (
  id uuid primary key default uuid_generate_v4(),
  registration_id uuid not null references registrations(id) on delete cascade,
  registration_item_id uuid references registration_items(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  action text not null,
  performed_by uuid,
  performed_at timestamptz not null default now()
);

alter table registration_checkin_logs
  add column if not exists registration_item_id uuid references registration_items(id) on delete cascade;

alter table registration_checkin_logs
  drop constraint if exists ck_registration_checkin_logs_action;

alter table registration_checkin_logs
  add constraint ck_registration_checkin_logs_action
  check (action in ('CHECK_IN', 'NOT_ATTENDING', 'GOODIE_BAG_COLLECTED'));

create index if not exists idx_registration_checkin_logs_item
  on registration_checkin_logs (registration_item_id, performed_at desc);
