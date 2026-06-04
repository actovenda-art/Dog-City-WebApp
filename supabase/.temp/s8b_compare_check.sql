select *
from public.finance_cockpit_v2_compare('empresa_demo', current_date - 30, current_date)
where metric_key in ('saldo_pendencias', 'cobrancas_abertas_vencidas')
order by metric_key;
