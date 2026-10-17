-- v1.7.2: editing a shared set together. Members edit the group's version of cards and note sections
-- (through the share function, which checks membership and the lock); every change is kept with who
-- made it, so it can be undone. The person who shared the set, or the group owner, can lock it.

alter table public.group_sets add column locked boolean not null default false;

create policy "sharer or owner locks" on public.group_sets for update to authenticated using (
  shared_by = (select auth.uid()) or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = (select auth.uid()))
) with check (true);
revoke update on public.group_sets from authenticated;
grant update (locked) on public.group_sets to authenticated;

create table public.group_set_changes (
  id            uuid primary key default gen_random_uuid(),
  set_id        uuid not null references public.group_sets (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  display_name  text not null,
  item_type     text not null check (item_type in ('card', 'note_section')),
  item_id       uuid not null,
  before        jsonb not null,
  after         jsonb not null,
  created_at    timestamptz not null default now(),
  undone_at     timestamptz,
  undone_by     text
);
create index group_set_changes_set_idx on public.group_set_changes (set_id, created_at desc);
alter table public.group_set_changes enable row level security;
-- Members read a set's history; only the share function writes it.
create policy "members read history" on public.group_set_changes for select to authenticated using (
  exists (select 1 from public.group_sets s where s.id = set_id and public.is_group_member(s.group_id))
);
