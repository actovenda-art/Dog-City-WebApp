-- Alinha a tabela notificacao ao contrato usado pelo frontend.
-- Execute apos os schemas base do projeto.

alter table if exists public.notificacao
  add column if not exists user_id text,
  add column if not exists empresa_id text,
  add column if not exists titulo text,
  add column if not exists mensagem text,
  add column if not exists link text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists updated_date timestamptz default now();

create index if not exists idx_notificacao_user_created
  on public.notificacao(user_id, created_date desc);

create index if not exists idx_notificacao_empresa_created
  on public.notificacao(empresa_id, created_date desc);

update public.notificacao
set
  payload = coalesce(payload, '{}'::jsonb),
  titulo = coalesce(
    titulo,
    payload->>'titulo',
    case
      when tipo = 'status_alterado' then 'Status de orcamento atualizado'
      else 'Notificacao'
    end
  ),
  mensagem = coalesce(
    mensagem,
    payload->>'mensagem',
    payload->>'descricao',
    case
      when tipo = 'status_alterado' then 'Houve alteracao de status no fluxo de orcamentos.'
      else 'Voce recebeu uma nova notificacao.'
    end
  ),
  link = coalesce(link, payload->>'link'),
  updated_date = coalesce(updated_date, created_date, now())
where true;
