create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_email text,
  summary text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'review',
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table videos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  status text not null default 'draft',
  due_label text,
  created_at timestamptz not null default now()
);

create table video_versions (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  label text not null,
  provider text not null check (provider in ('bunny', 'vimeo')),
  provider_video_id text,
  embed_url text,
  note text,
  approved_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references video_versions(id) on delete cascade,
  author_id uuid,
  author_name text not null,
  author_role text not null check (author_role in ('admin', 'client')),
  body text not null,
  created_at timestamptz not null default now()
);

create table review_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version_id uuid references video_versions(id) on delete set null,
  recipient_email text not null,
  subject text not null,
  note text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
