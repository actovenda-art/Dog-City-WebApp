-- Sprint 9A - Observabilidade financeira, governanca operacional e contrato de Pagamento V2
-- Objetivo:
-- 1. Criar uma camada SQL-first de observabilidade da escrita hibrida
-- 2. Formalizar a governanca oficial de leitura/escrita por dominio
-- 3. Fortalecer trilha operacional, reconciliacao e diagnosticos
-- 4. Preparar o contrato formal do Pagamento V2 sem implementar a escrita nova
--
-- Importante:
-- - Nao remove legado
-- - Nao desliga fluxos existentes
-- - Nao cria migracao destrutiva
-- - Nao inicia Pagamento V2 real

create extension if not exists pgcrypto;

drop function if exists public.finance_ensure_observability_feature_flags();

create or replace function public.finance_ensure_observability_feature_flags()
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
    where cfg.key = 'finance.operational_observability_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.operational_observability_enabled',
      'Finance - Operational Observability Enabled',
      'Habilita a camada de observabilidade financeira operacional.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.write_governance_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.write_governance_enabled',
      'Finance - Write Governance Enabled',
      'Habilita a matriz oficial de governanca da escrita financeira.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.payment_v2_contract_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.payment_v2_contract_enabled',
      'Finance - Payment V2 Contract Enabled',
      'Habilita o contrato formal preparatorio do Pagamento V2.',
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
        where cfg.key = 'finance.operational_observability_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.operational_observability_enabled',
          'Finance - Operational Observability Enabled',
          'Habilita a camada de observabilidade financeira operacional.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.write_governance_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.write_governance_enabled',
          'Finance - Write Governance Enabled',
          'Habilita a matriz oficial de governanca da escrita financeira.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.payment_v2_contract_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.payment_v2_contract_enabled',
          'Finance - Payment V2 Contract Enabled',
          'Habilita o contrato formal preparatorio do Pagamento V2.',
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
  where cfg.key in (
    'finance.operational_observability_enabled',
    'finance.write_governance_enabled',
    'finance.payment_v2_contract_enabled'
  )
  order by cfg.key, cfg.empresa_id nulls first;
end;
$$;

drop function if exists public.finance_write_flow_map(text);

