-- Reporting incorrect AI content: a flag on a card, quiz question, notes section or guide section
-- hides it for the student at once (it keeps a snapshot for Aarav to review in the admin dashboard,
-- since the row itself may later be edited or deleted). Tutor answers can be flagged too, but are
-- never hidden: they are already read, and stay part of the conversation.

create type public.report_item as enum ('card', 'quiz_question', 'notes_section', 'guide_section', 'tutor_message');
create type public.report_status as enum ('open', 'fixed', 'dismissed');

alter table public.cards add column hidden boolean not null default false;
alter table public.cards add column quote text check (char_length(quote) <= 500);
alter table public.quiz_questions add column hidden boolean not null default false;
alter table public.quiz_questions add column quote text check (char_length(quote) <= 500);
alter table public.notes_sections add column hidden boolean not null default false;
alter table public.guide_sections add column hidden boolean not null default false;

create table public.content_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_type   public.report_item not null,
  item_id     uuid not null,
  subject_id  uuid,
  source_id   uuid,
  reason      text not null default '' check (char_length(reason) <= 500),
  snapshot    jsonb not null,
  status      public.report_status not null default 'open',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index content_reports_status_idx on public.content_reports (status, created_at desc);
create index content_reports_user_idx on public.content_reports (user_id, created_at desc);

alter table public.content_reports enable row level security;
create policy "owner can read their reports" on public.content_reports for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owner can report" on public.content_reports for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Snapshots the item, hides it (except a tutor message, which has no hidden flag), and logs the report.
-- security invoker: row-level security limits every lookup and update to the student's own rows.
create function public.report_content(p_item_type public.report_item, p_item_id uuid, p_subject_id uuid, p_reason text)
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
revoke execute on function public.report_content(public.report_item, uuid, uuid, text) from public, anon;
grant execute on function public.report_content(public.report_item, uuid, uuid, text) to authenticated;
