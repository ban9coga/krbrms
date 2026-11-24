begin;

-- A multi-event package still creates one registration per event. This order
-- row only links those registrations and records the package price snapshot.
create table if not exists public.registration_bundle_orders (
  id uuid primary key default gen_random_uuid(),
  offer_id text not null,
  offer_name text not null,
  source_event_id uuid not null references public.events(id) on delete restrict,
  paired_event_id uuid not null references public.events(id) on delete restrict,
  bundle_base_price_per_rider integer not null,
  rider_count integer not null,
  total_amount integer not null,
  payment_status text not null default 'PENDING',
  bank_name text,
  account_name text,
  account_number text,
  proof_url text,
  created_at timestamptz not null default now(),
  constraint ck_registration_bundle_orders_different_events
    check (source_event_id <> paired_event_id),
  constraint ck_registration_bundle_orders_base_price
    check (bundle_base_price_per_rider >= 0),
  constraint ck_registration_bundle_orders_rider_count
    check (rider_count > 0),
  constraint ck_registration_bundle_orders_total
    check (total_amount >= 0),
  constraint ck_registration_bundle_orders_payment_status
    check (payment_status in ('PENDING', 'APPROVED', 'REJECTED'))
);

alter table public.registration_bundle_orders
  add column if not exists payment_status text not null default 'PENDING',
  add column if not exists bank_name text,
  add column if not exists account_name text,
  add column if not exists account_number text,
  add column if not exists proof_url text;

alter table public.registration_bundle_orders
  drop constraint if exists ck_registration_bundle_orders_payment_status;
alter table public.registration_bundle_orders
  add constraint ck_registration_bundle_orders_payment_status
  check (payment_status in ('PENDING', 'APPROVED', 'REJECTED'));

alter table public.registrations
  add column if not exists bundle_order_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_registrations_bundle_order'
      and conrelid = 'public.registrations'::regclass
  ) then
    alter table public.registrations
      add constraint fk_registrations_bundle_order
      foreign key (bundle_order_id)
      references public.registration_bundle_orders(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists idx_registration_bundle_orders_source_event
  on public.registration_bundle_orders(source_event_id, created_at desc);
create index if not exists idx_registration_bundle_orders_paired_event
  on public.registration_bundle_orders(paired_event_id, created_at desc);
create index if not exists idx_registrations_bundle_order
  on public.registrations(bundle_order_id)
  where bundle_order_id is not null;

comment on table public.registration_bundle_orders is
  'Links separate event registrations created together from one multi-event registration package.';
comment on column public.registration_bundle_orders.bundle_base_price_per_rider is
  'Package price per rider replacing only the sum of base entry fees; event-specific upclass and add-ons remain separate.';
comment on column public.registrations.bundle_order_id is
  'Optional link to a multi-event package order. Null for ordinary single-event registrations.';

-- Keep the package payment state and both event payment rows in sync in one
-- database transaction, so panitia only needs to review the combined payment once.
create or replace function public.set_registration_bundle_order_payment_status(
  p_event_id uuid,
  p_registration_id uuid,
  p_payment_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bundle_order_id uuid;
begin
  if p_status not in ('APPROVED', 'REJECTED') then
    raise exception 'Invalid bundle payment status';
  end if;

  select r.bundle_order_id into v_bundle_order_id
  from public.registrations r
  join public.registration_payments rp
    on rp.registration_id = r.id and rp.id = p_payment_id
  where r.id = p_registration_id
    and r.event_id = p_event_id
    and r.bundle_order_id is not null
  for update of r, rp;

  if v_bundle_order_id is null then
    raise exception 'Bundle registration payment not found';
  end if;

  perform 1
  from public.registration_bundle_orders rbo
  where rbo.id = v_bundle_order_id
  for update;
  if not found then
    raise exception 'Bundle order not found';
  end if;

  update public.registration_bundle_orders
  set payment_status = p_status
  where id = v_bundle_order_id;

  update public.registration_payments rp
  set status = p_status
  from public.registrations r
  where r.bundle_order_id = v_bundle_order_id
    and rp.registration_id = r.id;
end;
$$;

revoke all on function public.set_registration_bundle_order_payment_status(uuid, uuid, uuid, text) from public;
grant execute on function public.set_registration_bundle_order_payment_status(uuid, uuid, uuid, text) to service_role;

commit;

-- Rollback only after package orders have been removed or their linked
-- registrations have been detached:
-- begin;
-- drop function if exists public.set_registration_bundle_order_payment_status(uuid, uuid, uuid, text);
-- alter table public.registrations drop constraint if exists fk_registrations_bundle_order;
-- alter table public.registrations drop column if exists bundle_order_id;
-- drop table if exists public.registration_bundle_orders;
-- commit;
