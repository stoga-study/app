-- v1.4.0: the calendar. Tests, quizzes, homework, projects and anything else, per class, with the
-- units a test or quiz covers (for readiness and the planner later). Homework and projects can be
-- ticked off. Dates are the student's local calendar dates.

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid,
  kind        text not null check (kind in ('test', 'quiz', 'homework', 'project', 'other')),
  title       text not null check (char_length(title) between 1 and 120),
  due_on      date not null,
  due_time    time,
  notes       text check (char_length(notes) <= 1000),
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade
);
create index events_user_due_idx on public.events (user_id, due_on);
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

alter table public.events enable row level security;
create policy "owner can do everything" on public.events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Units a test or quiz covers. Deleting a unit or the event removes the link.
create table public.event_units (
  event_id  uuid not null,
  unit_id   uuid not null,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (event_id, unit_id),
  foreign key (event_id, user_id) references public.events (id, user_id) on delete cascade,
  foreign key (unit_id, user_id) references public.units (id, user_id) on delete cascade
);
create index event_units_unit_idx on public.event_units (unit_id);

alter table public.event_units enable row level security;
create policy "owner can do everything" on public.event_units for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
