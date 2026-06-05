select id, empresa_id, carteira_id, carteira_conta_id, status, valor, valor_recebido, codigo_solicitacao, txid, metodo, metadata, created_date, updated_date
from public.orcamento_pagamento
where carteira_id = 'b74aaff5-4ee3-4076-b45d-4e646de52801'
order by updated_date desc;
