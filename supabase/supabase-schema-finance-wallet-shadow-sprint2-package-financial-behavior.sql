-- Sprint 2 corrective migration
-- Objetivo:
-- 1. Persistir o comportamento financeiro do pacote em recurring_packages
-- 2. Eliminar inferencia em helper no shadow write
-- 3. Backfill seguro dos pacotes existentes

alter table if exists public.recurring_packages
  add column if not exists financial_behavior text;

update public.recurring_packages
set financial_behavior = case
  when service_id = 'day_care' then 'operational_only'
  else 'billable_detailed'
end
where coalesce(trim(financial_behavior), '') = ''
   or financial_behavior not in ('billable_detailed', 'operational_only');

alter table if exists public.recurring_packages
  alter column financial_behavior set default 'billable_detailed',
  alter column financial_behavior set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_recurring_packages_financial_behavior'
      and conrelid = 'public.recurring_packages'::regclass
  ) then
    alter table public.recurring_packages
      add constraint chk_recurring_packages_financial_behavior
      check (financial_behavior in ('billable_detailed', 'operational_only'));
  end if;
end;
$$;

create index if not exists idx_recurring_packages_financial_behavior
  on public.recurring_packages(empresa_id, financial_behavior, status);

comment on column public.recurring_packages.financial_behavior is
  'Comportamento financeiro explícito do pacote. billable_detailed detalha obrigações financeiras por item; operational_only mantém apenas o fluxo operacional.';

select
  id,
  empresa_id,
  service_id,
  status,
  financial_behavior,
  created_at
from public.recurring_packages
order by created_at asc nulls last, id asc;
