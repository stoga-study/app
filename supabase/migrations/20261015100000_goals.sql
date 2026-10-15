-- v1.5.1: personal weekly goals. Most are measured from real studying; a custom goal ("read 2
-- chapters") is ticked by hand, one tick at a time.

create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('days', 'cards', 'questions', 'minutes', 'custom')),
  target      integer not null check (target between 1 and 10000),
  label       text check (char_length(label) between 1 and 60),
  subject_id  uuid,
  created_at  timestamptz not null default now(),
  check (kind <> 'custom' or label is not null),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade
);
create index goals_user_idx on public.goals (user_id);
alter table public.goals enable row level security;
create policy "owner can do everything" on public.goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Ticks on a custom goal, on the student's own calendar day.
create table public.goal_ticks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id     uuid not null,
  day         date not null,
  created_at  timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);
create index goal_ticks_goal_idx on public.goal_ticks (goal_id, day);
alter table public.goal_ticks enable row level security;
create policy "owner can do everything" on public.goal_ticks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- At most four goals each.
create or replace function public.goals_limit() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (select count(*) from public.goals where user_id = new.user_id) >= 4 then
    raise exception 'goal_limit';
  end if;
  return new;
end;
$$;
create trigger goals_limit before insert on public.goals for each row execute function public.goals_limit();
