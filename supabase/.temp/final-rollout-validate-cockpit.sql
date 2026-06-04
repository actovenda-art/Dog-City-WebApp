with empresas as (
  select 'empresa_demo'::text as empresa_id
  union all
  select '992c8aa3-8c11-44a6-87fc-0346725f4980'::text as empresa_id
)
select
  e.empresa_id,
  (select count(*) from public.finance_cockpit_v2_context(e.empresa_id, current_date - 30, current_date)) as context_rows,
  (select count(*) from public.finance_cockpit_v2_compare(e.empresa_id, current_date - 30, current_date)) as compare_rows,
  (select count(*) from public.finance_financial_alerts_v2(e.empresa_id, current_date - 30, current_date, 100)) as alert_rows
from empresas e
order by e.empresa_id;
