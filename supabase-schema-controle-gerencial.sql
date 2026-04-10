-- Controle gerencial sem plano de acao.
-- Execute depois de:
-- 1. supabase-schema.sql
-- 2. supabase-schema-additional.sql
-- 3. supabase-schema-unit-isolation.sql
-- 4. supabase-schema-attendance-flow.sql
-- 5. supabase-schema-finance-ledger.sql
-- 6. supabase-schema-lancamento-contas-pagar.sql

create table if not exists public.centro_custo (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  nome text not null,
  descricao text,
  ativo boolean default true,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  unique (empresa_id, nome)
);

alter table if exists public.lancamento
  add column if not exists prioridade text default 'media',
  add column if not exists valor_anterior numeric(12,2),
  add column if not exists centro_custo_id text,
  add column if not exists centro_custo_nome text,
  add column if not exists recorrente boolean default false,
  add column if not exists data_competencia date;

alter table if exists public.extratobancario
  add column if not exists centro_custo_id text,
  add column if not exists centro_custo_nome text;

alter table if exists public.despesa
  add column if not exists empresa_id text,
  add column if not exists centro_custo_id text,
  add column if not exists centro_custo_nome text,
  add column if not exists vencimento date,
  add column if not exists lancamento_id text,
  add column if not exists extrato_id text;

alter table if exists public.plan_config
  add column if not exists client_name text,
  add column if not exists client_id text,
  add column if not exists service text,
  add column if not exists frequency text,
  add column if not exists weekdays jsonb default '[]'::jsonb,
  add column if not exists monthly_value numeric(12,2) default 0,
  add column if not exists due_day integer,
  add column if not exists next_billing_date date,
  add column if not exists observacoes text,
  add column if not exists cliente_fixo boolean default true,
  add column if not exists carteira_id text,
  add column if not exists responsavel_id text,
  add column if not exists data_renovacao date,
  add column if not exists renovacao_dia integer,
  add column if not exists service_lines jsonb default '[]'::jsonb,
  add column if not exists metadata_gerencial jsonb default '{}'::jsonb;

update public.plan_config
set
  cliente_fixo = coalesce(cliente_fixo, true),
  carteira_id = coalesce(carteira_id, cliente_id),
  renovacao_dia = coalesce(renovacao_dia, due_day),
  data_renovacao = coalesce(data_renovacao, data_vencimento),
  service_lines = coalesce(service_lines, '[]'::jsonb),
  metadata_gerencial = coalesce(metadata_gerencial, '{}'::jsonb)
where true;

update public.lancamento
set
  prioridade = coalesce(prioridade, 'media'),
  centro_custo_nome = coalesce(centro_custo_nome, categoria),
  data_competencia = coalesce(data_competencia, vencimento, data_lancamento)
where true;

update public.extratobancario
set centro_custo_nome = coalesce(centro_custo_nome, nullif(metadata_financeira->>'centro_custo_nome', ''))
where true;

create index if not exists idx_centro_custo_empresa_nome on public.centro_custo(empresa_id, nome);
create index if not exists idx_lancamento_centro_custo on public.lancamento(empresa_id, centro_custo_nome);
create index if not exists idx_lancamento_prioridade on public.lancamento(prioridade);
create index if not exists idx_extratobancario_centro_custo on public.extratobancario(empresa_id, centro_custo_nome);
create index if not exists idx_plan_config_cliente_fixo on public.plan_config(empresa_id, cliente_fixo, status);
create index if not exists idx_plan_config_data_renovacao on public.plan_config(data_renovacao);

alter table if exists public.centro_custo enable row level security;

drop policy if exists centro_custo_unit_policy on public.centro_custo;
create policy centro_custo_unit_policy on public.centro_custo
for all
to authenticated
using (public.app_active_unit_matches(empresa_id))
with check (public.app_active_unit_matches(empresa_id));

create or replace view public.vw_recebimentos_fixos_servico
with (security_invoker = true) as
select
  empresa_id,
  coalesce(service, tipo_plano, 'sem_servico') as servico,
  count(*) filter (where coalesce(status, 'ativo') = 'ativo' and coalesce(cliente_fixo, true) = true) as planos_ativos,
  count(distinct coalesce(carteira_id, cliente_id)) filter (where coalesce(status, 'ativo') = 'ativo' and coalesce(cliente_fixo, true) = true) as clientes_fixos,
  count(distinct dog_id) filter (where coalesce(status, 'ativo') = 'ativo' and coalesce(cliente_fixo, true) = true) as caes,
  coalesce(sum(coalesce(monthly_value, valor_mensal, 0)) filter (where coalesce(status, 'ativo') = 'ativo' and coalesce(cliente_fixo, true) = true), 0) as valor_mensal_previsto
from public.plan_config
group by empresa_id, coalesce(service, tipo_plano, 'sem_servico');

