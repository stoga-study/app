-- v1.1.0: students choose what a study set includes (notes, flashcards, quiz, guide) and how much,
-- within caps per plan; saving a file is free, and a file counts once, when something is first made.

-- Most that one file can make in one go, per plan. Editable without a deploy.
create table public.generation_caps (
  plan   public.plan primary key,
  cards  integer not null check (cards between 1 and 500),
  quiz   integer not null check (quiz between 1 and 100),
  guide  integer not null check (guide between 1 and 40)
);
insert into public.generation_caps (plan, cards, quiz, guide) values
  ('essential', 60, 25, 12),
  ('independent', 150, 50, 20),
  ('unlimited', 150, 50, 20);
alter table public.generation_caps enable row level security;
create policy "anyone signed in reads caps" on public.generation_caps for select to authenticated using (true);

-- What the student asked for, and whether this file has used one of their study sets yet.
alter table public.sources
  add column options jsonb,
  add column counted boolean not null default false;
-- Files from before this change were counted when they were uploaded.
update public.sources set counted = true;

-- Each class remembers the parts the student picked last time.
alter table public.subjects add column study_defaults jsonb;
grant update (study_defaults) on public.subjects to authenticated;

-- "Make another quiz" adds a quiz instead of replacing one; each generation run tags its own.
alter table public.quizzes add column gen_run integer;

-- Shared study sets only match students who asked for the same parts and amounts.
alter table public.shared_sets add column options_key text not null default 'legacy';
alter table public.shared_sets drop constraint shared_sets_pkey;
alter table public.shared_sets add primary key (content_hash, gen_version, options_key);

-- Saving a file no longer uses an upload; making a study set does (see the generate function).
create or replace function public.begin_upload(p_subject uuid, p_filename text, p_kind text, p_bytes integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.subjects where id = p_subject and user_id = v_user) then
    raise exception 'subject_not_found' using errcode = 'P0002';
  end if;
  insert into public.sources (user_id, subject_id, filename, kind, bytes, status)
  values (v_user, p_subject, p_filename, p_kind, p_bytes, 'uploaded')
  returning id into v_id;
  return v_id;
end $$;

-- Undo an upload that failed before its text was saved. Nothing was counted, so nothing is refunded.
create or replace function public.cancel_upload(p_source uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.sources where id = p_source and user_id = auth.uid() and status = 'uploaded';
end $$;
