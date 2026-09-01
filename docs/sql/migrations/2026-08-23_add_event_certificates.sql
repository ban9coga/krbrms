-- Immutable certificate records are created on the first successful download.
-- The public QR verification page reads the safe snapshot stored here, not the
-- registration contact data.
create table if not exists public.event_certificates (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  registration_item_id uuid not null references public.registration_items(id) on delete cascade,
  certificate_type text not null default 'PARTICIPATION',
  certificate_code text not null,
  snapshot jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text,
  constraint ck_event_certificates_type check (certificate_type in ('PARTICIPATION')),
  constraint uq_event_certificates_code unique (certificate_code),
  constraint uq_event_certificates_item_type unique (event_id, registration_item_id, certificate_type)
);

create index if not exists idx_event_certificates_event_item
  on public.event_certificates(event_id, registration_item_id);

create index if not exists idx_event_certificates_public_code
  on public.event_certificates(certificate_code);

alter table public.event_certificates enable row level security;

comment on table public.event_certificates is
  'Immutable public-safe snapshots for event e-certificates. Records are issued on first download.';
