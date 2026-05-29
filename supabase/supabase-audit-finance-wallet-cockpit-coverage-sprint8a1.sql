-- Sprint 8A.1 - Auditoria de cobertura Legado -> V2
-- Execute com a empresa piloto desejada.

-- 1. Itens legados classificados item a item
select
  classificacao,
  motivo_cobertura,
  conta_receber_id,
  conta_receber_empresa_id,
  cliente_id,
  cliente_nome,
  dog_id,
  servico,
  descricao,
  valor,
  vencimento,
  status_legado,
  transaction_id,
  transaction_status,
  scheduledtransaction_id,
  scheduledtransaction_status,
  recurring_package_id,
  financial_behavior,
  obrigacao_id,
  obrigacao_status,
  cobranca_id,
  cobranca_status,
  considera_no_comparativo,
  precisa_virar_obrigacao_v2,
  precisa_virar_cobranca_v2
from public.finance_cockpit_legacy_receivables_coverage('empresa_demo', current_date - 30, current_date)
where status_legado <> 'pago'
order by
  case classificacao
    when 'B' then 0
    when 'C' then 1
    when 'D' then 2
    else 3
  end,
  vencimento,
  conta_receber_id;

-- 2. Resumo da cobertura
select
  classificacao,
  count(*) as itens,
  round(sum(coalesce(valor, 0)), 2) as valor_total,
  count(*) filter (where considera_no_comparativo) as itens_no_comparativo,
  count(*) filter (where precisa_virar_obrigacao_v2) as itens_para_obrigacao_v2,
  count(*) filter (where precisa_virar_cobranca_v2) as itens_para_cobranca_v2
from public.finance_cockpit_legacy_receivables_coverage('empresa_demo', current_date - 30, current_date)
where status_legado <> 'pago'
group by classificacao
order by classificacao;

-- 3. Leitura consolidada do comparativo após a classificação
select
  metric_key,
  metric_label,
  legacy_value,
  v2_value,
  difference_value,
  severity,
  difference_origin,
  payload
from public.finance_cockpit_v2_compare('empresa_demo', current_date - 30, current_date)
where metric_key in ('saldo_pendencias', 'cobrancas_abertas_vencidas')
order by metric_key;
