begin;

with before_counts as (
  select
    (select coalesce(count(*),0) from public."transaction") as tx_count,
    (select coalesce(count(*),0) from public.scheduledtransaction) as st_count,
    (select coalesce(count(*),0) from public.conta_receber) as cr_count,
    (select coalesce(count(*),0) from public.finance_snapshot) as fs_count,
    (select coalesce(count(*),0) from public.finance_snapshot_delta) as fsd_count,
    (select coalesce(count(*),0) from public.carteira_movimento) as cm_count,
    (select coalesce(count(*),0) from public.carteira_conta where empresa_id = 'empresa_demo' and saldo_atual <> 0) as nonzero_wallets
), flip as (
  update public.app_config
  set value = jsonb_build_object('enabled', true), updated_date = now()
  where key = 'finance.legacy_cockpit_finance_disabled'
    and empresa_id = 'empresa_demo'
  returning key, empresa_id, value->>'enabled' as enabled
), state_during as (
  select key, empresa_id, value->>'enabled' as enabled
  from public.app_config
  where key = 'finance.legacy_cockpit_finance_disabled'
    and empresa_id = 'empresa_demo'
), after_counts as (
  select
    (select coalesce(count(*),0) from public."transaction") as tx_count,
    (select coalesce(count(*),0) from public.scheduledtransaction) as st_count,
    (select coalesce(count(*),0) from public.conta_receber) as cr_count,
    (select coalesce(count(*),0) from public.finance_snapshot) as fs_count,
    (select coalesce(count(*),0) from public.finance_snapshot_delta) as fsd_count,
    (select coalesce(count(*),0) from public.carteira_movimento) as cm_count,
    (select coalesce(count(*),0) from public.carteira_conta where empresa_id = 'empresa_demo' and saldo_atual <> 0) as nonzero_wallets
), context as (
  select * from public.finance_cockpit_v2_context('empresa_demo', current_date - 30, current_date)
), summary as (
  select * from public.finance_cockpit_v2_summary('empresa_demo', current_date - 30, current_date)
)
select jsonb_build_object(
  'flag_during', (select to_jsonb(sd) from state_during sd limit 1),
  'before_counts', (select to_jsonb(bc) from before_counts bc),
  'after_counts', (select to_jsonb(ac) from after_counts ac),
  'context', (select to_jsonb(c) from context c limit 1),
  'summary', (select to_jsonb(s) from summary s limit 1)
) as simulation_result;

rollback;

select key, empresa_id, value->>'enabled' as enabled
from public.app_config
where key = 'finance.legacy_cockpit_finance_disabled'
  and empresa_id = 'empresa_demo';
