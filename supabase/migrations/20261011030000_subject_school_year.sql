-- Which school year a class was picked for ("2026-27"). In a new school year the app asks students
-- to update their classes; last year's are archived with their notes and cards when they do.
alter table public.subjects
  add column school_year text check (school_year ~ '^\d{4}-\d{2}$');
update public.subjects set school_year = '2026-27' where catalog_id is not null;
