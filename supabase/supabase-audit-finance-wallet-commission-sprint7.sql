\set empresa_id 'empresa_demo'

-- Auditoria Sprint 7 - Comissão por venda quitada
-- Execute manualmente após ligar as flags na empresa piloto.

-- 1. Estado das flags
select
  key,
  empresa_id,
  value,
  ativo,
  updated_date
from public.app_config
where key in (
  'finance.commission_enabled',
  'finance.commission_visualization_enabled'
)
and (empresa_id = :'empresa_id' or empresa_id is null)
order by key, empresa_id nulls first;

-- 2. Contexto administrativo da comissão
-- select *
-- from public.finance_commission_read_context(:'empresa_id');

-- 3. Lista de eventos de comissão
-- select *
-- from public.finance_commission_list(:'empresa_id', null, 200);

-- 4. Verificação rápida de duplicidade por source_key
select
  ce.source_key,
  count(*) as total
from public.comissao_evento ce
where ce.empresa_id = :'empresa_id'
group by ce.source_key
having count(*) > 1;

-- 5. Obrigações quitadas sem comissão, quando há vendedor e percentual
select
  ofn.id as obrigacao_id,
  ofn.orcamento_id,
  ofn.recurring_package_id,
  ofn.valor_final,
  o.vendedor_user_id,
  o.commission_percentual
from public.obrigacao_financeira ofn
left join public.orcamento o on o.id = ofn.orcamento_id
left join public.comissao_evento ce on ce.obrigacao_id = ofn.id
where ofn.empresa_id = :'empresa_id'
  and ofn.status = 'quitada'
  and ce.id is null
  and (
    (coalesce(nullif(trim(o.vendedor_user_id), ''), '') <> '' and coalesce(o.commission_percentual, 0) > 0)
    or exists (
      select 1
      from public.recurring_packages rp
      where rp.id = ofn.recurring_package_id
        and coalesce(nullif(trim(rp.vendedor_user_id), ''), '') <> ''
        and coalesce(rp.commission_percentual, 0) > 0
    )
  )
order by ofn.created_date desc;
