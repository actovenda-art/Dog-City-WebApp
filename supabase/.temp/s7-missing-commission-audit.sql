select count(*) as quitadas_sem_comissao
from (
  select ofn.id
  from public.obrigacao_financeira ofn
  left join public.orcamento o on o.id = ofn.orcamento_id
  left join public.comissao_evento ce on ce.obrigacao_id = ofn.id
  where ofn.empresa_id = 'empresa_demo'
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
) s;
