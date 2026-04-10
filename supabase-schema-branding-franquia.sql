-- Branding da franquia Dog City Brasil.
-- Execute para permitir que a logo global da franquia seja lida antes do login.

drop policy if exists app_asset_public_branding on public.app_asset;
create policy app_asset_public_branding on public.app_asset
for select
to anon
using (
  key in ('branding.logo.primary', 'branding.franchise.logo')
  and (
    empresa_id is null
    or public.app_is_dog_city_unit(empresa_id)
  )
);