create or replace function public.finance_write_flow_map(
  p_empresa_id text default null
)
returns table (
  flow_key text,
  dominio text,
  origem text,
  frontend_surface text,
  backend_surface text,
  legacy_tables text[],
  v2_tables text[],
  official_writer text,
  compatibility_writer text,
  current_mode text,
  risk_level text,
  flags jsonb,
  notes jsonb
)
language sql
stable
as $$
  with flags as (
    select jsonb_build_object(
      'operational_observability_enabled', public.finance_get_feature_flag('finance.operational_observability_enabled', p_empresa_id),
      'write_governance_enabled', public.finance_get_feature_flag('finance.write_governance_enabled', p_empresa_id),
      'payment_v2_contract_enabled', public.finance_get_feature_flag('finance.payment_v2_contract_enabled', p_empresa_id),
      'cockpit_v2_enabled', public.finance_get_feature_flag('finance.cockpit_v2_enabled', p_empresa_id),
      'cockpit_v2_compare_enabled', public.finance_get_feature_flag('finance.cockpit_v2_compare_enabled', p_empresa_id),
      'financial_alerts_v2_enabled', public.finance_get_feature_flag('finance.financial_alerts_v2_enabled', p_empresa_id),
      'reports_v2_enabled', public.finance_get_feature_flag('finance.reports_v2_enabled', p_empresa_id)
    ) as payload
  )
  select
    flow_key,
    dominio,
    origem,
    frontend_surface,
    backend_surface,
    legacy_tables,
    v2_tables,
    official_writer,
    compatibility_writer,
    current_mode,
    risk_level,
    flags.payload as flags,
    notes
  from flags
  cross join (
    values
      (
        'pagamento_conta_receber',
        'pagamento',
        'baixa manual de contas a receber',
        'ContasReceber',
        'entidade direta ContaReceber.update',
        array['conta_receber']::text[],
        array['obrigacao_financeira','cobranca_financeira','carteira_movimento']::text[],
        'legado',
        'v2 leitura/comparativo',
        'legado_principal',
        'alto',
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'source_of_truth', 'conta_receber.status/data_recebimento',
          'blocked_for_payment_v2', true
        )
      ),
      (
        'geracao_cobranca_agendamento',
        'cobranca',
        'geracao avulsa por agendamento',
        'Agendamentos',
        'entidade direta ContaReceber.create',
        array['conta_receber']::text[],
        array['obrigacao_financeira','cobranca_financeira']::text[],
        'legado',
        'shadow/cobertura V2',
        'legado_principal',
        'alto',
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'source_of_truth', 'conta_receber',
          'blocked_for_payment_v2', true
        )
      ),
      (
        'geracao_cobranca_registrador',
        'cobranca',
        'registrador manual',
        'Registrador',
        'ServiceProvided + ContaReceber.create',
        array['serviceprovided','conta_receber']::text[],
        array['obrigacao_financeira','cobranca_financeira']::text[],
        'legado',
        'relatorios e cobertura V2',
        'legado_principal',
        'alto',
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'source_of_truth', 'conta_receber',
          'blocked_for_payment_v2', true
        )
      ),
      (
        'planos_recorrencia_pacotes',
        'cobranca',
        'planos, recorrencia e pacotes',
        'PlanosConfig',
        'RecurringPackage/PackageBilling/ContaReceber',
        array['recurring_packages','package_billing','conta_receber','packagesession','packagecredit']::text[],
        array['obrigacao_financeira','cobranca_financeira']::text[],
        'legado',
        'cobertura e comparativo V2',
        'hibrido',
        'alto',
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'source_of_truth', 'conta_receber/package_billing',
          'blocked_for_payment_v2', true
        )
      ),
      (
        'orcamento_shadow_autorizacao',
        'orcamento_autorizacao',
        'orcamento aprovado + shadow',
        'Orcamentos / OrcamentosHistoricoPanel',
        'RPC finance_shadow_sync_orcamento + finance_approve_budget_with_authorization',
        array['orcamento']::text[],
        array['obrigacao_financeira','cobranca_financeira','autorizacao_financeira']::text[],
        'v2_controlado',
        'legado operacional',
        'hibrido',
        'medio',
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'source_of_truth', 'obrigacao_financeira/cobranca_financeira para shadow',
          'blocked_for_payment_v2', false
        )
      ),
      (
        'carteira_admin_reconciliacao',
        'carteira',
        'operacao administrativa controlada',
        'Movimentacoes',
        'RPC finance_wallet_admin_apply_operation + finance_reconcile_wallet_account',
        array['extratobancario']::text[],
        array['carteira_conta','carteira_movimento','carteira_reconciliacao']::text[],
        'v2_oficial',
        'extratobancario como apoio',
        'ja_substituido',
        'baixo',
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'source_of_truth', 'carteira_movimento',
          'blocked_for_payment_v2', false
        )
      ),
      (
        'cancelamento_v2',
        'cancelamento',
        'cancelamento financeiro controlado',
        'Orcamento / cancelamento controlado',
        'RPC finance_process_cancellation_v2 + finance_process_budget_cancellation_v2',
        array['replacement']::text[],
        array['cancelamento_financeiro','carteira_movimento','obrigacao_financeira']::text[],
        'v2_oficial',
        'replacement para historico/legado',
        'ja_substituido',
        'medio',
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'source_of_truth', 'cancelamento_financeiro',
          'blocked_for_payment_v2', false
        )
      ),
      (
        'comissao_quitacao',
        'comissao',
        'gatilho em obrigacao quitada',
        'ControleGerencial',
        'trigger trg_obrigacao_financeira_after_commission',
        array[]::text[],
        array['comissao_evento','obrigacao_financeira']::text[],
        'v2_oficial',
        'sem_compatibilidade_legada_oficial',
        'ja_substituido',
        'medio',
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'source_of_truth', 'comissao_evento',
          'blocked_for_payment_v2', false
        )
      ),
      (
        'contas_pagar_manual',
        'pagamento_fornecedor',
        'quitacao manual de lancamentos',
        'ContasPagar / Despesas / Receitas',
        'entidades diretas Lancamento/Despesa/Receita/ExtratoBancario',
        array['lancamento','despesa','receita','extratobancario']::text[],
        array[]::text[],
        'legado',
        'sem_equivalente_v2_ativo',
        'fora_de_escopo_atual',
        'alto',
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'source_of_truth', 'lancamento/despesa/receita',
          'blocked_for_payment_v2', true
        )
      )
  ) as flow_map(
    flow_key,
    dominio,
    origem,
    frontend_surface,
    backend_surface,
    legacy_tables,
    v2_tables,
    official_writer,
    compatibility_writer,
    current_mode,
    risk_level,
    notes
  );
$$;

drop function if exists public.finance_write_governance_matrix(text);

