-- Mantem o vencimento da carteira coerente com titulos abertos e planos futuros.
-- Titulos quitados nao sao alterados. Cobrancas bancarias ja emitidas tambem ficam
-- fora desta propagacao, pois seu vencimento pertence ao instrumento do provedor.

create or replace function public.finance_date_with_due_day(
  p_reference_date date,
  p_due_day integer
)
returns date
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select make_date(
    extract(year from p_reference_date)::integer,
    extract(month from p_reference_date)::integer,
    least(
      p_due_day,
      extract(day from (date_trunc('month', p_reference_date) + interval '1 month - 1 day'))::integer
    )
  );
$$;

create or replace function public.finance_propagate_wallet_due_day()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_due_day integer;
begin
  if new.vencimento_planos is not distinct from old.vencimento_planos then
    return new;
  end if;

  if nullif(btrim(coalesce(new.vencimento_planos, '')), '') is null then
    return new;
  end if;

  if btrim(new.vencimento_planos) !~ '^([1-9]|[12][0-9]|3[01])$' then
    raise exception 'O dia de vencimento deve estar entre 1 e 31.' using errcode = '22023';
  end if;

  v_due_day := btrim(new.vencimento_planos)::integer;

  update public.conta_receber cr
  set
    vencimento = public.finance_date_with_due_day(cr.vencimento, v_due_day),
    source_key = case
      when cr.source_key ~ '^plano_recorrente\|.+\|[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then regexp_replace(
          cr.source_key,
          '\|[0-9]{4}-[0-9]{2}-[0-9]{2}$',
          '|' || public.finance_date_with_due_day(cr.vencimento, v_due_day)::text
        )
      else cr.source_key
    end,
    metadata = jsonb_set(
      coalesce(cr.metadata, '{}'::jsonb),
      '{due_day}',
      to_jsonb(v_due_day),
      true
    ) || jsonb_build_object(
      'wallet_due_day_previous_due_date', cr.vencimento,
      'wallet_due_day_updated_at', now()
    ),
    updated_date = now()
  where cr.cliente_id = new.id
    and cr.vencimento is not null
    and cr.data_recebimento is null
    and lower(coalesce(cr.status, 'pendente')) not in (
      'pago', 'paga', 'quitado', 'quitada',
      'cancelado', 'cancelada', 'estornado', 'estornada'
    );

  update public.obrigacao_financeira ofn
  set
    due_date = public.finance_date_with_due_day(ofn.due_date, v_due_day),
    source_key = case
      when ofn.source_key ~ '^plano_recorrente\|.+\|[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then regexp_replace(
          ofn.source_key,
          '\|[0-9]{4}-[0-9]{2}-[0-9]{2}$',
          '|' || public.finance_date_with_due_day(ofn.due_date, v_due_day)::text
        )
      else ofn.source_key
    end,
    metadata = coalesce(ofn.metadata, '{}'::jsonb) || jsonb_build_object(
      'wallet_due_day_previous_due_date', ofn.due_date,
      'wallet_due_day_updated_at', now()
    ),
    lock_version = ofn.lock_version + 1,
    updated_date = now()
  where (
      ofn.carteira_id = new.id
      or exists (
        select 1
        from public.carteira_conta cc
        where cc.id = ofn.carteira_conta_id
          and cc.carteira_id = new.id
      )
    )
    and ofn.due_date is not null
    and ofn.valor_em_aberto > 0
    and ofn.status in ('aberta', 'parcial', 'vencida');

  update public.cobranca_financeira cfn
  set
    due_date = public.finance_date_with_due_day(cfn.due_date, v_due_day),
    metadata = coalesce(cfn.metadata, '{}'::jsonb) || jsonb_build_object(
      'wallet_due_day_previous_due_date', cfn.due_date,
      'wallet_due_day_updated_at', now()
    ),
    lock_version = cfn.lock_version + 1,
    updated_date = now()
  where (
      cfn.carteira_id = new.id
      or exists (
        select 1
        from public.carteira_conta cc
        where cc.id = cfn.carteira_conta_id
          and cc.carteira_id = new.id
      )
    )
    and cfn.due_date is not null
    and cfn.valor_em_aberto > 0
    and cfn.status in ('aberta', 'parcial', 'vencida');

  update public.plan_config pc
  set
    due_day = v_due_day,
    renovacao_dia = v_due_day,
    next_billing_date = case
      when pc.next_billing_date is null then null
      else public.finance_date_with_due_day(pc.next_billing_date, v_due_day)
    end,
    data_vencimento = case
      when pc.data_vencimento is null then null
      else public.finance_date_with_due_day(pc.data_vencimento, v_due_day)
    end,
    data_renovacao = case
      when pc.data_renovacao is null then null
      else public.finance_date_with_due_day(pc.data_renovacao, v_due_day)
    end,
    metadata_gerencial = case
      when pc.metadata_gerencial #>> '{first_cycle,due_date}' is not null
        and exists (
          select 1
          from public.conta_receber cr
          where cr.cliente_id = new.id
            and cr.data_recebimento is null
            and lower(coalesce(cr.status, 'pendente')) not in (
              'pago', 'paga', 'quitado', 'quitada',
              'cancelado', 'cancelada', 'estornado', 'estornada'
            )
            and cr.metadata ->> 'plan_id' = pc.id
            and coalesce((cr.metadata ->> 'first_cycle')::boolean, false)
        )
        then jsonb_set(
          coalesce(pc.metadata_gerencial, '{}'::jsonb),
          '{first_cycle,due_date}',
          to_jsonb(public.finance_date_with_due_day(
            (pc.metadata_gerencial #>> '{first_cycle,due_date}')::date,
            v_due_day
          )),
          true
        )
      else coalesce(pc.metadata_gerencial, '{}'::jsonb)
    end,
    updated_date = now()
  where coalesce(pc.carteira_id, pc.client_id, pc.cliente_id) = new.id
    and lower(coalesce(pc.status, 'ativo')) not in ('cancelado', 'cancelada', 'inativo', 'inativa');

  update public.recurring_packages rp
  set
    metadata = jsonb_set(
      coalesce(rp.metadata, '{}'::jsonb),
      '{plan_metadata,first_cycle,due_date}',
      to_jsonb(public.finance_date_with_due_day(
        (rp.metadata #>> '{plan_metadata,first_cycle,due_date}')::date,
        v_due_day
      )),
      true
    ),
    updated_at = now(),
    updated_date = now()
  where rp.client_id = new.id
    and lower(coalesce(rp.status, 'ativo')) not in ('cancelado', 'cancelada', 'inativo', 'inativa')
    and rp.metadata #>> '{plan_metadata,first_cycle,due_date}' is not null
    and exists (
      select 1
      from public.conta_receber cr
      where cr.cliente_id = new.id
        and cr.recurring_package_id = rp.id
        and cr.data_recebimento is null
        and lower(coalesce(cr.status, 'pendente')) not in (
          'pago', 'paga', 'quitado', 'quitada',
          'cancelado', 'cancelada', 'estornado', 'estornada'
        )
        and coalesce((cr.metadata ->> 'first_cycle')::boolean, false)
    );

  return new;
end;
$$;

drop trigger if exists trg_finance_propagate_wallet_due_day on public.carteira;

create trigger trg_finance_propagate_wallet_due_day
after update of vencimento_planos on public.carteira
for each row
when (old.vencimento_planos is distinct from new.vencimento_planos)
execute function public.finance_propagate_wallet_due_day();

revoke all on function public.finance_date_with_due_day(date, integer) from public;
revoke all on function public.finance_propagate_wallet_due_day() from public;

comment on function public.finance_propagate_wallet_due_day() is
  'Propaga alteracoes do vencimento da carteira somente para titulos abertos e configuracoes futuras, preservando quitados.';
