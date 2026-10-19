-- v1.9.5: known issues, public (anyone can read, no sign-in), written by the team from the admin dashboard.
create table public.known_issues (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 3 and 120),
  body        text not null default '' check (char_length(body) <= 1000),
  workaround  text check (char_length(workaround) <= 500),
  status      text not null default 'open' check (status in ('open', 'fixed')),
  fixed_in    text check (fixed_in ~ '^\d+\.\d+\.\d+$'),
  created_at  timestamptz not null default now(),
  fixed_at    timestamptz
);
alter table public.known_issues enable row level security;
create policy "anyone can read" on public.known_issues for select to anon, authenticated using (true);
grant select on public.known_issues to anon;
