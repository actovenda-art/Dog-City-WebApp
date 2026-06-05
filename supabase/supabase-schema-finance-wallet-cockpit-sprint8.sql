-- Sprint 8 - Cockpit V2, comparativo e alertas financeiros
-- Objetivo:
-- 1. Criar leitura consolidada V2 para o cockpit financeiro
-- 2. Comparar legado vs camada nova sem desligar o legado abruptamente
-- 3. Introduzir alertas financeiros V2 atrás de feature flags
-- 4. Preparar desligamento gradual do legado apenas nas leituras do cockpit

create extension if not exists pgcrypto;

drop function if exists public.finance_ensure_cockpit_feature_flags();

create or replace function public.finance_ensure_cockpit_feature_flags()
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
    where cfg.key = 'finance.cockpit_v2_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.cockpit_v2_enabled',
      'Finance - Cockpit V2 Enabled',
      'Habilita o cockpit financeiro V2 em paralelo.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.cockpit_v2_compare_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.cockpit_v2_compare_enabled',
      'Finance - Cockpit V2 Compare Enabled',
      'Habilita o comparativo entre o cockpit legado e a camada financeira V2.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.financial_alerts_v2_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.financial_alerts_v2_enabled',
      'Finance - Financial Alerts V2 Enabled',
      'Habilita alertas financeiros baseados na nova camada.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.legacy_cockpit_finance_disabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.legacy_cockpit_finance_disabled',
      'Finance - Legacy Cockpit Finance Disabled',
      'Desliga a leitura financeira legada apenas no cockpit.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  for v_empresa in
    select e.id
    from public.empresa e
  loop
    if not exists (
      select 1 from public.app_config cfg
      where cfg.key = 'finance.cockpit_v2_enabled'
        and cfg.empresa_id = v_empresa.id
    ) then
      insert into public.app_config (key, label, description, value, ativo, empresa_id)
      values (
        'finance.cockpit_v2_enabled',
        'Finance - Cockpit V2 Enabled',
        'Habilita o cockpit financeiro V2 em paralelo.',
        jsonb_build_object('enabled', false),
        true,
        v_empresa.id
      );
    end if;

    if not exists (
      select 1 from public.app_config cfg
      where cfg.key = 'finance.cockpit_v2_compare_enabled'
        and cfg.empresa_id = v_empresa.id
    ) then
      insert into public.app_config (key, label, description, value, ativo, empresa_id)
      values (
        'finance.cockpit_v2_compare_enabled',
        'Finance - Cockpit V2 Compare Enabled',
        'Habilita o comparativo entre o cockpit legado e a camada financeira V2.',
        jsonb_build_object('enabled', false),
        true,
        v_empresa.id
      );
    end if;

    if not exists (
      select 1 from public.app_config cfg
      where cfg.key = 'finance.financial_alerts_v2_enabled'
        and cfg.empresa_id = v_empresa.id
    ) then
      insert into public.app_config (key, label, description, value, ativo, empresa_id)
      values (
        'finance.financial_alerts_v2_enabled',
        'Finance - Financial Alerts V2 Enabled',
        'Habilita alertas financeiros baseados na nova camada.',
        jsonb_build_object('enabled', false),
        true,
        v_empresa.id
      );
    end if;

    if not exists (
      select 1 from public.app_config cfg
      where cfg.key = 'finance.legacy_cockpit_finance_disabled'
        and cfg.empresa_id = v_empresa.id
    ) then
      insert into public.app_config (key, label, description, value, ativo, empresa_id)
      values (
        'finance.legacy_cockpit_finance_disabled',
        'Finance - Legacy Cockpit Finance Disabled',
        'Desliga a leitura financeira legada apenas no cockpit.',
        jsonb_build_object('enabled', false),
        true,
        v_empresa.id
      );
    end if;
  end loop;

  return query
  select
    cfg.key,
    cfg.empresa_id,
    coalesce((cfg.value ->> 'enabled')::boolean, false) as enabled
  from public.app_config cfg
  where cfg.key in (
    'finance.cockpit_v2_enabled',
    'finance.cockpit_v2_compare_enabled',
    'finance.financial_alerts_v2_enabled',
    'finance.legacy_cockpit_finance_disabled'
  )
  order by cfg.key, cfg.empresa_id nulls first;
end;
$$;

drop function if exists public.finance_cockpit_v2_summary(text, date, date);

