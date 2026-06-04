select *
from public.finance_payment_v2_execution_audit('empresa_demo', 20)
order by created_date desc, execucao_id desc;
