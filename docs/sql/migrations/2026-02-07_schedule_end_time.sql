-- Add optional end_time for category schedule range
alter table race_schedules
  add column if not exists end_time timestamptz;