create or replace function public.finance_cockpit_v2_summary(
  p_empresa_id text,
  p_periodo_inicio date,
  p_periodo_fim date
)
returns table (
  empresa_id text,
  periodo_inicio date,
  periodo_fim date,
  wallet_total numeric,
  faturamento_real_total numeric,
  geracao_recursos_total numeric,
  servicos_prestados_total numeric,
  obrigacoes_abertas_total numeric,
  obrigacoes_vencidas_total numeric,
  cobrancas_abertas_total numeric,
  cobrancas_vencidas_total numeric,
  comissoes_total numeric,
  comissoes_estornadas_total numeric,
  carteiras_negativas_count integer,
  reconciliacoes_divergentes_count integer,
  deltas_relevantes_count integer
)
language plpgsql
stable
as $$
declare
  v_reports_summary record;
  v_cockpit_enabled boolean;
  v_reports_enabled boolean;
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  v_cockpit_enabled := public.finance_get_feature_flag('finance.cockpit_v2_enabled', p_empresa_id);
  v_reports_enabled := public.finance_get_feature_flag('finance.reports_v2_enabled', p_empresa_id);

  if not v_cockpit_enabled then
    raise exception 'Feature flag finance.cockpit_v2_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  if not v_reports_enabled then
    raise exception 'Feature flag finance.reports_v2_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  select * into v_reports_summary
  from public.finance_reports_v2_summary(p_empresa_id, p_periodo_inicio, p_periodo_fim);

  return query
  with latest_reconciliation as (
    select distinct on (cr.carteira_conta_id)
      cr.carteira_conta_id,
      cr.status
    from public.carteira_reconciliacao cr
    where cr.empresa_id = p_empresa_id
    order by cr.carteira_conta_id, cr.created_date desc, cr.id desc
  )
  select
    p_empresa_id,
    p_periodo_inicio,
    p_periodo_fim,
    round(coalesce(v_reports_summary.wallet_total, 0), 2),
    round(coalesce(v_reports_summary.billing_total, 0), 2),
    round(coalesce(v_reports_summary.generation_total, 0), 2),
    round(coalesce(v_reports_summary.services_total, 0), 2),
    round(coalesce((
      select sum(coalesce(ofn.valor_em_aberto, 0))
      from public.obrigacao_financeira ofn
      where ofn.empresa_id = p_empresa_id
        and ofn.status in ('aberta', 'parcial', 'vencida')
        and coalesce(ofn.valor_em_aberto, 0) > 0
    ), 0), 2),
    round(coalesce((
      select sum(coalesce(ofn.valor_em_aberto, 0))
      from public.obrigacao_financeira ofn
      where ofn.empresa_id = p_empresa_id
        and ofn.status in ('aberta', 'parcial', 'vencida')
        and ofn.due_date < current_date
        and coalesce(ofn.valor_em_aberto, 0) > 0
    ), 0), 2),
    round(coalesce((
      select sum(coalesce(cf.valor_em_aberto, 0))
      from public.cobranca_financeira cf
      where cf.empresa_id = p_empresa_id
        and cf.status in ('aberta', 'parcial', 'vencida')
        and coalesce(cf.valor_em_aberto, 0) > 0
    ), 0), 2),
    round(coalesce((
      select sum(coalesce(cf.valor_em_aberto, 0))
      from public.cobranca_financeira cf
      where cf.empresa_id = p_empresa_id
        and cf.status in ('aberta', 'parcial', 'vencida')
        and cf.due_date < current_date
        and coalesce(cf.valor_em_aberto, 0) > 0
    ), 0), 2),
    round(coalesce((
      select sum(coalesce(ce.valor_comissao, 0))
      from public.comissao_evento ce
      where ce.empresa_id = p_empresa_id
        and ce.status = 'concedida'
        and (p_periodo_inicio is null or ce.data_comissao::date >= p_periodo_inicio)
        and (p_periodo_fim is null or ce.data_comissao::date <= p_periodo_fim)
    ), 0), 2),
    round(coalesce((
      select sum(coalesce(ce.valor_estornado, ce.valor_comissao, 0))
      from public.comissao_evento ce
      where ce.empresa_id = p_empresa_id
        and ce.status in ('estornada', 'parcialmente_estornada')
        and (p_periodo_inicio is null or ce.data_comissao::date >= p_periodo_inicio)
        and (p_periodo_fim is null or ce.data_comissao::date <= p_periodo_fim)
    ), 0), 2),
    coalesce((
      select count(*)::integer
      from public.carteira_conta cc
      where cc.empresa_id = p_empresa_id
        and coalesce(cc.saldo_atual, 0) < 0
    ), 0),
    coalesce((
      select count(*)::integer
      from latest_reconciliation lr
      where lr.status = 'divergente'
    ), 0),
    coalesce((
      select count(*)::integer
      from public.finance_snapshot_delta fsd
      where fsd.empresa_id = p_empresa_id
        and abs(coalesce(fsd.impacto_financeiro, 0)) > 0
        and (p_periodo_inicio is null or fsd.created_date::date >= p_periodo_inicio)
        and (p_periodo_fim is null or fsd.created_date::date <= p_periodo_fim)
    ), 0);