create or replace function public.finance_write_governance_matrix(
  p_empresa_id text default null
)
returns table (
  dominio text,
  leitura_oficial text,
  escrita_oficial text,
  compatibilidade text,
  legado_coexistente text,
  status_dominio text,
  fonte_oficial_atual text,
  risco_operacional text,
  payment_v2_blocker boolean,
  flags jsonb,
  notes jsonb
)
language sql
stable
as $$
  with flags as (
    select jsonb_build_object(
      'operational_observability_enabled', public.finance_get_feature_flag('finance.operational_observability_enabled', p_empresa_id),
      'write_governance_enabled', public.finance_get_feature_flag('finance.write_governance_enabled', p_empresa_id),
      'payment_v2_contract_enabled', public.finance_get_feature_flag('finance.payment_v2_contract_enabled', p_empresa_id),
      'reports_v2_enabled', public.finance_get_feature_flag('finance.reports_v2_enabled', p_empresa_id),
      'cockpit_v2_enabled', public.finance_get_feature_flag('finance.cockpit_v2_enabled', p_empresa_id)
    ) as payload
  )
  select
    dominio,
    leitura_oficial,
    escrita_oficial,
    compatibilidade,
    legado_coexistente,
    status_dominio,
    fonte_oficial_atual,
    risco_operacional,
    payment_v2_blocker,
    flags.payload as flags,
    notes
  from flags
  cross join (
    values
      (
        'pagamento',
        'cockpit_v2/relatorios_v2',
        'legado_conta_receber',
        'obrigacao_financeira/cobranca_financeira/carteira_movimento',
        'conta_receber',
        'hibrido_critico',
        'legado',
        'alto',
        true,
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'reason', 'nao existe caminho oficial unico de quitacao V2'
        )
      ),
      (
        'cobranca',
        'comparativo_v2 + cobertura legado_v2',
        'legado_conta_receber',
        'cobranca_financeira/obrigacao_financeira',
        'conta_receber',
        'hibrido',
        'legado',
        'alto',
        true,
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'reason', 'geracao de cobranca ainda nasce majoritariamente no legado'
        )
      ),
      (
        'obrigacao',
        'obrigacao_financeira',
        'shadow/autorizacao/cancelamento_v2',
        'conta_receber',
        'conta_receber',
        'hibrido_controlado',
        'v2_parcial',
        'medio',
        false,
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'reason', 'dominio V2 existe, mas nao cobre toda a vida financeira operacional'
        )
      ),
      (
        'carteira',
        'carteira_conta/carteira_movimento',
        'finance_apply_wallet_operation',
        'extratobancario como apoio',
        'extratobancario',
        'ja_substituido',
        'v2',
        'baixo',
        false,
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'reason', 'razao imutavel e reconciliacao ja estabilizadas'
        )
      ),
      (
        'comissao',
        'comissao_evento',
        'trigger em obrigacao quitada',
        'nenhuma',
        'sem_modelagem_legada_oficial',
        'ja_substituido',
        'v2',
        'medio',
        false,
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'reason', 'gatilho ja depende de quitacao V2 ou hibrida'
        )
      ),
      (
        'cancelamento',
        'cancelamento_financeiro',
        'finance_process_cancellation_v2',
        'replacement para historico',
        'replacement',
        'ja_substituido',
        'v2',
        'medio',
        false,
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'reason', 'cancelamento V2 ja esta auditavel e idempotente'
        )
      ),
      (
        'orcamento_autorizacao',
        'orcamento + obrigacao_financeira/cobranca_financeira',
        'shadow + autorizacao controlada',
        'orcamento legado',
        'orcamento operacional',
        'hibrido_controlado',
        'v2_parcial',
        'medio',
        false,
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'reason', 'orcamento ja conversa com a camada financeira nova sem substituir todo o fluxo'
        )
      )
  ) as governance(
    dominio,
    leitura_oficial,
    escrita_oficial,
    compatibilidade,
    legado_coexistente,
    status_dominio,
    fonte_oficial_atual,
    risco_operacional,
    payment_v2_blocker,
    notes
  );
$$;

drop function if exists public.finance_hybrid_write_audit(text, date, date, integer);

