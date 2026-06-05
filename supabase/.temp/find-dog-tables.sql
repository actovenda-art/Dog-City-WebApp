select table_name
from information_schema.tables
where table_schema='public' and (table_name ilike '%dog%' or table_name ilike '%cao%' or table_name ilike '%pet%')
order by table_name;
