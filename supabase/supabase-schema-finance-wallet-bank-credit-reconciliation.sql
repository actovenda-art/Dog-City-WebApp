-- Canonical reconciliation between Banco Inter receipts and wallet credits.
-- This migration is idempotent and never creates or changes wallet ledger amounts.

begin;

with linked_budget_payments as (
  select
    op.*,
    cm.transacao_id,
    (op.pago_em at time zone 'America/Fortaleza')::date as paid_date,
    coalesce(nullif(op.metadata ->> 'responsavel_nome', ''), eb.nome_contraparte) as payer_name,
    coalesce(
      nullif(op.metadata #>> '{charge_snapshot,cobranca,origemRecebimento}', ''),
      nullif(op.metadata #>> '{webhook_last_event,origemRecebimento}', '')
    ) as receipt_origin
  from public.orcamento_pagamento op
  inner join public.carteira_movimento cm
    on cm.id = op.credited_wallet_movement_id
  inner join public.extratobancario eb
    on eb.id = cm.transacao_id
  where lower(coalesce(op.status, '')) in ('recebido', 'pago')
    and op.pago_em is not null
    and cm.transacao_id is not null
)
update public.extratobancario eb
set
  data = linked.paid_date,
  data_movimento = linked.paid_date,
  data_hora_transacao = linked.pago_em,
  tipo = 'entrada',
  valor = coalesce(nullif(linked.valor_recebido, 0), linked.valor, eb.valor),
  banco = coalesce(nullif(eb.banco, ''), 'Banco Inter'),
  nome_contraparte = coalesce(nullif(linked.payer_name, ''), eb.nome_contraparte),
  forma_pagamento = case
    when upper(coalesce(linked.receipt_origin, '')) = 'PIX' then 'Pix'
    else coalesce(nullif(eb.forma_pagamento, ''), 'Boleto bancario')
  end,
  tipo_transacao_detalhado = case
    when upper(coalesce(linked.receipt_origin, '')) = 'PIX' then 'Pix recebido'
    else coalesce(nullif(eb.tipo_transacao_detalhado, ''), 'Boleto recebido')
  end,
  referencia = coalesce(nullif(linked.txid, ''), nullif(linked.codigo_solicitacao, ''), eb.referencia),
  carteira_nome = coalesce(nullif(eb.carteira_nome, ''), nullif(linked.payer_name, '')),
  vinculo_financeiro = coalesce(nullif(eb.vinculo_financeiro, ''), linked.carteira_id),
  raw_data = coalesce(eb.raw_data, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'codigoSolicitacao', nullif(linked.codigo_solicitacao, ''),
      'txid', nullif(linked.txid, ''),
      'dataPagamento', linked.pago_em,
      'dataHoraSituacao', linked.pago_em,
      'dataEntrada', linked.paid_date,
      'valor', coalesce(nullif(linked.valor_recebido, 0), linked.valor),
      'valorTotalRecebido', coalesce(nullif(linked.valor_recebido, 0), linked.valor),
      'nomePagador', nullif(linked.payer_name, ''),
      'cpfCnpjPagador', nullif(linked.metadata ->> 'responsavel_cpf_cnpj', ''),
      'tipoTransacao', case when upper(coalesce(linked.receipt_origin, '')) = 'PIX' then 'PIX' else 'BOLETO_COBRANCA' end
    ))
    || jsonb_build_object(
      'detalhes',
      coalesce(eb.raw_data -> 'detalhes', '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
          'codigoSolicitacao', nullif(linked.codigo_solicitacao, ''),
          'txid', nullif(linked.txid, ''),
          'nomePagador', nullif(linked.payer_name, ''),
          'cpfCnpjPagador', nullif(linked.metadata ->> 'responsavel_cpf_cnpj', '')
        ))
    ),
  metadata_financeira = coalesce(eb.metadata_financeira, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'provider', 'banco_inter',
      'payment_source', 'orcamento_pagamento',
      'payment_id', linked.id,
      'codigo_solicitacao', nullif(linked.codigo_solicitacao, ''),
      'txid', nullif(linked.txid, ''),
      'original_data_movimento', coalesce(
        nullif(eb.metadata_financeira ->> 'original_data_movimento', ''),
        eb.data_movimento::text
      ),
      'payment_reconciled_at', now(),
      'transaction_id_source', 'payment_reconciled_existing_transaction'
    )),
  updated_date = now()
from linked_budget_payments linked
where eb.id = linked.transacao_id;