create or replace function public.finance_hybrid_write_audit(
  p_empresa_id text,
  p_periodo_inicio date default null,
  p_periodo_fim date default null,
  p_limit integer default 200
)
returns table (
  event_date timestamptz,
  write_domain text,
  entity_type text,
  entity_id text,
  write_layer text,
  source_role text,
  empresa_id text,
  carteira_id text,
  carteira_conta_id text,
  counterparty_entity_type text,
  counterparty_entity_id text,
  status text,
  amount numeric,
  source_key text,
  origin_label text,
  hybrid_classification text,
  operational_risk text,
  payload jsonb
)
language sql
stable
as $$
  with coverage as (
    select *
    from public.finance_cockpit_legacy_receivables_coverage(p_empresa_id, p_periodo_inicio, p_periodo_fim)
  ),
  latest_reconciliation as (
    select distinct on (cr.carteira_conta_id)
      cr.carteira_conta_id,
      cr.status,
      cr.diferenca,
      cr.created_date
    from public.carteira_reconciliacao cr
    where cr.empresa_id = p_empresa_id
    order by cr.carteira_conta_id, cr.created_date desc, cr.id desc
  ),
  audit_rows as (
    select
      coalesce(cr.created_date, cov.vencimento::timestamptz, cov.data_recebimento::timestamptz) as event_date,
      'pagamento'::text as write_domain,
      'conta_receber'::text as entity_type,
      cov.conta_receber_id as entity_id,
      'legacy'::text as write_layer,
      'official_current'::text as source_role,
      cov.conta_receber_empresa_id as empresa_id,
      cov.cliente_id as carteira_id,
      cov.carteira_conta_id,
      case
        when cov.cobranca_id is not null then 'cobranca_financeira'
        when cov.obrigacao_id is not null then 'obrigacao_financeira'
        else null
      end as counterparty_entity_type,
      coalesce(cov.cobranca_id, cov.obrigacao_id) as counterparty_entity_id,
      cov.status_legado as status,
      round(coalesce(cov.valor, 0), 2) as amount,
      coalesce(cr.source_key, 'legacy_conta_receber|' || cov.conta_receber_id) as source_key,
      'conta_receber'::text as origin_label,
      cov.classificacao as hybrid_classification,
      case
        when cov.classificacao = 'B' and cov.considera_no_comparativo then 'alta'
        when cov.classificacao = 'C' then 'media'
        when cov.classificacao = 'D' then 'baixa'
        else 'baixa'
      end as operational_risk,
      jsonb_build_object(
        'motivo_cobertura', cov.motivo_cobertura,
        'considera_no_comparativo', cov.considera_no_comparativo,
        'precisa_virar_obrigacao_v2', cov.precisa_virar_obrigacao_v2,
        'precisa_virar_cobranca_v2', cov.precisa_virar_cobranca_v2,
        'financial_behavior', cov.financial_behavior
      ) as payload
    from coverage cov
    left join public.conta_receber cr on cr.id = cov.conta_receber_id

    union all

    select
      ofn.created_date as event_date,
      'obrigacao'::text,
      'obrigacao_financeira'::text,
      ofn.id,
      'v2'::text,
      case
        when ofn.source_key like 'legacy_conta_receber|%' then 'compatibility_shadow'
        else 'official_v2'
      end,
      ofn.empresa_id,
      ofn.carteira_id,
      ofn.carteira_conta_id,
      'cobranca_financeira'::text,
      null::text,
      ofn.status,
      round(coalesce(ofn.valor_final, ofn.valor_em_aberto, 0), 2),
      ofn.source_key,
      coalesce(ofn.tipo_item, 'obrigacao_financeira'),
      case
        when ofn.source_key like 'legacy_conta_receber|%' then 'shadow_legado_para_v2'
        else 'v2_oficial'
      end,
      case
        when ofn.source_key like 'legacy_conta_receber|%' then 'media'
        else 'baixa'
      end,
      jsonb_build_object(
        'orcamento_id', ofn.orcamento_id,
        'appointment_id', ofn.appointment_id,
        'due_date', ofn.due_date,
        'valor_em_aberto', ofn.valor_em_aberto
      ) as payload
    from public.obrigacao_financeira ofn
    where ofn.empresa_id = p_empresa_id
      and (p_periodo_inicio is null or coalesce(ofn.due_date, ofn.created_date::date) >= p_periodo_inicio)
      and (p_periodo_fim is null or coalesce(ofn.due_date, ofn.created_date::date) <= p_periodo_fim)

    union all

    select
      cf.created_date as event_date,
      'cobranca'::text,
      'cobranca_financeira'::text,
      cf.id,
      'v2'::text,
      case
        when cf.source_key like 'legacy_conta_receber|%' then 'compatibility_shadow'
        else 'official_v2'
      end,
      cf.empresa_id,
      null::text,
      cf.carteira_conta_id,
      null::text,
      null::text,
      cf.status,
      round(coalesce(cf.valor_total, cf.valor_em_aberto, 0), 2),
      cf.source_key,
      'cobranca_financeira'::text,
      case
        when cf.source_key like 'legacy_conta_receber|%' then 'shadow_legado_para_v2'
        else 'v2_oficial'
      end,
      case
        when cf.source_key like 'legacy_conta_receber|%' then 'media'
        else 'baixa'
      end,
      jsonb_build_object(
        'due_date', cf.due_date,
        'valor_em_aberto', cf.valor_em_aberto
      ) as payload
    from public.cobranca_financeira cf
    where cf.empresa_id = p_empresa_id
      and (p_periodo_inicio is null or coalesce(cf.due_date, cf.created_date::date) >= p_periodo_inicio)
      and (p_periodo_fim is null or coalesce(cf.due_date, cf.created_date::date) <= p_periodo_fim)

    union all

    select
      cm.created_date as event_date,
      'carteira'::text,
      'carteira_movimento'::text,
      cm.id,
      'v2'::text,
      'official_v2'::text,
      cm.empresa_id,
      cc.carteira_id,
      cm.carteira_conta_id,
      case when cm.obrigacao_id is not null then 'obrigacao_financeira' else null end,
      cm.obrigacao_id,
      cm.tipo,
      round(coalesce(cm.valor, 0), 2),
      cm.operacao_idempotencia,
      cm.origem,
      'v2_oficial'::text,
      case
        when cm.natureza = 'entrada' and cm.obrigacao_id is null then 'media'
        else 'baixa'
      end,
      jsonb_build_object(
        'natureza', cm.natureza,
        'saldo_anterior', cm.saldo_anterior,
        'saldo_final', cm.saldo_final,
        'transacao_id', cm.transacao_id
      ) as payload
    from public.carteira_movimento cm
    join public.carteira_conta cc on cc.id = cm.carteira_conta_id
    where cm.empresa_id = p_empresa_id
      and (p_periodo_inicio is null or cm.created_date::date >= p_periodo_inicio)
      and (p_periodo_fim is null or cm.created_date::date <= p_periodo_fim)

    union all

    select
      ce.created_date as event_date,
      'comissao'::text,
      'comissao_evento'::text,
      ce.id,
      'v2'::text,
      'official_v2'::text,
      ce.empresa_id,
      null::text,
      null::text,
      case when ce.obrigacao_id is not null then 'obrigacao_financeira' else null end,
      ce.obrigacao_id,
      ce.status,
      round(coalesce(ce.valor_comissao, 0), 2),
      ce.source_key,
      ce.origem,
      'v2_oficial'::text,
      case
        when ce.status in ('estornada', 'parcialmente_estornada') then 'media'
        else 'baixa'
      end,
      jsonb_build_object(
        'vendedor_user_id', ce.vendedor_user_id,
        'percentual', ce.percentual,
        'cobranca_financeira_id', ce.cobranca_financeira_id
      ) as payload
    from public.comissao_evento ce
    where ce.empresa_id = p_empresa_id
      and (p_periodo_inicio is null or ce.created_date::date >= p_periodo_inicio)
      and (p_periodo_fim is null or ce.created_date::date <= p_periodo_fim)

    union all

    select
      cfn.created_date as event_date,
      'cancelamento'::text,
      'cancelamento_financeiro'::text,
      cfn.id,
      'v2'::text,
      'official_v2'::text,
      cfn.empresa_id,
      null::text,
      cfn.carteira_conta_id,
      case when cfn.obrigacao_id is not null then 'obrigacao_financeira' else null end,
      cfn.obrigacao_id,
      cfn.status,
      round(coalesce(cfn.valor_multa, 0), 2),
      cfn.source_key,
      cfn.origem_cancelamento,
      'v2_oficial'::text,
      case
        when cfn.gerar_credito_compensatorio then 'media'
        else 'baixa'
      end,
      jsonb_build_object(
        'multa_movimento_id', cfn.multa_movimento_id,
        'credito_movimento_id', cfn.credito_movimento_id,
        'gerar_credito_compensatorio', cfn.gerar_credito_compensatorio
      ) as payload
    from public.cancelamento_financeiro cfn
    where cfn.empresa_id = p_empresa_id
      and (p_periodo_inicio is null or cfn.created_date::date >= p_periodo_inicio)
      and (p_periodo_fim is null or cfn.created_date::date <= p_periodo_fim)
  )
  select
    ar.event_date,
    ar.write_domain,
    ar.entity_type,
    ar.entity_id,
    ar.write_layer,
    ar.source_role,
    ar.empresa_id,
    ar.carteira_id,
    ar.carteira_conta_id,
    ar.counterparty_entity_type,
    ar.counterparty_entity_id,
    ar.status,
    ar.amount,
    ar.source_key,
    ar.origin_label,
    ar.hybrid_classification,
    ar.operational_risk,
    ar.payload
  from audit_rows ar
  order by ar.event_date desc nulls last, ar.entity_type, ar.entity_id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

