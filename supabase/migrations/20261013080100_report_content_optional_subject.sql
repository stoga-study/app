-- A report is not always made from a page that knows its subject (e.g. a tutor answer). Let the
-- subject be left out. The parameter order changes (uuid before text), so this is a new overload:
-- drop the old one once the new one is in place.
create function public.report_content(p_item_type public.report_item, p_item_id uuid, p_reason text, p_subject_id uuid default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_snapshot jsonb;
  v_source_id uuid;
begin
  if p_item_type = 'card' then
    select jsonb_build_object('front', front, 'back', back), source_id into v_snapshot, v_source_id
      from public.cards where id = p_item_id and user_id = auth.uid();
    update public.cards set hidden = true where id = p_item_id and user_id = auth.uid();
  elsif p_item_type = 'quiz_question' then
    select jsonb_build_object('prompt', prompt, 'options', options, 'answer_index', answer_index, 'explanation', explanation, 'quiz_id', quiz_id)
      into v_snapshot from public.quiz_questions where id = p_item_id and user_id = auth.uid();
    update public.quiz_questions set hidden = true where id = p_item_id and user_id = auth.uid();
  elsif p_item_type = 'notes_section' then
    select jsonb_build_object('title', title, 'body_md', body_md), source_id into v_snapshot, v_source_id
      from public.notes_sections where id = p_item_id and user_id = auth.uid();
    update public.notes_sections set hidden = true where id = p_item_id and user_id = auth.uid();
  elsif p_item_type = 'guide_section' then
    select jsonb_build_object('title', title, 'body_md', body_md), source_id into v_snapshot, v_source_id
      from public.guide_sections where id = p_item_id and user_id = auth.uid();
    update public.guide_sections set hidden = true where id = p_item_id and user_id = auth.uid();
  elsif p_item_type = 'tutor_message' then
    select jsonb_build_object('content', content) into v_snapshot
      from public.chat_messages where id = p_item_id and user_id = auth.uid() and role = 'assistant';
  end if;
  if v_snapshot is null then
    raise exception 'not_found';
  end if;
  insert into public.content_reports (user_id, item_type, item_id, subject_id, source_id, reason, snapshot)
  values (auth.uid(), p_item_type, p_item_id, p_subject_id, v_source_id, coalesce(p_reason, ''), v_snapshot);
end;
$$;
revoke execute on function public.report_content(public.report_item, uuid, text, uuid) from public, anon;
grant execute on function public.report_content(public.report_item, uuid, text, uuid) to authenticated;

drop function public.report_content(public.report_item, uuid, uuid, text);
