-- Pós-go-live 8A - Auditoria curta recorrente
-- Escopo atual: Dog City Brasil - Sousas
-- empresa_id = 992c8aa3-8c11-44a6-87fc-0346725f4980

-- 1. Flags do cockpit na unidade
select
  key,
  empresa_id,
  value ->> 'enabled' as enabled,
  updated_date
from public.app_config
where empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980'
  and key in (
    'finance.cockpit_v2_enabled',
    'finance.cockpit_v2_compare_enabled',
    'finance.financial_alerts_v2_enabled',
    'finance.reports_v2_enabled',
    'finance.legacy_cockpit_finance_disabled'
  )
order by key;

-- 2. Contexto do Cockpit V2
select *
from public.finance_cockpit_v2_context('992c8aa3-8c11-44a6-87fc-0346725f4980', current_date - 30, current_date);

-- 3. Resumo V2
select *
from public.finance_cockpit_v2_summary('992c8aa3-8c11-44a6-87fc-0346725f4980', current_date - 30, current_date);

-- 4. Comparativo legado x V2
select
  metric_key,
  metric_label,
  legacy_value,
  v2_value,
  difference_value,
  severity,
  difference_origin,
  payload
from public.finance_cockpit_v2_compare('992c8aa3-8c11-44a6-87fc-0346725f4980', current_date - 30, current_date)
order by metric_key;

-- 5. Alertas financeiros V2
select *
from public.finance_financial_alerts_v2('992c8aa3-8c11-44a6-87fc-0346725f4980', current_date - 30, current_date, 100)
order by
  case severity
    when 'critica' then 0
    when 'alta' then 1
    when 'media' then 2
    when 'baixa' then 3
    else 4
  end,
  created_date desc nulls last;

-- 6. Cobertura legado -> V2
select
  classificacao,
  motivo_cobertura,
  count(*) as itens,
  round(sum(coalesce(valor, 0)), 2) as valor_total,
  count(*) filter (where considera_no_comparativo) as itens_no_comparativo,
  count(*) filter (where precisa_virar_obrigacao_v2) as itens_para_obrigacao_v2,
  count(*) filter (where precisa_virar_cobranca_v2) as itens_para_cobranca_v2
from public.finance_cockpit_legacy_receivables_coverage('992c8aa3-8c11-44a6-87fc-0346725f4980', current_date - 30, current_date)
where status_legado <> 'pago'
group by classificacao, motivo_cobertura
order by classificacao, motivo_cobertura;

-- 7. Saúde financeira resumida
with latest_reconciliation as (
  select distinct on (cr.carteira_conta_id)
    cr.carteira_conta_id,
    cr.status
  from public.carteira_reconciliacao cr
  where cr.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980'
  order by cr.carteira_conta_id, cr.created_date desc, cr.id desc
)
select
  (select count(*) from public.carteira_conta cc where cc.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980' and coalesce(cc.saldo_atual, 0) < 0) as carteiras_negativas,
  (select count(*) from public.obrigacao_financeira ofn where ofn.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980' and ofn.status in ('aberta', 'parcial', 'vencida') and coalesce(ofn.valor_em_aberto, 0) > 0) as obrigacoes_abertas,
  (select count(*) from public.cobranca_financeira cf where cf.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980' and cf.status in ('aberta', 'parcial', 'vencida') and coalesce(cf.valor_em_aberto, 0) > 0) as cobrancas_abertas,
  (select count(*) from latest_reconciliation lr where lr.status = 'divergente') as reconciliacoes_divergentes,
  (select count(*) from public.finance_snapshot fs where fs.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980') as snapshots_total,
  (select count(*) from public.finance_snapshot_delta fsd where fsd.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980' and abs(coalesce(fsd.impacto_financeiro, 0)) > 0) as deltas_relevantes,
  (select count(*) from public.comissao_evento ce where ce.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980' and ce.status in ('concedida', 'parcialmente_estornada', 'estornada')) as comissoes_total,
  (select count(*) from public.cancelamento_financeiro cf where cf.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980') as cancelamentos_total;

-- 8. Integridade do legado preservado
select
  to_regclass('public.extratobancario') as extratobancario_table,
  to_regclass('public.conta_receber') as conta_receber_table,
  (select count(*) from public.extratobancario t where t.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980') as bank_transactions_total,
  (select count(*) from public.conta_receber cr where cr.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980') as legacy_conta_receber_total;
