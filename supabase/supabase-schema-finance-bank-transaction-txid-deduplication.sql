-- Reconciles Banco Inter rows imported after their wallet charge was already recorded.
-- The wallet ledger amount is never changed; only transaction identity and references are consolidated.

begin;

create temporary table inter_payment_txid_duplicates on commit drop as
with identified as (
  select
    eb.*,
    coalesce(
      nullif(eb.metadata_financeira ->> 'txid', ''),
      nullif(eb.raw_data ->> 'txid', ''),
      nullif(eb.raw_data ->> 'txId', ''),
      nullif(eb.raw_data #>> '{detalhes,txid}', ''),
      nullif(eb.raw_data #>> '{detalhes,txId}', '')
    ) as canonical_txid
  from public.extratobancario eb
  where eb.source_provider in ('banco_inter', 'banco_inter_charge')
), candidates as (
  select
    canonical.id as canonical_id,
    duplicate.id as duplicate_id,
    row_number() over (
      partition by canonical.id
      order by duplicate.imported_at desc nulls last, duplicate.created_date desc nulls last, duplicate.id
    ) as merge_priority
  from identified canonical
  inner join identified duplicate
    on duplicate.empresa_id = canonical.empresa_id
   and duplicate.canonical_txid = canonical.canonical_txid
   and duplicate.id <> canonical.id
   and duplicate.tipo = canonical.tipo
   and abs(duplicate.valor - canonical.valor) < 0.005
   and abs(duplicate.data_movimento - canonical.data_movimento) <= 1
  where canonical.canonical_txid is not null
    and coalesce(canonical.metadata_financeira ->> 'payment_source', '') <> ''
    and coalesce(canonical.metadata_financeira ->> 'payment_id', '') <> ''
    and coalesce(duplicate.metadata_financeira ->> 'payment_id', '') = ''
    and nullif(duplicate.vinculo_financeiro, '') is null
)
select canonical_id, duplicate_id, merge_priority
from candidates;

with selected as (
  select pair.canonical_id, pair.duplicate_id
  from inter_payment_txid_duplicates pair
  where pair.merge_priority = 1
)
update public.extratobancario canonical
set
  descricao = coalesce(nullif(duplicate.descricao, ''), canonical.descricao),
  nome_contraparte = coalesce(nullif(duplicate.nome_contraparte, ''), canonical.nome_contraparte),
  banco_contraparte = coalesce(nullif(duplicate.banco_contraparte, ''), canonical.banco_contraparte),
  forma_pagamento = coalesce(nullif(duplicate.forma_pagamento, ''), canonical.forma_pagamento),
  tipo_transacao_detalhado = coalesce(
    nullif(duplicate.tipo_transacao_detalhado, ''),
    canonical.tipo_transacao_detalhado
  ),
  data_hora_transacao = coalesce(canonical.data_hora_transacao, duplicate.data_hora_transacao),
  raw_data = coalesce(canonical.raw_data, '{}'::jsonb)
    || coalesce(duplicate.raw_data, '{}'::jsonb)
    || jsonb_build_object(
      'nomePagador', coalesce(
        nullif(duplicate.raw_data #>> '{detalhes,nomePagador}', ''),
        nullif(duplicate.raw_data ->> 'nomePagador', ''),
        nullif(canonical.raw_data ->> 'nomePagador', '')
      ),
      'detalhes',
        coalesce(canonical.raw_data -> 'detalhes', '{}'::jsonb)
        || coalesce(duplicate.raw_data -> 'detalhes', '{}'::jsonb)
    ),
  metadata_financeira = coalesce(duplicate.metadata_financeira, '{}'::jsonb)
    || coalesce(canonical.metadata_financeira, '{}'::jsonb)
    || jsonb_build_object(
      'provider_transaction_id', duplicate.id,
      'transaction_id_source', 'api_enriched_payment_identity',
      'duplicate_reconciled_at', now()
    ),
  updated_date = now()
from selected
inner join public.extratobancario duplicate
  on duplicate.id = selected.duplicate_id
where canonical.id = selected.canonical_id;

update public.carteira_movimento movement
set transacao_id = pair.canonical_id
from inter_payment_txid_duplicates pair
where movement.transacao_id = pair.duplicate_id;

update public.despesa expense
set transacao_id = pair.canonical_id,
    updated_date = now()
from inter_payment_txid_duplicates pair
where expense.transacao_id = pair.duplicate_id;

update public.receita revenue
set transacao_id = pair.canonical_id,
    updated_date = now()
from inter_payment_txid_duplicates pair
where revenue.transacao_id = pair.duplicate_id;

delete from public.extratobancario duplicate
using inter_payment_txid_duplicates pair
where duplicate.id = pair.duplicate_id;

create unique index if not exists uq_extratobancario_empresa_inter_txid
  on public.extratobancario (
    empresa_id,
    (coalesce(
      nullif(metadata_financeira ->> 'txid', ''),
      nullif(raw_data ->> 'txid', ''),
      nullif(raw_data ->> 'txId', ''),
      nullif(raw_data #>> '{detalhes,txid}', ''),
      nullif(raw_data #>> '{detalhes,txId}', '')
    ))
  )
  where source_provider in ('banco_inter', 'banco_inter_charge')
    and coalesce(
      nullif(metadata_financeira ->> 'txid', ''),
      nullif(raw_data ->> 'txid', ''),
      nullif(raw_data ->> 'txId', ''),
      nullif(raw_data #>> '{detalhes,txid}', ''),
      nullif(raw_data #>> '{detalhes,txId}', '')
    ) is not null;

comment on index public.uq_extratobancario_empresa_inter_txid is
  'Prevents the same Banco Inter Pix txid from being represented by more than one transaction per company.';

commit;
