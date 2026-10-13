-- How well a student wants to remember their cards (FSRS desired retention). Higher means more
-- reviews. Kept on the profile so every device schedules the same way.
alter table public.profiles
  add column review_retention real not null default 0.9 check (review_retention between 0.8 and 0.97);
grant update (review_retention) on public.profiles to authenticated;
