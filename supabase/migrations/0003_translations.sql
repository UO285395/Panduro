-- Hito 7: historial de traducciones libres del usuario.

create table if not exists public.translations (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  text text not null,
  card_ids jsonb not null default '[]'::jsonb,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists translations_user_created_idx
  on public.translations (user_id, created_at desc);

alter table public.translations enable row level security;

create policy "translations: insert own"
  on public.translations for insert
  with check (auth.uid() = user_id);

create policy "translations: read own"
  on public.translations for select
  using (auth.uid() = user_id);

create policy "translations: delete own"
  on public.translations for delete
  using (auth.uid() = user_id);