drop function if exists public.finance_operational_reconciliation_matrix(text, date, date);

create or replace function public.finance_operational_reconciliation_matrix(
  p_empresa_id text,
  p_periodo_inicio date default null,
  p_periodo_fim date default null
)
returns table (
  check_key text,
  check_label text,
  status text,
  severity text,
  legacy_value numeric,
  v2_value numeric,
  difference_value numeric,
  justification text,
  payload jsonb
)
language plpgsql
stable
as $$
declare
  v_legacy_open_value numeric := 0;
  v_v2_obrigacoes_open_value numeric := 0;
  v_legacy_overdue_count numeric := 0;
  v_v2_overdue_count numeric := 0;
  v_coverage_missing_count numeric := 0;
  v_expected_difference_count numeric := 0;
  v_orphan_legacy_count numeric := 0;
  v_wallet_divergent_count numeric := 0;
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  select
    round(coalesce(sum(case when cov.considera_no_comparativo then coalesce(cov.valor, 0) else 0 end), 0), 2),
    coalesce(sum(case when cov.considera_no_comparativo and cov.vencimento < current_date then 1 else 0 end), 0)::numeric,
    coalesce(sum(case when cov.classificacao = 'B' and cov.considera_no_comparativo then 1 else 0 end), 0)::numeric,
    coalesce(sum(case when cov.classificacao = 'D' then 1 else 0 end), 0)::numeric,
    coalesce(sum(case when cov.classificacao = 'C' then 1 else 0 end), 0)::numeric
  into
    v_legacy_open_value,
    v_legacy_overdue_count,
    v_coverage_missing_count,
    v_expected_difference_count,
    v_orphan_legacy_count
  from public.finance_cockpit_legacy_receivables_coverage(p_empresa_id, p_periodo_inicio, p_periodo_fim) cov;

  select round(coalesce(sum(coalesce(ofn.valor_em_aberto, 0)), 0), 2)
    into v_v2_obrigacoes_open_value
  from public.obrigacao_financeira ofn
  where ofn.empresa_id = p_empresa_id
    and ofn.status in ('aberta', 'parcial', 'vencida')
    and coalesce(ofn.valor_em_aberto, 0) > 0
    and (p_periodo_inicio is null or coalesce(ofn.due_date, ofn.created_date::date) >= p_periodo_inicio)
    and (p_periodo_fim is null or coalesce(ofn.due_date, ofn.created_date::date) <= p_periodo_fim);

  select coalesce(count(*)::numeric, 0)
    into v_v2_overdue_count
  from public.cobranca_financeira cf
  where cf.empresa_id = p_empresa_id
    and cf.status in ('aberta', 'parcial', 'vencida')
    and cf.due_date < current_date
    and coalesce(cf.valor_em_aberto, 0) > 0
    and (p_periodo_inicio is null or coalesce(cf.due_date, cf.created_date::date) >= p_periodo_inicio)
    and (p_periodo_fim is null or coalesce(cf.due_date, cf.created_date::date) <= p_periodo_fim);

  with latest_reconciliation as (
    select distinct on (cr.carteira_conta_id)
      cr.carteira_conta_id,
      cr.status
    from public.carteira_reconciliacao cr
    where cr.empresa_id = p_empresa_id
    order by cr.carteira_conta_id, cr.created_date desc, cr.id desc
  )
  select coalesce(count(*)::numeric, 0)
    into v_wallet_divergent_count
  from latest_reconciliation lr
  where lr.status = 'divergente';

  return query
  with metrics as (
    select
      'receivables_open_value'::text as check_key,
      'Saldo legado em aberto vs obrigacoes V2'::text as check_label,
      round(coalesce(v_legacy_open_value, 0), 2) as legacy_value,
      round(coalesce(v_v2_obrigacoes_open_value, 0), 2) as v2_value,
      case
        when v_coverage_missing_count > 0 then 'divergencia_real_na_cobertura'
        when v_expected_difference_count > 0 then 'residuos_formalmente_justificados'
        when v_orphan_legacy_count > 0 then 'legado_orfao_excluido_do_escopo'
        else 'sem_diferenca'
      end as justification,
      jsonb_build_object(
        'coverage_missing_count', v_coverage_missing_count,
        'expected_difference_count', v_expected_difference_count,
        'orphan_legacy_count', v_orphan_legacy_count
      ) as payload
    union all
    select
      'charges_overdue_count',
      'Cobrancas vencidas legado vs V2',
      round(coalesce(v_legacy_overdue_count, 0), 2),
      round(coalesce(v_v2_overdue_count, 0), 2),
      case
        when v_coverage_missing_count > 0 then 'divergencia_real_na_cobertura'
        when v_expected_difference_count > 0 then 'residuos_formalmente_justificados'
        when v_orphan_legacy_count > 0 then 'legado_orfao_excluido_do_escopo'
        else 'sem_diferenca'
      end,
      jsonb_build_object(
        'coverage_missing_count', v_coverage_missing_count,
        'expected_difference_count', v_expected_difference_count,
        'orphan_legacy_count', v_orphan_legacy_count
      )
    union all
    select
      'wallet_reconciliation_divergences',
      'Carteiras com reconciliacao divergente',
      0::numeric,
      round(coalesce(v_wallet_divergent_count, 0), 2),
      case when v_wallet_divergent_count > 0 then 'carteiras_divergentes_detectadas' else 'sem_diferenca' end,
      jsonb_build_object('wallet_divergent_count', v_wallet_divergent_count)
    union all
    select
      'coverage_missing_rows',
      'Linhas com cobertura faltando',
      round(coalesce(v_coverage_missing_count, 0), 2),
      0::numeric,
      case when v_coverage_missing_count > 0 then 'cobertura_v2_faltando' else 'sem_diferenca' end,
      jsonb_build_object('coverage_missing_count', v_coverage_missing_count)
  )
  select
    m.check_key,
    m.check_label,
    case when round(abs(m.v2_value - m.legacy_value), 2) = 0 then 'ok' else 'divergente' end as status,
    case
      when round(abs(m.v2_value - m.legacy_value), 2) = 0 then 'ok'
      when round(abs(m.v2_value - m.legacy_value), 2) <= 1 then 'baixa'
      when round(abs(m.v2_value - m.legacy_value), 2) <= 100 then 'media'
      else 'alta'
    end as severity,
    m.legacy_value,
    m.v2_value,
    round(m.v2_value - m.legacy_value, 2) as difference_value,
    m.justification,
    m.payload
  from metrics m;
