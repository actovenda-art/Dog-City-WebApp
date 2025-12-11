-- Additional schema for Dog-City-Brasil
-- Create tables referenced by the frontend but not present in the main schema

-- Checkins (registro de presença/check-in)
CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  dog_id TEXT,
  data_checkin TIMESTAMP DEFAULT NOW(),
  data_checkout TIMESTAMP,
  observacoes TEXT,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Service providers (fornecedores/terceiros)
CREATE TABLE IF NOT EXISTS serviceproviders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome TEXT,
  contato TEXT,
  telefone TEXT,
  email TEXT,
  ativo BOOLEAN DEFAULT true,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- ServiceProvided (registro de serviço prestado)
CREATE TABLE IF NOT EXISTS serviceprovided (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  appointment_id TEXT,
  dog_id TEXT,
  service_type TEXT,
  preco DECIMAL(10,2),
  quantidade INTEGER DEFAULT 1,
  observacoes TEXT,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Tabela de Preços
CREATE TABLE IF NOT EXISTS tabelaprecos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  codigo TEXT,
  descricao TEXT,
  valor DECIMAL(10,2),
  ativo BOOLEAN DEFAULT true,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Notificações
CREATE TABLE IF NOT EXISTS notificacao (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tipo TEXT,
  payload JSONB,
  lido BOOLEAN DEFAULT false,
  created_date TIMESTAMP DEFAULT NOW()
);

-- Pedidos internos
CREATE TABLE IF NOT EXISTS pedidointerno (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  descricao TEXT,
  solicitante_id TEXT,
  responsavel_id TEXT,
  status TEXT DEFAULT 'aberto',
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Receitas (entradas)
CREATE TABLE IF NOT EXISTS receita (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  descricao TEXT,
  valor DECIMAL(12,2) NOT NULL,
  data_receita DATE DEFAULT NOW(),
  categoria TEXT,
  origem TEXT,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Transactions (genérico)
CREATE TABLE IF NOT EXISTS "transaction" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  referencia TEXT,
  valor DECIMAL(12,2),
  tipo TEXT,
  status TEXT,
  data_transacao TIMESTAMP DEFAULT NOW(),
  meta JSONB,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Scheduled transactions
CREATE TABLE IF NOT EXISTS scheduledtransaction (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  descricao TEXT,
  valor DECIMAL(12,2),
  schedule_date DATE,
  periodo TEXT,
  status TEXT DEFAULT 'ativo',
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Replacement (trocas/ajustes)
CREATE TABLE IF NOT EXISTS replacement (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tipo TEXT,
  referencia_id TEXT,
  detalhe JSONB,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Integrations config
CREATE TABLE IF NOT EXISTS integracao_config (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  provider TEXT,
  config JSONB,
  ativo BOOLEAN DEFAULT true,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

-- Indexes for additional tables
CREATE INDEX IF NOT EXISTS idx_checkins_data_checkin ON checkins(data_checkin DESC);
CREATE INDEX IF NOT EXISTS idx_serviceprovided_created ON serviceprovided(created_date DESC);