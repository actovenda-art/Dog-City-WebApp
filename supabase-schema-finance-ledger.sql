-- Modelo financeiro detalhado centrado em extratobancario.
-- Execute apos:
-- 1. supabase-schema.sql
-- 2. supabase-schema-additional.sql
-- 3. supabase-schema-banco-inter.sql

alter table if exists public.extratobancario
  add column if not exists data_hora_transacao timestamptz,
  add column if not exists nome_contraparte text,
  add column if not exists banco_contraparte text,
  add column if not exists tipo_transacao_detalhado text,
  add column if not exists referencia text,
  add column if not exists carteira_nome text,
  add column if not exists observacoes text,
  add column if not exists rateio jsonb default '{}'::jsonb,
  add column if not exists metadata_financeira jsonb default '{}'::jsonb;

update public.extratobancario
set
  data_hora_transacao = coalesce(
    data_hora_transacao,
    created_date::timestamptz,
    case
      when data is not null then (data::text || ' 12:00:00')::timestamptz
      when data_movimento is not null then (data_movimento::text || ' 12:00:00')::timestamptz
      else null
    end
  ),
  nome_contraparte = coalesce(nome_contraparte, nullif(descricao, '')),
  banco_contraparte = coalesce(banco_contraparte, nullif(banco, '')),
  tipo_transacao_detalhado = coalesce(tipo_transacao_detalhado, nullif(forma_pagamento, ''), source_provider),
  referencia = coalesce(referencia, nullif(external_id, ''), nullif(lancamento_id, '')),
  observacoes = coalesce(observacoes, ''),
  rateio = coalesce(rateio, '{}'::jsonb),
  metadata_financeira = coalesce(metadata_financeira, raw_data, '{}'::jsonb)
where true;

create index if not exists idx_extratobancario_tipo_datetime
  on public.extratobancario(tipo, data_hora_transacao desc);

create index if not exists idx_extratobancario_contraparte
  on public.extratobancario(nome_contraparte);

create index if not exists idx_extratobancario_referencia
  on public.extratobancario(referencia);
