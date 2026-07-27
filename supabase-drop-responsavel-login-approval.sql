begin;

drop table if exists public.responsavel_approval_session;
drop table if exists public.responsavel_approval_request;
drop table if exists public.responsavel_portal_access;
drop function if exists public.touch_responsavel_access_updated_at();

commit;
