-- Initial seed for user_event_roles.
-- Preserves current global-role behavior by assigning existing role-based users to all existing events.
-- This is a transition step until event-specific assignments are curated in admin UI.

insert into user_event_roles (user_id, event_id, role, is_active, notes)
select
  u.id as user_id,
  e.id as event_id,
  case
    when upper(coalesce(u.raw_user_meta_data->>'role', u.raw_app_meta_data->>'role', '')) = 'JURY_START' then 'CHECKER'
    when upper(coalesce(u.raw_user_meta_data->>'role', u.raw_app_meta_data->>'role', '')) = 'JURY_FINISH' then 'FINISHER'
    else upper(coalesce(u.raw_user_meta_data->>'role', u.raw_app_meta_data->>'role', ''))
  end as role,
  true as is_active,
  'Seeded from existing global role during event-role transition.' as notes
from auth.users u
cross join events e
where upper(coalesce(u.raw_user_meta_data->>'role', u.raw_app_meta_data->>'role', '')) in (
  'SUPER_ADMIN',
  'ADMIN',
  'CHECKER',
  'FINISHER',
  'RACE_DIRECTOR',
  'RACE_CONTROL',
  'MC',
  'JURY_START',
  'JURY_FINISH'
)
on conflict (user_id, event_id, role) do nothing;
