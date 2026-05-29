select id, empresa_id, carteira_id, carteira_conta_id, tipo_origem, tipo_item, source_key, descricao, service_date, due_date, valor_final, valor_em_aberto, status, created_date
from public.obrigacao_financeira
where empresa_id = 'empresa_demo'
order by created_date;
