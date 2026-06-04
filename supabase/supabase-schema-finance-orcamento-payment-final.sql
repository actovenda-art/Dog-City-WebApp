create table if not exists public.orcamento_pagamento (
  id text primary key,
  empresa_id text not null,
  orcamento_id text not null,
  carteira_id text not null,
  carteira_conta_id text null,
  responsavel_id text null,
  provider text not null default 'banco_inter',
  metodo text not null,
  status text not null default 'pendente_emissao',
  valor numeric(12,2) not null default 0,
  seu_numero text null,
  codigo_solicitacao text null,
  nosso_numero text null,
  txid text null,
  linha_digitavel text null,
  codigo_barras text null,
  pix_copia_cola text null,
  pdf_disponivel boolean not null default false,
  pago_em timestamptz null,
  valor_recebido numeric(12,2) not null default 0,
  credited_wallet_movement_id text null,
  creditado_em timestamptz null,
  created_by_user_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create index if not exists idx_orcamento_pagamento_empresa on public.orcamento_pagamento (empresa_id);
create index if not exists idx_orcamento_pagamento_orcamento on public.orcamento_pagamento (orcamento_id);
create index if not exists idx_orcamento_pagamento_carteira on public.orcamento_pagamento (carteira_id);
create unique index if not exists uq_orcamento_pagamento_codigo_solicitacao
  on public.orcamento_pagamento (codigo_solicitacao)
  where codigo_solicitacao is not null;

