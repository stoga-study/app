-- Grade-aware classes. The student's grade is derived from their graduation year, so it moves up
-- on its own each school year. Subjects can point at a course in the Conestoga Program of Studies.
alter table public.profiles
  add column graduation_year smallint check (graduation_year between 2025 and 2040);
grant update (graduation_year) on public.profiles to authenticated;

alter table public.subjects
  add column catalog_id  text check (char_length(catalog_id) <= 80),   -- course id in src/data/chs-courses.json
  add column course_code text check (course_code ~ '^\d{4}$'),         -- the section's 4-digit code
  add column level       text check (level in ('AP', 'H*', 'H', 'X', 'A'));

-- One subject per catalog course (archived ones included, so re-adding a dropped class restores it
-- with its notes and cards instead of making a duplicate).
create unique index subjects_user_catalog_key on public.subjects (user_id, catalog_id) where catalog_id is not null;
