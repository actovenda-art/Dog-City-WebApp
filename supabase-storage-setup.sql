-- Storage buckets and policies for Dog City Brasil
-- Current frontend architecture uses the Supabase anon key directly and
-- does not rely on a guaranteed authenticated Supabase session for uploads.
-- Because of that, uploads must be allowed for the `public` role.
--
-- Security tradeoff:
-- - `public-assets`: intended for logos and non-sensitive files
-- - `private-files`: remains a private bucket, but object access/presign from
--   the frontend still requires permissive object policies until auth/server
--   mediation exists
--
-- Run this in Supabase SQL Editor.

insert into storage.buckets (id, name, public)
values
  ('public-assets', 'public-assets', true),
  ('private-files', 'private-files', false)
on conflict (id) do update
set public = excluded.public;

-- =========================================================
-- public-assets
-- Public read + frontend upload/update/delete
-- =========================================================

drop policy if exists "public_assets_read" on storage.objects;
create policy "public_assets_read"
on storage.objects for select
to public
using (bucket_id = 'public-assets');

drop policy if exists "public_assets_insert" on storage.objects;
create policy "public_assets_insert"
on storage.objects for insert
to public
with check (bucket_id = 'public-assets');

drop policy if exists "public_assets_update" on storage.objects;
create policy "public_assets_update"
on storage.objects for update
to public
using (bucket_id = 'public-assets')
with check (bucket_id = 'public-assets');

drop policy if exists "public_assets_delete" on storage.objects;
create policy "public_assets_delete"
on storage.objects for delete
to public
using (bucket_id = 'public-assets');

-- =========================================================
-- private-files
-- Frontend compatibility mode:
-- allows upload/presign/read/delete from the app using anon key.
-- If you later move uploads behind authenticated Supabase sessions or an Edge
-- Function, tighten these policies again.
-- =========================================================

drop policy if exists "private_files_select" on storage.objects;
create policy "private_files_select"
on storage.objects for select
to public
using (bucket_id = 'private-files');

drop policy if exists "private_files_insert" on storage.objects;
create policy "private_files_insert"
on storage.objects for insert
to public
with check (bucket_id = 'private-files');

drop policy if exists "private_files_update" on storage.objects;
create policy "private_files_update"
on storage.objects for update
to public
using (bucket_id = 'private-files')
with check (bucket_id = 'private-files');

drop policy if exists "private_files_delete" on storage.objects;
create policy "private_files_delete"
on storage.objects for delete
to public
using (bucket_id = 'private-files');
