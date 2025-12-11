-- Schema recomendado para Dog-City-Brasil no Supabase
-- Execute este SQL no Supabase SQL Editor após criar um projeto

-- Tabela de Cães
CREATE TABLE IF NOT EXISTS dogs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome TEXT NOT NULL,
  apelido TEXT,
  raca TEXT,
  peso DECIMAL(5,2),
  data_nascimento DATE,
  foto_url TEXT,
  ativo BOOLEAN DEFAULT true,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Tabela de Responsáveis/Clientes (Carteira)
CREATE TABLE IF NOT EXISTS carteira (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome_razao_social TEXT NOT NULL,
  cpf_cnpj TEXT,
  celular TEXT,
  email TEXT,
  dog_id_1 TEXT,
  dog_id_2 TEXT,
  dog_id_3 TEXT,
  dog_id_4 TEXT,
  dog_id_5 TEXT,
  dog_id_6 TEXT,
  dog_id_7 TEXT,
  dog_id_8 TEXT,
  ativo BOOLEAN DEFAULT true,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Tabela de Orçamentos
CREATE TABLE IF NOT EXISTS orcamento (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cliente_id TEXT,
  caes JSONB,
  subtotal_hospedagem DECIMAL(10,2) DEFAULT 0,
  subtotal_servicos DECIMAL(10,2) DEFAULT 0,
  subtotal_transporte DECIMAL(10,2) DEFAULT 0,
  desconto_total DECIMAL(10,2) DEFAULT 0,
  valor_total DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'rascunho',
  observacoes TEXT,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Tabela de Agendamentos/Appointments
CREATE TABLE IF NOT EXISTS appointment (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dog_id TEXT,
  data_hora_entrada TIMESTAMP,
  data_hora_saida TIMESTAMP,
  service_type TEXT,
  status TEXT DEFAULT 'agendado',
  observacoes TEXT,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Tabela de Responsáveis (alternativa: Responsavel)
CREATE TABLE IF NOT EXISTS responsavel (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome_completo TEXT NOT NULL,
  cpf TEXT,
  celular TEXT,
  celular_alternativo TEXT,
  email TEXT,
  dog_id_1 TEXT,
  dog_id_2 TEXT,
  dog_id_3 TEXT,
  dog_id_4 TEXT,
  dog_id_5 TEXT,
  dog_id_6 TEXT,
  dog_id_7 TEXT,
  dog_id_8 TEXT,
  ativo BOOLEAN DEFAULT true,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Tabela de Contas a Receber
CREATE TABLE IF NOT EXISTS conta_receber (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cliente_id TEXT,
  dog_id TEXT,
  descricao TEXT,
  servico TEXT,
  valor DECIMAL(10,2),
  vencimento DATE,
  data_recebimento DATE,
  forma_pagamento TEXT,
  status TEXT DEFAULT 'pendente',
  observacoes TEXT,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Tabela de Despesas
CREATE TABLE IF NOT EXISTS despesa (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  descricao TEXT NOT NULL,
  valor DECIMAL(10,2),
  data_despesa DATE,
  categoria TEXT,
  status TEXT DEFAULT 'pendente',
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Tabela de Lançamentos (lancamento)
CREATE TABLE IF NOT EXISTS lancamento (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  descricao TEXT,
  valor DECIMAL(12,2) NOT NULL,
  data_lancamento DATE DEFAULT NOW(),
  tipo TEXT, -- entrada|saida
  conta TEXT,
  referencia_id TEXT,
  categoria TEXT,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Tabela de Extrato Bancário (extratobancario)
CREATE TABLE IF NOT EXISTS extratobancario (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  descricao TEXT,
  tipo TEXT, -- entrada|saida
  valor DECIMAL(12,2) NOT NULL,
  data_movimento DATE DEFAULT NOW(),
  conta_origem TEXT,
  conta_destino TEXT,
  lancamento_id TEXT,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Tabela de Planos/Assinaturas
CREATE TABLE IF NOT EXISTS plan_config (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dog_id TEXT,
  cliente_id TEXT,
  tipo_plano TEXT,
  valor_mensal DECIMAL(10,2),
  data_vencimento DATE,
  status TEXT DEFAULT 'ativo',
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Usuários (aplicação)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT UNIQUE,
  full_name TEXT,
  profile TEXT,
  cpf TEXT,
  phone TEXT,
  active BOOLEAN DEFAULT true,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Ativar RLS (Row Level Security) se desejar controle de acesso
-- ALTER TABLE dogs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE carteira ENABLE ROW LEVEL SECURITY;
-- ... etc

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_dogs_created_date ON dogs(created_date DESC);
CREATE INDEX IF NOT EXISTS idx_carteira_created_date ON carteira(created_date DESC);
CREATE INDEX IF NOT EXISTS idx_orcamento_status ON orcamento(status);
CREATE INDEX IF NOT EXISTS idx_appointment_dog_id ON appointment(dog_id);
