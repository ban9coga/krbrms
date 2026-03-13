-- Add per-registration upload token to secure step-by-step uploads (prevents IDOR).

alter table registrations
  add column if not exists upload_token text;

alter table registrations
  add column if not exists upload_token_created_at timestamptz;

create unique index if not exists registrations_upload_token_unique
  on registrations(upload_token)
  where upload_token is not null;
