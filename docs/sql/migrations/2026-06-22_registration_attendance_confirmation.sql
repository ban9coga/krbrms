-- Online attendance confirmation before event day.
alter table registrations
  add column if not exists attendance_status text not null default 'UNCONFIRMED',
  add column if not exists attendance_confirmed_at timestamptz;

alter table registrations
  drop constraint if exists ck_registrations_attendance_status;

alter table registrations
  add constraint ck_registrations_attendance_status
  check (attendance_status in ('UNCONFIRMED', 'ATTENDING', 'NOT_ATTENDING'));

create index if not exists idx_registrations_event_attendance
  on registrations (event_id, attendance_status);
