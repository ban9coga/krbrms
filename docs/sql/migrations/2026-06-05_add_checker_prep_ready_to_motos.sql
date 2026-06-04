alter table if exists public.motos
  add column if not exists checker_prep_ready_at timestamptz,
  add column if not exists checker_prep_ready_by uuid references auth.users(id) on delete set null;

create index if not exists idx_motos_checker_prep_ready
  on public.motos(event_id, checker_prep_ready_at);
