with empresas as (
  select id, nome_fantasia, razao_social
  from public.empresa
)
select
  e.id as empresa_id,
  coalesce(nullif(e.nome_fantasia, ''), nullif(e.razao_social, ''), e.id) as empresa_nome,
  (select count(*) from public."transaction" t where coalesce(t.empresa_id, t.meta->>'empresa_id') = e.id) as legacy_transactions_total,
  (select round(coalesce(sum(coalesce(t.valor,0)),0),2) from public."transaction" t where coalesce(t.empresa_id, t.meta->>'empresa_id') = e.id and coalesce(t.tipo,'') in ('entrada','recebimento')) as legacy_recebimentos_total,
  (select count(*) from public.scheduledtransaction st where st.empresa_id = e.id) as legacy_scheduled_total,
  (select count(*) from public.conta_receber cr where cr.empresa_id = e.id) as legacy_conta_receber_total,
  (select round(coalesce(sum(coalesce(cr.valor,0)),0),2) from public.conta_receber cr where cr.empresa_id = e.id and cr.status <> 'pago') as legacy_conta_receber_aberto_total,
  (select count(*) from public.carteira_conta cc where cc.empresa_id = e.id) as wallet_accounts_total,
  (select count(*) from public.obrigacao_financeira ofn where ofn.empresa_id = e.id) as obrigacoes_total,
  (select round(coalesce(sum(coalesce(ofn.valor_final,0)),0),2) from public.obrigacao_financeira ofn where ofn.empresa_id = e.id) as obrigacoes_valor_total,
  (select count(*) from public.cobranca_financeira cf where cf.empresa_id = e.id) as cobrancas_total,
  (select round(coalesce(sum(coalesce(cf.valor_total,0)),0),2) from public.cobranca_financeira cf where cf.empresa_id = e.id) as cobrancas_valor_total,
  (select count(*) from public.comissao_evento ce where ce.empresa_id = e.id) as comissoes_total,
  (select count(*) from public.cancelamento_financeiro canc where canc.empresa_id = e.id) as cancelamentos_total,
  (select count(*) from public.finance_snapshot fs where fs.empresa_id = e.id) as snapshots_total
from empresas e
order by empresa_id;
