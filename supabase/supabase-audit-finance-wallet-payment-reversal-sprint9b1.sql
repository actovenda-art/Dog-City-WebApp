select
  key,
  empresa_id,
  value ->> 'enabled' as enabled
from public.app_config
where key in (
  'finance.payment_v2_write_enabled',
  'finance.payment_v2_reversal_enabled'
)
  and (empresa_id = 'empresa_demo' or empresa_id is null)
order by key, empresa_id nulls first;

select
  id,
  empresa_id,
  saldo_atual,
  ultimo_movimento_em,
  updated_date
from public.carteira_conta
where empresa_id = 'empresa_demo'
order by updated_date desc nulls last
limit 20;

select *
from public.finance_payment_v2_reversal_audit('empresa_demo', 200)
order by created_date desc, reversao_id desc;