create or replace view public.vw_despesas_centro_custo
with (security_invoker = true) as
select
  empresa_id,
  coalesce(nullif(centro_custo_nome, ''), 'Sem centro de custo') as centro_custo,
  count(*) as quantidade,
  coalesce(sum(abs(valor)), 0) as valor_total,
  min(coalesce(data_movimento, data)) as primeira_saida,
  max(coalesce(data_movimento, data)) as ultima_saida
from public.extratobancario
where tipo = 'saida'
group by empresa_id, coalesce(nullif(centro_custo_nome, ''), 'Sem centro de custo');

create or replace view public.vw_valores_receber_orcamentos
with (security_invoker = true) as
select
  coalesce(o.empresa_id, c.empresa_id) as empresa_id,
  o.id as orcamento_id,
  o.cliente_id,
  o.status as status_orcamento,
  coalesce(o.valor_total, 0) as valor_orcamento,
  coalesce(sum(c.valor), 0) as valor_cobrado,
  coalesce(sum(c.valor) filter (where c.data_recebimento is not null or c.status = 'pago'), 0) as valor_recebido,
  greatest(coalesce(sum(c.valor), o.valor_total, 0) - coalesce(sum(c.valor) filter (where c.data_recebimento is not null or c.status = 'pago'), 0), 0) as valor_em_aberto,
  min(c.vencimento) as primeiro_vencimento,
  max(c.vencimento) as ultimo_vencimento
from public.orcamento o
left join public.conta_receber c on c.orcamento_id = o.id
group by coalesce(o.empresa_id, c.empresa_id), o.id, o.cliente_id, o.status, o.valor_total;

create or replace view public.vw_contas_pagar_comparativo
with (security_invoker = true) as
select
  l.*,
  lag(l.valor) over (
    partition by l.empresa_id, lower(coalesce(l.recebedor, '')), lower(coalesce(l.categoria, '')), lower(coalesce(l.referencia, ''))
    order by coalesce(l.vencimento, l.data_lancamento, l.created_date::date)
  ) as valor_anterior_calculado
from public.lancamento l;

create or replace view public.vw_caes_ausentes
with (security_invoker = true) as
select
  d.empresa_id,
  d.id as dog_id,
  d.nome as cao,
  d.raca,
  max(coalesce(c.checkin_datetime, c.data_checkin)) as ultimo_checkin,
  case
    when max(coalesce(c.checkin_datetime, c.data_checkin)) is null then null
    else (current_date - max(coalesce(c.checkin_datetime, c.data_checkin))::date)
  end as dias_ausente
from public.dogs d
left join public.checkins c on c.dog_id = d.id and c.empresa_id = d.empresa_id
where coalesce(d.ativo, true) = true
group by d.empresa_id, d.id, d.nome, d.raca;

create or replace view public.vw_clientes_fixos_mensal
with (security_invoker = true) as
with utilizacoes as (
  select
    empresa_id,
    cliente_id,
    dog_id,
    coalesce(service_type, 'sem_servico') as servico,
    date_trunc('month', coalesce(data_utilizacao, created_date::date)::date)::date as mes,
    count(*) as quantidade
  from public.serviceprovided
  where dog_id is not null
  group by empresa_id, cliente_id, dog_id, coalesce(service_type, 'sem_servico'), date_trunc('month', coalesce(data_utilizacao, created_date::date)::date)::date
  union all
  select
    empresa_id,
    cliente_id,
    dog_id,
    coalesce(service_type, 'sem_servico') as servico,
    date_trunc('month', coalesce(checkin_datetime, data_checkin)::date)::date as mes,
    count(*) as quantidade
  from public.checkins
  where dog_id is not null
  group by empresa_id, cliente_id, dog_id, coalesce(service_type, 'sem_servico'), date_trunc('month', coalesce(checkin_datetime, data_checkin)::date)::date
),
planos as (
  select
    empresa_id,
    coalesce(carteira_id, cliente_id) as cliente_id,
    dog_id,
    max(data_renovacao) as data_renovacao,
    max(renovacao_dia) as renovacao_dia,
    bool_or(coalesce(cliente_fixo, true)) as cliente_fixo
  from public.plan_config
  where coalesce(status, 'ativo') = 'ativo'
  group by empresa_id, coalesce(carteira_id, cliente_id), dog_id
)
select
  p.empresa_id,
  p.cliente_id,
  p.dog_id,
  p.data_renovacao,
  p.renovacao_dia,
  avg(u.quantidade) filter (where u.servico = 'day_care') as media_day_care,
  avg(u.quantidade) filter (where u.servico = 'banho') as media_banho,
  avg(u.quantidade) filter (where u.servico = 'tosa') as media_tosa,
  avg(u.quantidade) filter (where u.servico = 'hospedagem') as media_hospedagem,
  avg(u.quantidade) filter (where u.servico = 'transporte') as media_transporte
from planos p
left join utilizacoes u on u.empresa_id = p.empresa_id and u.cliente_id = p.cliente_id and u.dog_id = p.dog_id
where p.cliente_fixo = true
group by p.empresa_id, p.cliente_id, p.dog_id, p.data_renovacao, p.renovacao_dia;
