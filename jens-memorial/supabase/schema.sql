create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  approved boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('foto', 'video', 'quote', 'tekst')),
  title text not null,
  body text,
  author text,
  created_by uuid references auth.users(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  media_provider text,
  media_url text,
  media_public_id text,
  media_resource_type text,
  media_thumbnail_url text,
  media_size bigint,
  file_name text,
  is_core_memory boolean not null default false
);

create table if not exists public.memory_candles (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (memory_id, user_id)
);

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  source_type text not null default 'link',
  source_url text not null,
  external_url text,
  artwork_url text,
  audio_public_id text,
  duration_seconds integer,
  submitted_by_name text,
  reason text,
  added_by uuid references auth.users(id) on delete set null,
  approved boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.memories add column if not exists type text;
alter table public.memories add column if not exists title text;
alter table public.memories add column if not exists body text;
alter table public.memories add column if not exists author text;
alter table public.memories add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.memories add column if not exists submitted_by uuid references auth.users(id) on delete set null;
alter table public.memories add column if not exists created_at timestamptz not null default now();
alter table public.memories add column if not exists media_provider text;
alter table public.memories add column if not exists media_url text;
alter table public.memories add column if not exists media_public_id text;
alter table public.memories add column if not exists media_resource_type text;
alter table public.memories add column if not exists media_thumbnail_url text;
alter table public.memories add column if not exists media_size bigint;
alter table public.memories add column if not exists file_name text;
alter table public.memories add column if not exists is_core_memory boolean not null default false;
alter table public.tracks add column if not exists title text;
alter table public.tracks add column if not exists artist text;
alter table public.tracks add column if not exists source_type text not null default 'link';
alter table public.tracks add column if not exists source_url text;
alter table public.tracks add column if not exists external_url text;
alter table public.tracks add column if not exists artwork_url text;
alter table public.tracks add column if not exists audio_public_id text;
alter table public.tracks add column if not exists duration_seconds integer;
alter table public.tracks add column if not exists submitted_by_name text;
alter table public.tracks add column if not exists reason text;
alter table public.tracks add column if not exists added_by uuid references auth.users(id) on delete set null;
alter table public.tracks add column if not exists approved boolean not null default true;
alter table public.tracks add column if not exists created_at timestamptz not null default now();
alter table public.users add column if not exists email text;
alter table public.users add column if not exists name text;
alter table public.users add column if not exists approved boolean not null default false;
alter table public.users add column if not exists is_admin boolean not null default false;
alter table public.users add column if not exists created_at timestamptz not null default now();

do $$
begin
  alter table public.memories drop constraint if exists memories_type_check;
  alter table public.tracks drop constraint if exists tracks_source_type_check;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'memories'
      and column_name = 'submitted_by'
  ) then
    alter table public.memories alter column submitted_by drop not null;
  end if;
end $$;

alter table public.memories
  add constraint memories_type_check
  check (type in ('foto', 'video', 'quote', 'tekst'));

alter table public.tracks
  add constraint tracks_source_type_check
  check (source_type in ('link', 'audio'));

alter table public.memories enable row level security;
alter table public.memory_candles enable row level security;
alter table public.tracks enable row level security;
alter table public.users enable row level security;

create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where email = auth.jwt() ->> 'email'
      and is_admin = true
  );
$$;

create or replace function public.is_current_user_approved()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where email = auth.jwt() ->> 'email'
      and approved = true
  );
$$;

drop policy if exists "Users can read their own access record" on public.users;
create policy "Users can read their own access record"
  on public.users for select
  to authenticated
  using (email = auth.jwt() ->> 'email');

drop policy if exists "Users can create their own access record" on public.users;
create policy "Users can create their own access record"
  on public.users for insert
  to authenticated
  with check (email = auth.jwt() ->> 'email');

drop policy if exists "Admins can read users" on public.users;
create policy "Admins can read users"
  on public.users for select
  to authenticated
  using (public.is_current_user_admin());

drop policy if exists "Admins can update users" on public.users;
create policy "Admins can update users"
  on public.users for update
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists "Admins can create users" on public.users;
create policy "Admins can create users"
  on public.users for insert
  to authenticated
  with check (public.is_current_user_admin());

drop policy if exists "Approved users can read memories" on public.memories;
create policy "Approved users can read memories"
  on public.memories for select
  to authenticated
  using (public.is_current_user_approved());

drop policy if exists "Approved users can create memories" on public.memories;
create policy "Approved users can create memories"
  on public.memories for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_current_user_approved()
  );

drop policy if exists "Admins can update memories" on public.memories;
create policy "Admins can update memories"
  on public.memories for update
  to authenticated
  using (public.is_current_user_admin());

drop policy if exists "Admins can delete memories" on public.memories;
create policy "Admins can delete memories"
  on public.memories for delete
  to authenticated
  using (public.is_current_user_admin());

drop policy if exists "Approved users can read candles" on public.memory_candles;
create policy "Approved users can read candles"
  on public.memory_candles for select
  to authenticated
  using (public.is_current_user_approved());

drop policy if exists "Users can read their own candles" on public.memory_candles;
create policy "Users can read their own candles"
  on public.memory_candles for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Approved users can light candles" on public.memory_candles;
create policy "Approved users can light candles"
  on public.memory_candles for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.memories
      where memories.id = memory_id
    )
    and public.is_current_user_approved()
  );

drop policy if exists "Users can remove their own candles" on public.memory_candles;
create policy "Users can remove their own candles"
  on public.memory_candles for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Approved users can read tracks" on public.tracks;
create policy "Approved users can read tracks"
  on public.tracks for select
  to authenticated
  using (
    approved = true
    and public.is_current_user_approved()
  );

drop policy if exists "Approved users can create tracks" on public.tracks;
create policy "Approved users can create tracks"
  on public.tracks for insert
  to authenticated
  with check (
    added_by = auth.uid()
    and public.is_current_user_approved()
  );

drop policy if exists "Admins can update tracks" on public.tracks;
create policy "Admins can update tracks"
  on public.tracks for update
  to authenticated
  using (public.is_current_user_admin());

drop policy if exists "Admins can delete tracks" on public.tracks;
create policy "Admins can delete tracks"
  on public.tracks for delete
  to authenticated
  using (public.is_current_user_admin());

create index if not exists memories_created_at_idx on public.memories (created_at desc);
create index if not exists memory_candles_memory_id_idx on public.memory_candles (memory_id);
create index if not exists tracks_created_at_idx on public.tracks (created_at desc);
