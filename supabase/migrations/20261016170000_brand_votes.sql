-- Testers' votes on a design change: which look they would rather use every day, and an optional comment.
-- One vote per student per survey; they can change it. Only the student sees their own vote; results
-- are read with server rights (the local admin dashboard).

create table public.brand_votes (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  survey      text not null check (survey ~ '^[a-z0-9-]{1,40}$'),
  choice      text not null check (choice in ('current', 'new', 'none')),
  comment     text not null default '' check (char_length(comment) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, survey)
);

alter table public.brand_votes enable row level security;
create policy "own vote" on public.brand_votes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
