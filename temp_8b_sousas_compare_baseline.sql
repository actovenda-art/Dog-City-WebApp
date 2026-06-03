select metric_key, severity, difference_origin, payload
from public.finance_cockpit_v2_compare('992c8aa3-8c11-44a6-87fc-0346725f4980', current_date - 30, current_date)
order by metric_key;
