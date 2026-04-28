-- Pacotes recorrentes pre-pagos: fichas, creditos, cobrancas e auditoria.
-- Execute apos os schemas base, isolamento por unidade e attendance-flow.

create table if not exists public.recurring_packages (
  id text primary key default gen_random_uuid()::text,
  empresa_id text,
  client_id text not null,
  pet_id text not null,
  service_id text not null,
  weekday integer,
  weekdays integer[] default '{}'::integer[],
  frequency text not null default 'semanal',
  price_per_session numeric(12,2) not null default 0 check (price_per_session >= 0),
  start_date date not null,
  end_date date,
  status text not null default 'ativo' check (status in ('ativo','pausado','cancelado')),
  cancellation_policy text default 'credito_com_aviso',
  allow_credit_rollover boolean not null default true,
  credit_expiration_months integer check (credit_expiration_months is null or credit_expiration_months >= 0),
  credit_limit integer check (credit_limit is null or credit_limit >= 0),
  blocked_dates date[] default '{}'::date[],
  pause_ranges jsonb default '[]'::jsonb,
  metadata jsonb default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.package_sessions (
  id text primary key default gen_random_uuid()::text,
  empresa_id text,
  package_id text not null references public.recurring_packages(id) on delete restrict,
  client_id text not null,
  pet_id text not null,
  service_id text not null,
  scheduled_date date not null,
  status text not null default 'prevista' check (
    status in (
      'prevista',
      'agendada',
      'realizada',
      'cancelada_com_credito',
      'cancelada_sem_credito',
      'falta_cobrada',
      'falta_nao_cobrada',
      'vencida_nao_utilizada',
      'convertida_em_credito'
    )
  ),
  billing_month text not null,
  charged boolean not null default false,
  covered_by_credit boolean not null default false,
  credit_id text,
  invoice_id text,
  appointment_id text,
  cancellation_reason text,
  manual_reason text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  deleted_at timestamptz,
  check (not (charged and covered_by_credit))
);

create table if not exists public.package_credits (
  id text primary key default gen_random_uuid()::text,
  empresa_id text,
  package_id text not null references public.recurring_packages(id) on delete restrict,
  client_id text not null,
  pet_id text not null,
  source_session_id text references public.package_sessions(id) on delete restrict,
  used_session_id text references public.package_sessions(id) on delete restrict,
  origin_month text not null,
  status text not null default 'disponivel' check (status in ('disponivel','usado','expirado','cancelado')),
  reason text,
  expires_at date,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  canceled_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.package_billings (
  id text primary key default gen_random_uuid()::text,
  empresa_id text,
  package_id text not null references public.recurring_packages(id) on delete restrict,
  client_id text not null,
  pet_id text not null,
  billing_month text not null,
  expected_sessions integer not null default 0 check (expected_sessions >= 0),
  pre_cancelled_sessions integer not null default 0 check (pre_cancelled_sessions >= 0),
  credits_used integer not null default 0 check (credits_used >= 0),
  charged_sessions integer not null default 0 check (charged_sessions >= 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  payment_status text not null default 'pendente',
  invoice_reference text,
  conta_receber_id text,
  metadata jsonb default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id text primary key default gen_random_uuid()::text,
  empresa_id text,
  user_id text,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now(),
  created_date timestamptz not null default now()
);

create unique index if not exists idx_package_sessions_unique_active
  on public.package_sessions(package_id, pet_id, service_id, scheduled_date)
  where deleted_at is null;

create unique index if not exists idx_package_billings_unique_month
  on public.package_billings(package_id, billing_month);

create unique index if not exists idx_package_credits_used_session_unique
  on public.package_credits(used_session_id)
  where used_session_id is not null and status = 'usado';

create index if not exists idx_recurring_packages_empresa_status
  on public.recurring_packages(empresa_id, status);

create index if not exists idx_package_sessions_month
  on public.package_sessions(empresa_id, billing_month, scheduled_date);

create index if not exists idx_package_sessions_package_month
  on public.package_sessions(package_id, billing_month);

create index if not exists idx_package_credits_available
  on public.package_credits(package_id, status, created_at);

create index if not exists idx_package_billings_month
  on public.package_billings(empresa_id, billing_month);

create index if not exists idx_audit_logs_entity
  on public.audit_logs(entity_type, entity_id, created_at desc);

alter table if exists public.appointment
  add column if not exists package_session_id text,
  add column if not exists recurring_package_id text;

alter table if exists public.conta_receber
  add column if not exists package_billing_id text,
  add column if not exists recurring_package_id text;

create index if not exists idx_appointment_package_session_id
  on public.appointment(package_session_id);

create index if not exists idx_conta_receber_package_billing_id
  on public.conta_receber(package_billing_id);

alter table public.recurring_packages enable row level security;
alter table public.package_sessions enable row level security;
alter table public.package_credits enable row level security;
alter table public.package_billings enable row level security;
alter table public.audit_logs enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'recurring_packages',
    'package_sessions',
    'package_credits',
    'package_billings',
    'audit_logs'
  ]
  loop
    if exists (
      select 1
      from information_schema.routines
      where routine_schema = 'public'
        and routine_name = 'app_active_unit_matches'
    ) then
      execute format('drop policy if exists %I on public.%I', tbl || '_unit_policy', tbl);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.app_active_unit_matches(empresa_id)) with check (public.app_active_unit_matches(empresa_id))',
        tbl || '_unit_policy',
        tbl
      );
    end if;
  end loop;
end $$;
