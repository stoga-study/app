-- v1.4.7: importing the student's own calendars (an .ics file once, or a calendar link kept in sync).
-- Imported items are ordinary events that remember where they came from, so a re-sync updates them
-- instead of adding copies, and removing a linked calendar removes what it added.

create table public.calendar_feeds (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  url             text not null check (char_length(url) <= 2000),
  subject_id      uuid,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, url),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id)
);
alter table public.calendar_feeds enable row level security;
create policy "owner can do everything" on public.calendar_feeds for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.events
  add column feed_id uuid,
  add column external_id text check (char_length(external_id) <= 400),
  add foreign key (feed_id, user_id) references public.calendar_feeds (id, user_id) on delete cascade;
create unique index events_external_key on public.events (user_id, external_id) where external_id is not null;
