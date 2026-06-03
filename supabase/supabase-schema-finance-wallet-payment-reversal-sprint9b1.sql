-- Sprint 9B.1 - Payment V2 Reversal (Corte 2)
-- Objetivo:
-- 1. Implementar estorno controlado de saldo e de servico sem abrir rollout
-- 2. Exigir motivo e anexo obrigatorios
-- 3. Manter legado preservado e auditoria explicita
--
-- Importante:
-- - Nao inicia rollout
-- - Nao desliga legado
-- - Nao implementa Cobranca V2
-- - Nao reabre obrigacao apos estorno de servico

create extension if not exists pgcrypto;

alter table if exists public.serviceprovided
  add column if not exists status text default 'registrado',
  add column if not exists status_pagamento text default 'pendente',
  add column if not exists estornado_em timestamptz,
  add column if not exists estornado_motivo text;

update public.serviceprovided
set
  status = coalesce(nullif(trim(status), ''), 'registrado'),
  status_pagamento = coalesce(nullif(trim(status_pagamento), ''), 'pendente')
where true;

create table if not exists public.pagamento_v2_reversao (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  carteira_conta_id text not null references public.carteira_conta(id) on delete cascade,
  pagamento_v2_execucao_id text null references public.pagamento_v2_execucao(id) on delete set null,
  appointment_id text null references public.appointment(id) on delete set null,
  serviceprovided_id text null references public.serviceprovided(id) on delete set null,
  obrigacao_id text null references public.obrigacao_financeira(id) on delete set null,
  cobranca_financeira_id text null references public.cobranca_financeira(id) on delete set null,
  conta_receber_id text null references public.conta_receber(id) on delete set null,
  carteira_movimento_id text null references public.carteira_movimento(id) on delete set null,
  reversao_tipo text not null,
  operacao_idempotencia text not null,
  source_key text not null,
  motivo text not null,
  attachment_name text not null,
  attachment_path text not null,
  attachment_extension text not null,
  valor_estornado numeric(14,2) not null default 0,
  servico_realizado boolean null,
  classe_resultado text not null,
  reason_code text null,
  reason_message text null,
  usuario_id text null references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  constraint uq_pagamento_v2_reversao_empresa_operacao unique (empresa_id, operacao_idempotencia),
  constraint chk_pagamento_v2_reversao_tipo
    check (reversao_tipo in ('saldo','servico')),
  constraint chk_pagamento_v2_reversao_classe
    check (classe_resultado in ('executado','idempotente_reutilizado','rejeitado_negocio','falha_controlada')),
  constraint chk_pagamento_v2_reversao_valor
    check (valor_estornado >= 0 and valor_estornado = round(valor_estornado, 2))
);

create index if not exists idx_pagamento_v2_reversao_empresa_data
  on public.pagamento_v2_reversao(empresa_id, created_date desc, id desc);

create index if not exists idx_pagamento_v2_reversao_obrigacao
  on public.pagamento_v2_reversao(obrigacao_id, created_date desc);

create index if not exists idx_pagamento_v2_reversao_appointment
  on public.pagamento_v2_reversao(appointment_id, created_date desc);

drop trigger if exists trg_pagamento_v2_reversao_updated_date on public.pagamento_v2_reversao;
create trigger trg_pagamento_v2_reversao_updated_date
before update on public.pagamento_v2_reversao
for each row
execute function public.finance_set_updated_date();

drop function if exists public.finance_ensure_payment_v2_reversal_feature_flags();

create or replace function public.finance_ensure_payment_v2_reversal_feature_flags()
returns table (
  flag_key text,
  scoped_empresa_id text,
  enabled boolean
)
language plpgsql
as $$
declare
  v_empresa record;
begin
  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.payment_v2_reversal_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.payment_v2_reversal_enabled',
      'Finance - Payment V2 Reversal Enabled',
      'Habilita o estorno controlado do Payment V2.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'empresa'
  ) then
    for v_empresa in
      select e.id from public.empresa e
    loop
      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.payment_v2_reversal_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.payment_v2_reversal_enabled',
          'Finance - Payment V2 Reversal Enabled',
          'Habilita o estorno controlado do Payment V2.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;
    end loop;
  end if;

  return query
  select
    cfg.key,
    cfg.empresa_id,
    coalesce((cfg.value ->> 'enabled')::boolean, false) as enabled
  from public.app_config cfg
  where cfg.key = 'finance.payment_v2_reversal_enabled'
  order by cfg.key, cfg.empresa_id nulls first;
end;
$$;

drop function if exists public.finance_payment_v2_reverse(
  text, text, text, text, text, text, text, text, numeric, text, text, text, text, text, text, jsonb
);

