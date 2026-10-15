-- v1.5.2: optional weekly streaks. Off until the student turns them on and picks how many days a week
-- they mean to study (3 to 7); the rest are free rest days. A paused week (a trip, being ill) neither
-- breaks nor extends the streak.

alter table public.profiles
  add column streak_days smallint check (streak_days between 1 and 7),
  add column streak_pauses date[] not null default '{}' check (cardinality(streak_pauses) <= 60);
grant update (streak_days, streak_pauses) on public.profiles to authenticated;
