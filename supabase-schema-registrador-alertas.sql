-- Registrador: campos de monitor e lembretes operacionais
-- Execute apos os schemas base e supabase-schema-attendance-flow.sql

alter table if exists public.checkins
  add column if not exists monitor_id text,
  add column if not exists tarefa_lembrete_horario text,
  add column if not exists tarefa_lembrete_notificar_em timestamptz,
  add column if not exists tarefa_lembrete_notificado_em timestamptz;

create index if not exists idx_checkins_monitor_id
  on public.checkins(monitor_id);

create index if not exists idx_checkins_reminder_due
  on public.checkins(tarefa_lembrete_notificar_em);
