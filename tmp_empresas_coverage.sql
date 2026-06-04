with empresas as (
  select id, nome_fantasia, razao_social
  from public.empresa
), coverage as (
  select
    e.id as empresa_id,
    coalesce(nullif(e.nome_fantasia, ''), nullif(e.razao_social, ''), e.id) as empresa_nome,
    c.classificacao,
    c.motivo_cobertura,
    c.considera_no_comparativo,
    c.precisa_virar_obrigacao_v2,
    c.precisa_virar_cobranca_v2,
    c.valor,
    c.status_legado
  from empresas e
  cross join lateral public.finance_cockpit_legacy_receivables_coverage(e.id, current_date - 30, current_date) c
)
select
  empresa_id,
  empresa_nome,
  count(*) filter (where status_legado <> 'pago') as legacy_abertos_no_periodo,
  count(*) filter (where classificacao = 'A' and status_legado <> 'pago') as cobertura_correta,
  count(*) filter (where classificacao = 'B' and status_legado <> 'pago') as cobertura_faltando,
  count(*) filter (where classificacao = 'C' and status_legado <> 'pago') as legado_orfao,
  count(*) filter (where classificacao = 'D' and status_legado <> 'pago') as diferenca_esperada,
  count(*) filter (where considera_no_comparativo and status_legado <> 'pago') as itens_no_comparativo,
  count(*) filter (where precisa_virar_obrigacao_v2) as itens_para_obrigacao_v2,
  count(*) filter (where precisa_virar_cobranca_v2) as itens_para_cobranca_v2,
  round(coalesce(sum(case when status_legado <> 'pago' then coalesce(valor,0) else 0 end),0),2) as valor_aberto_total
from coverage
group by empresa_id, empresa_nome
order by empresa_id;
