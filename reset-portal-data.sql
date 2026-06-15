-- Validate Delivery Portal beta reset
-- Run this in Supabase SQL Editor when you want to start over.
-- It deletes portal data and all Supabase Auth users for this project.
-- It removes old reusable beta invite codes. Generate fresh codes in Settings.

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

delete from public.invites
where code in ('VALIDATE-ADMIN-BETA', 'VALIDATE-CLIENT-BETA');

commit;