end;
$$;

drop function if exists public.finance_cockpit_v2_compare(text, date, date);

drop function if exists public.finance_cockpit_legacy_receivables_coverage(text, date, date);

create or replace function public.finance_cockpit_legacy_receivables_coverage(
  p_empresa_id text,
  p_periodo_inicio date default null,
  p_periodo_fim date default null
)
returns table (
  conta_receber_id text,
  conta_receber_empresa_id text,
  cliente_id text,
  cliente_nome text,
  dog_id text,
  descricao text,
  servico text,
  valor numeric,
  vencimento date,
  data_recebimento date,
  status_legado text,
  transaction_id text,
  transaction_status text,
  scheduledtransaction_id text,
  scheduledtransaction_status text,
  carteira_conta_id text,
  recurring_package_id text,
  financial_behavior text,
  obrigacao_id text,
  obrigacao_status text,
  cobranca_id text,
  cobranca_status text,
  classificacao text,
  motivo_cobertura text,
  considera_no_comparativo boolean,
  precisa_virar_obrigacao_v2 boolean,
  precisa_virar_cobranca_v2 boolean
)
language sql
stable
as $$
  with legacy_receivables as (
    select
      cr.id as conta_receber_id,
      cr.empresa_id as conta_receber_empresa_id,
      cr.cliente_id,
      c.nome_razao_social as cliente_nome,
      cr.dog_id,
      cr.descricao,
      cr.servico,
      cr.valor,
      cr.vencimento,
      cr.data_recebimento,
      cr.status as status_legado,
      null::text as transaction_id,
      null::text as transaction_status,
      null::text as scheduledtransaction_id,
      null::text as scheduledtransaction_status,
      cc.id as carteira_conta_id,
      rp.id as recurring_package_id,
      rp.financial_behavior
    from public.conta_receber cr
    left join public.carteira c
      on c.id = cr.cliente_id
    left join public.carteira_conta cc
      on cc.carteira_id = cr.cliente_id
    left join public.recurring_packages rp
      on rp.client_id = cr.cliente_id
     and rp.pet_id is not distinct from cr.dog_id
     and rp.service_id is not distinct from cr.servico
     and rp.status in ('ativo', 'paused', 'inativo')
    where (p_periodo_inicio is null or cr.vencimento >= p_periodo_inicio)
      and (p_periodo_fim is null or cr.vencimento <= p_periodo_fim)
  ),
  coverage as (
    select
      lr.*,
      ofn.id as obrigacao_id,
      ofn.status as obrigacao_status,
      cf.id as cobranca_id,
      cf.status as cobranca_status
    from legacy_receivables lr
    left join lateral (
      select o.*
      from public.obrigacao_financeira o
      where o.empresa_id = p_empresa_id
        and o.carteira_id = lr.cliente_id
        and (
          o.source_key = 'legacy_conta_receber|' || lr.conta_receber_id
          or (
            o.due_date = lr.vencimento
            and round(coalesce(o.valor_final, 0), 2) = round(coalesce(lr.valor, 0), 2)
            and lower(coalesce(o.descricao, '')) like '%' || lower(coalesce(lr.servico, '')) || '%'
          )
        )
      order by
        case when o.source_key = 'legacy_conta_receber|' || lr.conta_receber_id then 0 else 1 end,
        o.created_date desc
      limit 1
    ) ofn on true
    left join lateral (
      select cfin.*
      from public.cobranca_financeira cfin
      where cfin.empresa_id = p_empresa_id
        and cfin.carteira_conta_id = lr.carteira_conta_id
        and (
          cfin.source_key = 'legacy_conta_receber|' || lr.conta_receber_id
          or (
            cfin.due_date = lr.vencimento
            and round(coalesce(cfin.valor_total, 0), 2) = round(coalesce(lr.valor, 0), 2)
          )
        )
      order by
        case when cfin.source_key = 'legacy_conta_receber|' || lr.conta_receber_id then 0 else 1 end,
        cfin.created_date desc
      limit 1
    ) cf on true
  )
  select
    c.conta_receber_id,
    c.conta_receber_empresa_id,
    c.cliente_id,
    c.cliente_nome,
    c.dog_id,
    c.descricao,
    c.servico,
    c.valor,
    c.vencimento,
    c.data_recebimento,
    c.status_legado,
    c.transaction_id,
    c.transaction_status,
    c.scheduledtransaction_id,
    c.scheduledtransaction_status,
    c.carteira_conta_id,
    c.recurring_package_id,
    c.financial_behavior,
    c.obrigacao_id,
    c.obrigacao_status,
    c.cobranca_id,
    c.cobranca_status,
    case
      when c.conta_receber_empresa_id is not null and c.conta_receber_empresa_id <> p_empresa_id then 'D'
      when c.conta_receber_empresa_id is null then 'C'
      when c.financial_behavior = 'operational_only' then 'D'
      when c.obrigacao_id is not null and c.cobranca_id is not null then 'A'
      when c.obrigacao_id is not null and c.cobranca_id is null then 'B'
      when c.obrigacao_id is null and c.cobranca_id is null then 'B'
      else 'D'
    end as classificacao,
    case
      when c.conta_receber_empresa_id is not null and c.conta_receber_empresa_id <> p_empresa_id then 'fora_do_escopo_da_empresa_piloto'
      when c.conta_receber_empresa_id is null then 'legado_orfao_sem_empresa'
      when c.financial_behavior = 'operational_only' then 'pacote_operacional_sem_cobranca_detalhada_v2'
      when c.obrigacao_id is not null and c.cobranca_id is not null then 'cobertura_v2_encontrada'
      when c.obrigacao_id is not null and c.cobranca_id is null then 'obrigacao_existe_sem_cobranca_v2'
      when c.obrigacao_id is null and c.cobranca_id is null then 'sem_obrigacao_e_sem_cobranca_v2'
      else 'diferenca_esperada'
    end as motivo_cobertura,
    case
      when c.status_legado = 'pago' then false
      when c.conta_receber_empresa_id = p_empresa_id and c.financial_behavior is distinct from 'operational_only' then true
      else false
    end as considera_no_comparativo,
    case
      when c.status_legado <> 'pago'
        and c.conta_receber_empresa_id = p_empresa_id
        and c.financial_behavior is distinct from 'operational_only'
        and c.obrigacao_id is null then true
      else false
    end as precisa_virar_obrigacao_v2,
    case
      when c.status_legado <> 'pago'
        and c.conta_receber_empresa_id = p_empresa_id
        and c.financial_behavior is distinct from 'operational_only'
        and c.cobranca_id is null then true
      else false
    end as precisa_virar_cobranca_v2
  from coverage c;
