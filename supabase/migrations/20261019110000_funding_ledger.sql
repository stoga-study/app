-- The funding ledger, published in the app (Plans): what Stoga.study costs to run each month and how it's paid
-- for. AI costs come straight from the usage log at the listed prices (students' own keys excluded: they pay
-- those). Hosting, other costs and funding are entered by hand from the local admin dashboard.

create table public.ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  month       date not null check (extract(day from month) = 1),
  kind        text not null check (kind in ('cost', 'funding')),
  label       text not null check (char_length(label) between 1 and 80),
  amount_usd  numeric(10, 2) not null check (amount_usd >= 0),
  created_at  timestamptz not null default now()
);
create index ledger_entries_month_idx on public.ledger_entries (month);
alter table public.ledger_entries enable row level security;
-- No policies: only the server (the admin dashboard, with the secret key) reads or writes it directly.

/** Month by month, newest first: AI cost, other costs, funding, and how many students used the AI. */
create or replace function public.funding_ledger(p_months integer default 6)
returns table (month date, ai_cost numeric, other_costs numeric, funding numeric, students integer, items jsonb)
language sql stable security definer set search_path = '' as $$
  with months as (
    select (date_trunc('month', now() at time zone 'America/New_York') - make_interval(months => g))::date as month
      from generate_series(0, least(greatest(p_months, 1), 24) - 1) g
  ), ai as (
    select date_trunc('month', created_at at time zone 'America/New_York')::date as month,
           sum(cost_usd) as cost, count(distinct user_id)::int as students
      from public.ai_usage_costed
     where not byok
     group by 1
  ), entries as (
    select month,
           sum(amount_usd) filter (where kind = 'cost') as costs,
           sum(amount_usd) filter (where kind = 'funding') as funding,
           jsonb_agg(jsonb_build_object('kind', kind, 'label', label, 'amount', amount_usd) order by kind, amount_usd desc) as items
      from public.ledger_entries
     group by 1
  )
  select m.month,
         round(coalesce(ai.cost, 0), 2),
         coalesce(e.costs, 0),
         coalesce(e.funding, 0),
         coalesce(ai.students, 0),
         coalesce(e.items, '[]'::jsonb)
    from months m
    left join ai on ai.month = m.month
    left join entries e on e.month = m.month
   order by m.month desc;
$$;

revoke all on function public.funding_ledger(integer) from public, anon;
grant execute on function public.funding_ledger(integer) to authenticated;
