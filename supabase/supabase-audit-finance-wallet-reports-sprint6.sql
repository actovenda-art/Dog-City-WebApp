-- Sprint 6 - Auditoria manual de relatórios V2, snapshots e competência financeira
-- Uso sugerido:
-- 1. Defina empresa, competência e snapshot alvo
-- 2. Ligue as flags apenas na empresa piloto
-- 3. Compare o snapshot fechado com o estado atual

-- Exemplo de parâmetros:
-- \set empresa_id 'empresa_demo'
-- \set competencia '2026-05'
-- \set snapshot_id 'snapshot_demo'

-- 1. Conferir flags da Sprint 6
select
  cfg.key,
  cfg.empresa_id,
  cfg.value,
  cfg.updated_date
from public.app_config cfg
where cfg.key in (
  'finance.reports_v2_enabled',
  'finance.snapshots_enabled',
  'finance.financial_competence_enabled'
)
order by cfg.key, cfg.empresa_id nulls first;

-- 2. Conferir snapshots fechados
-- select
--   fs.id,
--   fs.empresa_id,
--   fs.competencia,
--   fs.tipo,
--   fs.status,
--   fs.hash_checksum,
--   fs.payload -> 'summary' as summary,
--   fs.created_date
-- from public.finance_snapshot fs
-- where fs.empresa_id = :'empresa_id'
-- order by fs.created_date desc, fs.id desc;

-- 3. Conferir deltas gerados para um snapshot
-- select
--   d.comparison_run_id,
--   d.delta_kind,
--   d.entity_key,
--   d.entity_label,
--   d.valor_anterior,
--   d.valor_atual,
--   d.impacto_financeiro,
--   d.created_date
-- from public.finance_snapshot_delta d
-- where d.snapshot_id = :'snapshot_id'
-- order by d.created_date desc, d.entity_key asc;

-- 4. Conferir geração de recursos no período
-- select *
-- from public.finance_report_generation_resources(:'empresa_id', (: 'competencia' || '-01')::date, ((: 'competencia' || '-01')::date + interval '1 month - 1 day')::date)
-- order by competencia_date, entity_key;

-- 4.1 Conferir resumo oficial V2 do período
-- select *
-- from public.finance_reports_v2_summary(:'empresa_id', (: 'competencia' || '-01')::date, ((: 'competencia' || '-01')::date + interval '1 month - 1 day')::date);

-- 5. Conferir faturamento real no período
-- select *
-- from public.finance_report_real_billing(:'empresa_id', (: 'competencia' || '-01')::date, ((: 'competencia' || '-01')::date + interval '1 month - 1 day')::date)
-- order by competencia_date, entity_key;

-- 6. Conferir carteira atual
-- select *
-- from public.finance_report_wallet(:'empresa_id')
-- order by entity_key;

-- 7. Conferir serviços prestados no período
-- select *
-- from public.finance_report_services_provided(:'empresa_id', (: 'competencia' || '-01')::date, ((: 'competencia' || '-01')::date + interval '1 month - 1 day')::date)
-- order by competencia_date, entity_key;
