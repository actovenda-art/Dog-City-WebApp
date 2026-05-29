select proname, oidvectortypes(proargtypes) as args
from pg_proc
join pg_namespace n on n.oid = pg_proc.pronamespace
where n.nspname = 'public'
  and proname like 'finance_cockpit%'
order by proname;
