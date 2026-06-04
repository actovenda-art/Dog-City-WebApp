select
  id,
  empresa_id,
  ativo,
  provider,
  nome,
  left(coalesce(scope, ''), 120) as scope,
  length(coalesce(certificate_crt, '')) > 0 as has_top_level_cert,
  length(coalesce(certificate_key, '')) > 0 as has_top_level_key,
  left(coalesce(config::text, '{}'), 400) as config_preview,
  left(coalesce(credenciais::text, '{}'), 400) as credenciais_preview,
  left(coalesce(metadata::text, '{}'), 400) as metadata_preview
from integracao_config
where provider = 'banco_inter'
order by created_date desc;
