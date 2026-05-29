select cliente_id, coalesce(empresa_id,'<null>') as empresa_id, status, count(*) as rows, sum(valor) as total
from public.conta_receber
group by cliente_id, coalesce(empresa_id,'<null>'), status
order by empresa_id, cliente_id, status;
