-- Panduro — esquema inicial
-- Tablas: profiles, progress, reviews, events
-- RLS: cada usuario solo ve/edita sus filas.

-- =============================================================
-- profiles: extiende auth.users con datos de aprendizaje
-- =============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  mcer_level text not null default 'A1' check (mcer_level in ('A1','A2','B1','B2')),
  ui_locale text not null default 'es-ES',
  hearts int not null default 5 check (hearts >= 0 and hearts <= 5),
  hearts_regen_at timestamptz,
  streak_days int not null default 0 check (streak_days >= 0),
  streak_last_day date,
  xp_total int not null default 0 check (xp_total >= 0),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- profile row se crea automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- progress: estado por lección
-- =============================================================
create table if not exists public.progress (
  user_id uuid not null references auth.users on delete cascade,
  lesson_id text not null,
  status text not null default 'unlocked' check (status in ('locked','unlocked','completed','perfected')),
  best_score int not null default 0 check (best_score >= 0),
  attempts int not null default 0 check (attempts >= 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists progress_user_idx on public.progress (user_id);

alter table public.progress enable row level security;

create policy "progress: read own" on public.progress for select using (auth.uid() = user_id);
create policy "progress: insert own" on public.progress for insert with check (auth.uid() = user_id);
create policy "progress: update own" on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "progress: delete own" on public.progress for delete using (auth.uid() = user_id);

-- =============================================================
-- reviews: tarjetas SM-2 (repetición espaciada)
-- =============================================================
create table if not exists public.reviews (
  user_id uuid not null references auth.users on delete cascade,
  card_id text not null,
  ease numeric not null default 2.5 check (ease >= 1.3),
  interval_days int not null default 0 check (interval_days >= 0),
  repetitions int not null default 0 check (repetitions >= 0),
  due_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create index if not exists reviews_due_idx on public.reviews (user_id, due_at);

alter table public.reviews enable row level security;

create policy "reviews: read own" on public.reviews for select using (auth.uid() = user_id);
create policy "reviews: insert own" on public.reviews for insert with check (auth.uid() = user_id);
create policy "reviews: update own" on public.reviews for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reviews: delete own" on public.reviews for delete using (auth.uid() = user_id);

-- =============================================================
-- events: telemetría de aprendizaje
-- =============================================================
create table if not exists public.events (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_user_created_idx on public.events (user_id, created_at desc);
create index if not exists events_kind_idx on public.events (kind);

alter table public.events enable row level security;

create policy "events: insert own" on public.events for insert with check (auth.uid() = user_id);
create policy "events: read own" on public.events for select using (auth.uid() = user_id);
