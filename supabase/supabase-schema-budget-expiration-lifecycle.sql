begin;

create or replace function public.finance_budget_service_types_match(
  p_appointment_service text,
  p_financial_service text
)
returns boolean
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(p_appointment_service, '')), '') is null then true
    when nullif(trim(coalesce(p_financial_service, '')), '') is null then true
    when lower(trim(p_appointment_service)) = lower(trim(p_financial_service)) then true
    when lower(trim(p_appointment_service)) = 'hospedagem'
      and lower(trim(p_financial_service)) in ('hospedagem', 'hospedagem_diaria', 'pernoite', 'pernoite_daycare') then true
    when lower(trim(p_appointment_service)) in ('day_care', 'day care', 'daycare')
      and lower(trim(p_financial_service)) in ('day_care', 'day care', 'daycare', 'pernoite_daycare') then true
    when lower(trim(p_appointment_service)) in ('banho_tosa', 'banho & tosa', 'banho e tosa')
      and lower(trim(p_financial_service)) in ('banho', 'tosa', 'banho_tosa', 'banho & tosa', 'banho e tosa') then true
    else false
  end;
$$;

create or replace function public.finance_budget_record_matches_appointment(
  p_appointment_id text,
  p_appointment_source_key text,
  p_appointment_dog_id text,
  p_appointment_service text,
  p_appointment_start_date date,
  p_appointment_end_date date,
  p_record_appointment_id text,
  p_record_source_key text,
  p_record_dog_id text,
  p_record_service text,
  p_record_date date
)
returns boolean
language sql
immutable
as $$
  select
    (
      nullif(trim(coalesce(p_record_appointment_id, '')), '') is not null
      and p_record_appointment_id = p_appointment_id
    )
    or (
      nullif(trim(coalesce(p_appointment_source_key, '')), '') is not null
      and regexp_replace(coalesce(p_record_source_key, ''), '^shadow\|', '') = p_appointment_source_key
    )
    or (
      nullif(trim(coalesce(p_appointment_dog_id, '')), '') is not null
      and p_record_dog_id = p_appointment_dog_id
      and p_record_date between p_appointment_start_date and p_appointment_end_date
      and public.finance_budget_service_types_match(p_appointment_service, p_record_service)
    );
$$;

create or replace function public.finance_expire_budgets(
  p_empresa_id text default null,
  p_orcamento_id text default null,
  p_reference_date date default null
)
returns table (
  processed_budgets integer,
  expired_budgets integer,
  removed_appointments integer,
  preserved_appointments integer,
  cancelled_obligations integer,
  removed_receivables integer,
  expired_payments integer
)
language plpgsql
as $$
declare
  v_reference_date date := coalesce(
    p_reference_date,
    (now() at time zone 'America/Fortaleza')::date
  );
  v_budget public.orcamento%rowtype;
  v_appointment public.appointment%rowtype;
  v_has_checkin boolean;
  v_has_payment boolean;
  v_preserve_reason text;
  v_open_amount numeric(14, 2);
  v_rows integer;
  v_processed_budgets integer := 0;
  v_expired_budgets integer := 0;
  v_removed_appointments integer := 0;
  v_preserved_appointments integer := 0;
  v_cancelled_obligations integer := 0;
  v_removed_receivables integer := 0;
  v_expired_payments integer := 0;