$$;

create or replace function public.finance_cockpit_v2_compare(
  p_empresa_id text,
  p_periodo_inicio date,
  p_periodo_fim date
)
returns table (
  metric_key text,
  metric_label text,
  legacy_value numeric,
  v2_value numeric,
  difference_value numeric,
  severity text,
  difference_origin text,
  payload jsonb
)
language plpgsql
stable
as $$
declare
  v_summary record;
  v_compare_enabled boolean;
  v_recebimentos_legacy numeric := 0;
  v_pendencias_legacy numeric := 0;
  v_faturamento_legacy numeric := 0;
  v_geracao_legacy numeric := 0;
  v_cancelamentos_legacy numeric := 0;
  v_comissoes_legacy numeric := 0;
  v_cobrancas_legacy numeric := 0;
  v_pendencias_excluidas numeric := 0;
  v_cobrancas_excluidas numeric := 0;
  v_cobertura_correta_count integer := 0;
  v_divergencia_real_count integer := 0;
  v_legado_orfao_count integer := 0;
  v_diferenca_esperada_count integer := 0;
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  v_compare_enabled := public.finance_get_feature_flag('finance.cockpit_v2_compare_enabled', p_empresa_id);
  if not v_compare_enabled then
    raise exception 'Feature flag finance.cockpit_v2_compare_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  select * into v_summary
  from public.finance_cockpit_v2_summary(p_empresa_id, p_periodo_inicio, p_periodo_fim);

  select round(coalesce(sum(coalesce(t.valor, 0)), 0), 2)
    into v_recebimentos_legacy
  from public.extratobancario t
  where coalesce(t.tipo, '') in ('entrada', 'recebimento')
    and t.empresa_id = p_empresa_id
    and (p_periodo_inicio is null or coalesce(t.data_movimento, t.created_date::date) >= p_periodo_inicio)
    and (p_periodo_fim is null or coalesce(t.data_movimento, t.created_date::date) <= p_periodo_fim);

  select
    round(coalesce(sum(case when considera_no_comparativo then coalesce(valor, 0) else 0 end), 0), 2),
    round(coalesce(sum(case when not considera_no_comparativo and status_legado <> 'pago' then coalesce(valor, 0) else 0 end), 0), 2),
    coalesce(count(*) filter (where classificacao = 'A' and status_legado <> 'pago'), 0),
    coalesce(count(*) filter (where classificacao = 'B' and status_legado <> 'pago'), 0),
    coalesce(count(*) filter (where classificacao = 'C' and status_legado <> 'pago'), 0),
    coalesce(count(*) filter (where classificacao = 'D' and status_legado <> 'pago'), 0)
  into
    v_pendencias_legacy,
    v_pendencias_excluidas,
    v_cobertura_correta_count,
    v_divergencia_real_count,
    v_legado_orfao_count,
    v_diferenca_esperada_count
  from public.finance_cockpit_legacy_receivables_coverage(p_empresa_id, p_periodo_inicio, p_periodo_fim);

  v_faturamento_legacy := v_recebimentos_legacy;

  select round(coalesce(sum(coalesce(sp.valor_cobrado, sp.preco, 0)), 0), 2)
    into v_geracao_legacy
  from public.serviceprovided sp
  where sp.empresa_id = p_empresa_id
    and (p_periodo_inicio is null or coalesce(sp.data_utilizacao, sp.created_date::date) >= p_periodo_inicio)
    and (p_periodo_fim is null or coalesce(sp.data_utilizacao, sp.created_date::date) <= p_periodo_fim);

  select coalesce(count(*)::numeric, 0)
    into v_cancelamentos_legacy
  from public.replacement rp
  where (p_periodo_inicio is null or rp.created_date::date >= p_periodo_inicio)
    and (p_periodo_fim is null or rp.created_date::date <= p_periodo_fim);

  select
    coalesce(count(*) filter (where considera_no_comparativo and status_legado <> 'pago' and vencimento < current_date)::numeric, 0),
    coalesce(count(*) filter (where not considera_no_comparativo and status_legado <> 'pago' and vencimento < current_date)::numeric, 0)
  into
    v_cobrancas_legacy,
    v_cobrancas_excluidas
  from public.finance_cockpit_legacy_receivables_coverage(p_empresa_id, p_periodo_inicio, p_periodo_fim)
  ;

  return query
  with metrics as (
    select
      'recebimentos'::text as metric_key,
      'Recebimentos'::text as metric_label,
      round(coalesce(v_recebimentos_legacy, 0), 2) as legacy_value,
      round(coalesce(v_summary.faturamento_real_total, 0), 2) as v2_value,
      'transaction_vs_carteira_movimento'::text as difference_origin,
      'currency'::text as unit
    union all
    select
      'saldo_pendencias',
      'Saldo / Pendências',
      round(coalesce(v_pendencias_legacy, 0), 2),
      round(coalesce(v_summary.obrigacoes_abertas_total, 0), 2),
      case
        when v_divergencia_real_count > 0 then 'conta_receber_vs_obrigacao_financeira'
        when v_legado_orfao_count > 0 and v_diferenca_esperada_count > 0 then 'divergencia_formalmente_justificada'
        when v_legado_orfao_count > 0 then 'legado_orfao_excluido_do_escopo'
        when v_diferenca_esperada_count > 0 then 'diferenca_esperada_operational_only'
        else 'sem_diferenca'
      end,
      'currency'
    union all
    select
      'faturamento_real',
      'Faturamento Real',
      round(coalesce(v_faturamento_legacy, 0), 2),
      round(coalesce(v_summary.faturamento_real_total, 0), 2),
      'transaction_vs_relatorio_v2',
      'currency'
    union all
    select
      'geracao_recursos',
      'Geração de Recursos',
      round(coalesce(v_geracao_legacy, 0), 2),
      round(coalesce(v_summary.geracao_recursos_total, 0), 2),
      'serviceprovided_vs_competencia_v2',
      'currency'
    union all
    select
      'cancelamentos_estornos',
      'Cancelamentos / Estornos',
      round(coalesce(v_cancelamentos_legacy, 0), 2),
      round(coalesce((
        select count(*)::numeric
        from public.cancelamento_financeiro cf
        where cf.empresa_id = p_empresa_id
          and (p_periodo_inicio is null or cf.created_date::date >= p_periodo_inicio)
          and (p_periodo_fim is null or cf.created_date::date <= p_periodo_fim)
      ), 0), 2),
      'replacement_vs_cancelamento_financeiro',
      'count'
    union all
    select
      'comissoes',
      'Comissões',
      round(coalesce(v_comissoes_legacy, 0), 2),
      round(coalesce(v_summary.comissoes_total, 0), 2),
      'legado_sem_modelagem_oficial',
      'currency'
    union all
    select
      'cobrancas_abertas_vencidas',
      'Cobranças Abertas / Vencidas',
      round(coalesce(v_cobrancas_legacy, 0), 2),
      round(coalesce((
        select count(*)::numeric
        from public.cobranca_financeira cf
        where cf.empresa_id = p_empresa_id
          and cf.status in ('aberta', 'parcial', 'vencida')
          and cf.due_date < current_date
      ), 0), 2),
      case
        when v_divergencia_real_count > 0 then 'conta_receber_vs_cobranca_financeira'
        when v_legado_orfao_count > 0 and v_diferenca_esperada_count > 0 then 'divergencia_formalmente_justificada'
        when v_legado_orfao_count > 0 then 'legado_orfao_excluido_do_escopo'
        when v_diferenca_esperada_count > 0 then 'diferenca_esperada_operational_only'
        else 'sem_diferenca'
      end,
      'count'
  )
  select
    m.metric_key,
    m.metric_label,
    m.legacy_value,
    m.v2_value,
    round(m.v2_value - m.legacy_value, 2) as difference_value,
    case
      when round(abs(m.v2_value - m.legacy_value), 2) = 0 then 'ok'
      when m.metric_key in ('comissoes', 'cancelamentos_estornos') and m.legacy_value = 0 and m.v2_value > 0 then 'info'
      when round(abs(m.v2_value - m.legacy_value), 2) <= 1 then 'baixa'
      when round(abs(m.v2_value - m.legacy_value), 2) <= 100 then 'media'
      else 'alta'
    end as severity,
    m.difference_origin,
    jsonb_build_object(
      'unit', m.unit,
      'periodo_inicio', p_periodo_inicio,
      'periodo_fim', p_periodo_fim,
      'coverage_correct_count', v_cobertura_correta_count,
      'real_divergence_count', v_divergencia_real_count,
      'orphan_legacy_count', v_legado_orfao_count,
      'expected_difference_count', v_diferenca_esperada_count,
      'excluded_legacy_value', case when m.metric_key = 'saldo_pendencias' then v_pendencias_excluidas else null end,
      'excluded_legacy_count', case when m.metric_key = 'cobrancas_abertas_vencidas' then v_cobrancas_excluidas else null end
    ) as payload
  from metrics m
  order by m.metric_key;
