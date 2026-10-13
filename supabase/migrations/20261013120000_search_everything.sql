-- One search bar across everything a student has: files, pages, their own notes, cards and quiz
-- questions. Postgres full-text search over each table, unioned into one ranked result.

alter table public.cards add column search tsvector generated always as (to_tsvector('english', front || ' ' || back)) stored;
create index cards_search_idx on public.cards using gin (search);

alter table public.quiz_questions add column search tsvector generated always as (to_tsvector('english', prompt || ' ' || explanation)) stored;
create index quiz_questions_search_idx on public.quiz_questions using gin (search);

create function public.search_everything(p_query text, p_subject uuid default null, p_limit integer default 8)
returns table (kind text, id uuid, subject_id uuid, title text, snippet text, source_id uuid, extra_id uuid, page_no integer, rank real)
language sql stable security invoker set search_path = '' as $$
  with q as (select websearch_to_tsquery('english', p_query) as tsq), lim as (select least(greatest(p_limit, 1), 20) as n)
  (
    select 'file', s.id, s.subject_id, s.filename, null::text, s.id, null::uuid, null::integer, 0.5::real
      from public.sources s, lim
     where (p_subject is null or s.subject_id = p_subject) and p_query <> '' and s.filename ilike '%' || p_query || '%'
     order by s.filename
     limit (select n from lim)
  )
  union all
  (
    select 'page', sp.source_id, s.subject_id, s.filename,
           ts_headline('english', sp.text, q.tsq, 'MaxFragments=1,MaxWords=24,MinWords=6,ShortWord=3'),
           sp.source_id, null::uuid, sp.page_no, ts_rank_cd(sp.tsv, q.tsq)
      from public.source_pages sp join public.sources s on s.id = sp.source_id, q, lim
     where (p_subject is null or s.subject_id = p_subject) and sp.tsv @@ q.tsq
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
     order by ts_rank_cd(n.search, q.tsq) desc
     limit (select n from lim)
  )
  union all
  (
    select 'card', c.id, c.subject_id, c.front, c.back, c.source_id, null::uuid, null::integer, ts_rank_cd(c.search, q.tsq)
      from public.cards c, q, lim
     where (p_subject is null or c.subject_id = p_subject) and c.search @@ q.tsq and c.hidden = false
     order by ts_rank_cd(c.search, q.tsq) desc
     limit (select n from lim)
  )
  union all
  (
    select 'question', qq.id, z.subject_id, qq.prompt, qq.explanation, z.source_id, qq.quiz_id, null::integer, ts_rank_cd(qq.search, q.tsq)
      from public.quiz_questions qq join public.quizzes z on z.id = qq.quiz_id, q, lim
     where (p_subject is null or z.subject_id = p_subject) and qq.search @@ q.tsq and qq.hidden = false
     order by ts_rank_cd(qq.search, q.tsq) desc
     limit (select n from lim)
  )
$$;
revoke execute on function public.search_everything(text, uuid, integer) from public, anon;
grant execute on function public.search_everything(text, uuid, integer) to authenticated;
