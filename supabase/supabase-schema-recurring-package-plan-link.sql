-- Normaliza o vinculo entre contrato comercial e execucao recorrente.

begin;

alter table public.recurring_packages
  add column if not exists plan_config_id text;

update public.recurring_packages rp
set plan_config_id = nullif(rp.metadata ->> 'plan_config_id', '')
where rp.plan_config_id is null
  and nullif(rp.metadata ->> 'plan_config_id', '') is not null;

do $$
begin
  if exists (
    select 1
    from public.recurring_packages rp
    left join public.plan_config pc on pc.id = rp.plan_config_id
    where rp.plan_config_id is not null
      and pc.id is null
  ) then
    raise exception 'Existem pacotes com plan_config_id sem contrato correspondente.';
  end if;
end;
$$;

alter table public.recurring_packages
  drop constraint if exists recurring_packages_plan_config_id_fkey;

alter table public.recurring_packages
  add constraint recurring_packages_plan_config_id_fkey
  foreign key (plan_config_id)
  references public.plan_config(id)
  on delete set null;

create unique index if not exists uq_recurring_packages_plan_config_id
  on public.recurring_packages(plan_config_id)
  where plan_config_id is not null;

comment on column public.recurring_packages.plan_config_id is
  'FK oficial para o contrato em plan_config. Metadata permanece apenas como snapshot historico.';

notify pgrst, 'reload schema';

commit;
