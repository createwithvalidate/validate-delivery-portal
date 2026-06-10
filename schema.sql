-- Validate Delivery Portal beta schema
-- Run this in Supabase SQL Editor.
-- Signup rule: invite-only accounts. Use invites.role = 'admin' for admin accounts
-- and invites.role = 'client' for client accounts.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz not null default now()
);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null unique,
  role text not null default 'client' check (role in ('admin', 'client')),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id text primary key,
  name text not null,
  contact text,
  email text,
  summary text,
  archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'review',
  archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists videos (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  title text not null,
  status text not null default 'draft',
  due text,
  created_at timestamptz not null default now()
);

create table if not exists video_versions (
  id text primary key,
  video_id text not null references videos(id) on delete cascade,
  label text not null,
  provider text not null default 'Bunny Stream',
  embed_url text,
  bunny_video_id text,
  note text,
  created_at_label text default 'Just now',
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists comments (
  id text primary key,
  version_id text not null references video_versions(id) on delete cascade,
  author text not null,
  role text not null check (role in ('admin', 'client')),
  body text not null,
  created_at_label text default 'Just now',
  created_at timestamptz not null default now()
);

create table if not exists project_access (
  project_id text not null references projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  granted_at timestamptz not null default now(),
  primary key (project_id, email)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_code text;
  invite_id uuid;
  invited_role text;
begin
  invite_code := new.raw_user_meta_data->>'invite_code';

  select id, role into invite_id, invited_role
  from invites
  where lower(email) = lower(new.email)
    and code = invite_code
    and accepted_at is null
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if lower(new.email) <> 'henry@createwithvalidate.com' and invite_id is null then
    raise exception 'A valid invite is required to create an account.';
  end if;

  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case
      when lower(new.email) = 'henry@createwithvalidate.com' then 'admin'
      when invited_role is not null then invited_role
      else 'client'
    end
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role;

  update invites
  set accepted_by = new.id,
      accepted_at = now()
  where id = invite_id;

  update project_access
  set user_id = new.id
  where lower(email) = lower(new.email)
    and user_id is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table profiles enable row level security;
alter table invites enable row level security;
alter table clients enable row level security;
alter table projects enable row level security;
alter table videos enable row level security;
alter table video_versions enable row level security;
alter table comments enable row level security;
alter table project_access enable row level security;

drop policy if exists "profiles_select_own_or_admin" on profiles;
drop policy if exists "profiles_update_own_name" on profiles;
drop policy if exists "admins_manage_invites" on invites;
drop policy if exists "admins_manage_clients" on clients;
drop policy if exists "clients_read_own_client" on clients;
drop policy if exists "admins_manage_projects" on projects;
drop policy if exists "clients_read_sent_projects" on projects;
drop policy if exists "admins_manage_videos" on videos;
drop policy if exists "clients_read_accessible_videos" on videos;
drop policy if exists "admins_manage_versions" on video_versions;
drop policy if exists "clients_read_accessible_versions" on video_versions;
drop policy if exists "clients_approve_accessible_versions" on video_versions;
drop policy if exists "read_accessible_comments" on comments;
drop policy if exists "clients_insert_accessible_comments" on comments;
drop policy if exists "admins_manage_project_access" on project_access;
drop policy if exists "clients_read_own_project_access" on project_access;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create policy "profiles_select_own_or_admin" on profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_name" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "admins_manage_invites" on invites
  for all using (public.is_admin()) with check (public.is_admin());

create policy "admins_manage_clients" on clients
  for all using (public.is_admin()) with check (public.is_admin());

create policy "clients_read_own_client" on clients
  for select using (
    public.is_admin()
    or lower(email) = lower((select email from profiles where id = auth.uid()))
  );

create policy "admins_manage_projects" on projects
  for all using (public.is_admin()) with check (public.is_admin());

create policy "clients_read_sent_projects" on projects
  for select using (
    public.is_admin()
    or exists (
      select 1 from project_access pa
      join profiles p on p.id = auth.uid()
      where pa.project_id = projects.id
        and lower(pa.email) = lower(p.email)
    )
  );

create policy "admins_manage_videos" on videos
  for all using (public.is_admin()) with check (public.is_admin());

create policy "clients_read_accessible_videos" on videos
  for select using (
    public.is_admin()
    or exists (
      select 1 from projects p
      join project_access pa on pa.project_id = p.id
      join profiles pr on pr.id = auth.uid()
      where videos.project_id = p.id
        and lower(pa.email) = lower(pr.email)
    )
  );

create policy "admins_manage_versions" on video_versions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "clients_read_accessible_versions" on video_versions
  for select using (
    public.is_admin()
    or exists (
      select 1 from videos v
      join projects p on p.id = v.project_id
      join project_access pa on pa.project_id = p.id
      join profiles pr on pr.id = auth.uid()
      where video_versions.video_id = v.id
        and lower(pa.email) = lower(pr.email)
    )
  );

create policy "clients_approve_accessible_versions" on video_versions
  for update using (
    public.is_admin()
    or exists (
      select 1 from videos v
      join projects p on p.id = v.project_id
      join project_access pa on pa.project_id = p.id
      join profiles pr on pr.id = auth.uid()
      where video_versions.video_id = v.id
        and lower(pa.email) = lower(pr.email)
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from videos v
      join projects p on p.id = v.project_id
      join project_access pa on pa.project_id = p.id
      join profiles pr on pr.id = auth.uid()
      where video_versions.video_id = v.id
        and lower(pa.email) = lower(pr.email)
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
      join profiles pr on pr.id = auth.uid()
      where comments.version_id = vv.id
        and lower(pa.email) = lower(pr.email)
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
      join profiles pr on pr.id = auth.uid()
      where comments.version_id = vv.id
        and lower(pa.email) = lower(pr.email)
        and comments.role = 'client'
    )
  );

create policy "admins_manage_project_access" on project_access
  for all using (public.is_admin()) with check (public.is_admin());

create policy "clients_read_own_project_access" on project_access
  for select using (
    lower(email) = lower((select email from profiles where id = auth.uid()))
  );

insert into invites (email, code, role)
values ('henry@createwithvalidate.com', 'VALIDATE-ADMIN-BETA', 'admin')
on conflict (code) do nothing;

insert into profiles (id, email, full_name, role)
select id, email, coalesce(raw_user_meta_data->>'full_name', 'Henry'), 'admin'
from auth.users
where lower(email) = 'henry@createwithvalidate.com'
on conflict (id) do update set role = 'admin';
