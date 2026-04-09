-- Presenca > Agendamentos > Utilizacoes > Valores a Receber
-- Execute apos os schemas base e de isolamento por unidade.

alter table if exists public.appointment
  add column if not exists cliente_id text,
  add column if not exists orcamento_id text,
  add column if not exists linked_checkin_id text,
  add column if not exists charge_type text default 'avulso',
  add column if not exists source_type text default 'manual',
  add column if not exists valor_previsto numeric(12,2) default 0,
  add column if not exists data_referencia date,
  add column if not exists hora_entrada text,
  add column if not exists hora_saida text,
  add column if not exists source_key text,
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table if exists public.checkins
  add column if not exists empresa_id text,
  add column if not exists appointment_id text,
  add column if not exists service_type text,
  add column if not exists cliente_id text,
  add column if not exists monitor_id text,
  add column if not exists dog_nome text,
  add column if not exists dog_raca text,
  add column if not exists responsavel_nome text,
  add column if not exists entregador_nome text,
  add column if not exists checkin_monitor_nome text,
  add column if not exists checkout_monitor_nome text,
  add column if not exists recebedor_nome text,
  add column if not exists tipo_cobranca text,
  add column if not exists pacote_codigo text,
  add column if not exists checkin_datetime timestamptz,
  add column if not exists checkout_datetime timestamptz,
  add column if not exists pertences_entrada_foto_url text,
  add column if not exists pertences_saida_foto_url text,
  add column if not exists tem_refeicao boolean default false,
  add column if not exists refeicao_observacao text,
  add column if not exists refeicao_registros jsonb default '[]'::jsonb,
  add column if not exists tarefa_lembrete text,
  add column if not exists tarefa_lembrete_horario text,
  add column if not exists tarefa_lembrete_notificar_em timestamptz,
  add column if not exists tarefa_lembrete_notificado_em timestamptz,
  add column if not exists source_type text default 'manual',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists status text default 'presente';

alter table if exists public.serviceprovided
  add column if not exists cliente_id text,
  add column if not exists checkin_id text,
  add column if not exists responsavel_nome text,
  add column if not exists data_utilizacao date,
  add column if not exists source_type text default 'manual',
  add column if not exists charge_type text default 'avulso',
  add column if not exists valor_cobrado numeric(12,2) default 0,
  add column if not exists source_key text,
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table if exists public.conta_receber
  add column if not exists appointment_id text,
  add column if not exists checkin_id text,
  add column if not exists orcamento_id text,
  add column if not exists origem text,
  add column if not exists tipo_agendamento text,
  add column if not exists tipo_cobranca text,
  add column if not exists data_prestacao date,
  add column if not exists source_key text,
  add column if not exists metadata jsonb default '{}'::jsonb;

update public.appointment
set
  data_referencia = coalesce(data_referencia, (data_hora_entrada at time zone 'America/Sao_Paulo')::date, current_date),
  hora_entrada = coalesce(hora_entrada, nullif(to_char(data_hora_entrada at time zone 'America/Sao_Paulo', 'HH24:MI'), '')),
  hora_saida = coalesce(hora_saida, nullif(to_char(data_hora_saida at time zone 'America/Sao_Paulo', 'HH24:MI'), '')),
  metadata = coalesce(metadata, '{}'::jsonb)
where true;

update public.checkins
set
  checkin_datetime = coalesce(checkin_datetime, data_checkin),
  checkout_datetime = coalesce(checkout_datetime, data_checkout),
  metadata = coalesce(metadata, '{}'::jsonb),
  refeicao_registros = coalesce(refeicao_registros, '[]'::jsonb)
where true;

update public.serviceprovided
set
  data_utilizacao = coalesce(data_utilizacao, created_date::date),
  metadata = coalesce(metadata, '{}'::jsonb)
where true;

update public.conta_receber
set
  data_prestacao = coalesce(data_prestacao, vencimento),
  metadata = coalesce(metadata, '{}'::jsonb)
where true;

create index if not exists idx_appointment_data_referencia on public.appointment(data_referencia desc);
create index if not exists idx_appointment_service_type on public.appointment(service_type);
create index if not exists idx_appointment_source_type on public.appointment(source_type);
create index if not exists idx_appointment_cliente_id on public.appointment(cliente_id);
create index if not exists idx_checkins_appointment_id on public.checkins(appointment_id);
create index if not exists idx_checkins_checkin_datetime on public.checkins(checkin_datetime desc);
create index if not exists idx_checkins_status on public.checkins(status);
create index if not exists idx_checkins_monitor_id on public.checkins(monitor_id);
create index if not exists idx_checkins_reminder_due on public.checkins(tarefa_lembrete_notificar_em);
create index if not exists idx_serviceprovided_data_utilizacao on public.serviceprovided(data_utilizacao desc);
create index if not exists idx_serviceprovided_checkin_id on public.serviceprovided(checkin_id);
create index if not exists idx_conta_receber_data_prestacao on public.conta_receber(data_prestacao desc);
create index if not exists idx_conta_receber_tipo_cobranca on public.conta_receber(tipo_cobranca);
create index if not exists idx_conta_receber_origem on public.conta_receber(origem);

create unique index if not exists idx_appointment_source_key_unique
  on public.appointment(empresa_id, source_key)
  where source_key is not null;

create unique index if not exists idx_serviceprovided_source_key_unique
  on public.serviceprovided(empresa_id, source_key)
  where source_key is not null;

create unique index if not exists idx_conta_receber_source_key_unique
  on public.conta_receber(empresa_id, source_key)
  where source_key is not null;
