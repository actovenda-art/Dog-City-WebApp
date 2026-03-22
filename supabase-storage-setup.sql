-- Storage buckets and policies for Dog City Brasil
-- Run this in Supabase SQL Editor

insert into storage.buckets (id, name, public)
values
  ('public-assets', 'public-assets', true),
  ('private-files', 'private-files', false)
on conflict (id) do update
set public = excluded.public;

-- Public assets: public read, authenticated write/update/delete
drop policy if exists "public_assets_read" on storage.objects;
create policy "public_assets_read"
on storage.objects for select
to public
using (bucket_id = 'public-assets');

drop policy if exists "public_assets_auth_insert" on storage.objects;
create policy "public_assets_auth_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'public-assets');

drop policy if exists "public_assets_auth_update" on storage.objects;
create policy "public_assets_auth_update"
on storage.objects for update
to authenticated
using (bucket_id = 'public-assets')
with check (bucket_id = 'public-assets');

drop policy if exists "public_assets_auth_delete" on storage.objects;
create policy "public_assets_auth_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'public-assets');

-- Private files: authenticated only
drop policy if exists "private_files_auth_read" on storage.objects;
create policy "private_files_auth_read"
on storage.objects for select
to authenticated
using (bucket_id = 'private-files');

drop policy if exists "private_files_auth_insert" on storage.objects;
create policy "private_files_auth_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'private-files');

drop policy if exists "private_files_auth_update" on storage.objects;
create policy "private_files_auth_update"
on storage.objects for update
to authenticated
using (bucket_id = 'private-files')
with check (bucket_id = 'private-files');

drop policy if exists "private_files_auth_delete" on storage.objects;
create policy "private_files_auth_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'private-files');