begin
  create temporary table if not exists finance_budget_expiry_appointments (
    appointment_id text primary key
  ) on commit drop;

  for v_budget in
    select o.*
    from public.orcamento o
    where o.data_validade is not null
      and o.data_validade < v_reference_date
      and (p_empresa_id is null or o.empresa_id = p_empresa_id)
      and (p_orcamento_id is null or o.id = p_orcamento_id)
      and (
        lower(coalesce(o.status, '')) in ('rascunho', 'enviado', 'aprovado')
        or exists (
          select 1
          from public.orcamento_pagamento op
          where op.orcamento_id = o.id
            and op.empresa_id = o.empresa_id
            and lower(coalesce(op.status, '')) not in ('recebido', 'pago', 'baixado', 'cancelado', 'cancelada', 'expirado')
        )
        or exists (
          select 1
          from public.appointment a
          where a.empresa_id = o.empresa_id
            and (
              a.orcamento_id = o.id
              or a.metadata ->> 'orcamento_id' = o.id
              or (
                a.source_type = 'orcamento_aprovado'
                and a.source_key like concat('orcamento|', o.id, '|%')
              )
            )
            and coalesce(a.metadata ->> 'budget_expiry_processed_for', '') <> o.id
        )
      )
    order by o.data_validade, o.id
    for update
  loop
    perform pg_advisory_xact_lock(hashtextextended(concat('budget-expiry|', v_budget.empresa_id, '|', v_budget.id), 0));
    v_processed_budgets := v_processed_budgets + 1;

    truncate table finance_budget_expiry_appointments;

    with recursive linked_appointments as (
      select a.id, a.source_key, a.metadata
      from public.appointment a
      where a.empresa_id = v_budget.empresa_id
        and (
          a.orcamento_id = v_budget.id
          or a.metadata ->> 'orcamento_id' = v_budget.id
          or (
            a.source_type = 'orcamento_aprovado'
            and a.source_key like concat('orcamento|', v_budget.id, '|%')
          )
        )

      union

      select child.id, child.source_key, child.metadata
      from public.appointment child
      join linked_appointments parent on (
        child.metadata ->> 'replacement_of_appointment_id' = parent.id
        or child.metadata ->> 'replacement_of_source_key' = parent.source_key
        or child.source_key like concat('reposicao_pacote|', parent.id, '|%')
        or parent.metadata ->> 'replacement_scheduled_appointment_id' = child.id
        or parent.metadata ->> 'replacement_scheduled_source_key' = child.source_key
      )
      where child.empresa_id = v_budget.empresa_id
    )
    insert into finance_budget_expiry_appointments (appointment_id)
    select distinct id
    from linked_appointments
    where id is not null
    on conflict (appointment_id) do nothing;

    for v_appointment in
      select a.*
      from public.appointment a
      join finance_budget_expiry_appointments scoped on scoped.appointment_id = a.id
      order by coalesce(a.data_referencia, a.data_hora_entrada::date), a.id
      for update
    loop
      select
        a.linked_checkin_id is not null
        or lower(coalesce(a.status, '')) in ('presente', 'finalizado', 'concluido', 'realizado')
        or exists (
          select 1
          from public.checkins ch
          where ch.empresa_id = a.empresa_id
            and (
              ch.appointment_id = a.id
              or ch.id = a.linked_checkin_id
              or ch.metadata ->> 'appointment_id' = a.id
              or (
                nullif(a.source_key, '') is not null
                and ch.metadata ->> 'appointment_source_key' = a.source_key
              )
            )
            and (
              ch.checkin_datetime is not null
              or ch.data_checkin is not null
              or lower(coalesce(ch.status, '')) in ('presente', 'finalizado', 'concluido', 'realizado')
            )
        )
      into v_has_checkin
      from public.appointment a
      where a.id = v_appointment.id;

      select
        exists (
          select 1
          from public.orcamento_pagamento op
          where op.empresa_id = v_budget.empresa_id
            and op.orcamento_id = v_budget.id
            and (
              lower(coalesce(op.status, '')) in ('recebido', 'pago')
              or op.pago_em is not null
              or op.credited_wallet_movement_id is not null
            )
        )
        or exists (
          select 1
          from public.obrigacao_financeira ofn
          where ofn.empresa_id = v_budget.empresa_id
            and ofn.orcamento_id = v_budget.id
            and public.finance_budget_record_matches_appointment(
              v_appointment.id,
              v_appointment.source_key,
              v_appointment.dog_id,
              v_appointment.service_type,
              coalesce(v_appointment.data_referencia, v_appointment.data_hora_entrada::date),
              coalesce(v_appointment.data_hora_saida::date, v_appointment.data_referencia, v_appointment.data_hora_entrada::date),
              ofn.appointment_id,
              ofn.source_key,
              ofn.metadata ->> 'dog_id',
              ofn.tipo_item,
              ofn.service_date
            )
            and (
              lower(coalesce(ofn.status, '')) in ('quitada', 'parcial')
              or coalesce(ofn.valor_em_aberto, 0) <= 0
              or coalesce(ofn.valor_em_aberto, 0) < coalesce(ofn.valor_final, ofn.valor_original, 0)
            )
        )
        or exists (
          select 1
          from public.conta_receber cr
          where cr.empresa_id = v_budget.empresa_id
            and cr.orcamento_id = v_budget.id
            and public.finance_budget_record_matches_appointment(
              v_appointment.id,
              v_appointment.source_key,
              v_appointment.dog_id,
              v_appointment.service_type,
              coalesce(v_appointment.data_referencia, v_appointment.data_hora_entrada::date),
              coalesce(v_appointment.data_hora_saida::date, v_appointment.data_referencia, v_appointment.data_hora_entrada::date),
              cr.appointment_id,
              cr.source_key,
              cr.dog_id,
              coalesce(cr.tipo_agendamento, cr.servico),
              coalesce(cr.data_prestacao, cr.vencimento)
            )
            and (
              cr.data_recebimento is not null
              or lower(coalesce(cr.status, '')) in ('pago', 'quitado', 'quitada', 'recebido')
            )
        )
        or exists (
          select 1
          from public.carteira_movimento cm
          where cm.empresa_id = v_budget.empresa_id
            and cm.appointment_id = v_appointment.id
        )
        or lower(coalesce(v_appointment.metadata ->> 'payment_status', '')) in ('pago', 'quitado', 'quitada', 'recebido')
      into v_has_payment;

      if v_has_checkin
        or v_has_payment
        or exists (
          select 1
          from public.cancelamento_financeiro cf
          where cf.empresa_id = v_budget.empresa_id
            and cf.appointment_id = v_appointment.id
        ) then
        v_preserve_reason := case
          when v_has_checkin then 'checkin_or_operational_record'
          when v_has_payment then 'payment_evidence'
          else 'financial_cancellation_history'
        end;

        update public.appointment
        set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'budget_expiry_processed_for', v_budget.id,
          'budget_expiry_preserved', true,
          'budget_expiry_preserve_reason', v_preserve_reason,
          'budget_expired_on', v_reference_date,
          'budget_expiry_processed_at', now()
        )
        where id = v_appointment.id;

        update public.obrigacao_financeira ofn
        set metadata = coalesce(ofn.metadata, '{}'::jsonb) || jsonb_build_object(
          'budget_expiry_preserved', true,
          'budget_expiry_preserve_reason', v_preserve_reason,
          'budget_expired_on', v_reference_date
        )
        where ofn.empresa_id = v_budget.empresa_id
          and ofn.orcamento_id = v_budget.id
          and public.finance_budget_record_matches_appointment(
            v_appointment.id,
            v_appointment.source_key,
            v_appointment.dog_id,
            v_appointment.service_type,
            coalesce(v_appointment.data_referencia, v_appointment.data_hora_entrada::date),
            coalesce(v_appointment.data_hora_saida::date, v_appointment.data_referencia, v_appointment.data_hora_entrada::date),
            ofn.appointment_id,
            ofn.source_key,
            ofn.metadata ->> 'dog_id',
            ofn.tipo_item,
            ofn.service_date
          );

        v_preserved_appointments := v_preserved_appointments + 1;
      else
        update public.obrigacao_financeira ofn
        set
          status = 'cancelada',
          valor_em_aberto = 0,
          cancelado_motivo = 'Orçamento expirado antes do pagamento e da utilização do serviço.',
          updated_date = now(),
          metadata = coalesce(ofn.metadata, '{}'::jsonb) || jsonb_build_object(
            'budget_expiry_cancelled', true,
            'budget_expired_on', v_reference_date,
            'budget_expiry_appointment_id', v_appointment.id
          )
        where ofn.empresa_id = v_budget.empresa_id
          and ofn.orcamento_id = v_budget.id
          and lower(coalesce(ofn.status, '')) in ('aberta', 'vencida')
          and public.finance_budget_record_matches_appointment(
            v_appointment.id,
            v_appointment.source_key,
            v_appointment.dog_id,
            v_appointment.service_type,
            coalesce(v_appointment.data_referencia, v_appointment.data_hora_entrada::date),
            coalesce(v_appointment.data_hora_saida::date, v_appointment.data_referencia, v_appointment.data_hora_entrada::date),
            ofn.appointment_id,
            ofn.source_key,
            ofn.metadata ->> 'dog_id',
            ofn.tipo_item,
            ofn.service_date
          );
        get diagnostics v_rows = row_count;
        v_cancelled_obligations := v_cancelled_obligations + v_rows;

        delete from public.conta_receber cr
        where cr.empresa_id = v_budget.empresa_id
          and cr.orcamento_id = v_budget.id
          and cr.data_recebimento is null
          and lower(coalesce(cr.status, '')) not in ('pago', 'quitado', 'quitada', 'recebido')
          and public.finance_budget_record_matches_appointment(
            v_appointment.id,
            v_appointment.source_key,
            v_appointment.dog_id,
            v_appointment.service_type,
            coalesce(v_appointment.data_referencia, v_appointment.data_hora_entrada::date),
            coalesce(v_appointment.data_hora_saida::date, v_appointment.data_referencia, v_appointment.data_hora_entrada::date),
            cr.appointment_id,
            cr.source_key,
            cr.dog_id,
            coalesce(cr.tipo_agendamento, cr.servico),
            coalesce(cr.data_prestacao, cr.vencimento)
          );
        get diagnostics v_rows = row_count;
        v_removed_receivables := v_removed_receivables + v_rows;

        delete from public.serviceprovided sp
        where sp.empresa_id = v_budget.empresa_id
          and sp.appointment_id = v_appointment.id
          and sp.checkin_id is null;

        delete from public.replacement r
        where r.empresa_id = v_budget.empresa_id
          and (
            r.referencia_id = v_appointment.id
            or r.detalhe ->> 'appointment_id' = v_appointment.id
            or r.detalhe ->> 'source_appointment_id' = v_appointment.id
            or r.detalhe ->> 'original_appointment_id' = v_appointment.id
            or r.detalhe ->> 'linked_appointment_id' = v_appointment.id
            or r.detalhe ->> 'replacement_of_appointment_id' = v_appointment.id
          );

        delete from public.appointment
        where id = v_appointment.id;

        v_removed_appointments := v_removed_appointments + 1;
      end if;
    end loop;

    update public.obrigacao_financeira ofn
    set
      status = 'cancelada',
      valor_em_aberto = 0,
      cancelado_motivo = 'Orçamento expirado sem agendamento pago ou utilizado.',
      updated_date = now(),
      metadata = coalesce(ofn.metadata, '{}'::jsonb) || jsonb_build_object(
        'budget_expiry_cancelled', true,
        'budget_expired_on', v_reference_date
      )
    where ofn.empresa_id = v_budget.empresa_id
      and ofn.orcamento_id = v_budget.id
      and lower(coalesce(ofn.status, '')) in ('aberta', 'vencida')
      and not exists (
        select 1
        from finance_budget_expiry_appointments scoped
        join public.appointment a on a.id = scoped.appointment_id
        where public.finance_budget_record_matches_appointment(
          a.id,
          a.source_key,
          a.dog_id,
          a.service_type,
          coalesce(a.data_referencia, a.data_hora_entrada::date),
          coalesce(a.data_hora_saida::date, a.data_referencia, a.data_hora_entrada::date),
          ofn.appointment_id,
          ofn.source_key,
          ofn.metadata ->> 'dog_id',
          ofn.tipo_item,
          ofn.service_date
        )
      );
    get diagnostics v_rows = row_count;
    v_cancelled_obligations := v_cancelled_obligations + v_rows;

    delete from public.conta_receber cr
    where cr.empresa_id = v_budget.empresa_id
      and cr.orcamento_id = v_budget.id
      and cr.data_recebimento is null
      and lower(coalesce(cr.status, '')) not in ('pago', 'quitado', 'quitada', 'recebido')
      and not exists (
        select 1
        from finance_budget_expiry_appointments scoped
        join public.appointment a on a.id = scoped.appointment_id
        where public.finance_budget_record_matches_appointment(
          a.id,
          a.source_key,
          a.dog_id,
          a.service_type,
          coalesce(a.data_referencia, a.data_hora_entrada::date),
          coalesce(a.data_hora_saida::date, a.data_referencia, a.data_hora_entrada::date),
          cr.appointment_id,
          cr.source_key,
          cr.dog_id,
          coalesce(cr.tipo_agendamento, cr.servico),
          coalesce(cr.data_prestacao, cr.vencimento)
        )
      );
    get diagnostics v_rows = row_count;
    v_removed_receivables := v_removed_receivables + v_rows;

    select coalesce(sum(ofn.valor_em_aberto), 0)
    into v_open_amount
    from public.obrigacao_financeira ofn
    where ofn.empresa_id = v_budget.empresa_id
      and ofn.orcamento_id = v_budget.id
      and lower(coalesce(ofn.status, '')) not in ('cancelada', 'estornada', 'quitada');

    update public.cobranca_financeira cfn
    set
      valor_em_aberto = round(v_open_amount, 2),
      status = case
        when v_open_amount <= 0 then 'cancelada'
        when v_open_amount < cfn.valor_total then 'parcial'
        when cfn.due_date < v_reference_date then 'vencida'
        else 'aberta'
      end,
      updated_date = now(),
      metadata = coalesce(cfn.metadata, '{}'::jsonb) || jsonb_build_object(
        'budget_expiry_reconciled', true,
        'budget_expired_on', v_reference_date
      )
    where cfn.empresa_id = v_budget.empresa_id
      and cfn.orcamento_id = v_budget.id
      and lower(coalesce(cfn.status, '')) <> 'quitada';

    update public.orcamento_pagamento op
    set
      status = 'expirado',
      linha_digitavel = null,
      codigo_barras = null,
      pix_copia_cola = null,
      pdf_disponivel = false,
      updated_date = now(),
      metadata = coalesce(op.metadata, '{}'::jsonb) || jsonb_build_object(
        'budget_expired_on', v_reference_date,
        'budget_expiry_blocked_bank_refresh', true
      )
    where op.empresa_id = v_budget.empresa_id
      and op.orcamento_id = v_budget.id
      and lower(coalesce(op.status, '')) not in ('recebido', 'pago', 'baixado', 'cancelado', 'cancelada', 'expirado');
    get diagnostics v_rows = row_count;
    v_expired_payments := v_expired_payments + v_rows;

    if lower(coalesce(v_budget.status, '')) in ('rascunho', 'enviado', 'aprovado') then
      update public.orcamento
      set
        status = 'expirado',
        updated_date = now()
      where id = v_budget.id;
      v_expired_budgets := v_expired_budgets + 1;
    end if;
  end loop;

  return query select
    v_processed_budgets,
    v_expired_budgets,
    v_removed_appointments,
    v_preserved_appointments,
    v_cancelled_obligations,
    v_removed_receivables,
    v_expired_payments;
end;
$$;

comment on function public.finance_expire_budgets(text, text, date) is
  'Expira orçamentos vencidos e remove apenas agendamentos simultaneamente não pagos e sem check-in, preservando histórico utilizado ou liquidado.';

grant execute on function public.finance_expire_budgets(text, text, date) to authenticated, service_role;

do $$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for v_job_id in
      select jobid
      from cron.job
      where jobname = 'finance-expire-budgets-daily'
    loop
      perform cron.unschedule(v_job_id);
    end loop;

    perform cron.schedule(
      'finance-expire-budgets-daily',
      '5 3 * * *',
      'select public.finance_expire_budgets();'
    );
  end if;
end;
$$;

commit;
