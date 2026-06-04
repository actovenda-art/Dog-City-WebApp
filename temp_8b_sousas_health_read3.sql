select
  (select count(*) from public.carteira_conta cc where cc.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980' and coalesce(cc.saldo_atual, 0) < 0) as carteiras_negativas,
  (select count(*) from public.obrigacao_financeira ofn where ofn.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980' and ofn.status in ('aberta','parcial','vencida')) as obrigacoes_abertas,
  (select count(*) from public.cobranca_financeira cf where cf.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980' and cf.status in ('aberta','vencida','parcial')) as cobrancas_abertas,
  (select count(*) from public.finance_snapshot fs where fs.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980') as snapshots_total,
  (select count(*) from public.finance_snapshot_delta fd where fd.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980') as deltas_relevantes,
  (select count(*) from public.comissao_evento ce where ce.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980') as comissoes_total,
  (select count(*) from public.cancelamento_financeiro c where c.empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980') as cancelamentos_total;
