-- Auditoria shadow write Sprint 2
-- Troque 'ORCAMENTO_ID_AQUI' pelo orçamento desejado.

-- 1. Resumo legado x shadow
select *
from public.finance_shadow_audit_orcamento_summary('ORCAMENTO_ID_AQUI');

-- 2. Orçamento -> obrigações
select
  o.id as orcamento_id,
  o.valor_total as legado_valor_total,
  ofn.id as obrigacao_id,
  ofn.tipo_item,
  ofn.descricao,
  ofn.service_date,
  ofn.due_date,
  ofn.valor_original,
  ofn.valor_desconto,
  ofn.valor_final,
  ofn.status,
  ofn.source_key
from public.orcamento o
left join public.obrigacao_financeira ofn on ofn.orcamento_id = o.id
where o.id = 'ORCAMENTO_ID_AQUI'
order by ofn.due_date asc nulls last, ofn.service_date asc nulls last, ofn.created_date asc nulls last, ofn.id asc nulls last;

-- 3. Obrigações -> cobrança
select
  ofn.orcamento_id,
  ofn.id as obrigacao_id,
  ofn.descricao as obrigacao_descricao,
  ofn.valor_final as obrigacao_valor,
  cfn.id as cobranca_id,
  cfn.descricao as cobranca_descricao,
  cfn.due_date as cobranca_vencimento,
  cfn.valor_total as cobranca_valor_total,
  cfn.status as cobranca_status
from public.obrigacao_financeira ofn
left join public.cobranca_item ci on ci.obrigacao_id = ofn.id
left join public.cobranca_financeira cfn on cfn.id = ci.cobranca_financeira_id
where ofn.orcamento_id = 'ORCAMENTO_ID_AQUI'
order by cfn.created_date asc nulls last, ofn.due_date asc nulls last, ofn.id asc;

-- 4. Cobrança -> itens
select
  cfn.id as cobranca_id,
  cfn.orcamento_id,
  cfn.valor_total,
  cfn.valor_em_aberto,
  cfn.status,
  ci.ordem,
  ci.valor as valor_item,
  ofn.id as obrigacao_id,
  ofn.descricao as obrigacao_descricao,
  ofn.source_key as obrigacao_source_key
from public.cobranca_financeira cfn
left join public.cobranca_item ci on ci.cobranca_financeira_id = cfn.id
left join public.obrigacao_financeira ofn on ofn.id = ci.obrigacao_id
where cfn.orcamento_id = 'ORCAMENTO_ID_AQUI'
order by cfn.created_date asc nulls last, ci.ordem asc nulls last, ci.created_date asc nulls last;

-- 5. Divergência de valor por orçamento
select
  o.id as orcamento_id,
  round(coalesce(o.valor_total, 0), 2) as legado_orcamento_total,
  round(coalesce(sum(case when ofn.status <> 'cancelada' then ofn.valor_final else 0 end), 0), 2) as shadow_obrigacoes_total,
  round(coalesce(sum(distinct case when cfn.status <> 'cancelada' then cfn.valor_total else 0 end), 0), 2) as shadow_cobrancas_total,
  round(coalesce(o.valor_total, 0) - coalesce(sum(case when ofn.status <> 'cancelada' then ofn.valor_final else 0 end), 0), 2) as divergencia_orcamento_vs_obrigacoes
from public.orcamento o
left join public.obrigacao_financeira ofn on ofn.orcamento_id = o.id
left join public.cobranca_item ci on ci.obrigacao_id = ofn.id
left join public.cobranca_financeira cfn on cfn.id = ci.cobranca_financeira_id
where o.id = 'ORCAMENTO_ID_AQUI'
group by o.id, o.valor_total;
