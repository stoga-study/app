-- v1.5.3: quiet milestones. Which ones the student has reached, and the day each was first noticed,
-- so each is celebrated once, on any device.
alter table public.profiles
  add column milestones jsonb not null default '{}' check (jsonb_typeof(milestones) = 'object' and pg_column_size(milestones) < 4000);
grant update (milestones) on public.profiles to authenticated;
