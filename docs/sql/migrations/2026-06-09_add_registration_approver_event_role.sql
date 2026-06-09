alter table if exists public.user_event_roles
  drop constraint if exists ck_user_event_roles_role;

alter table if exists public.user_event_roles
  add constraint ck_user_event_roles_role
    check (
      upper(role) in (
        'SUPER_ADMIN',
        'ADMIN',
        'REGISTRATION_APPROVER',
        'CHECKER',
        'FINISHER',
        'RACE_DIRECTOR',
        'RACE_CONTROL',
        'MC'
      )
    );

comment on column public.user_event_roles.role is
  'Scoped role for this event: SUPER_ADMIN, ADMIN, REGISTRATION_APPROVER, CHECKER, FINISHER, RACE_DIRECTOR, RACE_CONTROL, or MC.';
