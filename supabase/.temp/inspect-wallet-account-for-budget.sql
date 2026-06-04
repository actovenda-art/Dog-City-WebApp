select id, empresa_id, carteira_id, saldo_atual, ativo, created_date, updated_date
from carteira_conta
where carteira_id = 'b74aaff5-4ee3-4076-b45d-4e646de52801'
order by created_date desc;
