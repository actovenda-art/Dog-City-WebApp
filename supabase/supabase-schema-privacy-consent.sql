begin;

create table if not exists public.privacy_consent_record (
  id uuid primary key default gen_random_uuid(),
  empresa_id text,
  subject_type text not null,
  subject_id text not null,
  source text not null,
  privacy_notice_version text not null,
  terms_version text,
  accepted boolean not null default false,
  sensitive_data_accepted boolean,
  accepted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint privacy_consent_record_subject_type_check
    check (subject_type in ('client_registration', 'employee_registration', 'user_onboarding')),
  constraint privacy_consent_record_accepted_check
    check (accepted = true)
);

create index if not exists privacy_consent_record_subject_idx
  on public.privacy_consent_record (subject_type, subject_id, accepted_at desc);

create index if not exists privacy_consent_record_empresa_idx
  on public.privacy_consent_record (empresa_id, accepted_at desc);

alter table public.privacy_consent_record enable row level security;

revoke all on table public.privacy_consent_record from anon, authenticated;
grant all on table public.privacy_consent_record to service_role;

comment on table public.privacy_consent_record is
  'Evidencia minimizada de ciencia e consentimento para documentos de privacidade. Sem IP ou conteudo cadastral.';

commit;
