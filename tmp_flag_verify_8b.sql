select key, empresa_id, value->>'enabled' as enabled
from public.app_config
where key = 'finance.legacy_cockpit_finance_disabled'
  and empresa_id = 'empresa_demo';
