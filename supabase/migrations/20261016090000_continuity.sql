-- v1.6.2: pick up where you left off on any device: the last thing being studied, and the coach
-- conversation (the last 40 messages), with when each was last saved.
alter table public.profiles
  add column recent jsonb check (recent is null or (jsonb_typeof(recent) = 'object' and pg_column_size(recent) < 2000)),
  add column coach_chat jsonb check (coach_chat is null or (jsonb_typeof(coach_chat) = 'array' and pg_column_size(coach_chat) < 300000)),
  add column coach_chat_at timestamptz;
grant update (recent, coach_chat, coach_chat_at) on public.profiles to authenticated;
