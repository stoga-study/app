-- What every AI call actually used, so costs and free-plan limits come from real numbers.
-- Server only: students can neither read nor write these tables.

create table public.ai_usage (
  id             bigint generated always as identity primary key,
  user_id        uuid references auth.users (id) on delete set null,
  -- tutor, tutor_route, tutor_card, study_notes, study_cards, study_quiz, study_guide, source_title
  feature        text not null check (char_length(feature) <= 40),
  model          text not null check (char_length(model) <= 80),
  input_tokens   integer not null default 0,
  cached_tokens  integer not null default 0,
  output_tokens  integer not null default 0,
  -- Hidden reasoning, already included in output_tokens (shown separately for insight).
  reasoning_tokens integer not null default 0,
  -- Charged to the student's own key, not to Stoga.study.
  byok           boolean not null default false,
  -- Flex processing (half price) when used.
  flex           boolean not null default false,
  created_at     timestamptz not null default now()
);
create index ai_usage_created_idx on public.ai_usage (created_at);
create index ai_usage_user_idx on public.ai_usage (user_id, created_at);

-- Price list per million tokens, editable without a deploy. Costs are worked out from it when read.
create table public.model_prices (
  model          text primary key,
  input_per_m    numeric not null,
  cached_per_m   numeric not null,
  output_per_m   numeric not null,
  note           text,
  updated_at     timestamptz not null default now()
);
insert into public.model_prices (model, input_per_m, cached_per_m, output_per_m, note) values
  ('gpt-6-luna',   0.10, 0.01,  0.50, 'Cached price assumed at a tenth of input; confirm on OpenAI pricing'),
  ('gpt-5.6-luna', 0.20, 0.02,  1.20, null),
  ('gpt-5.4-nano', 0.20, 0.02,  1.25, 'Shuts down 2027-04-01'),
  ('gpt-5-nano',   0.05, 0.005, 0.40, 'Shuts down 2026-12-11');

-- Cost of each call in US dollars (cached input billed at the cached rate, Flex at half price).
create view public.ai_usage_costed with (security_invoker = true) as
select u.*,
       round(((u.input_tokens - u.cached_tokens) * coalesce(p.input_per_m, 0)
            + u.cached_tokens * coalesce(p.cached_per_m, 0)
            + u.output_tokens * coalesce(p.output_per_m, 0)) / 1e6
            * case when u.flex then 0.5 else 1 end, 8) as cost_usd,
       p.model is not null as priced
  from public.ai_usage u
  left join public.model_prices p on p.model = u.model;

-- One row per day, feature and model: what the admin dashboard charts.
create view public.ai_usage_daily with (security_invoker = true) as
select (created_at at time zone 'America/New_York')::date as day,
       feature, model, byok,
       count(*)::integer as calls,
       sum(input_tokens)::bigint as input_tokens,
       sum(cached_tokens)::bigint as cached_tokens,
       sum(output_tokens)::bigint as output_tokens,
       sum(reasoning_tokens)::bigint as reasoning_tokens,
       sum(cost_usd)::numeric(12, 6) as cost_usd
  from public.ai_usage_costed
 group by 1, 2, 3, 4;

alter table public.ai_usage enable row level security;
alter table public.model_prices enable row level security;
revoke all on public.ai_usage, public.model_prices, public.ai_usage_costed, public.ai_usage_daily from anon, authenticated;
grant select, insert on public.ai_usage to service_role;
grant select, insert, update on public.model_prices to service_role;
grant select on public.ai_usage_costed, public.ai_usage_daily to service_role;
