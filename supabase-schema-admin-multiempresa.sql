-- Multiempresa, perfis de acesso e branding por empresa
-- Execute apos:
-- 1. supabase-schema.sql
-- 2. supabase-schema-additional.sql
-- 3. supabase-schema-cloud-config.sql
-- 4. supabase-schema-company-pricing.sql

CREATE TABLE IF NOT EXISTS empresa (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  codigo TEXT UNIQUE,
  nome_fantasia TEXT NOT NULL,
  razao_social TEXT,
  cnpj TEXT,
  slug TEXT UNIQUE,
  status TEXT DEFAULT 'ativa',
  logo_asset_key TEXT,
  branding JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS perfil_acesso (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  escopo TEXT DEFAULT 'empresa',
  permissoes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ativo BOOLEAN DEFAULT true,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS access_profile_id TEXT,
  ADD COLUMN IF NOT EXISTS company_role TEXT,
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN DEFAULT false;

ALTER TABLE IF EXISTS app_config
  ADD COLUMN IF NOT EXISTS empresa_id TEXT;

ALTER TABLE IF EXISTS app_asset
  ADD COLUMN IF NOT EXISTS empresa_id TEXT;

ALTER TABLE IF EXISTS app_config
  DROP CONSTRAINT IF EXISTS app_config_key_key;

ALTER TABLE IF EXISTS app_asset
  DROP CONSTRAINT IF EXISTS app_asset_key_key;

DROP INDEX IF EXISTS idx_app_config_key;
DROP INDEX IF EXISTS idx_app_asset_key;
DROP INDEX IF EXISTS app_config_key_key;
DROP INDEX IF EXISTS app_asset_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_config_key_global
  ON app_config(key)
  WHERE empresa_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_config_key_empresa
  ON app_config(key, empresa_id)
  WHERE empresa_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_asset_key_global
  ON app_asset(key)
  WHERE empresa_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_asset_key_empresa
  ON app_asset(key, empresa_id)
  WHERE empresa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empresa_codigo ON empresa(codigo);
CREATE INDEX IF NOT EXISTS idx_empresa_status ON empresa(status);
CREATE INDEX IF NOT EXISTS idx_perfil_acesso_codigo ON perfil_acesso(codigo);
CREATE INDEX IF NOT EXISTS idx_users_access_profile_id ON users(access_profile_id);
CREATE INDEX IF NOT EXISTS idx_app_config_empresa_id ON app_config(empresa_id);
CREATE INDEX IF NOT EXISTS idx_app_asset_empresa_id ON app_asset(empresa_id);

INSERT INTO perfil_acesso (codigo, nome, descricao, escopo, permissoes, ativo)
VALUES
  (
    'platform_owner',
    'Platform Owner',
    'Acesso total entre empresas, configuracoes globais e administracao da plataforma.',
    'plataforma',
    '["platform:*","empresa:*","usuarios:*","precos:*","branding:*","storage:*"]'::jsonb,
    true
  ),
  (
    'admin_empresa',
    'Administrador da Empresa',
    'Gerencia usuarios, precos, branding e operacao da propria empresa.',
    'empresa',
    '["empresa:read","empresa:update","usuarios:read","usuarios:update","precos:*","branding:*","tarefas:*","financeiro:read"]'::jsonb,
    true
  ),
  (
    'operacional',
    'Operacional',
    'Acesso operacional ao dia a dia da empresa.',
    'empresa',
    '["checkin:*","agenda:*","dogs:*","tarefas:read","tarefas:update"]'::jsonb,
    true
  ),
  (
    'financeiro',
    'Financeiro',
    'Acesso financeiro e consulta operacional.',
    'empresa',
    '["financeiro:*","orcamentos:read","empresa:read"]'::jsonb,
    true
  )
ON CONFLICT (codigo) DO NOTHING;
