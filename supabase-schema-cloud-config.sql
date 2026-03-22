-- Cloud config and storage metadata for Dog City Brasil
-- Execute after supabase-schema.sql and supabase-schema-additional.sql

CREATE TABLE IF NOT EXISTS app_config (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key TEXT NOT NULL,
  label TEXT,
  description TEXT,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  ativo BOOLEAN DEFAULT true,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_asset (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key TEXT NOT NULL,
  label TEXT,
  bucket TEXT NOT NULL DEFAULT 'public',
  storage_path TEXT NOT NULL,
  public_url TEXT,
  mime_type TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ativo BOOLEAN DEFAULT true,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_config_key ON app_config(key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_asset_key ON app_asset(key);

-- Suggested config keys:
-- branding.logo
-- branding.company_name
-- pricing.hospedagem
-- pricing.banho_por_raca
-- pricing.tosa_higienica
-- pricing.tosa_geral
-- pricing.tosa_detalhada
-- pricing.descontos

-- Suggested asset keys:
-- branding.logo.primary
-- branding.logo.mobile
-- dogs.photo.<dog_id>
-- dogs.vaccine_card.<dog_id>
-- checkin.belongings.<checkin_id>

INSERT INTO app_config (key, label, description, value, ativo)
VALUES
  (
    'branding.company_name',
    'Nome da empresa',
    'Nome exibido no sidebar e telas institucionais',
    '{"text":"Dog City Brasil"}'::jsonb,
    true
  ),
  (
    'pricing.descontos',
    'Regras de desconto',
    'Percentuais globais aplicados em orcamentos',
    '{"desconto_canil":0.30,"desconto_longa_estadia":0.03}'::jsonb,
    true
  )
ON CONFLICT (key) DO NOTHING;
