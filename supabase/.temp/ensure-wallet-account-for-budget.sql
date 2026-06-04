with ensured as (
  insert into public.carteira_conta (
    empresa_id,
    carteira_id,
    saldo_atual,
    saldo_negativo_autorizado,
    ativo,
    observacoes_financeiras,
    created_date,
    updated_date
  )
  select
    'empresa_demo',
    'b74aaff5-4ee3-4076-b45d-4e646de52801',
    0,
    false,
    true,
    'Conta criada automaticamente para viabilizar recarga de carteira por cobrança de orçamento.',
    now(),
    now()
  where not exists (
    select 1
    from public.carteira_conta cc
    where cc.empresa_id = 'empresa_demo'
      and cc.carteira_id = 'b74aaff5-4ee3-4076-b45d-4e646de52801'
  )
  returning id
), chosen as (
  select id from ensured
  union all
  select cc.id
  from public.carteira_conta cc
  where cc.empresa_id = 'empresa_demo'
    and cc.carteira_id = 'b74aaff5-4ee3-4076-b45d-4e646de52801'
  order by id
  limit 1
)
update public.orcamento_pagamento op
set carteira_conta_id = (select id from chosen),
    updated_date = now()
where op.carteira_id = 'b74aaff5-4ee3-4076-b45d-4e646de52801'
  and op.carteira_conta_id is null;

select id, empresa_id, carteira_id, saldo_atual, ativo
from public.carteira_conta
where empresa_id = 'empresa_demo'
  and carteira_id = 'b74aaff5-4ee3-4076-b45d-4e646de52801';

select id, orcamento_id, carteira_id, carteira_conta_id, status, credited_wallet_movement_id
from public.orcamento_pagamento
where carteira_id = 'b74aaff5-4ee3-4076-b45d-4e646de52801'
order by created_date desc;
