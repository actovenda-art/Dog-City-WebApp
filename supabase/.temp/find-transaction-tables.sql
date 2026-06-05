select table_name
from information_schema.tables
where table_schema='public' and (table_name ilike '%extrato%' or table_name ilike '%transaction%' or table_name ilike '%lancamento%')
order by table_name;
