select id, empresa_id, referencia, valor, tipo, status, data_transacao, meta, created_date
from public."transaction"
order by created_date;

select id, empresa_id, descricao, valor, schedule_date, periodo, status, created_date
from public.scheduledtransaction
order by created_date;
