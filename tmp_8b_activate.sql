update public.app_config
set value = jsonb_build_object('enabled', true), updated_date = now()
where key = 'finance.legacy_cockpit_finance_disabled'
  and empresa_id = 'empresa_demo';

select key, value->>'enabled' as enabled
from public.app_config
where empresa_id = 'empresa_demo'
  and key in (
    'finance.cockpit_v2_enabled',
    'finance.cockpit_v2_compare_enabled',
    'finance.financial_alerts_v2_enabled',
    'finance.legacy_cockpit_finance_disabled'
  )
order by key;
