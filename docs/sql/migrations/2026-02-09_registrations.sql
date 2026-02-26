-- Registrations schema (public registration + admin review flow)
create extension if not exists "uuid-ossp";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'registration_status') then
    create type registration_status as enum ('PENDING','APPROVED','REJECTED');
  end if;
  if not exists (select 1 from pg_type where typname = 'registration_item_status') then
    create type registration_item_status as enum ('PENDING','APPROVED','REJECTED');
  end if;
  if not exists (select 1 from pg_type where typname = 'registration_document_type') then
    create type registration_document_type as enum ('KK','AKTE');
  end if;
  if not exists (select 1 from pg_type where typname = 'registration_payment_status') then
    create type registration_payment_status as enum ('PENDING','APPROVED','REJECTED');
  end if;
  if not exists (select 1 from pg_type where typname = 'registration_payment_method') then
    create type registration_payment_method as enum ('MANUAL_TRANSFER');
  end if;
end$$;

create table if not exists registrations (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  community_name text,
  contact_name text not null,
  contact_phone text not null,
  contact_email text,
  total_amount int not null default 0,
  status registration_status not null default 'PENDING',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_registrations_total_amount check (total_amount >= 0)
);

create index if not exists idx_registrations_event on registrations(event_id);
create index if not exists idx_registrations_status on registrations(event_id, status);

drop trigger if exists trg_registrations_updated_at on registrations;
create trigger trg_registrations_updated_at
before update on registrations
for each row execute function set_updated_at();

create table if not exists registration_items (
  id uuid primary key default uuid_generate_v4(),
  registration_id uuid not null references registrations(id) on delete cascade,
  rider_name text not null,
  rider_nickname text,
  jersey_size text,
  date_of_birth date not null,
  gender gender_type not null,
  club text,
  primary_category_id uuid references categories(id) on delete set null,
  extra_category_id uuid references categories(id) on delete set null,
  requested_plate_number int,
  requested_plate_suffix char(1),
  photo_url text,
  price int not null default 0,
  status registration_item_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_registration_items_gender check (gender in ('BOY','GIRL')),
  constraint ck_registration_items_price check (price >= 0),
  constraint ck_registration_items_requested_plate_number check (
    requested_plate_number is null or requested_plate_number > 0
  ),
  constraint ck_registration_items_requested_plate_suffix check (
    requested_plate_suffix is null or requested_plate_suffix ~ '^[A-Z]$'
  ),
  constraint ck_registration_items_jersey_size check (
    jersey_size is null or jersey_size in ('XS','S','M','L','XL')
  )
);

create index if not exists idx_registration_items_registration on registration_items(registration_id);
create index if not exists idx_registration_items_status on registration_items(registration_id, status);
create index if not exists idx_registration_items_primary_category on registration_items(primary_category_id);
create index if not exists idx_registration_items_extra_category on registration_items(extra_category_id);

drop trigger if exists trg_registration_items_updated_at on registration_items;
create trigger trg_registration_items_updated_at
before update on registration_items
for each row execute function set_updated_at();

create table if not exists registration_documents (
  id uuid primary key default uuid_generate_v4(),
  registration_id uuid not null references registrations(id) on delete cascade,
  registration_item_id uuid references registration_items(id) on delete set null,
  document_type registration_document_type not null,
  file_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_registration_documents_registration on registration_documents(registration_id);
create index if not exists idx_registration_documents_item on registration_documents(registration_item_id);

create table if not exists registration_payments (
  id uuid primary key default uuid_generate_v4(),
  registration_id uuid not null references registrations(id) on delete cascade,
  amount int not null,
  bank_name text,
  account_name text,
  account_number text,
  proof_url text not null,
  status registration_payment_status not null default 'PENDING',
  payment_method registration_payment_method not null default 'MANUAL_TRANSFER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_registration_payments_amount check (amount >= 0)
);

create index if not exists idx_registration_payments_registration on registration_payments(registration_id);
create index if not exists idx_registration_payments_status on registration_payments(status);

drop trigger if exists trg_registration_payments_updated_at on registration_payments;
create trigger trg_registration_payments_updated_at
before update on registration_payments
for each row execute function set_updated_at();
