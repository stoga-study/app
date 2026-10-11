-- Stoga.study v1.0 schema.
-- Every row belongs to one student (user_id) and row-level security keeps it that way:
-- no student can read or change another student's uploads, cards, mistakes or keys.

-- Vault stores bring-your-own-key secrets encrypted at rest. It is on by default on hosted projects.
create extension if not exists supabase_vault with schema vault;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create type public.plan as enum ('essential', 'independent', 'unlimited');

create table public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  first_name  text check (char_length(first_name) <= 60),
  grade       text check (char_length(grade) <= 40),
  school      text check (char_length(school) <= 120),
  plan        public.plan not null default 'essential',
  onboarded   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A profile row appears the moment an account is created.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Subjects and sources
-- ---------------------------------------------------------------------------
create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  area        text check (char_length(area) <= 40),
  color_index smallint not null default 0 check (color_index between 0 and 3),
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index subjects_user_idx on public.subjects (user_id);

create type public.source_status as enum ('uploaded', 'ready_text', 'generating', 'ready', 'failed');

create table public.sources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id    uuid not null references public.subjects (id) on delete cascade,
  filename      text not null check (char_length(filename) between 1 and 255),
  kind          text not null check (kind in ('pdf', 'docx', 'text')),
  storage_path  text,
  bytes         integer check (bytes between 0 and 26214400),
  page_count    integer not null default 0,
  status        public.source_status not null default 'uploaded',
  -- Progress for the "Preparing your study set" screen: {"notes": "done", "cards": "working", ...}
  steps         jsonb not null default '{}'::jsonb,
  error_code    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index sources_user_subject_idx on public.sources (user_id, subject_id);
create trigger sources_touch before update on public.sources
  for each row execute function public.touch_updated_at();

-- Text is extracted per page on the device, so citations can point at real page numbers.
create table public.source_pages (
  source_id  uuid not null references public.sources (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page_no    integer not null check (page_no >= 1),
  text       text not null check (char_length(text) <= 60000),
  tsv        tsvector generated always as (to_tsvector('english', text)) stored,
  primary key (source_id, page_no)
);
create index source_pages_tsv_idx on public.source_pages using gin (tsv);
create index source_pages_user_idx on public.source_pages (user_id);

-- ---------------------------------------------------------------------------
-- Generated study material
-- ---------------------------------------------------------------------------
create table public.notes_sections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id  uuid not null references public.sources (id) on delete cascade,
  position   integer not null,
  title      text not null,
  body_md    text not null,
  pages      integer[] not null default '{}'
);
create index notes_sections_source_idx on public.notes_sections (source_id, position);

create table public.guide_sections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id  uuid not null references public.sources (id) on delete cascade,
  position   integer not null,
  title      text not null,
  body_md    text not null,
  minutes    smallint,
  pages      integer[] not null default '{}'
);
create index guide_sections_source_idx on public.guide_sections (source_id, position);

-- Flashcards with FSRS scheduling state (ts-fsrs field names).
create table public.cards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id      uuid not null references public.subjects (id) on delete cascade,
  source_id       uuid references public.sources (id) on delete set null,
  front           text not null check (char_length(front) between 1 and 1000),
  back            text not null check (char_length(back) between 1 and 2000),
  pages           integer[] not null default '{}',
  edited          boolean not null default false,
  due             timestamptz not null default now(),
  stability       double precision not null default 0,
  difficulty      double precision not null default 0,
  elapsed_days    integer not null default 0,
  scheduled_days  integer not null default 0,
  learning_steps  integer not null default 0,
  reps            integer not null default 0,
  lapses          integer not null default 0,
  state           smallint not null default 0,
  last_review     timestamptz,
  created_at      timestamptz not null default now()
);
create index cards_due_idx on public.cards (user_id, due);
create index cards_subject_idx on public.cards (subject_id);

create table public.card_reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id      uuid not null references public.cards (id) on delete cascade,
  rating       smallint not null check (rating between 1 and 4),
  state        smallint not null,
  reviewed_at  timestamptz not null default now(),
  -- Client-generated, so reviews queued offline sync exactly once.
  client_id    uuid unique
);
create index card_reviews_user_idx on public.card_reviews (user_id, reviewed_at);

create table public.quizzes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  source_id   uuid references public.sources (id) on delete set null,
  title       text not null,
  created_at  timestamptz not null default now()
);
create index quizzes_subject_idx on public.quizzes (subject_id);

create table public.quiz_questions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quiz_id       uuid not null references public.quizzes (id) on delete cascade,
  position      integer not null,
  topic         text,
  prompt        text not null,
  options       jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  answer_index  smallint not null,
  hint          text,
  explanation   text not null,
  pages         integer[] not null default '{}'
);
create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, position);

