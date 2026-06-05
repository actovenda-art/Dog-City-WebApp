select 
  (select count(*) from public.carteira_movimento where carteira_conta_id = 'd9b2ffcd-097d-4911-9038-0e12e22d371a') as wallet_movements,
  (select count(*) from public.orcamento_pagamento where carteira_id = 'b74aaff5-4ee3-4076-b45d-4e646de52801' and status in ('recebido','pago')) as received_budget_payments,
  (select count(*) from public.appointment where cliente_id = 'b74aaff5-4ee3-4076-b45d-4e646de52801' and orcamento_id is not null and status <> 'cancelado') as budget_appointments;
