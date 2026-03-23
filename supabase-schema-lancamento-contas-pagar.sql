-- Alinha a tabela lancamento com a pagina Contas a Pagar.
-- Execute apos:
-- 1. supabase-schema.sql
-- 2. supabase-schema-company-pricing.sql

alter table if exists public.lancamento
  add column if not exists empresa_id text,
  add column if not exists recebedor text,
  add column if not exists referencia text,
  add column if not exists vencimento date,
  add column if not exists juros_multa decimal(12,2) default 0,
  add column if not exists forma_pagamento text,
  add column if not exists anexo_url text,
  add column if not exists negociacao text,
  add column if not exists status text default 'pendente',
  add column if not exists valor_quitado decimal(12,2) default 0,
  add column if not exists vinculacoes jsonb default '[]'::jsonb,
  add column if not exists data_quitacao date,
  add column if not exists movido_para_despesas boolean default false;

update public.lancamento
set
  recebedor = coalesce(recebedor, descricao),
  referencia = coalesce(referencia, referencia_id),
  vencimento = coalesce(vencimento, data_lancamento),
  juros_multa = coalesce(juros_multa, 0),
  forma_pagamento = coalesce(forma_pagamento, conta),
  status = coalesce(status, case when data_quitacao is not null then 'quitada' else 'pendente' end),
  valor_quitado = coalesce(valor_quitado, 0),
  vinculacoes = coalesce(vinculacoes, '[]'::jsonb),
  movido_para_despesas = coalesce(movido_para_despesas, false)
where true;

create index if not exists idx_lancamento_empresa_vencimento
  on public.lancamento(empresa_id, vencimento desc);

create index if not exists idx_lancamento_status
  on public.lancamento(status);

create index if not exists idx_lancamento_recebedor
  on public.lancamento(recebedor);
