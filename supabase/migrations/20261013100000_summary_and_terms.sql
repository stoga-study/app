-- Two new study-set parts: a short summary of the file, and a key-terms glossary. Both choosable on
-- upload like notes, cards, quiz and guide.

alter table public.generation_caps add column terms integer not null default 20 check (terms between 1 and 100);
update public.generation_caps set terms = 20 where plan = 'essential';
update public.generation_caps set terms = 40 where plan in ('independent', 'unlimited');
alter table public.generation_caps alter column terms drop default;

create table public.summaries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id   uuid not null,
  body_md     text not null check (char_length(body_md) <= 4000),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (source_id),
  foreign key (source_id, user_id) references public.sources (id, user_id) on delete cascade
);

create table public.key_terms (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id   uuid not null,
  position    integer not null,
  term        text not null check (char_length(term) <= 120),
  definition  text not null check (char_length(definition) <= 600),
  pages       integer[] not null default '{}',
  hidden      boolean not null default false,
  foreign key (source_id, user_id) references public.sources (id, user_id) on delete cascade
);
create index key_terms_source_idx on public.key_terms (source_id, position);

alter table public.summaries enable row level security;
create policy "owner can do everything" on public.summaries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.key_terms enable row level security;
create policy "owner can do everything" on public.key_terms for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
