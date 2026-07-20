-- Read-only audit for transaction links created from the Transactions page.

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'finance_can_link_transaction',
    'finance_guard_delete_linked_bank_transaction',
    'finance_guard_unique_payable_transaction_link',
    'finance_link_bank_entry_to_wallet',
    'finance_link_bank_output_to_payable'
  )
order by p.proname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'uq_carteira_movimento_bank_entry',
    'uq_extratobancario_payment_identity'
  )
order by indexname;

select
  c.conname,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid = 'public.carteira_movimento'::regclass
  and c.conname = 'carteira_movimento_transacao_id_fkey';

select
  t.tgname as trigger_name,
  p.proname as function_name
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.lancamento'::regclass
  and not t.tgisinternal
  and t.tgname = 'trg_finance_guard_unique_payable_transaction_link';

select
  t.tgname as trigger_name,
  p.proname as function_name
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.extratobancario'::regclass
  and not t.tgisinternal
  and t.tgname = 'trg_finance_guard_delete_linked_bank_transaction';

-- Healthy result: zero rows. A bank transaction cannot credit more than one wallet movement.
select
  empresa_id,
  transacao_id,
  count(*) as movement_count,
  array_agg(id order by created_date) as movement_ids
from public.carteira_movimento
where transacao_id is not null
  and tipo = 'entrada_direcionada'
  and natureza = 'entrada'
group by empresa_id, transacao_id
having count(*) > 1;

-- Healthy result: zero rows. Every bank-backed wallet credit must resolve to Transactions.
select
  cm.id as wallet_movement_id,
  cm.empresa_id,
  cm.carteira_conta_id,
  cm.transacao_id,
  cm.valor,
  cm.created_date
from public.carteira_movimento cm
left join public.extratobancario eb
  on eb.id = cm.transacao_id
 and eb.empresa_id = cm.empresa_id
where cm.transacao_id is not null
  and eb.id is null
order by cm.created_date desc;

-- Healthy result: zero rows. One output cannot appear in multiple payables.
with output_links as (
  select
    l.empresa_id,
    l.id as payable_id,
    link.value ->> 'transaction_id' as transaction_id
  from public.lancamento l
  cross join lateral jsonb_array_elements(coalesce(l.vinculacoes, '[]'::jsonb)) link(value)
  where coalesce(link.value ->> 'transaction_id', '') <> ''
)
select
  empresa_id,
  transaction_id,
  count(distinct payable_id) as payable_count,
  array_agg(distinct payable_id) as payable_ids
from output_links
group by empresa_id, transaction_id
having count(distinct payable_id) > 1;

-- Healthy result: zero rows. Received budget payments credited to a wallet need a canonical transaction.
select
  op.id as payment_id,
  op.empresa_id,
  op.carteira_id,
  op.codigo_solicitacao,
  op.txid,
  op.credited_wallet_movement_id
from public.orcamento_pagamento op
left join public.carteira_movimento cm
  on cm.id = op.credited_wallet_movement_id
left join public.extratobancario eb
  on eb.id = cm.transacao_id
 and eb.empresa_id = op.empresa_id
where lower(coalesce(op.status, '')) in ('pago', 'recebido')
  and op.credited_wallet_movement_id is not null
  and eb.id is null
order by op.updated_date desc;

-- Current link coverage by direction for operational monitoring.
select
  lower(coalesce(tipo, 'nao_informado')) as direction,
  count(*) filter (where coalesce(vinculo_financeiro, '') <> '') as linked_count,
  count(*) filter (where coalesce(vinculo_financeiro, '') = '') as unlinked_count,
  count(*) as total_count
from public.extratobancario
group by lower(coalesce(tipo, 'nao_informado'))
order by direction;

-- Consolidated pass/fail counters. Every issue counter must be zero.
select
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'finance_can_link_transaction',
        'finance_guard_delete_linked_bank_transaction',
        'finance_guard_unique_payable_transaction_link',
        'finance_link_bank_entry_to_wallet',
        'finance_link_bank_output_to_payable'
      )
  ) as installed_function_count,
  (
    select count(*)
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'uq_carteira_movimento_bank_entry',
        'uq_extratobancario_payment_identity'
      )
  ) as installed_guard_index_count,
  (
    select count(*)
    from pg_constraint c
    where c.conrelid = 'public.carteira_movimento'::regclass
      and c.conname = 'carteira_movimento_transacao_id_fkey'
      and pg_get_constraintdef(c.oid) ilike '%ON DELETE RESTRICT%'
  ) as installed_transaction_fk_guard_count,
  (
    select count(*)
    from pg_trigger t
    where t.tgrelid = 'public.lancamento'::regclass
      and not t.tgisinternal
      and t.tgname = 'trg_finance_guard_unique_payable_transaction_link'
  ) as installed_payable_trigger_guard_count,
  (
    select count(*)
    from pg_trigger t
    where t.tgrelid = 'public.extratobancario'::regclass
      and not t.tgisinternal
      and t.tgname = 'trg_finance_guard_delete_linked_bank_transaction'
  ) as installed_transaction_delete_guard_count,
  (
    select count(*)
    from (
      select empresa_id, transacao_id
      from public.carteira_movimento
      where transacao_id is not null
        and tipo = 'entrada_direcionada'
        and natureza = 'entrada'
      group by empresa_id, transacao_id
      having count(*) > 1
    ) duplicates
  ) as duplicate_wallet_credit_issue_count,
  (
    select count(*)
    from public.carteira_movimento cm
    left join public.extratobancario eb
      on eb.id = cm.transacao_id
     and eb.empresa_id = cm.empresa_id
    where cm.transacao_id is not null
      and eb.id is null
  ) as orphan_wallet_transaction_issue_count,
  (
    select count(*)
    from (
      select
        l.empresa_id,
        link.value ->> 'transaction_id' as transaction_id
      from public.lancamento l
      cross join lateral jsonb_array_elements(coalesce(l.vinculacoes, '[]'::jsonb)) link(value)
      where coalesce(link.value ->> 'transaction_id', '') <> ''
      group by l.empresa_id, link.value ->> 'transaction_id'
      having count(distinct l.id) > 1
    ) duplicates
  ) as duplicate_payable_output_issue_count,
  (
    select count(*)
    from public.orcamento_pagamento op
    left join public.carteira_movimento cm
      on cm.id = op.credited_wallet_movement_id
    left join public.extratobancario eb
      on eb.id = cm.transacao_id
     and eb.empresa_id = op.empresa_id
    where lower(coalesce(op.status, '')) in ('pago', 'recebido')
      and op.credited_wallet_movement_id is not null
      and eb.id is null
  ) as paid_budget_without_transaction_issue_count;
