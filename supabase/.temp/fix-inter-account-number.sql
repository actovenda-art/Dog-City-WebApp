update integracao_config
set
  config = jsonb_set(
    jsonb_set(
      coalesce(config, '{}'::jsonb),
      '{account_number}',
      to_jsonb('366131400'::text),
      true
    ),
    '{conta_corrente}',
    to_jsonb('366131400'::text),
    true
  ),
  credenciais = jsonb_set(
    coalesce(credenciais, '{}'::jsonb),
    '{account_number}',
    to_jsonb('366131400'::text),
    true
  ),
  extra_headers = jsonb_set(
    coalesce(extra_headers, '{}'::jsonb),
    '{x-conta-corrente}',
    to_jsonb('366131400'::text),
    true
  )
where id = '15200119-d62e-4708-ac79-2358b3793560';

select
  id,
  empresa_id,
  config->>'account_number' as account_number,
  config->>'conta_corrente' as conta_corrente,
  credenciais->>'account_number' as credenciais_account_number,
  extra_headers->>'x-conta-corrente' as header_conta_corrente
from integracao_config
where id = '15200119-d62e-4708-ac79-2358b3793560';
