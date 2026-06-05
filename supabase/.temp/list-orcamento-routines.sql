select routine_name
from information_schema.routines
where specific_schema='public' and routine_name ilike '%orcamento%'
order by routine_name;
