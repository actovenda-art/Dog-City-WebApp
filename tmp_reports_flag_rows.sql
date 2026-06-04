select key, empresa_id, value, ativo, updated_date
from public.app_config
where key = 'finance.reports_v2_enabled'
order by empresa_id nulls first;
