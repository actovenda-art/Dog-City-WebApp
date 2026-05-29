select pg_get_triggerdef(oid, true) as trigger_def
from pg_trigger
where tgname = 'trg_obrigacao_financeira_after_commission';
