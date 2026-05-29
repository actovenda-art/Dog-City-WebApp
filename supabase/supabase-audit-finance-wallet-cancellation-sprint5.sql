-- Sprint 5 - Auditoria manual de cancelamento V2, multas e créditos
-- Uso sugerido:
-- 1. Defina empresa, carteira_conta e orçamento
-- 2. Ligue as flags apenas na empresa piloto
-- 3. Compare cancelamentos, movimentos e obrigação após cada cenário

-- Exemplo de parâmetros:
-- \set empresa_id 'empresa_demo'
-- \set carteira_conta_id 'conta_demo'
-- \set orcamento_id 'orcamento_demo'

-- 1. Conferir flags da Sprint 5
select
  cfg.key,
  cfg.empresa_id,
  cfg.value,
  cfg.updated_date
from public.app_config cfg
where cfg.key in (
  'finance.cancellation_v2_enabled',
  'finance.compensatory_credit_enabled',
  'finance.manual_credit_enabled',
  'finance.cancellation_penalty_enabled'
)
order by cfg.key, cfg.empresa_id nulls first;

-- 2. Conferir obrigações abertas/parciais/quitadas do orçamento
-- select
--   ofi.id,
--   ofi.status,
--   ofi.tipo_item,
--   ofi.descricao,
--   ofi.service_date,
--   ofi.due_date,
--   ofi.valor_final,
--   ofi.valor_em_aberto,
--   ofi.cancelado_motivo,
--   ofi.source_key,
--   ofi.metadata,
--   ofi.updated_date
-- from public.obrigacao_financeira ofi
-- where ofi.orcamento_id = :'orcamento_id'
-- order by ofi.created_date asc, ofi.id asc;

-- 3. Conferir cancelamentos financeiros gerados
-- select
--   cf.id,
--   cf.origem_cancelamento,
--   cf.aplicar_multa,
--   cf.percentual_multa,
--   cf.valor_multa,
--   cf.gerar_credito_compensatorio,
--   cf.valor_credito_compensatorio,
--   cf.status,
--   cf.motivo,
--   cf.multa_movimento_id,
--   cf.credito_movimento_id,
--   cf.source_key,
--   cf.metadata,
--   cf.created_date
-- from public.cancelamento_financeiro cf
-- where cf.orcamento_id = :'orcamento_id'
-- order by cf.created_date desc, cf.id desc;

-- 4. Conferir movimentos da carteira relacionados a multa / crédito
-- select
--   cm.id,
--   cm.tipo,
--   cm.natureza,
--   cm.origem,
--   cm.valor,
--   cm.referencia_amigavel,
--   cm.descricao,
--   cm.obrigacao_id,
--   cm.orcamento_id,
--   cm.saldo_anterior,
--   cm.saldo_final,
--   cm.operacao_idempotencia,
--   cm.metadata,
--   cm.created_date
-- from public.carteira_movimento cm
-- where cm.carteira_conta_id = :'carteira_conta_id'
--   and (
--     cm.tipo in ('multa', 'credito_compensatorio', 'credito_manual', 'estorno_manual', 'ajuste_manual')
--     or cm.origem in ('cancellation_penalty', 'cancellation_compensation')
--   )
-- order by cm.created_date desc, cm.id desc;

-- 5. Conferir saldo persistido vs razão
-- select
--   cc.id,
--   cc.saldo_atual,
--   cc.ultimo_movimento_em,
--   cc.ultima_reconciliacao_em,
--   lr.status as reconciliacao_status,
--   lr.diferenca as reconciliacao_diferenca
-- from public.carteira_conta cc
-- left join lateral (
--   select cr.status, cr.diferenca
--   from public.carteira_reconciliacao cr
--   where cr.carteira_conta_id = cc.id
--   order by cr.created_date desc, cr.id desc
--   limit 1
-- ) lr on true
-- where cc.id = :'carteira_conta_id';

-- 6. Conferir reconciliações recentes
-- select
--   cr.id,
--   cr.status,
--   cr.saldo_persistido,
--   cr.saldo_recalculado,
--   cr.diferenca,
--   cr.metadata,
--   cr.created_date
-- from public.carteira_reconciliacao cr
-- where cr.carteira_conta_id = :'carteira_conta_id'
-- order by cr.created_date desc, cr.id desc
-- limit 20;
