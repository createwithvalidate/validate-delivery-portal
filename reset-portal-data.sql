-- Validate Delivery Portal beta reset
-- Run this in Supabase SQL Editor when you want to start over.
-- It deletes portal data and all Supabase Auth users for this project.
-- It keeps/recreates the reusable beta invite codes.

begin;

truncate table
  public.project_access,
  public.comments,
  public.video_versions,
  public.videos,
  public.projects,
  public.clients
restart identity cascade;

delete from public.profiles;
delete from auth.users;

update public.invites
set accepted_by = null,
    accepted_at = null;

insert into public.invites (email, code, role)
values
  (null, 'VALIDATE-ADMIN-BETA', 'admin'),
  (null, 'VALIDATE-CLIENT-BETA', 'client')
on conflict (code) do update set
  email = excluded.email,
  role = excluded.role,
  accepted_by = null,
  accepted_at = null,
  expires_at = null;

commit;
