-- v1.4.1: study-plan tasks the student finished on a day (ticked by hand, or marked by finishing a
-- quiz). Card review ticks itself off from the cards, so it is not stored here.

create table public.plan_done (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  key         text not null check (char_length(key) between 1 and 120),
  created_at  timestamptz not null default now(),
  primary key (user_id, day, key)
);

alter table public.plan_done enable row level security;
create policy "owner can do everything" on public.plan_done for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
