-- Sprint 9A - Auditoria operacional de observabilidade e governanca financeira
-- Ajuste empresa_id e periodo conforme necessario.



select
  key,
  empresa_id,
  value ->> 'enabled' as enabled
from public.app_config
where key in (
  'finance.operational_observability_enabled',
  'finance.write_governance_enabled',
  'finance.payment_v2_contract_enabled',
  'finance.cockpit_v2_enabled',
  'finance.cockpit_v2_compare_enabled',
  'finance.financial_alerts_v2_enabled',
  'finance.reports_v2_enabled'
)
order by key, empresa_id nulls first;

select *
from public.finance_write_flow_map('empresa_demo')
order by dominio, flow_key;

select *
from public.finance_write_governance_matrix('empresa_demo')
order by dominio;

select *
from public.finance_operational_observability_context('empresa_demo', current_date - 30, current_date);

select *
from public.finance_operational_reconciliation_matrix('empresa_demo', current_date - 30, current_date)
order by check_key;

select *
from public.finance_hybrid_write_audit('empresa_demo', current_date - 30, current_date, 200)
order by event_date desc nulls last;

select *
from public.finance_payment_v2_contract('empresa_demo')
order by contract_stage, rule_key;

