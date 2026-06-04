select
  classificacao,
  motivo_cobertura,
  count(*) as itens,
  round(sum(coalesce(valor, 0)), 2) as valor_total,
  count(*) filter (where considera_no_comparativo) as itens_no_comparativo,
  count(*) filter (where precisa_virar_obrigacao_v2) as itens_para_obrigacao_v2,
  count(*) filter (where precisa_virar_cobranca_v2) as itens_para_cobranca_v2
from public.finance_cockpit_legacy_receivables_coverage('empresa_demo', current_date - 30, current_date)
where status_legado <> 'pago'
group by classificacao, motivo_cobertura
order by classificacao, motivo_cobertura;