create table public.quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quiz_id      uuid not null references public.quizzes (id) on delete cascade,
  answers      jsonb not null default '[]'::jsonb,
  correct      integer not null default 0,
  total        integer not null default 0,
  finished_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index quiz_attempts_quiz_idx on public.quiz_attempts (quiz_id, created_at);

-- Missed questions, to revisit. "To revisit", never "failed".
create table public.mistakes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id  uuid not null references public.quiz_questions (id) on delete cascade,
  attempt_id   uuid references public.quiz_attempts (id) on delete set null,
  chosen_index smallint,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, question_id)
);

-- ---------------------------------------------------------------------------
-- Tutor
-- ---------------------------------------------------------------------------
create table public.chat_threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index chat_threads_subject_idx on public.chat_threads (user_id, subject_id, updated_at desc);

create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  thread_id   uuid not null references public.chat_threads (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null check (char_length(content) <= 20000),
  hint_level  smallint check (hint_level between 1 and 3),
  -- [{ "source_id": "...", "filename": "...", "page": 12 }]
  citations   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- Allowances (Essential plan). Limits live in a table so they change without a deploy.
-- ---------------------------------------------------------------------------
create type public.usage_kind as enum ('tutor_message', 'upload');

create table public.plan_limits (
  plan    public.plan not null,
  kind    public.usage_kind not null,
  period  text not null check (period in ('day', 'month')),
  "limit" integer,  -- null means no cap (fair use applies)
  primary key (plan, kind)
);
insert into public.plan_limits (plan, kind, period, "limit") values
  ('essential',   'tutor_message', 'day',   50),
  ('essential',   'upload',        'month', 10),
  ('independent', 'tutor_message', 'day',   null),
  ('independent', 'upload',        'month', null),
  ('unlimited',   'tutor_message', 'day',   null),
  ('unlimited',   'upload',        'month', null);

create table public.usage_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        public.usage_kind not null,
  byok        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index usage_events_user_idx on public.usage_events (user_id, kind, created_at desc);

-- Allowances reset at midnight Eastern (CHS local time).
create function public.period_start(p_period text) returns timestamptz
language sql stable set search_path = '' as $$
  select (date_trunc(p_period, now() at time zone 'America/New_York')) at time zone 'America/New_York'
$$;

create function public.period_end(p_period text) returns timestamptz
language sql stable set search_path = '' as $$
  select (date_trunc(p_period, now() at time zone 'America/New_York')
          + case when p_period = 'day' then interval '1 day' else interval '1 month' end) at time zone 'America/New_York'
$$;

-- Read-only status for the signed-in student's usage meters.
create function public.allowance_status()
returns table (kind public.usage_kind, used integer, "limit" integer, resets_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.kind,
         (select count(*)::integer from public.usage_events e
            where e.user_id = auth.uid() and e.kind = l.kind and not e.byok
              and e.created_at >= public.period_start(l.period)),
         l."limit",
         public.period_end(l.period)
  from public.plan_limits l
  join public.profiles p on p.plan = l.plan and p.user_id = auth.uid()
$$;

-- Check and record one unit of usage in a single transaction. Called only by Edge Functions
-- (service role), after they have verified the student's session. Returns false at the limit.
create function public.consume_allowance(p_user uuid, p_kind public.usage_kind, p_byok boolean default false)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_limit  integer;
  v_period text;
  v_used   integer;
begin
  -- Serialise concurrent requests from the same student so two tabs cannot both take the last message.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || p_kind::text, 0));

  if not p_byok then
    select l."limit", l.period into v_limit, v_period
      from public.plan_limits l join public.profiles p on p.plan = l.plan
     where p.user_id = p_user and l.kind = p_kind;

    if v_limit is not null then
      select count(*) into v_used from public.usage_events
       where user_id = p_user and kind = p_kind and not byok
         and created_at >= public.period_start(v_period);
      if v_used >= v_limit then
        return false;
      end if;
    end if;
  end if;

  insert into public.usage_events (user_id, kind, byok) values (p_user, p_kind, p_byok);
  return true;
end $$;

-- A failed upload or generation gives the unit back ("Nothing was used from your allowance").
create function public.refund_allowance(p_user uuid, p_kind public.usage_kind)
returns void
language sql security definer set search_path = '' as $$
  delete from public.usage_events
   where id = (select id from public.usage_events
                where user_id = p_user and kind = p_kind
                order by created_at desc limit 1)
$$;

revoke execute on function public.consume_allowance(uuid, public.usage_kind, boolean) from public, anon, authenticated;
revoke execute on function public.refund_allowance(uuid, public.usage_kind) from public, anon, authenticated;
grant execute on function public.consume_allowance(uuid, public.usage_kind, boolean) to service_role;
grant execute on function public.refund_allowance(uuid, public.usage_kind) to service_role;
revoke execute on function public.allowance_status() from public, anon;
grant execute on function public.allowance_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Bring your own key (Independent plan). The key itself lives in Supabase Vault (encrypted);
-- this table only keeps the last four characters for display.
-- ---------------------------------------------------------------------------
create table public.api_keys (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  provider         text not null default 'groq' check (provider in ('groq')),
  vault_secret_id  uuid not null,
  last4            text not null check (char_length(last4) = 4),
  created_at       timestamptz not null default now()
);

