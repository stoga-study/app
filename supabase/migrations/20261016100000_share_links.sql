-- v1.7.0: private links to share a study set. A link works only for signed-in students, expires
-- (30 days by default), and can be turned off. Opening and copying go through the share function,
-- which reads with server rights and copies only the study set itself: never the sharer's own notes,
-- progress or mistakes.

create table public.share_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id   uuid not null,
  token       text not null unique check (token ~ '^[A-Za-z0-9_-]{20,64}$'),
  with_file   boolean not null default true,
  expires_at  timestamptz not null default now() + interval '30 days',
  revoked_at  timestamptz,
  copies      integer not null default 0,
  created_at  timestamptz not null default now(),
  foreign key (source_id, user_id) references public.sources (id, user_id) on delete cascade
);
create index share_links_source_idx on public.share_links (source_id);
alter table public.share_links enable row level security;
-- The owner sees and turns off their own links; making one goes through the function (it picks the token).
create policy "owner reads" on public.share_links for select to authenticated using (user_id = (select auth.uid()));
create policy "owner revokes" on public.share_links for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.share_links from authenticated;
grant update (revoked_at) on public.share_links to authenticated;

-- Where a copy came from (for "shared by" and so a set isn't added twice).
alter table public.sources add column copied_from uuid references public.share_links (id) on delete set null;
