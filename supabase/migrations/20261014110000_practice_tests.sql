-- v1.4.5: finished timed practice tests, for the score history before a test (and the exam-prep page).

create table public.practice_tests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid not null,
  event_id    uuid,
  unit_ids    uuid[] not null default '{}',
  total       integer not null check (total between 1 and 60),
  points      numeric(5, 1) not null check (points >= 0 and points <= total),
  pct         integer not null check (pct between 0 and 100),
  seconds     integer not null check (seconds >= 0),
  items       jsonb not null default '[]',
  finished_at timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade,
  foreign key (event_id, user_id) references public.events (id, user_id) on delete set null (event_id)
);
create index practice_tests_user_idx on public.practice_tests (user_id, finished_at desc);

alter table public.practice_tests enable row level security;
create policy "owner can do everything" on public.practice_tests for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