end;
$$;

drop function if exists public.finance_financial_alerts_v2(text, date, date, integer);

create or replace function public.finance_financial_alerts_v2(
  p_empresa_id text,
  p_periodo_inicio date default null,
  p_periodo_fim date default null,
  p_limit integer default 100
)
returns table (
  alert_key text,
  alert_type text,
  severity text,
  title text,
  description text,
  entity_type text,
  entity_id text,
  amount numeric,
  created_date timestamptz,
  payload jsonb
)
language plpgsql
stable
as $$
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  if not public.finance_get_feature_flag('finance.financial_alerts_v2_enabled', p_empresa_id) then
    raise exception 'Feature flag finance.financial_alerts_v2_enabled esta desligada para a empresa %.', p_empresa_id;
  end if;

  return query
  with latest_reconciliation as (
    select distinct on (cr.carteira_conta_id)
      cr.id,
      cr.carteira_conta_id,
      cr.status,
      cr.diferenca,
      cr.created_date
    from public.carteira_reconciliacao cr
    where cr.empresa_id = p_empresa_id
    order by cr.carteira_conta_id, cr.created_date desc, cr.id desc
  ),
  alerts as (
    select
      'wallet_negative|' || cc.id as alert_key,
      'carteira_negativa'::text as alert_type,
      'alta'::text as severity,
      'Carteira negativa'::text as title,
      'Carteira com saldo negativo na nova camada financeira.'::text as description,
      'carteira_conta'::text as entity_type,
      cc.id as entity_id,
      round(coalesce(cc.saldo_atual, 0), 2) as amount,
      coalesce(cc.updated_date, cc.created_date) as created_date,
      jsonb_build_object('carteira_id', cc.carteira_id, 'saldo_atual', cc.saldo_atual) as payload
    from public.carteira_conta cc
    where cc.empresa_id = p_empresa_id
      and coalesce(cc.saldo_atual, 0) < 0

    union all

    select
      'charge_overdue|' || cf.id,
      'cobranca_vencida',
      'media',
      'Cobrança vencida',
      'Cobrança aberta/parcial com vencimento ultrapassado.',
      'cobranca_financeira',
      cf.id,
      round(coalesce(cf.valor_em_aberto, 0), 2),
      coalesce(cf.updated_date, cf.created_date),
      jsonb_build_object('due_date', cf.due_date, 'status', cf.status) as payload
    from public.cobranca_financeira cf
    where cf.empresa_id = p_empresa_id
      and cf.status in ('aberta', 'parcial', 'vencida')
      and cf.due_date < current_date
      and coalesce(cf.valor_em_aberto, 0) > 0

    union all

    select
      'obligation_overdue|' || ofn.id,
      'obrigacao_vencida',
      'media',
      'Obrigação vencida',
      'Obrigação financeira ainda em aberto após o vencimento.',
      'obrigacao_financeira',
      ofn.id,
      round(coalesce(ofn.valor_em_aberto, 0), 2),
      coalesce(ofn.updated_date, ofn.created_date),
      jsonb_build_object('due_date', ofn.due_date, 'status', ofn.status) as payload
    from public.obrigacao_financeira ofn
    where ofn.empresa_id = p_empresa_id
      and ofn.status in ('aberta', 'parcial', 'vencida')
      and ofn.due_date < current_date
      and coalesce(ofn.valor_em_aberto, 0) > 0

    union all

    select
      'possible_overpayment|' || cm.id,
      'pagamento_a_maior',
      'baixa',
      'Possível pagamento a maior',
      'Entrada sem obrigação em aberto vinculada para a carteira.',
      'carteira_movimento',
      cm.id,
      round(coalesce(cm.valor, 0), 2),
      cm.created_date,
      jsonb_build_object('carteira_conta_id', cm.carteira_conta_id, 'tipo', cm.tipo) as payload
    from public.carteira_movimento cm
    where cm.empresa_id = p_empresa_id
      and cm.natureza = 'entrada'
      and cm.obrigacao_id is null
      and not exists (
        select 1
        from public.obrigacao_financeira ofn
        where ofn.carteira_conta_id = cm.carteira_conta_id
          and ofn.status in ('aberta', 'parcial', 'vencida')
          and coalesce(ofn.valor_em_aberto, 0) > 0
      )

    union all

    select
      'reconciliation_divergence|' || lr.id,
      'divergencia_reconciliacao',
      'alta',
      'Divergência de reconciliação',
      'A última reconciliação da carteira está divergente.',
      'carteira_reconciliacao',
      lr.id,
      round(coalesce(lr.diferenca, 0), 2),
      lr.created_date,
      jsonb_build_object('carteira_conta_id', lr.carteira_conta_id, 'status', lr.status) as payload
    from latest_reconciliation lr
    where lr.status = 'divergente'

    union all

    select
      'commission_reversed|' || ce.id,
      'comissao_estornada',
      'media',
      'Comissão estornada',
      'Evento de comissão com estorno total ou parcial.',
      'comissao_evento',
      ce.id,
      round(coalesce(ce.valor_estornado, ce.valor_comissao, 0), 2),
      ce.created_date,
      jsonb_build_object('status', ce.status, 'vendedor_user_id', ce.vendedor_user_id) as payload
    from public.comissao_evento ce
    where ce.empresa_id = p_empresa_id
      and ce.status in ('estornada', 'parcialmente_estornada')

    union all

    select
      'cancellation_credit|' || cf.id,
      'cancelamento_com_credito_compensatorio',
      'info',
      'Cancelamento com crédito compensatório',
      'Cancelamento financeiro gerou crédito compensatório auditável.',
      'cancelamento_financeiro',
      cf.id,
      round(coalesce(cf.valor_multa, 0), 2),
      cf.created_date,
      jsonb_build_object('origem_cancelamento', cf.origem_cancelamento, 'gerar_credito_compensatorio', cf.gerar_credito_compensatorio) as payload
    from public.cancelamento_financeiro cf
    where cf.empresa_id = p_empresa_id
      and cf.gerar_credito_compensatorio = true
      and (p_periodo_inicio is null or cf.created_date::date >= p_periodo_inicio)
      and (p_periodo_fim is null or cf.created_date::date <= p_periodo_fim)

    union all

    select
      'snapshot_delta|' || fsd.id,
      'snapshot_delta_relevante',
      case when abs(coalesce(fsd.impacto_financeiro, 0)) > 100 then 'alta' else 'media' end,
      'Snapshot alterado por delta relevante',
      'Mudança financeira detectada após fechamento preservado.',
      'finance_snapshot_delta',
      fsd.id,
      round(coalesce(fsd.impacto_financeiro, 0), 2),
      fsd.created_date,
      jsonb_build_object('comparison_run_id', fsd.comparison_run_id, 'delta_kind', fsd.delta_kind, 'snapshot_id', fsd.snapshot_id) as payload
    from public.finance_snapshot_delta fsd
    where fsd.empresa_id = p_empresa_id
      and abs(coalesce(fsd.impacto_financeiro, 0)) > 0
      and (p_periodo_inicio is null or fsd.created_date::date >= p_periodo_inicio)
      and (p_periodo_fim is null or fsd.created_date::date <= p_periodo_fim)
  )
  select
    a.alert_key,
    a.alert_type,
    a.severity,
    a.title,
    a.description,
    a.entity_type,
    a.entity_id,
    a.amount,
    a.created_date,
    a.payload
  from alerts a
  order by
    case a.severity
      when 'critica' then 0
      when 'alta' then 1
      when 'media' then 2
      when 'baixa' then 3
      else 4
    end,
    abs(coalesce(a.amount, 0)) desc,
    a.created_date desc
  limit greatest(coalesce(p_limit, 100), 1);
