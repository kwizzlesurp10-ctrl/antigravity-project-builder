-- Enable pgvector for semantic module discovery
create extension if not exists vector with schema extensions;

-- 1. Catalog of orbital architecture modules
create table public.orbital_modules (
  id text primary key,
  name text not null,
  category text not null check (category in ('frontend', 'backend', 'database', 'ai', 'devops')),
  orbit_mass integer not null default 10,
  dependencies text[] not null default '{}',
  code_template jsonb not null,
  embedding extensions.halfvec(1536),
  created_at timestamptz not null default now()
);

-- HNSW index using halfvec cosine distance for sub-10ms semantic matching
create index idx_orbital_modules_embedding 
  on public.orbital_modules 
  using hnsw (embedding extensions.halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);

-- 2. User-assembled blueprints
create table public.project_blueprints (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  title text not null check (char_length(title) between 1 and 120),
  prompt text,
  docked_module_ids text[] not null default '{}',
  gravity_config jsonb not null default '{"rpm": 1.0, "zeroG": true}'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Row Level Security (RLS)
alter table public.orbital_modules enable row level security;
alter table public.project_blueprints enable row level security;

create policy "Orbital modules are readable by everyone"
  on public.orbital_modules for select using (true);

create policy "Users can view public or own blueprints"
  on public.project_blueprints for select
  using (is_public = true or (select auth.uid()) = owner_id);

create policy "Users can insert own blueprints"
  on public.project_blueprints for insert
  with check ((select auth.uid()) = owner_id);

create policy "Users can update own blueprints"
  on public.project_blueprints for update
  using ((select auth.uid()) = owner_id);

-- 4. Semantic RPC matcher
create or replace function public.match_orbital_modules(
  query_embedding extensions.halfvec(1536),
  match_threshold float default 0.72,
  match_count int default 6
)
returns table (id text, name text, category text, similarity float)
language sql stable
as $$
  select
    m.id,
    m.name,
    m.category,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.orbital_modules m
  where 1 - (m.embedding <=> query_embedding) > match_threshold
  order by m.embedding <=> query_embedding
  limit match_count;
$$;
