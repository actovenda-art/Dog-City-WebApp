-- Convites de usuario + ficha complementar de cadastro
-- Execute apos:
-- 1. supabase-schema.sql
-- 2. supabase-schema-admin-multiempresa.sql

ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS street TEXT,
  ADD COLUMN IF NOT EXISTS number TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS pix_key_type TEXT,
  ADD COLUMN IF NOT EXISTS pix_key TEXT,
  ADD COLUMN IF NOT EXISTS contact_nickname TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_path TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'completo',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS invite_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS invite_accepted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS invite_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS invite_token TEXT,
  ADD COLUMN IF NOT EXISTS invited_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS invite_accepted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS invite_metadata JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.user_invite (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  empresa_id TEXT,
  access_profile_id TEXT,
  company_role TEXT,
  is_platform_admin BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pendente',
  invited_by_user_id TEXT,
  invited_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  onboarding_completed_at TIMESTAMP,
  expires_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_date TIMESTAMP DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_invite_email ON public.user_invite(email);
CREATE INDEX IF NOT EXISTS idx_user_invite_status ON public.user_invite(status);
CREATE INDEX IF NOT EXISTS idx_user_invite_empresa_id ON public.user_invite(empresa_id);
CREATE INDEX IF NOT EXISTS idx_users_onboarding_status ON public.users(onboarding_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_token ON public.users(invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_invite_status ON public.users(invite_status) WHERE invite_sent = true;
CREATE INDEX IF NOT EXISTS idx_users_invite_email ON public.users(lower(email)) WHERE invite_sent = true;

ALTER TABLE IF EXISTS public.user_invite DISABLE ROW LEVEL SECURITY;

UPDATE public.users
SET onboarding_status = COALESCE(onboarding_status, 'completo')
WHERE onboarding_status IS NULL;
