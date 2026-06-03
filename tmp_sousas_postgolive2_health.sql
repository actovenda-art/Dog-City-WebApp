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
