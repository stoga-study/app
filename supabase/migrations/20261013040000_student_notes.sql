-- Your own notes: as many as you like per class, each optionally tied to a unit and a file.
-- Notes outlive the file or unit they were tied to (those links just clear).

create table public.student_notes (
  id          uuid primary key,  -- made on the device, so a note can be started offline
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid not null,
  unit_id     uuid,
  source_id   uuid,
  title       text not null default '' check (char_length(title) <= 120),
  body        text not null default '' check (char_length(body) <= 200000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  search      tsvector generated always as (to_tsvector('english', title || ' ' || body)) stored,
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade,
  foreign key (unit_id, user_id) references public.units (id, user_id) on delete set null (unit_id),
  foreign key (source_id, user_id) references public.sources (id, user_id) on delete set null (source_id)
);
create index student_notes_subject_idx on public.student_notes (subject_id, updated_at desc);
create index student_notes_source_idx on public.student_notes (source_id) where source_id is not null;
create index student_notes_search_idx on public.student_notes using gin (search);

alter table public.student_notes enable row level security;
create policy "owner can do everything" on public.student_notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
