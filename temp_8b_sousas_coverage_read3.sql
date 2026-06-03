select *
from public.finance_cockpit_legacy_receivables_coverage('992c8aa3-8c11-44a6-87fc-0346725f4980', current_date - 30, current_date)
order by vencimento nulls last, conta_receber_id;
