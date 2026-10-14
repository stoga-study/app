-- Tags on files, and archiving: an archived file, or a file in an archived class, drops out of review,
-- quizzes, mastery, search and the tutor until it is restored. Nothing is deleted.
--
-- cards.archived and quizzes.archived are derived (source or class archived), kept in sync by triggers,
-- so every list filters one column the same way it already filters `hidden`.

alter table public.sources add column tags text[] not null default '{}' check (cardinality(tags) <= 20);
alter table public.sources add column archived boolean not null default false;
create index sources_tags_idx on public.sources using gin (tags);

alter table public.cards add column archived boolean not null default false;
alter table public.quizzes add column archived boolean not null default false;

-- What a card or quiz should be, from its file and its class.
create function public.is_archived(p_subject uuid, p_source uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select coalesce((select archived from public.subjects where id = p_subject), false)
      or coalesce((select archived from public.sources where id = p_source), false)
$$;

create function public.sync_archived_from_source() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.archived is distinct from old.archived or new.subject_id is distinct from old.subject_id then
    update public.cards set archived = public.is_archived(subject_id, source_id) where source_id = new.id;
    update public.quizzes set archived = public.is_archived(subject_id, source_id) where source_id = new.id;
  end if;
  return new;
end $$;
create trigger sources_sync_archived after update on public.sources
  for each row execute function public.sync_archived_from_source();

create function public.sync_archived_from_subject() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.archived is distinct from old.archived then
    update public.cards set archived = public.is_archived(subject_id, source_id) where subject_id = new.id;
    update public.quizzes set archived = public.is_archived(subject_id, source_id) where subject_id = new.id;
  end if;
  return new;
end $$;
create trigger subjects_sync_archived after update on public.subjects
  for each row execute function public.sync_archived_from_subject();

-- New or moved cards and quizzes pick up the state of where they land.
create function public.set_archived_on_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.archived := public.is_archived(new.subject_id, new.source_id);
  return new;
end $$;
create trigger cards_set_archived before insert or update of subject_id, source_id on public.cards
  for each row execute function public.set_archived_on_write();
create trigger quizzes_set_archived before insert or update of subject_id, source_id on public.quizzes
  for each row execute function public.set_archived_on_write();

-- Backfill: cards and quizzes already in archived classes.
update public.cards set archived = true where public.is_archived(subject_id, source_id);
update public.quizzes set archived = true where public.is_archived(subject_id, source_id);

-- The tutor's page search skips archived files and classes.
create or replace function public.search_pages(p_subject uuid, p_query text, p_limit integer default 8, p_source_id uuid default null, p_unit_id uuid default null)
returns table (source_id uuid, filename text, page_no integer, text text, rank real)
language sql stable security invoker set search_path = '' as $$
  with q as (select websearch_to_tsquery('english', p_query) as tsq)
  select sp.source_id, s.filename, sp.page_no, sp.text, ts_rank_cd(sp.tsv, q.tsq) as rank
    from public.source_pages sp
    join public.sources s on s.id = sp.source_id
    cross join q
   where s.subject_id = p_subject and sp.tsv @@ q.tsq and not s.archived
     and (p_source_id is null or sp.source_id = p_source_id)
     and (p_unit_id is null or s.unit_id = p_unit_id)
   order by rank desc
   limit least(greatest(p_limit, 1), 12)
$$;

-- Search everything skips archived files, archived classes, and their cards and questions.
create or replace function public.search_everything(p_query text, p_subject uuid default null, p_limit integer default 8)
returns table (kind text, id uuid, subject_id uuid, title text, snippet text, source_id uuid, extra_id uuid, page_no integer, rank real)
language sql stable security invoker set search_path = '' as $$
  with q as (select websearch_to_tsquery('english', p_query) as tsq), lim as (select least(greatest(p_limit, 1), 20) as n),
       live as (select id from public.subjects where not archived)
  (
    select 'file', s.id, s.subject_id, s.filename, null::text, s.id, null::uuid, null::integer, 0.5::real
      from public.sources s, lim
     where (p_subject is null or s.subject_id = p_subject) and p_query <> '' and not s.archived
       and s.subject_id in (select id from live) and s.filename ilike '%' || p_query || '%'
     order by s.filename
     limit (select n from lim)
  )
  union all
  (
    select 'page', sp.source_id, s.subject_id, s.filename,
           ts_headline('english', sp.text, q.tsq, 'MaxFragments=1,MaxWords=24,MinWords=6,ShortWord=3'),
           sp.source_id, null::uuid, sp.page_no, ts_rank_cd(sp.tsv, q.tsq)
      from public.source_pages sp join public.sources s on s.id = sp.source_id, q, lim
     where (p_subject is null or s.subject_id = p_subject) and sp.tsv @@ q.tsq and not s.archived
       and s.subject_id in (select id from live)
     order by ts_rank_cd(sp.tsv, q.tsq) desc
     limit (select n from lim)
  )
  union all
  (
    select 'note', n.id, n.subject_id, coalesce(nullif(trim(n.title), ''), 'Untitled note'),
           ts_headline('english', n.body, q.tsq, 'MaxFragments=1,MaxWords=24,MinWords=6,ShortWord=3'),
           n.source_id, null::uuid, null::integer, ts_rank_cd(n.search, q.tsq)
      from public.student_notes n, q, lim
     where (p_subject is null or n.subject_id = p_subject) and n.search @@ q.tsq
       and n.subject_id in (select id from live)
     order by ts_rank_cd(n.search, q.tsq) desc
     limit (select n from lim)
  )
  union all
  (
    select 'card', c.id, c.subject_id, c.front, c.back, c.source_id, null::uuid, null::integer, ts_rank_cd(c.search, q.tsq)
      from public.cards c, q, lim
     where (p_subject is null or c.subject_id = p_subject) and c.search @@ q.tsq and not c.hidden and not c.archived
     order by ts_rank_cd(c.search, q.tsq) desc
     limit (select n from lim)
  )
  union all
  (
    select 'question', qq.id, z.subject_id, qq.prompt, qq.explanation, z.source_id, qq.quiz_id, null::integer, ts_rank_cd(qq.search, q.tsq)
      from public.quiz_questions qq join public.quizzes z on z.id = qq.quiz_id, q, lim
     where (p_subject is null or z.subject_id = p_subject) and qq.search @@ q.tsq and not qq.hidden and not z.archived
     order by ts_rank_cd(qq.search, q.tsq) desc
     limit (select n from lim)
  )
$$;
