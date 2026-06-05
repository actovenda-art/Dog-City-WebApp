select id, data_hora_transacao, nome_contraparte, valor, referencia, tipo_transacao_detalhado, forma_pagamento, raw_data, metadata_financeira, created_date
from public.extratobancario
order by created_date desc
limit 10;
