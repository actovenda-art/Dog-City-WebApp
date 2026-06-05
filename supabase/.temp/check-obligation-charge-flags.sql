select key, value, ativo, empresa_id
from public.app_config
where key in ('finance.obligations_enabled','finance.charges_enabled')
  and (empresa_id is null or empresa_id = 'empresa_demo')
order by key, empresa_id nulls first;
