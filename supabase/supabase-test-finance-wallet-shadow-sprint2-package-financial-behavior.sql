-- Sprint 2 corrective test
-- Pré-requisito:
-- 1. supabase-schema-finance-wallet-shadow-sprint2-package-financial-behavior.sql aplicada

begin;

do $$
declare
  v_exists boolean;
  v_invalid_count integer;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recurring_packages'
      and column_name = 'financial_behavior'
  )
  into v_exists;

  if not v_exists then
    raise exception 'Coluna recurring_packages.financial_behavior não foi criada.';
  end if;

  select count(*)
    into v_invalid_count
  from public.recurring_packages
  where financial_behavior not in ('billable_detailed', 'operational_only');

  if v_invalid_count <> 0 then
    raise exception 'Existem % recurring_packages com financial_behavior inválido.', v_invalid_count;
  end if;

  insert into public.recurring_packages (
    id,
    empresa_id,
    client_id,
    pet_id,
    service_id,
    financial_behavior,
    frequency,
    price_per_session,
    start_date,
    status,
    metadata,
    created_at,
    updated_at,
    created_date,
    updated_date
  )
  values (
    'test_recurring_package_financial_behavior',
    'empresa_demo',
    'client_shadow_behavior',
    'dog_shadow_behavior',
    'banho',
    'billable_detailed',
    'semanal',
    50,
    current_date,
    'ativo',
    '{}'::jsonb,
    now(),
    now(),
    now(),
    now()
  );

  begin
    insert into public.recurring_packages (
      id,
      empresa_id,
      client_id,
      pet_id,
      service_id,
      financial_behavior,
      frequency,
      price_per_session,
      start_date,
      status,
      metadata,
      created_at,
      updated_at,
      created_date,
      updated_date
    )
    values (
      'test_recurring_package_financial_behavior_invalid',
      'empresa_demo',
      'client_shadow_behavior',
      'dog_shadow_behavior',
      'banho',
      'indefinido',
      'semanal',
      50,
      current_date,
      'ativo',
      '{}'::jsonb,
      now(),
      now(),
      now(),
      now()
    );

    raise exception 'Constraint de financial_behavior não bloqueou valor inválido.';
  exception
    when check_violation then
      null;
  end;
end;
$$;

rollback;
