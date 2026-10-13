-- Organising cards: tags on each card, and custom decks that can mix cards from any class.

alter table public.cards
  add column tags text[] not null default '{}' check (cardinality(tags) <= 20);
create index cards_tags_idx on public.cards using gin (tags);

create table public.decks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  created_at  timestamptz not null default now(),
  unique (id, user_id)
);
create index decks_user_idx on public.decks (user_id, created_at);

-- A card can be in many decks. Deleting a card or a deck just removes the link.
create table public.deck_cards (
  deck_id   uuid not null,
  card_id   uuid not null,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (deck_id, card_id),
  foreign key (deck_id, user_id) references public.decks (id, user_id) on delete cascade,
  foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade
);
create index deck_cards_card_idx on public.deck_cards (card_id);

alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;
create policy "owner can do everything" on public.decks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can do everything" on public.deck_cards for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Merge one deck into another in one step: every card ends up in `into`, then `from` is removed.
-- Runs as the student (row-level security applies), so only their own decks can be merged.
create function public.merge_decks(from_deck uuid, into_deck uuid) returns void
language sql security invoker set search_path = '' as $$
  insert into public.deck_cards (deck_id, card_id)
    select into_deck, card_id from public.deck_cards where deck_id = from_deck
    on conflict do nothing;
  delete from public.decks where id = from_deck and from_deck <> into_deck;
$$;
revoke execute on function public.merge_decks(uuid, uuid) from public, anon;
grant execute on function public.merge_decks(uuid, uuid) to authenticated;
