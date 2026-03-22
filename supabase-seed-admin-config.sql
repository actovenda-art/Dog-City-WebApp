-- Seed inicial para branding, precos e governanca multiempresa
-- Execute apos:
-- 1. supabase-schema-admin-multiempresa.sql
-- 2. supabase-storage-setup.sql

INSERT INTO empresa (id, codigo, nome_fantasia, razao_social, slug, status, branding)
VALUES
  (
    'empresa_demo',
    'DOGCITY',
    'Dog City Brasil',
    'Dog City Brasil',
    'dog-city-brasil',
    'ativa',
    '{"primary_color":"#2563eb","accent_color":"#ea580c"}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nome_fantasia = EXCLUDED.nome_fantasia,
  razao_social = EXCLUDED.razao_social,
  slug = EXCLUDED.slug,
  status = EXCLUDED.status,
  branding = EXCLUDED.branding,
  updated_date = NOW();

UPDATE users
SET
  empresa_id = COALESCE(empresa_id, 'empresa_demo'),
  access_profile_id = COALESCE(access_profile_id, (SELECT id FROM perfil_acesso WHERE codigo = 'platform_owner' LIMIT 1)),
  company_role = COALESCE(company_role, profile),
  is_platform_admin = COALESCE(is_platform_admin, true),
  updated_date = NOW()
WHERE email IS NOT NULL;

INSERT INTO app_config (key, label, description, value, ativo, empresa_id)
VALUES
  (
    'branding.company_name',
    'Nome da empresa',
    'Nome exibido no menu lateral e cabecalho',
    '{"text":"Dog City Brasil"}'::jsonb,
    true,
    'empresa_demo'
  )
ON CONFLICT (key, empresa_id) WHERE empresa_id IS NOT NULL
DO UPDATE SET
  value = EXCLUDED.value,
  ativo = EXCLUDED.ativo,
  updated_date = NOW();

INSERT INTO tabelaprecos (codigo, descricao, valor, ativo, tipo, empresa_id, config_key)
VALUES
  ('DOGCITY_HOSPEDAGEM_NORMAL', 'Hospedagem nao mensalista', 150, true, 'hospedagem', 'empresa_demo', 'diaria_normal'),
  ('DOGCITY_HOSPEDAGEM_MENSALISTA', 'Hospedagem mensalista', 120, true, 'hospedagem_mensalista', 'empresa_demo', 'diaria_mensalista'),
  ('DOGCITY_PERNOITE_DAYCARE', 'Pernoite day care', 60, true, 'pernoite', 'empresa_demo', 'pernoite'),
  ('DOGCITY_TRANSPORTE_KM', 'Transporte por km', 6, true, 'transporte_km', 'empresa_demo', 'transporte_km'),
  ('DOGCITY_DESC_DORMITORIO', 'Desconto dormitorio compartilhado', 30, true, 'desconto', 'empresa_demo', 'desconto_canil'),
  ('DOGCITY_DESC_LONGA_ESTADIA', 'Desconto longa estadia', 3, true, 'desconto', 'empresa_demo', 'desconto_longa_estadia'),
  ('DOGCITY_BANHO_POODLE', 'Banho Poodle', 60, true, 'banho', 'empresa_demo', null),
  ('DOGCITY_BANHO_SHIH_TZU', 'Banho Shih Tzu', 65, true, 'banho', 'empresa_demo', null),
  ('DOGCITY_BANHO_SRD', 'Banho SRD', 60, true, 'banho', 'empresa_demo', null),
  ('DOGCITY_TOSA_GERAL_POODLE', 'Tosa Geral Poodle', 80, true, 'tosa_geral', 'empresa_demo', null),
  ('DOGCITY_TOSA_DETALHADA_POODLE', 'Tosa Detalhada Poodle', 120, true, 'tosa_detalhada', 'empresa_demo', null)
ON CONFLICT DO NOTHING;

-- A logo deve ser enviada pelo app para o bucket public-assets.
-- Depois do upload, grave o path em app_asset:
-- INSERT INTO app_asset (key, label, bucket, storage_path, public_url, ativo, empresa_id)
-- VALUES ('branding.logo.primary', 'Logo principal', 'public-assets', 'empresa_demo/branding/logo.png', 'https://<project>.supabase.co/storage/v1/object/public/public-assets/empresa_demo/branding/logo.png', true, 'empresa_demo')
-- ON CONFLICT (key, empresa_id) WHERE empresa_id IS NOT NULL
-- DO UPDATE SET storage_path = EXCLUDED.storage_path, public_url = EXCLUDED.public_url, ativo = EXCLUDED.ativo, updated_date = NOW();