end;
$$;

drop function if exists public.finance_cockpit_v2_context(text, date, date);

create or replace function public.finance_cockpit_v2_context(
  p_empresa_id text,
  p_periodo_inicio date,
  p_periodo_fim date
)
returns table (
  empresa_id text,
  cockpit_v2_enabled boolean,
  cockpit_v2_compare_enabled boolean,
  financial_alerts_v2_enabled boolean,
  legacy_cockpit_finance_disabled boolean,
  wallet_accounts_count integer,
  open_obligations_count integer,
  open_charges_count integer,
  snapshots_count integer,
  latest_snapshot_created_at timestamptz
)
language plpgsql
stable
as $$
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  return query
  select
    p_empresa_id,
    public.finance_get_feature_flag('finance.cockpit_v2_enabled', p_empresa_id),
    public.finance_get_feature_flag('finance.cockpit_v2_compare_enabled', p_empresa_id),
    public.finance_get_feature_flag('finance.financial_alerts_v2_enabled', p_empresa_id),
    public.finance_get_feature_flag('finance.legacy_cockpit_finance_disabled', p_empresa_id),
    coalesce((
      select count(*)::integer
      from public.carteira_conta cc
      where cc.empresa_id = p_empresa_id
    ), 0),
    coalesce((
      select count(*)::integer
      from public.obrigacao_financeira ofn
      where ofn.empresa_id = p_empresa_id
        and ofn.status in ('aberta', 'parcial', 'vencida')
        and coalesce(ofn.valor_em_aberto, 0) > 0
    ), 0),
    coalesce((
      select count(*)::integer
      from public.cobranca_financeira cf
      where cf.empresa_id = p_empresa_id
        and cf.status in ('aberta', 'parcial', 'vencida')
        and coalesce(cf.valor_em_aberto, 0) > 0
    ), 0),
    coalesce((
      select count(*)::integer
      from public.finance_snapshot fs
      where fs.empresa_id = p_empresa_id
    ), 0),
    (
      select max(fs.created_date)
      from public.finance_snapshot fs
      where fs.empresa_id = p_empresa_id
    );
end;
$$;

select * from public.finance_ensure_cockpit_feature_flags();
