select *
from public.finance_payment_v2_reversal_audit('empresa_demo', 20)
order by created_date desc, reversao_id desc;
