-- Audit trail for admin edits to approved rider upclass from registration admin.
create table if not exists registration_upclass_change_logs (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  registration_id uuid not null references registrations(id) on delete cascade,
  registration_item_id uuid references registration_items(id) on delete set null,
  rider_id uuid references riders(id) on delete set null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_category_id uuid references categories(id) on delete set null,
  new_category_id uuid references categories(id) on delete set null,
  notes text
);

create index if not exists idx_registration_upclass_change_logs_registration
  on registration_upclass_change_logs (registration_id, changed_at desc);

create index if not exists idx_registration_upclass_change_logs_rider
  on registration_upclass_change_logs (rider_id, changed_at desc);

