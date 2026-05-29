select id, empresa_id, referencia, valor, tipo, status, data_transacao, meta, created_date
from public."transaction"
order by created_date;
