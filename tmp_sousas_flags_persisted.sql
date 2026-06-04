select key, value->>'enabled' as enabled
from public.app_config
where empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980'
  and key in (
    'finance.cockpit_v2_enabled',
    'finance.cockpit_v2_compare_enabled',
    'finance.financial_alerts_v2_enabled',
    'finance.legacy_cockpit_finance_disabled'
  )
order by key;
