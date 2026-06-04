select
  id,
  empresa_id,
  provider,
  nome,
  ativo,
  coalesce(token_url, credenciais->>'token_url', config->>'token_url') as token_url,
  coalesce(api_base_url, credenciais->>'api_base_url', config->>'api_base_url') as api_base_url,
  coalesce(scope, credenciais->>'scope', config->>'scope') as scope,
  config->>'conta_corrente' as conta_corrente,
  config->>'charge_path' as charge_path,
  config->>'charge_read_scope' as charge_read_scope,
  config->>'charge_write_scope' as charge_write_scope,
  config->>'token_auth_mode' as token_auth_mode,
  extra_headers,
  (config ? 'client_id' or credenciais ? 'client_id') as has_client_id,
  (config ? 'client_secret' or credenciais ? 'client_secret') as has_client_secret,
  (config ? 'certificate_crt' or credenciais ? 'certificate_crt' or metadata ? 'certificate_crt') as has_cert,
  (config ? 'certificate_key' or credenciais ? 'certificate_key' or metadata ? 'certificate_key') as has_key
from integracao_config
where provider = 'banco_inter'
order by created_date desc;
