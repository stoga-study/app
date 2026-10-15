-- v1.5.0: study history. Real studying only: card reviews, quiz answers, practice tests and questions
-- asked of the tutor. Days are the student's own calendar days (their time zone), so a late-night
-- session counts for the night it happened.

-- Every bit of studying as one stream: when, which class, what kind, how many, how many right.
create or replace function public.study_events(p_since timestamptz)
returns table (at timestamptz, subject_id uuid, kind text, n integer, correct integer)
language sql stable security invoker set search_path = '' as $$
  select r.reviewed_at, c.subject_id, 'review', 1, (r.rating > 1)::int
    from public.card_reviews r join public.cards c on c.id = r.card_id
   where r.reviewed_at >= p_since
  union all
  select coalesce(a.finished_at, a.created_at), z.subject_id, 'quiz', jsonb_array_length(a.answers), a.correct
    from public.quiz_attempts a join public.quizzes z on z.id = a.quiz_id
   where a.created_at >= p_since and jsonb_array_length(a.answers) > 0
  union all
  select t.finished_at, t.subject_id, 'practice_test', t.total, floor(t.points)::int
    from public.practice_tests t
   where t.finished_at >= p_since
  union all
  select m.created_at, th.subject_id, 'tutor', 1, 0
    from public.chat_messages m join public.chat_threads th on th.id = m.thread_id
   where m.role = 'user' and m.created_at >= p_since
$$;

-- Totals per local day, class and kind.
create or replace function public.study_history(p_days integer, p_tz text)
returns table (day date, subject_id uuid, kind text, n integer, correct integer)
language plpgsql stable security invoker set search_path = '' as $$
declare
  tz text := case when exists (select 1 from pg_timezone_names where name = p_tz) then p_tz else 'UTC' end;
begin
  return query
    select (e.at at time zone tz)::date, e.subject_id, e.kind, sum(e.n)::int, sum(e.correct)::int
      from public.study_events(now() - make_interval(days => least(greatest(p_days, 1), 400))) e
     group by 1, 2, 3;
end;
$$;

-- Study sessions: activity with gaps under 30 minutes counts as one sitting.
create or replace function public.study_sessions(p_days integer, p_limit integer default 30)
returns table (started_at timestamptz, ended_at timestamptz, subject_ids uuid[], reviews integer, quiz_answers integer, practice_tests integer, tutor integer, correct integer, graded integer)
language sql stable security invoker set search_path = '' as $$
  with e as (
    select * from public.study_events(now() - make_interval(days => least(greatest(p_days, 1), 120)))
  ), marked as (
    select e.*, case when lag(e.at) over (order by e.at) is null or e.at - lag(e.at) over (order by e.at) > interval '30 minutes' then 1 else 0 end as starts
      from e
  ), grouped as (
    select m.*, sum(m.starts) over (order by m.at) as session from marked m
  )
  select min(g.at), max(g.at), array_agg(distinct g.subject_id),
         coalesce(sum(g.n) filter (where g.kind = 'review'), 0)::int,
         coalesce(sum(g.n) filter (where g.kind = 'quiz'), 0)::int,
         count(*) filter (where g.kind = 'practice_test')::int,
         coalesce(sum(g.n) filter (where g.kind = 'tutor'), 0)::int,
         coalesce(sum(g.correct) filter (where g.kind <> 'tutor'), 0)::int,
         coalesce(sum(g.n) filter (where g.kind <> 'tutor'), 0)::int
    from grouped g
   group by g.session
   order by min(g.at) desc
   limit least(greatest(p_limit, 1), 100)
$$;

revoke all on function public.study_events(timestamptz) from public, anon;
revoke all on function public.study_history(integer, text) from public, anon;
revoke all on function public.study_sessions(integer, integer) from public, anon;
grant execute on function public.study_events(timestamptz) to authenticated;
grant execute on function public.study_history(integer, text) to authenticated;
grant execute on function public.study_sessions(integer, integer) to authenticated;

create index if not exists chat_messages_user_created_idx on public.chat_messages (user_id, created_at) where role = 'user';
create index if not exists practice_tests_user_finished_idx on public.practice_tests (user_id, finished_at);
