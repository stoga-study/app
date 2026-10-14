-- v1.3.6: duplicate a file and its study set, into the same class or another one.
-- The copy starts fresh: cards are new (no review history), and nothing reported comes along.
-- Runs as the caller, so row-level security keeps it to the caller's own file and class.
-- The original file in storage is copied by the client afterwards (storage_path starts empty).

create or replace function public.duplicate_source(p_source uuid, p_subject uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  src public.sources;
  new_id uuid;
  q record;
  new_quiz uuid;
begin
  select * into src from public.sources where id = p_source and user_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
  if src.status in ('uploaded', 'generating') then raise exception 'not_ready'; end if;
  if not exists (select 1 from public.subjects where id = p_subject and user_id = auth.uid()) then
    raise exception 'no_subject';
  end if;

  insert into public.sources (subject_id, filename, kind, bytes, page_count, status, options, steps, counted,
                              original_filename, content_hash, lesson, unit_id, tags)
  values (p_subject, left(src.filename || ' (copy)', 255), src.kind, src.bytes, src.page_count, src.status,
          src.options, src.steps, src.counted, src.original_filename, src.content_hash, src.lesson,
          case when p_subject = src.subject_id then src.unit_id end, src.tags)
  returning id into new_id;

  insert into public.source_pages (source_id, page_no, text)
    select new_id, page_no, text from public.source_pages where source_id = p_source;
  insert into public.notes_sections (source_id, position, title, body_md, pages, gen_part)
    select new_id, position, title, body_md, pages, gen_part from public.notes_sections where source_id = p_source and not hidden;
  insert into public.guide_sections (source_id, position, title, body_md, pages, minutes)
    select new_id, position, title, body_md, pages, minutes from public.guide_sections where source_id = p_source and not hidden;
  insert into public.key_terms (source_id, position, term, definition, pages)
    select new_id, position, term, definition, pages from public.key_terms where source_id = p_source and not hidden;
  insert into public.summaries (source_id, body_md)
    select new_id, body_md from public.summaries where source_id = p_source and not hidden;
  insert into public.cards (source_id, subject_id, front, back, pages, quote, tags, gen_part, edited)
    select new_id, p_subject, front, back, pages, quote, tags, gen_part, edited from public.cards where source_id = p_source and not hidden;

  for q in select * from public.quizzes where source_id = p_source order by created_at loop
    insert into public.quizzes (source_id, subject_id, title, gen_run)
      values (new_id, p_subject, q.title, q.gen_run) returning id into new_quiz;
    insert into public.quiz_questions (quiz_id, position, prompt, options, answer_index, hint, explanation, topic, pages, quote)
      select new_quiz, position, prompt, options, answer_index, hint, explanation, topic, pages, quote
        from public.quiz_questions where quiz_id = q.id and not hidden;
  end loop;

  return new_id;
end;
$$;

revoke all on function public.duplicate_source(uuid, uuid) from public, anon;
grant execute on function public.duplicate_source(uuid, uuid) to authenticated;
