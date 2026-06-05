select id, carteira_conta_id, natureza, tipo, valor, transacao_id, referencia_amigavel, origem, metadata, created_date
from public.carteira_movimento
where carteira_conta_id = 'd9b2ffcd-097d-4911-9038-0e12e22d371a'
order by created_date desc
limit 20;
