alter table if exists public.event_certificates
  drop constraint if exists ck_event_certificates_type;

alter table if exists public.event_certificates
  add constraint ck_event_certificates_type
    check (certificate_type in ('PARTICIPATION', 'ACHIEVEMENT'));

comment on column public.event_certificates.certificate_type is
  'PARTICIPATION for approved riders, ACHIEVEMENT for an official final-stage result.';
