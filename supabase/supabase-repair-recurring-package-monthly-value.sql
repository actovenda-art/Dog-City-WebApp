begin;

create temporary table day_care_monthly_repair_targets on commit drop as
with package_values as (
  select
    rp.id as package_id,
    coalesce(pc.monthly_value, pc.valor_mensal)::numeric as monthly_value
  from public.recurring_packages rp
  join public.plan_config pc
    on pc.id = nullif(rp.metadata ->> 'plan_config_id', '')
  where rp.service_id = 'day_care'
    and coalesce(pc.monthly_value, pc.valor_mensal, 0) > 0
),
session_rollup as (
  select
    ps.package_id,
    ps.billing_month,
    count(*) filter (where ps.deleted_at is null)::integer as expected_sessions,
    count(*) filter (
      where ps.deleted_at is null
        and ps.status in ('cancelada_com_credito', 'cancelada_sem_credito')
    )::integer as pre_cancelled_sessions,
    count(*) filter (
      where ps.deleted_at is null
        and ps.status not in ('cancelada_com_credito', 'cancelada_sem_credito')
    )::integer as billable_sessions
  from public.package_sessions ps
  group by ps.package_id, ps.billing_month
)
select
  pb.id as billing_id,
  pb.package_id,
  pb.billing_month,
  pb.conta_receber_id,
  sr.expected_sessions,
  sr.pre_cancelled_sessions,
  greatest(sr.billable_sessions - least(coalesce(pb.credits_used, 0), sr.billable_sessions), 0)::integer as charged_sessions,
  round(pv.monthly_value / sr.billable_sessions, 2) as unit_price,
  round(
    pv.monthly_value
      * greatest(sr.billable_sessions - least(coalesce(pb.credits_used, 0), sr.billable_sessions), 0)
      / sr.billable_sessions,
    2
  ) as total_amount,
  pv.monthly_value
from public.package_billings pb
join package_values pv on pv.package_id = pb.package_id
join session_rollup sr
  on sr.package_id = pb.package_id
 and sr.billing_month = pb.billing_month
left join public.conta_receber cr on cr.id = pb.conta_receber_id
where sr.billable_sessions > 0
  and lower(coalesce(pb.payment_status, 'pendente')) not in ('pago', 'recebido', 'quitado')
  and cr.data_recebimento is null
  and lower(coalesce(cr.status, 'pendente')) not in ('pago', 'recebido', 'quitado')
  and (
    abs(coalesce(pb.unit_price, 0) - round(pv.monthly_value / sr.billable_sessions, 2)) >= 0.01
    or abs(
      coalesce(pb.total_amount, 0)
        - round(
          pv.monthly_value
            * greatest(sr.billable_sessions - least(coalesce(pb.credits_used, 0), sr.billable_sessions), 0)
            / sr.billable_sessions,
          2
        )
    ) >= 0.01
  );

update public.recurring_packages rp
set
  metadata = coalesce(rp.metadata, '{}'::jsonb) || jsonb_build_object(
    'plan_monthly_value', coalesce(pc.monthly_value, pc.valor_mensal)::numeric,
    'plan_monthly_value_snapshot', coalesce(pc.monthly_value, pc.valor_mensal)::numeric,
    'price_per_session_snapshot', rp.price_per_session
  ),
  updated_at = now(),
  updated_date = now()
from public.plan_config pc
where rp.service_id = 'day_care'
  and pc.id = nullif(rp.metadata ->> 'plan_config_id', '')
  and coalesce(pc.monthly_value, pc.valor_mensal, 0) > 0
  and (
    rp.metadata -> 'plan_monthly_value' is distinct from to_jsonb(coalesce(pc.monthly_value, pc.valor_mensal)::numeric)
    or rp.metadata -> 'plan_monthly_value_snapshot' is distinct from to_jsonb(coalesce(pc.monthly_value, pc.valor_mensal)::numeric)
  );

update public.package_billings pb
set
  expected_sessions = target.expected_sessions,
  pre_cancelled_sessions = target.pre_cancelled_sessions,
  charged_sessions = target.charged_sessions,
  unit_price = target.unit_price,
  total_amount = target.total_amount,
  metadata = coalesce(pb.metadata, '{}'::jsonb) || jsonb_build_object(
    'monthly_value_repaired', true,
    'monthly_value_repaired_at', now(),
    'monthly_value_snapshot', target.monthly_value
  ),
  updated_at = now(),
  updated_date = now()
from day_care_monthly_repair_targets target
where pb.id = target.billing_id;

update public.appointment appointment
set
  valor_previsto = target.unit_price,
  updated_date = now()
from public.package_sessions session
join day_care_monthly_repair_targets target
  on target.package_id = session.package_id
 and target.billing_month = session.billing_month
where appointment.id = session.appointment_id
  and session.deleted_at is null
  and abs(coalesce(appointment.valor_previsto, 0) - target.unit_price) >= 0.01;

update public.conta_receber receivable
set
  valor = target.total_amount,
  metadata = coalesce(receivable.metadata, '{}'::jsonb) || jsonb_build_object(
    'expected_sessions', target.expected_sessions,
    'charged_sessions', target.charged_sessions,
    'monthly_value_snapshot', target.monthly_value,
    'monthly_value_repaired', true,
    'monthly_value_repaired_at', now()
  ),
  updated_date = now()
from day_care_monthly_repair_targets target
where receivable.id = target.conta_receber_id
  and receivable.data_recebimento is null
  and lower(coalesce(receivable.status, 'pendente')) not in ('pago', 'recebido', 'quitado');

do $$
begin
  if exists (
    select 1
    from day_care_monthly_repair_targets target
    join public.package_billings billing on billing.id = target.billing_id
    where abs(billing.unit_price - target.unit_price) >= 0.01
       or abs(billing.total_amount - target.total_amount) >= 0.01
  ) then
    raise exception 'O reparo de mensalidades Day Care não convergiu para os valores esperados.';
  end if;
end;
$$;

commit;
