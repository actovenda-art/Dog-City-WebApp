select
  op.id,
  op.created_date,
  op.updated_date,
  op.empresa_id,
  op.orcamento_id,
  op.carteira_id,
  op.carteira_conta_id,
  op.status,
  op.valor,
  op.valor_recebido,
  op.codigo_solicitacao,
  op.credited_wallet_movement_id,
  op.creditado_em,
  op.metadata->>'responsavel_nome' as responsavel_nome,
  op.metadata->>'reissued_from_payment_id' as reissued_from_payment_id
from orcamento_pagamento op
order by op.created_date desc
limit 10;
