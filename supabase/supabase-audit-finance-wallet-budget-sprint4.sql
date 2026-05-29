-- Sprint 4 - Auditoria manual do orçamento + carteira + consumo cronológico
-- Uso sugerido:
-- 1. Defina a empresa e a carteira abaixo
-- 2. Ative as flags apenas na empresa piloto
-- 3. Execute as consultas separadamente para comparar contexto, simulação e autorizações

-- Exemplo de parâmetros:
-- \set empresa_id 'empresa_demo'
-- \set carteira_id 'carteira_demo'
-- \set carteira_conta_id 'conta_demo'

-- 1. Conferir flags da Sprint 4
select
  cfg.key,
  cfg.empresa_id,
  cfg.value,
  cfg.updated_date
from public.app_config cfg
where cfg.key in (
  'finance.wallet_budget_balance_enabled',
  'finance.chronological_consumption_enabled',
  'finance.allow_negative_wallet_with_authorization',
  'finance.budget_authorization_enabled'
)
order by cfg.key, cfg.empresa_id nulls first;

-- 2. Conferir o contexto da carteira no orçamento
-- select *
-- from public.finance_wallet_budget_read_context(:'empresa_id', :'carteira_id');

-- 3. Conferir obrigações abertas da conta
-- select
--   ofi.id,
--   ofi.status,
--   ofi.tipo_item,
--   ofi.descricao,
--   ofi.service_date,
--   ofi.due_date,
--   ofi.valor_final,
--   ofi.valor_em_aberto,
--   ofi.source_key,
--   ofi.created_date
-- from public.obrigacao_financeira ofi
-- where ofi.carteira_conta_id = :'carteira_conta_id'
--   and ofi.status in ('aberta', 'parcial', 'vencida')
-- order by ofi.due_date asc, ofi.service_date asc, ofi.created_date asc, ofi.id asc;

-- 4. Simular consumo cronológico para um orçamento de exemplo
-- Ajuste o JSON conforme o cenário desejado.
-- select *
-- from public.finance_preview_budget_consumption(
--   p_carteira_conta_id := :'carteira_conta_id',
--   p_valor_orcamento_total := 125.00,
--   p_valor_saldo_solicitado := 125.00,
--   p_preview_items := jsonb_build_array(
--     jsonb_build_object(
--       'source_key', 'preview|orcamento|demo',
--       'descricao', 'Banho Duke',
--       'service_date', current_date + interval '3 day',
--       'due_date', current_date + interval '3 day',
--       'valor_final', 125.00,
--       'metadata', jsonb_build_object('dog_nome', 'Duke')
--     )
--   )
-- );

-- 5. Conferir autorizações já registradas para o orçamento/carteira
-- select
--   af.id,
--   af.source_key,
--   af.status,
--   af.motivo,
--   af.vencimento_novo,
--   af.usuario_id,
--   af.metadata,
--   af.created_date
-- from public.autorizacao_financeira af
-- where af.carteira_conta_id = :'carteira_conta_id'
-- order by af.created_date desc, af.id desc;
