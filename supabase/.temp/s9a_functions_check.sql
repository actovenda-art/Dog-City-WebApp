select proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in (
    'finance_ensure_observability_feature_flags',
    'finance_write_flow_map',
    'finance_write_governance_matrix',
    'finance_hybrid_write_audit',
    'finance_operational_reconciliation_matrix',
    'finance_operational_observability_context',
    'finance_payment_v2_contract'
  )
order by proname;
