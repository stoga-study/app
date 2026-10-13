-- Units: a class's units (Unit 11, Chapter 7, …), the unit and lesson each file belongs to, and the
-- class's current unit (follows the newest upload unless the student pins one).

create table public.units (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid not null,
  number      text check (number ~ '^\d{1,3}$'),
  title       text check (char_length(title) between 1 and 80),
  word        text not null default 'Unit' check (word in ('Unit', 'Chapter', 'Module', 'Topic', 'Lesson')),
  created_at  timestamptz not null default now(),
  check (number is not null or title is not null),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade
);
create unique index units_subject_number_key on public.units (subject_id, number) where number is not null;
create index units_subject_idx on public.units (subject_id);

alter table public.units enable row level security;
create policy "owner can do everything" on public.units for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Which unit (and lesson, like "11.1") a file belongs to. Deleting a unit leaves its files unfiled.
alter table public.sources
  add column unit_id uuid,
  add column lesson text check (lesson ~ '^\d{1,3}\.\d{1,3}$'),
  add foreign key (unit_id, user_id) references public.units (id, user_id) on delete set null (unit_id);
create index sources_unit_idx on public.sources (unit_id) where unit_id is not null;

-- The unit the class is on now, and whether the student pinned it.
alter table public.subjects
  add column current_unit_id uuid,
  add column current_unit_pinned boolean not null default false,
  add foreign key (current_unit_id, user_id) references public.units (id, user_id) on delete set null (current_unit_id);
grant update (current_unit_id, current_unit_pinned) on public.subjects to authenticated;