end;
$$;

drop function if exists public.finance_operational_observability_context(text, date, date);

create or replace function public.finance_operational_observability_context(
  p_empresa_id text,
  p_periodo_inicio date default null,
  p_periodo_fim date default null
)
returns table (
  empresa_id text,
  periodo_inicio date,
  periodo_fim date,
  operational_observability_enabled boolean,
  write_governance_enabled boolean,
  payment_v2_contract_enabled boolean,
  cockpit_v2_enabled boolean,
  cockpit_v2_compare_enabled boolean,
  financial_alerts_v2_enabled boolean,
  reports_v2_enabled boolean,
  hybrid_write_events_count integer,
  legacy_only_events_count integer,
  v2_only_events_count integer,
  legacy_receivables_total integer,
  legacy_receivables_open_count integer,
  legacy_receivables_paid_count integer,
  v2_obligations_total integer,
  v2_obligations_open_count integer,
  v2_charges_total integer,
  v2_charges_open_count integer,
  wallet_movements_total integer,
  wallet_accounts_total integer,
  wallet_reconciliation_divergent_count integer,
  commissions_total integer,
  cancellations_total integer,
  real_divergence_count integer,
  expected_difference_count integer,
  orphan_legacy_count integer,
  non_comparable_count integer,
  active_alerts_count integer,
  payment_write_official text,
  payment_v2_ready_gate boolean
)
language plpgsql
stable
as $$
declare
  v_hybrid_count integer := 0;
  v_legacy_only_count integer := 0;
  v_v2_only_count integer := 0;
  v_legacy_total integer := 0;
  v_legacy_open integer := 0;
  v_legacy_paid integer := 0;
  v_obligations_total integer := 0;
  v_obligations_open integer := 0;
  v_charges_total integer := 0;
  v_charges_open integer := 0;
  v_wallet_movements_total integer := 0;
  v_wallet_accounts_total integer := 0;
  v_wallet_divergent integer := 0;
  v_commissions_total integer := 0;
  v_cancellations_total integer := 0;
  v_real_divergence integer := 0;
  v_expected_difference integer := 0;
  v_orphan_legacy integer := 0;
  v_non_comparable integer := 0;
  v_alerts_total integer := 0;
