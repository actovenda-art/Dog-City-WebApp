alter table if exists public.responsavel
  add column if not exists empresa_id text;

alter table if exists public.carteira
  add column if not exists empresa_id text,
  add column if not exists cep text,
  add column if not exists numero_residencia text,
  add column if not exists vencimento_planos text;

alter table if exists public.orcamento
  add column if not exists empresa_id text,
  add column if not exists data_criacao date,
  add column if not exists data_validade date;

update public.orcamento
set
  data_criacao = coalesce(data_criacao, created_date::date),
  data_validade = coalesce(data_validade, (created_date::date + interval '7 day')::date)
where data_criacao is null
   or data_validade is null;

create index if not exists idx_responsavel_empresa_id on public.responsavel(empresa_id);
create index if not exists idx_carteira_empresa_id on public.carteira(empresa_id);
create index if not exists idx_orcamento_empresa_id on public.orcamento(empresa_id);
create index if not exists idx_orcamento_data_criacao on public.orcamento(data_criacao desc);
