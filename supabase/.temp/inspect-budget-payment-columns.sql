select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orcamento_pagamento'
order by ordinal_position;
