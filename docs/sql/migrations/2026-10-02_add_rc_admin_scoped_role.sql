-- RC Admins have event visibility through an explicit scoped role, not ADMIN.
-- This keeps the existing admin API helpers from granting them the full operator workspace.
alter table public.user_event_roles
  drop constraint if exists ck_user_event_roles_role;

alter table public.user_event_roles
  add constraint ck_user_event_roles_role check (
    upper(role) in (
      'SUPER_ADMIN',
      'ADMIN',
      'RC_ADMIN',
      'REGISTRATION_APPROVER',
      'DRAW_MANAGER',
      'CHECKER',
      'FINISHER',
      'RACE_DIRECTOR',
      'RACE_CONTROL',
      'MC'
    )
  );

comment on column public.user_event_roles.role is
  'Event-scoped access role. RC_ADMIN can see its event in the RC workspace but is not an ADMIN workspace role.';
