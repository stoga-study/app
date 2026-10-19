-- v1.9.3: optional surveys (1 to 3 questions, defined in the app). One row per student per survey: their answers,
-- or that they chose "Not now" (which hides that survey for good). Read by the team with the server key.
create table public.survey_responses (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  survey_id   text not null check (survey_id ~ '^[a-z0-9-]{1,40}$'),
  answers     jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 4000),
  dismissed   boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (user_id, survey_id)
);
alter table public.survey_responses enable row level security;
create policy "own survey answers" on public.survey_responses for select to authenticated using (user_id = (select auth.uid()));
create policy "answer once" on public.survey_responses for insert to authenticated with check (user_id = (select auth.uid()));