create or replace function public.finance_payment_v2_reverse(
  p_empresa_id text,
  p_carteira_conta_id text,
  p_reversao_tipo text,
  p_operacao_idempotencia text,
  p_source_key text,
  p_motivo text,
  p_attachment_name text,
  p_attachment_path text,
  p_valor numeric default null,
  p_appointment_id text default null,
  p_serviceprovided_id text default null,
  p_obrigacao_id text default null,
  p_cobranca_financeira_id text default null,
  p_conta_receber_id text default null,
  p_usuario_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  reversao_id text,
  classe_resultado text,
  reversao_tipo text,
  carteira_movimento_id text,
  carteira_conta_id text,
  appointment_id text,
  serviceprovided_id text,
  obrigacao_id text,
  cobranca_financeira_id text,
  conta_receber_id text,
  operacao_idempotencia text,
  source_key text,
  valor_estornado numeric,
  saldo_anterior numeric,
  saldo_final numeric,
  servico_realizado boolean,
  reason_code text,
  reason_message text,
  reused boolean
)
language plpgsql
as $$
declare
  v_existing public.pagamento_v2_reversao%rowtype;
  v_carteira_conta public.carteira_conta%rowtype;
  v_pagamento_execucao public.pagamento_v2_execucao%rowtype;
  v_service public.serviceprovided%rowtype;
  v_appointment public.appointment%rowtype;
  v_obrigacao public.obrigacao_financeira%rowtype;
  v_cobranca public.cobranca_financeira%rowtype;
  v_conta_receber public.conta_receber%rowtype;
  v_wallet_result record;
  v_wallet_movimento_id text := null;
  v_wallet_saldo_anterior numeric := null;
  v_wallet_saldo_final numeric := null;
  v_now timestamptz := now();
  v_attachment_extension text;
  v_reason_code text := null;
  v_reason_message text := null;
  v_charge_item_count integer := 0;
  v_service_count integer := 0;
  v_servico_realizado boolean := null;
  v_valor_pago_total numeric(14,2) := 0;
  v_valor_final_servico numeric(14,2) := 0;
  v_status_obrigacao_final text := 'cancelada';
  v_reversao public.pagamento_v2_reversao%rowtype;
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  if coalesce(trim(p_carteira_conta_id), '') = '' then
    raise exception 'p_carteira_conta_id e obrigatorio.';
  end if;

  if coalesce(trim(p_operacao_idempotencia), '') = '' then
    raise exception 'p_operacao_idempotencia e obrigatorio.';
  end if;

  select *
    into v_existing
  from public.pagamento_v2_reversao pvr
  where pvr.empresa_id = p_empresa_id
    and pvr.operacao_idempotencia = p_operacao_idempotencia
  limit 1;

  if found then
    reversao_id := v_existing.id;
    classe_resultado := case
      when v_existing.classe_resultado = 'executado' then 'idempotente_reutilizado'
      else v_existing.classe_resultado
    end;
    reversao_tipo := v_existing.reversao_tipo;
    carteira_movimento_id := v_existing.carteira_movimento_id;
    carteira_conta_id := v_existing.carteira_conta_id;
    appointment_id := v_existing.appointment_id;
    serviceprovided_id := v_existing.serviceprovided_id;
    obrigacao_id := v_existing.obrigacao_id;
    cobranca_financeira_id := v_existing.cobranca_financeira_id;
    conta_receber_id := v_existing.conta_receber_id;
    operacao_idempotencia := v_existing.operacao_idempotencia;
    source_key := v_existing.source_key;
    valor_estornado := v_existing.valor_estornado;
    servico_realizado := v_existing.servico_realizado;
    reason_code := v_existing.reason_code;
    reason_message := v_existing.reason_message;
    reused := true;

    if v_existing.carteira_movimento_id is not null then
      select cm.saldo_anterior, cm.saldo_final
        into saldo_anterior, saldo_final
      from public.carteira_movimento cm
      where cm.id = v_existing.carteira_movimento_id;
    else
      saldo_anterior := null;
      saldo_final := null;
    end if;

    return next;
    return;
  end if;

  select *
    into v_carteira_conta
  from public.carteira_conta cc
  where cc.id = p_carteira_conta_id
    and cc.empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'carteira_conta % nao encontrada para a empresa %.', p_carteira_conta_id, p_empresa_id;
  end if;

  if not public.finance_get_feature_flag('finance.payment_v2_reversal_enabled', p_empresa_id) then
    v_reason_code := 'payment_v2_reversal_disabled';
    v_reason_message := format('Feature flag finance.payment_v2_reversal_enabled esta desligada para a empresa %s.', p_empresa_id);
  elsif coalesce(trim(p_reversao_tipo), '') not in ('saldo', 'servico') then
    v_reason_code := 'reversao_tipo_invalido';
    v_reason_message := 'p_reversao_tipo deve ser saldo ou servico.';
  elsif coalesce(trim(p_source_key), '') = '' then
    v_reason_code := 'source_key_required';
    v_reason_message := 'p_source_key e obrigatorio.';
  elsif coalesce(trim(p_motivo), '') = '' then
    v_reason_code := 'motivo_required';
    v_reason_message := 'p_motivo e obrigatorio.';
  elsif coalesce(trim(p_attachment_name), '') = '' then
    v_reason_code := 'attachment_name_required';
    v_reason_message := 'p_attachment_name e obrigatorio.';
  elsif coalesce(trim(p_attachment_path), '') = '' then
    v_reason_code := 'attachment_path_required';
    v_reason_message := 'p_attachment_path e obrigatorio.';
  end if;

  v_attachment_extension := lower(
    coalesce(
      nullif(regexp_replace(trim(coalesce(p_attachment_name, '')), '^.*(\.[^.]+)$', '\1'), trim(coalesce(p_attachment_name, ''))),
      nullif(regexp_replace(trim(coalesce(p_attachment_path, '')), '^.*(\.[^.]+)$', '\1'), trim(coalesce(p_attachment_path, '')))
    )
  );

  if v_reason_code is null and coalesce(v_attachment_extension, '') not in ('.pdf', '.doc', '.txt', '.img', '.jpg', '.png') then
    v_reason_code := 'attachment_extension_invalid';
    v_reason_message := format(
      'Extensao de anexo invalida: %s. Tipos aceitos: .pdf, .doc, .txt, .img, .jpg, .png.',
      coalesce(v_attachment_extension, '<vazia>')
    );
  end if;

  if v_reason_code is not null then
    insert into public.pagamento_v2_reversao (
      empresa_id,
      carteira_conta_id,
      reversao_tipo,
      operacao_idempotencia,
      source_key,
      motivo,
      attachment_name,
      attachment_path,
      attachment_extension,
      valor_estornado,
      classe_resultado,
      reason_code,
      reason_message,
      usuario_id,
      metadata
    )
    values (
      p_empresa_id,
      p_carteira_conta_id,
      coalesce(nullif(trim(p_reversao_tipo), ''), 'saldo'),
      p_operacao_idempotencia,
      coalesce(nullif(trim(p_source_key), ''), '__invalid__'),
      coalesce(nullif(trim(p_motivo), ''), '__invalid__'),
      coalesce(nullif(trim(p_attachment_name), ''), '__invalid__'),
      coalesce(nullif(trim(p_attachment_path), ''), '__invalid__'),
      coalesce(v_attachment_extension, '__invalid__'),
      0,
      'rejeitado_negocio',
      v_reason_code,
      v_reason_message,
      p_usuario_id,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'payment_v2_reverse',
        'contract_scope', 'sprint9b1_cut2',
        'authority_scope', 'payment_v2_reversal',
        'rejected_before_resolution', true
      )
    )
    returning * into v_reversao;

    reversao_id := v_reversao.id;
    classe_resultado := 'rejeitado_negocio';
    reversao_tipo := v_reversao.reversao_tipo;
    carteira_movimento_id := null;
    carteira_conta_id := v_reversao.carteira_conta_id;
    appointment_id := null;
    serviceprovided_id := null;
    obrigacao_id := null;
    cobranca_financeira_id := null;
    conta_receber_id := null;
    operacao_idempotencia := v_reversao.operacao_idempotencia;
    source_key := v_reversao.source_key;
    valor_estornado := 0;
    saldo_anterior := null;
    saldo_final := null;
    servico_realizado := null;
    reason_code := v_reversao.reason_code;
    reason_message := v_reversao.reason_message;
    reused := false;
    return next;
    return;
  end if;

  if p_reversao_tipo = 'saldo' then
    if p_valor is null or round(p_valor, 2) <= 0 then
      v_reason_code := 'saldo_reversal_value_required';
      v_reason_message := 'p_valor deve ser maior que zero para estorno de saldo.';
    elsif round(coalesce(v_carteira_conta.saldo_atual, 0), 2) <= 0 then
      v_reason_code := 'saldo_positivo_indisponivel';
      v_reason_message := 'Nao ha saldo positivo disponivel para estorno.';
    elsif round(p_valor, 2) > round(coalesce(v_carteira_conta.saldo_atual, 0), 2) then
      v_reason_code := 'saldo_reversal_exceeds_balance';
      v_reason_message := format(
        'Valor solicitado para estorno (%s) excede o saldo positivo atual (%s).',
        round(p_valor, 2),
        round(coalesce(v_carteira_conta.saldo_atual, 0), 2)
      );
    end if;

    if v_reason_code is not null then
      insert into public.pagamento_v2_reversao (
        empresa_id,
        carteira_conta_id,
        reversao_tipo,
        operacao_idempotencia,
        source_key,
        motivo,
        attachment_name,
        attachment_path,
        attachment_extension,
        valor_estornado,
        classe_resultado,
        reason_code,
        reason_message,
        usuario_id,
        metadata
      )
      values (
        p_empresa_id,
        p_carteira_conta_id,
        'saldo',
        p_operacao_idempotencia,
        p_source_key,
        trim(p_motivo),
        trim(p_attachment_name),
        trim(p_attachment_path),
        v_attachment_extension,
        coalesce(round(p_valor, 2), 0),
        'rejeitado_negocio',
        v_reason_code,
        v_reason_message,
        p_usuario_id,
        coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
          'source', 'payment_v2_reverse',
          'contract_scope', 'sprint9b1_cut2',
          'authority_scope', 'payment_v2_reversal',
          'reversal_scope', 'saldo'
        )
      )
      returning * into v_reversao;

      reversao_id := v_reversao.id;
      classe_resultado := 'rejeitado_negocio';
      reversao_tipo := 'saldo';
      carteira_movimento_id := null;
      carteira_conta_id := v_reversao.carteira_conta_id;
      appointment_id := null;
      serviceprovided_id := null;
      obrigacao_id := null;
      cobranca_financeira_id := null;
      conta_receber_id := null;
      operacao_idempotencia := v_reversao.operacao_idempotencia;
      source_key := v_reversao.source_key;
      valor_estornado := v_reversao.valor_estornado;
      saldo_anterior := null;
      saldo_final := null;
      servico_realizado := null;
      reason_code := v_reversao.reason_code;
      reason_message := v_reversao.reason_message;
      reused := false;
      return next;
      return;
    end if;

    select *
      into v_wallet_result
    from public.finance_apply_wallet_operation(
      p_carteira_conta_id := p_carteira_conta_id,
      p_operacao_idempotencia := p_operacao_idempotencia,
      p_tipo := 'estorno',
      p_natureza := 'saida',
      p_origem := 'payment_v2_reversal_saldo',
      p_valor := round(p_valor, 2),
      p_referencia_amigavel := 'Estorno de saldo - Payment V2',
      p_descricao := trim(p_motivo),
      p_orcamento_id := null,
      p_appointment_id := null,
      p_obrigacao_id := null,
      p_transacao_id := null,
      p_autorizacao_financeira_id := null,
      p_usuario_id := p_usuario_id,
      p_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'payment_v2_reverse',
        'contract_scope', 'sprint9b1_cut2',
        'reversal_scope', 'saldo',
        'attachment_name', trim(p_attachment_name),
        'attachment_path', trim(p_attachment_path),
        'attachment_extension', v_attachment_extension,
        'authority_scope', 'payment_v2_reversal'
      ),
      p_permitir_saldo_negativo := false
    );

    insert into public.pagamento_v2_reversao (
      empresa_id,
      carteira_conta_id,
      carteira_movimento_id,
      reversao_tipo,
      operacao_idempotencia,
      source_key,
      motivo,
      attachment_name,
      attachment_path,
      attachment_extension,
      valor_estornado,
      classe_resultado,
      usuario_id,
      metadata
    )
    values (
      p_empresa_id,
      p_carteira_conta_id,
      v_wallet_result.movimento_id,
      'saldo',
      p_operacao_idempotencia,
      trim(p_source_key),
      trim(p_motivo),
      trim(p_attachment_name),
      trim(p_attachment_path),
      v_attachment_extension,
      round(p_valor, 2),
      'executado',
      p_usuario_id,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'payment_v2_reverse',
        'contract_scope', 'sprint9b1_cut2',
        'reversal_scope', 'saldo',
        'authority_scope', 'payment_v2_reversal'
      )
    )
    returning * into v_reversao;

    reversao_id := v_reversao.id;
    classe_resultado := 'executado';
    reversao_tipo := 'saldo';
    carteira_movimento_id := v_reversao.carteira_movimento_id;
    carteira_conta_id := v_reversao.carteira_conta_id;
    appointment_id := null;
    serviceprovided_id := null;
    obrigacao_id := null;
    cobranca_financeira_id := null;
    conta_receber_id := null;
    operacao_idempotencia := v_reversao.operacao_idempotencia;
    source_key := v_reversao.source_key;
    valor_estornado := v_reversao.valor_estornado;
    saldo_anterior := v_wallet_result.saldo_anterior;
    saldo_final := v_wallet_result.saldo_final;
    servico_realizado := null;
    reason_code := null;
    reason_message := null;
    reused := false;
    return next;
    return;
  end if;

  if coalesce(trim(p_serviceprovided_id), '') <> '' then
    select *
      into v_service
    from public.serviceprovided sp
    where sp.id = p_serviceprovided_id
      and sp.empresa_id = p_empresa_id
    limit 1;

    if not found then
      v_reason_code := 'serviceprovided_not_found';
      v_reason_message := format('serviceprovided %s nao encontrado para a empresa %s.', p_serviceprovided_id, p_empresa_id);
    end if;
  elsif coalesce(trim(p_appointment_id), '') <> '' then
    select count(*)::integer
      into v_service_count
    from public.serviceprovided sp
    where sp.empresa_id = p_empresa_id
      and sp.appointment_id = p_appointment_id;

    if v_service_count > 1 then
      v_reason_code := 'multiple_serviceprovided_for_appointment';
      v_reason_message := format('appointment %s possui multiplos servicesprovided. Informe p_serviceprovided_id explicitamente.', p_appointment_id);
    elsif v_service_count = 1 then
      select *
        into v_service
      from public.serviceprovided sp
      where sp.empresa_id = p_empresa_id
        and sp.appointment_id = p_appointment_id
      limit 1;
    end if;
  end if;

  if v_reason_code is null then
    if coalesce(trim(p_appointment_id), '') <> '' then
      select *
        into v_appointment
      from public.appointment ap
      where ap.id = p_appointment_id
        and ap.empresa_id = p_empresa_id
      limit 1;
    elsif coalesce(v_service.appointment_id, '') <> '' then
      select *
        into v_appointment
      from public.appointment ap
      where ap.id = v_service.appointment_id
        and ap.empresa_id = p_empresa_id
      limit 1;
    end if;

    if coalesce(trim(p_appointment_id), '') <> '' and coalesce(v_appointment.id, '') = '' then
      v_reason_code := 'appointment_not_found';
      v_reason_message := format('appointment %s nao encontrado para a empresa %s.', p_appointment_id, p_empresa_id);
    end if;

    if v_reason_code is null and coalesce(trim(p_obrigacao_id), '') <> '' then
      select *
        into v_obrigacao
      from public.obrigacao_financeira ofn
      where ofn.id = p_obrigacao_id
        and ofn.empresa_id = p_empresa_id
        and ofn.carteira_conta_id = p_carteira_conta_id
      limit 1;
    elsif coalesce(v_appointment.id, '') <> '' then
      select *
        into v_obrigacao
      from public.obrigacao_financeira ofn
      where ofn.empresa_id = p_empresa_id
        and ofn.carteira_conta_id = p_carteira_conta_id
        and ofn.appointment_id = v_appointment.id
      order by ofn.created_date desc, ofn.id desc
      limit 1;
    end if;

    if v_reason_code is null
       and coalesce(trim(p_obrigacao_id), '') <> ''
       and coalesce(v_obrigacao.id, '') = '' then
      v_reason_code := 'obrigacao_not_found';
      v_reason_message := format('obrigacao_financeira %s nao encontrada para a empresa %s.', p_obrigacao_id, p_empresa_id);
    end if;

    if v_reason_code is null and coalesce(trim(p_conta_receber_id), '') <> '' then
      select *
        into v_conta_receber
      from public.conta_receber cr
      where cr.id = p_conta_receber_id
        and cr.empresa_id = p_empresa_id
      limit 1;
    elsif coalesce(v_appointment.id, '') <> '' then
      select *
        into v_conta_receber
      from public.conta_receber cr
      where cr.empresa_id = p_empresa_id
        and cr.appointment_id = v_appointment.id
      order by cr.created_date desc, cr.id desc
      limit 1;
    end if;

    if v_reason_code is null
       and coalesce(trim(p_conta_receber_id), '') <> ''
       and coalesce(v_conta_receber.id, '') = '' then
      v_reason_code := 'conta_receber_not_found';
      v_reason_message := format('conta_receber %s nao encontrada para a empresa %s.', p_conta_receber_id, p_empresa_id);
    end if;

    if v_reason_code is null and coalesce(trim(p_cobranca_financeira_id), '') <> '' then
      select *
        into v_cobranca
      from public.cobranca_financeira cf
      where cf.id = p_cobranca_financeira_id
        and cf.empresa_id = p_empresa_id
        and cf.carteira_conta_id = p_carteira_conta_id
      limit 1;
    elsif coalesce(v_obrigacao.id, '') <> '' then
      select cf.*
        into v_cobranca
      from public.cobranca_financeira cf
      join public.cobranca_item ci
        on ci.cobranca_financeira_id = cf.id
       and ci.obrigacao_id = v_obrigacao.id
      where cf.empresa_id = p_empresa_id
        and cf.carteira_conta_id = p_carteira_conta_id
      order by cf.created_date desc, cf.id desc
      limit 1;
    end if;

    if v_reason_code is null
       and coalesce(trim(p_cobranca_financeira_id), '') <> ''
       and coalesce(v_cobranca.id, '') = '' then
      v_reason_code := 'charge_not_found';
      v_reason_message := format('cobranca_financeira %s nao encontrada para a empresa %s.', p_cobranca_financeira_id, p_empresa_id);
    end if;

    if v_reason_code is null
       and coalesce(v_service.id, '') = ''
       and coalesce(v_appointment.id, '') = ''
       and coalesce(v_obrigacao.id, '') = ''
       and coalesce(v_conta_receber.id, '') = '' then
      v_reason_code := 'service_reversal_target_not_found';
      v_reason_message := 'Nao foi possivel localizar servico, agendamento ou obrigacao para o estorno de servico.';
    end if;
  end if;

  if v_reason_code is null and coalesce(v_obrigacao.id, '') <> '' then
    if v_obrigacao.status in ('cancelada', 'estornada') then
      v_reason_code := 'service_already_reversed';
      v_reason_message := format('Obrigacao %s ja esta com status %s.', v_obrigacao.id, v_obrigacao.status);
    else
      v_valor_pago_total := round(greatest(coalesce(v_obrigacao.valor_final, 0) - coalesce(v_obrigacao.valor_em_aberto, 0), 0), 2);
      v_valor_final_servico := round(
        greatest(
          coalesce(v_service.valor_cobrado, v_service.preco, 0),
          coalesce(v_conta_receber.valor, 0),
          coalesce(v_obrigacao.valor_final, v_obrigacao.valor_original, 0),
          coalesce(v_appointment.valor_previsto, 0)
        ),
        2
      );

      if v_valor_final_servico <= 0 then
        v_reason_code := 'service_value_not_found';
        v_reason_message := 'Nao foi possivel determinar um valor positivo para o servico a ser estornado.';
      elsif v_valor_pago_total > 0 and v_valor_pago_total <> round(coalesce(v_obrigacao.valor_final, v_valor_final_servico), 2) then
        v_reason_code := 'partial_paid_service_reversal_out_of_scope';
        v_reason_message := format(
          'Pagamento parcial nao esta no escopo do corte atual. Valor pago %s difere do valor final %s.',
          v_valor_pago_total,
          round(coalesce(v_obrigacao.valor_final, v_valor_final_servico), 2)
        );
      elsif v_valor_pago_total > 0 and round(coalesce(v_carteira_conta.saldo_atual, 0), 2) < v_valor_pago_total then
        v_reason_code := 'insufficient_positive_balance_for_service_reversal';
        v_reason_message := format(
          'Saldo atual %s insuficiente para estornar o servico no valor de %s.',
          round(coalesce(v_carteira_conta.saldo_atual, 0), 2),
          v_valor_pago_total
        );
      end if;
    end if;
  else
    v_valor_final_servico := round(
      greatest(
        coalesce(v_service.valor_cobrado, v_service.preco, 0),
        coalesce(v_conta_receber.valor, 0),
        coalesce(v_appointment.valor_previsto, 0)
      ),
      2
    );
  end if;

  if v_reason_code is null and coalesce(v_cobranca.id, '') <> '' then
    select count(*)::integer
      into v_charge_item_count
    from public.cobranca_item ci
    where ci.cobranca_financeira_id = v_cobranca.id;

    if v_charge_item_count > 1 then
      v_reason_code := 'multi_charge_reversal_out_of_scope';
      v_reason_message := format(
        'Cobranca %s possui %s itens e o estorno de servico no corte atual exige cobranca de item unico.',
        v_cobranca.id,
        v_charge_item_count
      );
    end if;
  end if;

  if v_reason_code is null then
    select exists (
      select 1
      from public.checkins ch
      where (
        (coalesce(v_service.checkin_id, '') <> '' and ch.id = v_service.checkin_id)
        or (coalesce(v_appointment.linked_checkin_id, '') <> '' and ch.id = v_appointment.linked_checkin_id)
        or (coalesce(v_appointment.id, '') <> '' and ch.appointment_id = v_appointment.id)
      )
        and (
          ch.checkin_datetime is not null
          or ch.checkout_datetime is not null
          or ch.data_checkin is not null
          or ch.data_checkout is not null
        )
    ) into v_servico_realizado;

    if not coalesce(v_servico_realizado, false)
       and coalesce(v_appointment.id, '') = ''
       and coalesce(v_service.id, '') = '' then
      v_reason_code := 'service_target_missing_for_removal';
      v_reason_message := 'Estorno de servico sem servico/agendamento identificado nao pode ser processado.';
    end if;
  end if;

  if v_reason_code is not null then
    insert into public.pagamento_v2_reversao (
      empresa_id,
      carteira_conta_id,
      appointment_id,
      serviceprovided_id,
      obrigacao_id,
      cobranca_financeira_id,
      conta_receber_id,
      reversao_tipo,
      operacao_idempotencia,
      source_key,
      motivo,
      attachment_name,
      attachment_path,
      attachment_extension,
      valor_estornado,
      servico_realizado,
      classe_resultado,
      reason_code,
      reason_message,
      usuario_id,
      metadata
    )
    values (
      p_empresa_id,
      p_carteira_conta_id,
      nullif(v_appointment.id, ''),
      nullif(v_service.id, ''),
      nullif(v_obrigacao.id, ''),
      nullif(v_cobranca.id, ''),
      nullif(v_conta_receber.id, ''),
      'servico',
      p_operacao_idempotencia,
      trim(p_source_key),
      trim(p_motivo),
      trim(p_attachment_name),
      trim(p_attachment_path),
      v_attachment_extension,
      round(coalesce(v_valor_pago_total, 0), 2),
      v_servico_realizado,
      'rejeitado_negocio',
      v_reason_code,
      v_reason_message,
      p_usuario_id,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'payment_v2_reverse',
        'contract_scope', 'sprint9b1_cut2',
        'authority_scope', 'payment_v2_reversal',
        'reversal_scope', 'servico'
      )
    )
    returning * into v_reversao;

    reversao_id := v_reversao.id;
    classe_resultado := 'rejeitado_negocio';
    reversao_tipo := 'servico';
    carteira_movimento_id := null;
    carteira_conta_id := v_reversao.carteira_conta_id;
    appointment_id := v_reversao.appointment_id;
    serviceprovided_id := v_reversao.serviceprovided_id;
    obrigacao_id := v_reversao.obrigacao_id;
    cobranca_financeira_id := v_reversao.cobranca_financeira_id;
    conta_receber_id := v_reversao.conta_receber_id;
    operacao_idempotencia := v_reversao.operacao_idempotencia;
    source_key := v_reversao.source_key;
    valor_estornado := v_reversao.valor_estornado;
    saldo_anterior := null;
    saldo_final := null;
    servico_realizado := v_reversao.servico_realizado;
    reason_code := v_reversao.reason_code;
    reason_message := v_reversao.reason_message;
    reused := false;
    return next;
    return;
  end if;

  if coalesce(v_obrigacao.id, '') <> '' then
    select *
      into v_pagamento_execucao
    from public.pagamento_v2_execucao pve
    where pve.empresa_id = p_empresa_id
      and pve.obrigacao_id = v_obrigacao.id
      and pve.classe_resultado = 'executado'
    order by pve.created_date desc, pve.id desc
    limit 1;
  end if;

  if v_valor_pago_total > 0 then
    select *
      into v_wallet_result
    from public.finance_apply_wallet_operation(
      p_carteira_conta_id := p_carteira_conta_id,
      p_operacao_idempotencia := p_operacao_idempotencia,
      p_tipo := 'estorno',
      p_natureza := 'saida',
      p_origem := 'payment_v2_reversal_servico',
      p_valor := v_valor_pago_total,
      p_referencia_amigavel := 'Estorno de servico - Payment V2',
      p_descricao := trim(p_motivo),
      p_orcamento_id := v_obrigacao.orcamento_id,
      p_appointment_id := nullif(v_appointment.id, ''),
      p_obrigacao_id := nullif(v_obrigacao.id, ''),
      p_transacao_id := null,
      p_autorizacao_financeira_id := null,
      p_usuario_id := p_usuario_id,
      p_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'payment_v2_reverse',
        'contract_scope', 'sprint9b1_cut2',
        'reversal_scope', 'servico',
        'attachment_name', trim(p_attachment_name),
        'attachment_path', trim(p_attachment_path),
        'attachment_extension', v_attachment_extension,
        'authority_scope', 'payment_v2_reversal'
      ),
      p_permitir_saldo_negativo := false
    );

    v_wallet_movimento_id := v_wallet_result.movimento_id;
    v_wallet_saldo_anterior := v_wallet_result.saldo_anterior;
    v_wallet_saldo_final := v_wallet_result.saldo_final;
  end if;

  if coalesce(v_service.id, '') <> '' and coalesce(v_servico_realizado, false) then
    update public.serviceprovided
    set
      preco = 0,
      valor_cobrado = 0,
      status = 'estornado',
      status_pagamento = 'pago',
      estornado_em = v_now,
      estornado_motivo = trim(p_motivo),
      observacoes = concat_ws(E'\n', nullif(trim(observacoes), ''), '[Payment V2 Reversal] ' || trim(p_motivo)),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'payment_v2_reversal', true,
        'payment_v2_reversal_at', v_now,
        'payment_v2_reversal_operacao_idempotencia', p_operacao_idempotencia,
        'payment_v2_reversal_attachment_path', trim(p_attachment_path),
        'payment_v2_reversal_original_preco', coalesce(v_service.preco, 0),
        'payment_v2_reversal_original_valor_cobrado', coalesce(v_service.valor_cobrado, 0)
      ),
      updated_date = v_now
    where id = v_service.id;
  elsif coalesce(v_service.id, '') <> '' then
    delete from public.serviceprovided
    where id = v_service.id;
  end if;

  if coalesce(v_appointment.id, '') <> '' and coalesce(v_servico_realizado, false) then
    update public.appointment
    set
      status = 'estornado',
      observacoes = concat_ws(E'\n', nullif(trim(observacoes), ''), '[Payment V2 Reversal] ' || trim(p_motivo)),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'payment_v2_reversal', true,
        'payment_v2_reversal_at', v_now,
        'payment_v2_reversal_operacao_idempotencia', p_operacao_idempotencia,
        'payment_v2_reversal_attachment_path', trim(p_attachment_path)
      ),
      updated_date = v_now
    where id = v_appointment.id;
  elsif coalesce(v_appointment.id, '') <> '' then
    delete from public.appointment
    where id = v_appointment.id;
  end if;

  if coalesce(v_obrigacao.id, '') <> '' then
    v_status_obrigacao_final := case
      when coalesce(v_servico_realizado, false) or v_valor_pago_total > 0 then 'estornada'
      else 'cancelada'
    end;

    update public.obrigacao_financeira
    set
      valor_original = 0,
      valor_desconto = 0,
      valor_multa = 0,
      valor_final = 0,
      valor_em_aberto = 0,
      status = v_status_obrigacao_final,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'payment_v2_reversal', true,
        'payment_v2_reversal_at', v_now,
        'payment_v2_reversal_operacao_idempotencia', p_operacao_idempotencia,
        'payment_v2_reversal_original_valor_original', coalesce(v_obrigacao.valor_original, 0),
        'payment_v2_reversal_original_valor_final', coalesce(v_obrigacao.valor_final, 0),
        'payment_v2_reversal_original_valor_em_aberto', coalesce(v_obrigacao.valor_em_aberto, 0),
        'payment_v2_reversal_attachment_path', trim(p_attachment_path),
        'payment_v2_reversal_servico_realizado', coalesce(v_servico_realizado, false)
      ),
      updated_date = v_now
    where id = v_obrigacao.id;
  end if;

  if coalesce(v_cobranca.id, '') <> '' then
    update public.cobranca_financeira
    set
      valor_total = 0,
      valor_em_aberto = 0,
      status = 'cancelada',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'payment_v2_reversal', true,
        'payment_v2_reversal_at', v_now,
        'payment_v2_reversal_operacao_idempotencia', p_operacao_idempotencia,
        'payment_v2_reversal_original_valor_total', coalesce(v_cobranca.valor_total, 0),
        'payment_v2_reversal_original_valor_em_aberto', coalesce(v_cobranca.valor_em_aberto, 0),
        'payment_v2_reversal_attachment_path', trim(p_attachment_path)
      ),
      updated_date = v_now
    where id = v_cobranca.id;
  end if;

  if coalesce(v_conta_receber.id, '') <> '' then
    update public.conta_receber
    set
      valor = 0,
      status = 'pago',
      observacoes = concat_ws(E'\n', nullif(trim(observacoes), ''), '[Payment V2 Reversal] ' || trim(p_motivo)),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'payment_v2_reversal', true,
        'payment_v2_reversal_at', v_now,
        'payment_v2_reversal_operacao_idempotencia', p_operacao_idempotencia,
        'payment_v2_reversal_original_valor', coalesce(v_conta_receber.valor, 0),
        'payment_v2_reversal_attachment_path', trim(p_attachment_path),
        'payment_v2_reversal_servico_realizado', coalesce(v_servico_realizado, false)
      ),
      updated_date = v_now
    where id = v_conta_receber.id;
  end if;

  insert into public.pagamento_v2_reversao (
    empresa_id,
    carteira_conta_id,
    pagamento_v2_execucao_id,
    appointment_id,
    serviceprovided_id,
    obrigacao_id,
    cobranca_financeira_id,
    conta_receber_id,
    carteira_movimento_id,
    reversao_tipo,
    operacao_idempotencia,
    source_key,
    motivo,
    attachment_name,
    attachment_path,
    attachment_extension,
    valor_estornado,
    servico_realizado,
    classe_resultado,
    usuario_id,
    metadata
  )
  values (
    p_empresa_id,
    p_carteira_conta_id,
    nullif(v_pagamento_execucao.id, ''),
    case when coalesce(v_servico_realizado, false) then nullif(v_appointment.id, '') else null end,
    case when coalesce(v_servico_realizado, false) then nullif(v_service.id, '') else null end,
    nullif(v_obrigacao.id, ''),
    nullif(v_cobranca.id, ''),
    nullif(v_conta_receber.id, ''),
    v_wallet_movimento_id,
    'servico',
    p_operacao_idempotencia,
    trim(p_source_key),
    trim(p_motivo),
    trim(p_attachment_name),
    trim(p_attachment_path),
    v_attachment_extension,
    round(coalesce(v_valor_pago_total, 0), 2),
    v_servico_realizado,
    'executado',
    p_usuario_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'source', 'payment_v2_reverse',
      'contract_scope', 'sprint9b1_cut2',
      'authority_scope', 'payment_v2_reversal',
      'reversal_scope', 'servico',
      'service_value_final', v_valor_final_servico,
      'original_appointment_id', nullif(v_appointment.id, ''),
      'original_serviceprovided_id', nullif(v_service.id, '')
    )
  )
  returning * into v_reversao;

  reversao_id := v_reversao.id;
  classe_resultado := 'executado';
  reversao_tipo := 'servico';
  carteira_movimento_id := v_reversao.carteira_movimento_id;
  carteira_conta_id := v_reversao.carteira_conta_id;
  appointment_id := v_reversao.appointment_id;
  serviceprovided_id := v_reversao.serviceprovided_id;
  obrigacao_id := v_reversao.obrigacao_id;
  cobranca_financeira_id := v_reversao.cobranca_financeira_id;
  conta_receber_id := v_reversao.conta_receber_id;
  operacao_idempotencia := v_reversao.operacao_idempotencia;
  source_key := v_reversao.source_key;
  valor_estornado := v_reversao.valor_estornado;
  saldo_anterior := v_wallet_saldo_anterior;
  saldo_final := v_wallet_saldo_final;
  servico_realizado := v_reversao.servico_realizado;
  reason_code := null;
  reason_message := null;
  reused := false;
  return next;
