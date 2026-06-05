select *
from public.finance_wallet_admin_apply_operation(
  p_carteira_conta_id := 'd9b2ffcd-097d-4911-9038-0e12e22d371a',
  p_operacao_idempotencia := 'orcamento_pagamento|421cf512-4cfc-41d8-a31a-9bb1b3a9508f|recebido',
  p_tipo := 'entrada_direcionada',
  p_natureza := 'entrada',
  p_valor := 3.60,
  p_referencia_amigavel := 'Recarga do orçamento 56025d5f-3645-4e02-9a90-6888952fecea',
  p_motivo := 'Recarga de carteira por pagamento do orçamento',
  p_observacao := 'Cobrança recebida via Banco Inter (dac6e276-2e3f-4895-b26e-e17448263db4)',
  p_origem := 'orcamento_pagamento_banco_inter',
  p_transacao_id := '3661314001780563740000hyy4cAOadzKNd',
  p_usuario_id := '5f15078e-9220-417c-9232-dd0fec5a4b7a',
  p_metadata := '{"orcamento_pagamento_id":"421cf512-4cfc-41d8-a31a-9bb1b3a9508f","orcamento_id":"56025d5f-3645-4e02-9a90-6888952fecea","provider":"banco_inter","metodo":"boleto_bancario"}'::jsonb
);
