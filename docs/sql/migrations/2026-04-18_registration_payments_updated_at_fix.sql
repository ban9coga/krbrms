alter table if exists registration_payments
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_registration_payments_updated_at on registration_payments;
create trigger trg_registration_payments_updated_at
before update on registration_payments
for each row execute function set_updated_at();