begin
  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id e obrigatorio.';
  end if;

  select
    coalesce(sum(case when ar.write_layer = 'legacy' and ar.hybrid_classification = 'B' then 1 else 0 end), 0)::integer,
    coalesce(sum(case when ar.write_layer = 'legacy' then 1 else 0 end), 0)::integer,
    coalesce(sum(case when ar.write_layer = 'v2' then 1 else 0 end), 0)::integer
  into
    v_hybrid_count,
    v_legacy_only_count,
    v_v2_only_count
  from public.finance_hybrid_write_audit(p_empresa_id, p_periodo_inicio, p_periodo_fim, 1000) ar;

  select
    coalesce(count(*), 0)::integer,
    coalesce(sum(case when cov.status_legado = 'pago' or cov.data_recebimento is not null then 1 else 0 end), 0)::integer,
    coalesce(sum(case when cov.status_legado <> 'pago' and cov.data_recebimento is null then 1 else 0 end), 0)::integer,
    coalesce(sum(case when cov.classificacao = 'B' and cov.considera_no_comparativo then 1 else 0 end), 0)::integer,
    coalesce(sum(case when cov.classificacao = 'D' then 1 else 0 end), 0)::integer,
    coalesce(sum(case when cov.classificacao = 'C' then 1 else 0 end), 0)::integer,
    coalesce(sum(case when not cov.considera_no_comparativo then 1 else 0 end), 0)::integer
  into
    v_legacy_total,
    v_legacy_paid,
    v_legacy_open,
    v_real_divergence,
    v_expected_difference,
    v_orphan_legacy,
    v_non_comparable
  from public.finance_cockpit_legacy_receivables_coverage(p_empresa_id, p_periodo_inicio, p_periodo_fim) cov;

  select count(*)::integer
    into v_obligations_total
  from public.obrigacao_financeira ofn
  where ofn.empresa_id = p_empresa_id
    and (p_periodo_inicio is null or coalesce(ofn.due_date, ofn.created_date::date) >= p_periodo_inicio)
    and (p_periodo_fim is null or coalesce(ofn.due_date, ofn.created_date::date) <= p_periodo_fim);

  select count(*)::integer
    into v_obligations_open
  from public.obrigacao_financeira ofn
  where ofn.empresa_id = p_empresa_id
    and ofn.status in ('aberta', 'parcial', 'vencida')
    and coalesce(ofn.valor_em_aberto, 0) > 0
    and (p_periodo_inicio is null or coalesce(ofn.due_date, ofn.created_date::date) >= p_periodo_inicio)
    and (p_periodo_fim is null or coalesce(ofn.due_date, ofn.created_date::date) <= p_periodo_fim);

  select count(*)::integer
    into v_charges_total
  from public.cobranca_financeira cf
  where cf.empresa_id = p_empresa_id
    and (p_periodo_inicio is null or coalesce(cf.due_date, cf.created_date::date) >= p_periodo_inicio)
    and (p_periodo_fim is null or coalesce(cf.due_date, cf.created_date::date) <= p_periodo_fim);

  select count(*)::integer
    into v_charges_open
  from public.cobranca_financeira cf
  where cf.empresa_id = p_empresa_id
    and cf.status in ('aberta', 'parcial', 'vencida')
    and coalesce(cf.valor_em_aberto, 0) > 0
    and (p_periodo_inicio is null or coalesce(cf.due_date, cf.created_date::date) >= p_periodo_inicio)
    and (p_periodo_fim is null or coalesce(cf.due_date, cf.created_date::date) <= p_periodo_fim);

  select count(*)::integer
    into v_wallet_movements_total
  from public.carteira_movimento cm
  where cm.empresa_id = p_empresa_id
    and (p_periodo_inicio is null or cm.created_date::date >= p_periodo_inicio)
    and (p_periodo_fim is null or cm.created_date::date <= p_periodo_fim);

  select count(*)::integer
    into v_wallet_accounts_total
  from public.carteira_conta cc
  where cc.empresa_id = p_empresa_id;

  with latest_reconciliation as (
    select distinct on (cr.carteira_conta_id)
      cr.carteira_conta_id,
      cr.status
    from public.carteira_reconciliacao cr
    where cr.empresa_id = p_empresa_id
    order by cr.carteira_conta_id, cr.created_date desc, cr.id desc
  )
  select count(*)::integer
    into v_wallet_divergent
  from latest_reconciliation lr
  where lr.status = 'divergente';

  select count(*)::integer
    into v_commissions_total
  from public.comissao_evento ce
  where ce.empresa_id = p_empresa_id
    and (p_periodo_inicio is null or ce.created_date::date >= p_periodo_inicio)
    and (p_periodo_fim is null or ce.created_date::date <= p_periodo_fim);

  select count(*)::integer
    into v_cancellations_total
  from public.cancelamento_financeiro cfn
  where cfn.empresa_id = p_empresa_id
    and (p_periodo_inicio is null or cfn.created_date::date >= p_periodo_inicio)
    and (p_periodo_fim is null or cfn.created_date::date <= p_periodo_fim);

  with latest_reconciliation as (
    select distinct on (cr.carteira_conta_id)
      cr.carteira_conta_id,
      cr.status,
      cr.diferenca
    from public.carteira_reconciliacao cr
    where cr.empresa_id = p_empresa_id
    order by cr.carteira_conta_id, cr.created_date desc, cr.id desc
  ),
  alerts as (
    select 1 as alert_count
    from public.carteira_conta cc
    where cc.empresa_id = p_empresa_id
      and coalesce(cc.saldo_atual, 0) < 0

    union all

    select 1
    from public.cobranca_financeira cf
    where cf.empresa_id = p_empresa_id
      and cf.status in ('aberta', 'parcial', 'vencida')
      and coalesce(cf.valor_em_aberto, 0) > 0
      and cf.due_date < current_date

    union all

    select 1
    from public.obrigacao_financeira ofn
    where ofn.empresa_id = p_empresa_id
      and ofn.status in ('aberta', 'parcial', 'vencida')
      and coalesce(ofn.valor_em_aberto, 0) > 0
      and ofn.due_date < current_date

    union all

    select 1
    from latest_reconciliation lr
    where lr.status = 'divergente'

    union all

    select 1
    from public.comissao_evento ce
    where ce.empresa_id = p_empresa_id
      and ce.status in ('estornada', 'parcialmente_estornada')

    union all

    select 1
    from public.cancelamento_financeiro cfn
    where cfn.empresa_id = p_empresa_id
      and cfn.gerar_credito_compensatorio = true

    union all

    select 1
    from public.finance_snapshot_delta fsd
    where fsd.empresa_id = p_empresa_id
      and abs(coalesce(fsd.impacto_financeiro, 0)) > 0
  )
  select coalesce(count(*), 0)::integer
    into v_alerts_total
  from alerts;

  return query
  select
    p_empresa_id,
    p_periodo_inicio,
    p_periodo_fim,
    public.finance_get_feature_flag('finance.operational_observability_enabled', p_empresa_id),
    public.finance_get_feature_flag('finance.write_governance_enabled', p_empresa_id),
    public.finance_get_feature_flag('finance.payment_v2_contract_enabled', p_empresa_id),
    public.finance_get_feature_flag('finance.cockpit_v2_enabled', p_empresa_id),
    public.finance_get_feature_flag('finance.cockpit_v2_compare_enabled', p_empresa_id),
    public.finance_get_feature_flag('finance.financial_alerts_v2_enabled', p_empresa_id),
    public.finance_get_feature_flag('finance.reports_v2_enabled', p_empresa_id),
    v_hybrid_count,
    v_legacy_only_count,
    v_v2_only_count,
    v_legacy_total,
    v_legacy_open,
    v_legacy_paid,
    v_obligations_total,
    v_obligations_open,
    v_charges_total,
    v_charges_open,
    v_wallet_movements_total,
    v_wallet_accounts_total,
    v_wallet_divergent,
    v_commissions_total,
    v_cancellations_total,
    v_real_divergence,
    v_expected_difference,
    v_orphan_legacy,
    v_non_comparable,
    v_alerts_total,
    'legado'::text,
    (v_real_divergence = 0 and v_wallet_divergent = 0);
