select id, data_hora_transacao, nome_contraparte, valor, referencia, tipo_transacao_detalhado, forma_pagamento, created_date
from public.extratobancario
where abs(coalesce(valor,0) - 3.60) < 0.001
order by created_date desc
limit 50;
