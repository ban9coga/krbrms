-- Public registration code used by guardians to check registration status.
alter table registrations
  add column if not exists registration_code text;

update registrations
set registration_code =
  'RPB-' ||
  to_char(created_at at time zone 'Asia/Jakarta', 'YYMMDD') ||
  '-' ||
  upper(substr(md5(id::text), 1, 8))
where registration_code is null or btrim(registration_code) = '';

alter table registrations
  alter column registration_code set not null;

create unique index if not exists registrations_registration_code_unique
  on registrations (registration_code);

create index if not exists idx_registrations_public_lookup
  on registrations (registration_code, contact_phone);
