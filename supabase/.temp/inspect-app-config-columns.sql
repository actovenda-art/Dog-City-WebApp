select column_name
from information_schema.columns
where table_schema='public' and table_name='app_config'
order by ordinal_position;
