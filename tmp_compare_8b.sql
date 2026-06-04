select metric_key, legacy_value, v2_value, difference_value, severity, difference_origin, payload
from public.finance_cockpit_v2_compare('empresa_demo', current_date - 30, current_date)
where metric_key in ('recebimentos','saldo_pendencias','faturamento_real','geracao_recursos','cancelamentos_estornos','comissoes','cobrancas_abertas_vencidas')
order by metric_key;
