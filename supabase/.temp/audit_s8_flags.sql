select key, empresa_id, (value->>'enabled')::boolean as enabled, ativo
from public.app_config
where key in (
  'finance.cockpit_v2_enabled',
  'finance.cockpit_v2_compare_enabled',
  'finance.financial_alerts_v2_enabled',
  'finance.legacy_cockpit_finance_disabled'
)
and (empresa_id is null or empresa_id in ('empresa_demo','992c8aa3-8c11-44a6-87fc-0346725f4980'))
order by key, empresa_id nulls first;