with linked_wallet_charges as (
  select
    charge.*,
    cm.transacao_id,
    (charge.pago_em at time zone 'America/Fortaleza')::date as paid_date,
    coalesce(nullif(charge.metadata ->> 'responsavel_nome', ''), eb.nome_contraparte) as payer_name,
    coalesce(
      nullif(charge.metadata #>> '{charge_snapshot,cobranca,origemRecebimento}', ''),
      nullif(charge.metadata #>> '{webhook_last_event,origemRecebimento}', '')
    ) as receipt_origin
  from public.carteira_cobranca charge
  inner join public.carteira_movimento cm
    on cm.id = charge.credited_wallet_movement_id
  inner join public.extratobancario eb
    on eb.id = cm.transacao_id
  where lower(coalesce(charge.status, '')) = 'recebido'
    and charge.pago_em is not null
    and cm.transacao_id is not null
)
update public.extratobancario eb
set
  data = linked.paid_date,
  data_movimento = linked.paid_date,
  data_hora_transacao = linked.pago_em,
  tipo = 'entrada',
  valor = coalesce(nullif(linked.valor_recebido, 0), linked.valor, eb.valor),
  banco = coalesce(nullif(eb.banco, ''), 'Banco Inter'),
  nome_contraparte = coalesce(nullif(linked.payer_name, ''), eb.nome_contraparte),
  forma_pagamento = case
    when upper(coalesce(linked.receipt_origin, '')) = 'PIX' then 'Pix'
    else coalesce(nullif(eb.forma_pagamento, ''), 'Boleto bancario')
  end,
  tipo_transacao_detalhado = case
    when upper(coalesce(linked.receipt_origin, '')) = 'PIX' then 'Pix recebido'
    else coalesce(nullif(eb.tipo_transacao_detalhado, ''), 'Boleto recebido')
  end,
  referencia = coalesce(nullif(linked.txid, ''), nullif(linked.codigo_solicitacao, ''), eb.referencia),
  carteira_nome = coalesce(nullif(eb.carteira_nome, ''), nullif(linked.payer_name, '')),
  vinculo_financeiro = coalesce(nullif(eb.vinculo_financeiro, ''), linked.carteira_id),
  raw_data = coalesce(eb.raw_data, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'codigoSolicitacao', nullif(linked.codigo_solicitacao, ''),
      'txid', nullif(linked.txid, ''),
      'dataPagamento', linked.pago_em,
      'dataHoraSituacao', linked.pago_em,
      'dataEntrada', linked.paid_date,
      'valor', coalesce(nullif(linked.valor_recebido, 0), linked.valor),
      'valorTotalRecebido', coalesce(nullif(linked.valor_recebido, 0), linked.valor),
      'nomePagador', nullif(linked.payer_name, ''),
      'cpfCnpjPagador', nullif(linked.metadata ->> 'responsavel_cpf_cnpj', ''),
      'tipoTransacao', case when upper(coalesce(linked.receipt_origin, '')) = 'PIX' then 'PIX' else 'BOLETO_COBRANCA' end
    ))
    || jsonb_build_object(
      'detalhes',
      coalesce(eb.raw_data -> 'detalhes', '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
          'codigoSolicitacao', nullif(linked.codigo_solicitacao, ''),
          'txid', nullif(linked.txid, ''),
          'nomePagador', nullif(linked.payer_name, ''),
          'cpfCnpjPagador', nullif(linked.metadata ->> 'responsavel_cpf_cnpj', '')
        ))
    ),
  metadata_financeira = coalesce(eb.metadata_financeira, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'provider', 'banco_inter',
      'payment_source', 'carteira_cobranca',
      'payment_id', linked.id,
      'codigo_solicitacao', nullif(linked.codigo_solicitacao, ''),
      'txid', nullif(linked.txid, ''),
      'original_data_movimento', coalesce(
        nullif(eb.metadata_financeira ->> 'original_data_movimento', ''),
        eb.data_movimento::text
      ),
      'payment_reconciled_at', now(),
      'transaction_id_source', 'payment_reconciled_existing_transaction'
    )),
  updated_date = now()
from linked_wallet_charges linked
where eb.id = linked.transacao_id;

create unique index if not exists uq_extratobancario_payment_identity
  on public.extratobancario (
    empresa_id,
    (metadata_financeira ->> 'payment_source'),
    (metadata_financeira ->> 'payment_id')
  )
  where coalesce(metadata_financeira ->> 'payment_source', '') <> ''
    and coalesce(metadata_financeira ->> 'payment_id', '') <> '';

comment on index public.uq_extratobancario_payment_identity is
  'Prevents more than one bank transaction from representing the same received wallet payment.';

commit;
