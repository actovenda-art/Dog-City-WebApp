select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name in ('conta_receber','obrigacao_financeira','cobranca_financeira','transaction','scheduledtransaction')
order by table_name, ordinal_position;
