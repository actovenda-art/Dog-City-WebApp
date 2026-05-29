with params as (
  select 'empresa_demo'::text as empresa_id
), legacy_receivables as (
  select cr.id as conta_receber_id, cr.empresa_id as conta_receber_empresa_id, cr.cliente_id, c.nome_razao_social as cliente_nome,
         cr.dog_id, cr.descricao, cr.servico, cr.valor, cr.vencimento, cr.data_recebimento, cr.status as status_legado,
         tx.id as transaction_id, st.id as scheduledtransaction_id, cc.id as carteira_conta_id,
         rp.id as recurring_package_id, rp.financial_behavior
  from public.conta_receber cr
  left join public.carteira c on c.id = cr.cliente_id
  left join public.carteira_conta cc on cc.carteira_id = cr.cliente_id
  left join public."transaction" tx on tx.referencia = cr.id
  left join public.scheduledtransaction st on st.empresa_id is not distinct from cr.empresa_id and lower(coalesce(st.descricao, '')) like '%' || lower(coalesce(cr.servico, '')) || '%'
  left join public.recurring_packages rp on rp.client_id = cr.cliente_id and rp.pet_id is not distinct from cr.dog_id and rp.service_id is not distinct from cr.servico and rp.status in ('ativo', 'paused', 'inativo')
), coverage as (
  select lr.*, ofn.id as obrigacao_id, cf.id as cobranca_id
  from legacy_receivables lr
  left join lateral (
    select o.* from public.obrigacao_financeira o join params p on true
    where o.empresa_id = p.empresa_id and o.carteira_id = lr.cliente_id
      and (o.source_key = 'legacy_conta_receber|' || lr.conta_receber_id or (o.due_date = lr.vencimento and round(coalesce(o.valor_final,0),2)=round(coalesce(lr.valor,0),2) and lower(coalesce(o.descricao,'')) like '%' || lower(coalesce(lr.servico,'')) || '%'))
    order by case when o.source_key = 'legacy_conta_receber|' || lr.conta_receber_id then 0 else 1 end, o.created_date desc
    limit 1
  ) ofn on true
  left join lateral (
    select cfin.* from public.cobranca_financeira cfin join params p on true
    where cfin.empresa_id = p.empresa_id and cfin.carteira_conta_id = lr.carteira_conta_id
      and (cfin.source_key = 'legacy_conta_receber|' || lr.conta_receber_id or (cfin.due_date = lr.vencimento and round(coalesce(cfin.valor_total,0),2)=round(coalesce(lr.valor,0),2)))
    order by case when cfin.source_key = 'legacy_conta_receber|' || lr.conta_receber_id then 0 else 1 end, cfin.created_date desc
    limit 1
  ) cf on true
), classified as (
  select c.*, case
      when c.conta_receber_empresa_id is not null and c.conta_receber_empresa_id <> p.empresa_id then 'D'
      when c.conta_receber_empresa_id is null then 'C'
      when c.financial_behavior = 'operational_only' then 'D'
      when c.obrigacao_id is not null and c.cobranca_id is not null then 'A'
      when c.obrigacao_id is not null and c.cobranca_id is null then 'B'
      when c.obrigacao_id is null and c.cobranca_id is null then 'B'
      else 'D'
    end as classificacao,
    case when c.conta_receber_empresa_id = p.empresa_id and c.financial_behavior is distinct from 'operational_only' and c.obrigacao_id is null then true else false end as precisa_virar_obrigacao_v2,
    case when c.conta_receber_empresa_id = p.empresa_id and c.financial_behavior is distinct from 'operational_only' and c.cobranca_id is null then true else false end as precisa_virar_cobranca_v2
  from coverage c join params p on true
)
select classificacao, count(*) as itens, round(sum(coalesce(valor,0)),2) as valor_total,
       count(*) filter (where precisa_virar_obrigacao_v2) as itens_para_obrigacao_v2,
       count(*) filter (where precisa_virar_cobranca_v2) as itens_para_cobranca_v2
from classified
where status_legado <> 'pago'
group by classificacao
order by classificacao;
