-- Validate Delivery Portal invite loading fix
-- Run this once in Supabase SQL Editor after the main schema exists.
-- It updates policies only; it does not delete clients, projects, videos, or versions.

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select lower(auth.jwt() ->> 'email');
$$;

drop policy if exists "clients_read_own_client" on clients;
drop policy if exists "clients_read_sent_projects" on projects;
drop policy if exists "clients_read_accessible_videos" on videos;
drop policy if exists "clients_read_accessible_versions" on video_versions;
drop policy if exists "clients_approve_accessible_versions" on video_versions;
drop policy if exists "read_accessible_comments" on comments;
drop policy if exists "clients_insert_accessible_comments" on comments;
drop policy if exists "clients_read_own_project_access" on project_access;

create policy "clients_read_own_client" on clients
  for select using (
    public.is_admin()
    or lower(email) = public.current_user_email()
  );

create policy "clients_read_sent_projects" on projects
  for select using (
    public.is_admin()
    or exists (
      select 1 from project_access pa
      where pa.project_id = projects.id
        and lower(pa.email) = public.current_user_email()
    )
  );

create policy "clients_read_accessible_videos" on videos
  for select using (
    public.is_admin()
    or exists (
      select 1 from projects p
      join project_access pa on pa.project_id = p.id
      where videos.project_id = p.id
        and lower(pa.email) = public.current_user_email()
    )
  );

create policy "clients_read_accessible_versions" on video_versions
  for select using (
    public.is_admin()
    or exists (
      select 1 from videos v
      join projects p on p.id = v.project_id
      join project_access pa on pa.project_id = p.id
      where video_versions.video_id = v.id
        and lower(pa.email) = public.current_user_email()
    )
  );

create policy "clients_approve_accessible_versions" on video_versions
  for update using (
    public.is_admin()
    or exists (
      select 1 from videos v
      join projects p on p.id = v.project_id
      join project_access pa on pa.project_id = p.id
      where video_versions.video_id = v.id
        and lower(pa.email) = public.current_user_email()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from videos v
      join projects p on p.id = v.project_id
      join project_access pa on pa.project_id = p.id
      where video_versions.video_id = v.id
        and lower(pa.email) = public.current_user_email()
    )
  );

create policy "read_accessible_comments" on comments
  for select using (
    public.is_admin()
    or exists (
      select 1 from video_versions vv
      join videos v on v.id = vv.video_id
      join projects p on p.id = v.project_id
      join project_access pa on pa.project_id = p.id
      where comments.version_id = vv.id
        and lower(pa.email) = public.current_user_email()
    )
  );

create policy "clients_insert_accessible_comments" on comments
  for insert with check (
    public.is_admin()
    or exists (
      select 1 from video_versions vv
      join videos v on v.id = vv.video_id
      join projects p on p.id = v.project_id
      join project_access pa on pa.project_id = p.id
      where comments.version_id = vv.id
        and lower(pa.email) = public.current_user_email()
        and comments.role = 'client'
    )
  );

create policy "clients_read_own_project_access" on project_access
  for select using (
    lower(email) = public.current_user_email()
  );
