-- Sprint 3 - Queries de auditoria da carteira e movimentacoes
-- Execute apos a Sprint 3 para conferir saldo persistido vs razao.

-- 1. Feature flags da Sprint 3
select
  key,
  empresa_id,
  coalesce((value ->> 'enabled')::boolean, false) as enabled,
  updated_date
from public.app_config
where key in (
  'finance.wallet_balance_read_enabled',
  'finance.wallet_movements_enabled',
  'finance.wallet_manual_adjustments_enabled'
)
order by key, empresa_id nulls first;

-- 2. Resumo administrativo das contas
select *
from public.finance_wallet_admin_read_accounts('<empresa_id>');

-- 3. Auditoria saldo persistido vs razao
select *
from public.finance_wallet_admin_audit_accounts('<empresa_id>');

-- 4. Ultimos movimentos da empresa
select *
from public.finance_wallet_admin_read_movements('<empresa_id>', null, 50);

-- 5. Ultimos movimentos de uma conta especifica
select *
from public.finance_wallet_admin_read_movements('<empresa_id>', '<carteira_conta_id>', 50);

-- 6. Ultimas reconciliacoes registradas
select
  cr.created_date,
  cr.carteira_conta_id,
  cc.carteira_id,
  c.nome_razao_social,
  cr.saldo_persistido,
  cr.saldo_recalculado,
  cr.diferenca,
  cr.status,
  cr.metadata
from public.carteira_reconciliacao cr
inner join public.carteira_conta cc on cc.id = cr.carteira_conta_id
inner join public.carteira c on c.id = cc.carteira_id
where cc.empresa_id = '<empresa_id>'
order by cr.created_date desc, cr.id desc
limit 50;
