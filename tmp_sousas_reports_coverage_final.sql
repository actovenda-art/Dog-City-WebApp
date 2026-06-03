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