end;
$$;

drop function if exists public.finance_payment_v2_reversal_audit(text, integer);

create or replace function public.finance_payment_v2_reversal_audit(
  p_empresa_id text,
  p_limit integer default 100
)
returns table (
  reversao_id text,
  empresa_id text,
  reversao_tipo text,
  carteira_conta_id text,
  carteira_movimento_id text,
  movimento_tipo text,
  pagamento_v2_execucao_id text,
  appointment_id text,
  appointment_status text,
  serviceprovided_id text,
  serviceprovided_status text,
  serviceprovided_status_pagamento text,
  obrigacao_id text,
  obrigacao_status text,
  cobranca_financeira_id text,
  cobranca_status text,
  conta_receber_id text,
  conta_receber_status text,
  operacao_idempotencia text,
  source_key text,
  valor_estornado numeric,
  servico_realizado boolean,
  attachment_name text,
  attachment_path text,
  attachment_extension text,
  motivo text,
  classe_resultado text,
  reason_code text,
  reason_message text,
  created_date timestamptz,
  metadata jsonb
)
language sql
stable
as $$
  select
    pvr.id as reversao_id,
    pvr.empresa_id,
    pvr.reversao_tipo,
    pvr.carteira_conta_id,
    pvr.carteira_movimento_id,
    cm.tipo as movimento_tipo,
    pvr.pagamento_v2_execucao_id,
    pvr.appointment_id,
    ap.status as appointment_status,
    pvr.serviceprovided_id,
    sp.status as serviceprovided_status,
    sp.status_pagamento as serviceprovided_status_pagamento,
    pvr.obrigacao_id,
    ofn.status as obrigacao_status,
    pvr.cobranca_financeira_id,
    cf.status as cobranca_status,
    pvr.conta_receber_id,
    cr.status as conta_receber_status,
    pvr.operacao_idempotencia,
    pvr.source_key,
    pvr.valor_estornado,
    pvr.servico_realizado,
    pvr.attachment_name,
    pvr.attachment_path,
    pvr.attachment_extension,
    pvr.motivo,
    pvr.classe_resultado,
    pvr.reason_code,
    pvr.reason_message,
    pvr.created_date,
    pvr.metadata
  from public.pagamento_v2_reversao pvr
  left join public.carteira_movimento cm
    on cm.id = pvr.carteira_movimento_id
  left join public.appointment ap
    on ap.id = pvr.appointment_id
  left join public.serviceprovided sp
    on sp.id = pvr.serviceprovided_id
  left join public.obrigacao_financeira ofn
    on ofn.id = pvr.obrigacao_id
  left join public.cobranca_financeira cf
    on cf.id = pvr.cobranca_financeira_id
  left join public.conta_receber cr
    on cr.id = pvr.conta_receber_id
  where pvr.empresa_id = p_empresa_id
  order by pvr.created_date desc, pvr.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