end;
$$;

drop function if exists public.finance_payment_v2_contract(text);

create or replace function public.finance_payment_v2_contract(
  p_empresa_id text default null
)
returns table (
  contract_stage text,
  rule_key text,
  status text,
  severity text,
  description text,
  blocked_by text,
  payload jsonb
)
language plpgsql
stable
as $$
declare
  v_context record;
begin
  if coalesce(trim(coalesce(p_empresa_id, '')), '') <> '' then
    select * into v_context
    from public.finance_operational_observability_context(p_empresa_id, current_date - 30, current_date);
  end if;

  return query
  select
    item.contract_stage,
    item.rule_key,
    item.status,
    item.severity,
    item.description,
    item.blocked_by,
    item.payload
  from (
    values
      (
        'precondicao',
        'fonte_oficial_pagamento',
        'pendente_implementacao',
        'alta',
        'Pagamento V2 precisa definir um unico caminho oficial de quitacao por obrigacao/cobranca.',
        'legado_conta_receber_ainda_e_escrita_oficial',
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'payment_write_official', coalesce(v_context.payment_write_official, 'legado'),
          'payment_v2_ready_gate', coalesce(v_context.payment_v2_ready_gate, false)
        )
      ),
      (
        'precondicao',
        'idempotencia',
        'obrigatorio',
        'alta',
        'Toda quitacao V2 deve usar chave de idempotencia unica por empresa e evento de pagamento.',
        'desenho_da_chave_ainda_nao_formalizado',
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'base_existente', 'uq_carteira_movimento_idempotencia'
        )
      ),
      (
        'atomicidade',
        'movimento_obrigacao_cobranca',
        'obrigatorio',
        'alta',
        'Pagamento V2 precisa liquidar movimento, obrigacao e cobranca na mesma fronteira transacional.',
        'fluxo_real_de_pagamento_ainda_nao_existe',
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'real_divergence_count', coalesce(v_context.real_divergence_count, 0)
        )
      ),
      (
        'concorrencia',
        'locks',
        'obrigatorio',
        'alta',
        'Pagamento V2 precisa travar carteira e entidade financeira alvo para evitar dupla quitacao.',
        'estrategia_de_lock_ainda_nao_materializada',
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'wallet_accounts_total', coalesce(v_context.wallet_accounts_total, 0)
        )
      ),
      (
        'reversibilidade',
        'sem_mutacao_do_razao',
        'preparado',
        'media',
        'Reversoes devem usar movimentos compensatorios; carteira_movimento permanece imutavel.',
        null,
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'ledger_strategy', 'compensacao_ao_invés_de_mutacao'
        )
      ),
      (
        'coexistencia',
        'legado_preservado',
        'obrigatorio',
        'media',
        'Durante o rollout, conta_receber continua preservado para compatibilidade e rollback.',
        null,
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'legacy_receivables_total', coalesce(v_context.legacy_receivables_total, 0),
          'legacy_only_events_count', coalesce(v_context.legacy_only_events_count, 0)
        )
      ),
      (
        'observabilidade',
        'auditoria_operacional',
        'preparado_na_sprint_9a',
        'media',
        'Pagamento V2 deve nascer usando a camada de observabilidade, governanca e reconciliacao operacional.',
        null,
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'operational_observability_enabled', public.finance_get_feature_flag('finance.operational_observability_enabled', p_empresa_id),
          'write_governance_enabled', public.finance_get_feature_flag('finance.write_governance_enabled', p_empresa_id)
        )
      ),
      (
        'rollout',
        'flags_progressivas',
        'obrigatorio',
        'media',
        'Pagamento V2 deve abrir com flags por empresa e reversao simples, sem migracao destrutiva.',
        null,
        jsonb_build_object(
          'empresa_id', p_empresa_id,
          'recommendation', 'abrir_somente_na_9b'
        )
      )
  ) as item(
    contract_stage,
    rule_key,
    status,
    severity,
    description,
    blocked_by,
    payload
  );
end;
$$;

select * from public.finance_ensure_observability_feature_flags();
