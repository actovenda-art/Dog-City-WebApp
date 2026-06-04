select metric_key, severity, difference_origin, payload
from public.finance_cockpit_v2_compare('empresa_demo', current_date - 30, current_date)
order by metric_key;
