-- v1.9.1: the feature request board. Anyone in the beta can suggest something and vote. Students are minors and
-- the board is shared by everyone, so a suggestion is visible only to its author until the team approves it, and
-- no names are shown. At most 3 suggestions a day each; one vote per person per request.

create table public.feature_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references auth.users (id) on delete set null,
  title       text not null check (char_length(trim(title)) between 3 and 80),
  body        text not null default '' check (char_length(body) <= 600),
  status      text not null default 'review' check (status in ('review', 'open', 'planned', 'building', 'shipped', 'declined')),
  note        text check (char_length(note) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index feature_requests_status_idx on public.feature_requests (status, created_at desc);

create table public.feature_votes (
  request_id  uuid not null references public.feature_requests (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (request_id, user_id)
);

alter table public.feature_requests enable row level security;
alter table public.feature_votes enable row level security;

-- Suggest: only a title and details; the status starts at "review" and only the team changes it.
create policy "suggest" on public.feature_requests for insert to authenticated with check (user_id = (select auth.uid()) and status = 'review');
revoke insert, update, delete on public.feature_requests from authenticated;
grant insert (title, body) on public.feature_requests to authenticated;
-- Read: approved requests, plus your own while they wait.
create policy "read approved or own" on public.feature_requests for select to authenticated using (status <> 'review' or user_id = (select auth.uid()));

create policy "vote on approved" on public.feature_votes for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.feature_requests r where r.id = request_id and r.status in ('open', 'planned', 'building'))
);
create policy "take back your vote" on public.feature_votes for delete to authenticated using (user_id = (select auth.uid()));
create policy "see your votes" on public.feature_votes for select to authenticated using (user_id = (select auth.uid()));

/** At most 3 suggestions a day each. */
create or replace function public.feature_request_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.feature_requests where user_id = new.user_id and created_at > now() - interval '1 day') >= 3 then
    raise exception 'request_limit';
  end if;
  new.title := trim(new.title);
  new.body := trim(new.body);
  return new;
end;
$$;
create trigger feature_request_limit before insert on public.feature_requests for each row execute function public.feature_request_limit();

/** The board: approved requests with their vote counts and whether you voted, plus your own waiting ones. No names. */
create or replace function public.feature_board()
returns table (id uuid, title text, body text, status text, note text, votes integer, voted boolean, mine boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.title, r.body, r.status, r.note,
         (select count(*)::int from public.feature_votes v where v.request_id = r.id),
         exists (select 1 from public.feature_votes v where v.request_id = r.id and v.user_id = auth.uid()),
         r.user_id = auth.uid(),
         r.created_at
    from public.feature_requests r
   where r.status <> 'review' or r.user_id = auth.uid()
   order by r.created_at desc
   limit 300;
$$;
revoke all on function public.feature_board() from public, anon;
grant execute on function public.feature_board() to authenticated;
