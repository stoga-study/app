-- v1.8.0: the student's own meters, for Plans and Settings: scanned pages in the last 24 hours and
-- answer checks today (both counted from the AI usage log, which students can't read directly), the
-- per-file limits for their plan, and what their own key was used for this month.
-- Keep in step with read-page (OCR_PAGES_PER_DAY, default 150) and grade-answer (DAILY_GRADES = 150).
create or replace function public.usage_meters()
returns table (scan_pages integer, scan_limit integer, checks integer, checks_limit integer, cap_cards integer, cap_quiz integer, cap_guide integer, own_calls integer, own_tokens bigint)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::int from public.ai_usage where user_id = auth.uid() and feature = 'ocr_page' and created_at >= now() - interval '24 hours'),
    150,
    (select count(*)::int from public.ai_usage where user_id = auth.uid() and feature = 'grade_answer' and not byok and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'),
    150,
    c.cards, c.quiz, c.guide,
    (select count(*)::int from public.ai_usage where user_id = auth.uid() and byok and created_at >= date_trunc('month', now())),
    (select coalesce(sum(input_tokens + output_tokens), 0) from public.ai_usage where user_id = auth.uid() and byok and created_at >= date_trunc('month', now()))
  from public.profiles p left join public.generation_caps c on c.plan = p.plan
  where p.user_id = auth.uid()
$$;
revoke all on function public.usage_meters() from public, anon;
grant execute on function public.usage_meters() to authenticated;