create function public.store_api_key(p_user uuid, p_provider text, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old uuid;
  v_new uuid;
begin
  select vault_secret_id into v_old from public.api_keys where user_id = p_user;
  if v_old is not null then
    delete from vault.secrets where id = v_old;
  end if;
  v_new := vault.create_secret(p_key, 'byok:' || p_user::text || ':' || gen_random_uuid()::text);
  insert into public.api_keys (user_id, provider, vault_secret_id, last4)
  values (p_user, p_provider, v_new, right(p_key, 4))
  on conflict (user_id) do update
    set provider = excluded.provider, vault_secret_id = excluded.vault_secret_id,
        last4 = excluded.last4, created_at = now();
  update public.profiles set plan = 'independent' where user_id = p_user and plan = 'essential';
end $$;

create function public.read_api_key(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from public.api_keys k
    join vault.decrypted_secrets s on s.id = k.vault_secret_id
   where k.user_id = p_user
$$;

-- Students remove their own key; this one runs as the student.
create function public.remove_api_key() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old uuid;
begin
  select vault_secret_id into v_old from public.api_keys where user_id = auth.uid();
  if v_old is not null then
    delete from vault.secrets where id = v_old;
  end if;
  delete from public.api_keys where user_id = auth.uid();
  update public.profiles set plan = 'essential' where user_id = auth.uid() and plan = 'independent';
end $$;

revoke execute on function public.store_api_key(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.read_api_key(uuid) from public, anon, authenticated;
grant execute on function public.store_api_key(uuid, text, text) to service_role;
grant execute on function public.read_api_key(uuid) to service_role;
revoke execute on function public.remove_api_key() from public, anon;
grant execute on function public.remove_api_key() to authenticated;

-- ---------------------------------------------------------------------------
-- Feedback (bug reports, feature ideas, optional testimonials)
-- ---------------------------------------------------------------------------
create table public.feedback (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid default auth.uid() references auth.users (id) on delete set null,
  kind                text not null check (kind in ('bug', 'idea', 'testimonial')),
  body                text not null check (char_length(body) between 1 and 4000),
  page                text check (char_length(page) <= 200),
  consent_to_publish  boolean not null default false,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tutor retrieval: rank a subject's pages for a question. Runs as the student, so RLS applies.
-- ---------------------------------------------------------------------------
create function public.search_pages(p_subject uuid, p_query text, p_limit integer default 8)
returns table (source_id uuid, filename text, page_no integer, text text, rank real)
language sql stable security invoker set search_path = '' as $$
  with q as (select websearch_to_tsquery('english', p_query) as tsq)
  select sp.source_id, s.filename, sp.page_no, sp.text, ts_rank_cd(sp.tsv, q.tsq) as rank
    from public.source_pages sp
    join public.sources s on s.id = sp.source_id
    cross join q
   where s.subject_id = p_subject and sp.tsv @@ q.tsq
   order by rank desc
   limit least(greatest(p_limit, 1), 12)
$$;

-- ---------------------------------------------------------------------------
-- Row-level security: owner-only on every table.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'subjects', 'sources', 'source_pages', 'notes_sections', 'guide_sections', 'cards',
    'card_reviews', 'quizzes', 'quiz_questions', 'quiz_attempts', 'mistakes',
    'chat_threads', 'chat_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner can do everything" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy "owner reads profile" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
-- Students edit their own profile, but cannot change their own plan.
create policy "owner updates profile" on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (first_name, grade, school, onboarded) on public.profiles to authenticated;

alter table public.plan_limits enable row level security;
create policy "anyone signed in reads limits" on public.plan_limits for select to authenticated using (true);

alter table public.usage_events enable row level security;
create policy "owner reads usage" on public.usage_events for select to authenticated
  using (user_id = (select auth.uid()));

alter table public.api_keys enable row level security;
create policy "owner reads key summary" on public.api_keys for select to authenticated
  using (user_id = (select auth.uid()));
-- Only last4 and dates are ever readable; the secret stays in Vault.
revoke select on public.api_keys from authenticated;
grant select (user_id, provider, last4, created_at) on public.api_keys to authenticated;

alter table public.feedback enable row level security;
create policy "signed-in students send feedback" on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: a private bucket; each student's files live under their own user id folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sources', 'sources', false, 26214400, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/markdown'
]);

create policy "owner manages own files" on storage.objects for all to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Realtime: the processing screen follows its source's progress live.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.sources;
