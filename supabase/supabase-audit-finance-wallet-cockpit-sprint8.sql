\set empresa_id 'empresa_demo'

-- Auditoria Sprint 8 - Cockpit V2, comparativo e alertas
-- Execute manualmente após ligar as flags na empresa piloto.

-- 1. Estado das flags da Sprint 8
select
  key,
  empresa_id,
  value,
  ativo,
  updated_date
from public.app_config
where key in (
  'finance.cockpit_v2_enabled',
  'finance.cockpit_v2_compare_enabled',
  'finance.financial_alerts_v2_enabled',
  'finance.legacy_cockpit_finance_disabled'
)
and (empresa_id = :'empresa_id' or empresa_id is null)
order by key, empresa_id nulls first;

-- 2. Contexto do cockpit V2
-- select *
-- from public.finance_cockpit_v2_context(:'empresa_id', current_date - 30, current_date);

-- 3. Resumo V2
-- select *
-- from public.finance_cockpit_v2_summary(:'empresa_id', current_date - 30, current_date);

-- 4. Comparativo legado vs V2
-- select *
-- from public.finance_cockpit_v2_compare(:'empresa_id', current_date - 30, current_date);

-- 5. Alertas V2
-- select *
-- from public.finance_financial_alerts_v2(:'empresa_id', current_date - 30, current_date, 100);

-- 6. Confirmação de que nenhuma tabela legada foi esvaziada por Sprint 8
select
  (select count(*) from public."transaction") as legacy_transactions_total,
  (select count(*) from public.scheduledtransaction) as legacy_scheduled_total,
  (select count(*) from public.conta_receber) as legacy_conta_receber_total;
