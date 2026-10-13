-- Chat scope: a conversation can be scoped to one file or one unit, set when it starts and kept for
-- the whole thread. search_pages learns to narrow to that scope too.

alter table public.chat_threads add column scope_source_id uuid;
alter table public.chat_threads add column scope_unit_id uuid;
alter table public.chat_threads add constraint chat_threads_scope_source
  foreign key (scope_source_id, user_id) references public.sources (id, user_id) on delete set null (scope_source_id);
alter table public.chat_threads add constraint chat_threads_scope_unit
  foreign key (scope_unit_id, user_id) references public.units (id, user_id) on delete set null (scope_unit_id);

-- Postgres allows CREATE OR REPLACE to add new trailing parameters as long as they default: this
-- replaces the same function in place, no drop needed.
create or replace function public.search_pages(p_subject uuid, p_query text, p_limit integer default 8, p_source_id uuid default null, p_unit_id uuid default null)
returns table (source_id uuid, filename text, page_no integer, text text, rank real)
language sql stable security invoker set search_path = '' as $$
  with q as (select websearch_to_tsquery('english', p_query) as tsq)
  select sp.source_id, s.filename, sp.page_no, sp.text, ts_rank_cd(sp.tsv, q.tsq) as rank
    from public.source_pages sp
    join public.sources s on s.id = sp.source_id
    cross join q
   where s.subject_id = p_subject and sp.tsv @@ q.tsq
     and (p_source_id is null or sp.source_id = p_source_id)
     and (p_unit_id is null or s.unit_id = p_unit_id)
   order by rank desc
   limit least(greatest(p_limit, 1), 12)
$$;
